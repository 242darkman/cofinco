/**
 * Service de gestion des sessions de caisse - Version Production
 *
 * Ce service implémente:
 * - Validation du billetage côté backend
 * - Transactions atomiques avec isolation
 * - Heartbeat et détection de sessions orphelines
 * - Monitoring et alertes pour écarts significatifs
 * - Synchronisation automatique du solde caisse physique
 */

import { db } from "../../db";
import { sessionsCaisse, sessionsCaisseAuditLogs, operationsCaisse, caisses, users, mouvementsFinanciers, clients } from "@shared/schema";
import { eq, and, sql, desc, lt, gte, lte, or, isNull, isNotNull, notInArray } from "drizzle-orm";
import { ForcedCloseReason, SessionComputedStatus } from "@shared/enums";
import { StatutTransaction, StatutSessionCaisse, StatutCaisse } from "@shared/enum/status-constants";
import type { TypeOperationCaisseDz, MethodePaiementDz } from "@shared/enum/enums";
import {
  getOperationDelta,
  CAISSE_THRESHOLDS,
  isIncomingOperation,
  isOutgoingOperation,
} from "@shared/config/caisse-operations";
import { postGlForMouvement } from "../accounting-posting-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger('SessionService');

// ============================================================================
// TYPES & CONSTANTES
// ============================================================================

/** Valeurs des billets/pièces en FCFA */
const BILLETAGE_VALUES: Record<string, number> = {
  billets_10000: 10000,
  billets_5000: 5000,
  billets_2000: 2000,
  billets_1000: 1000,
  billets_500: 500,
  billets_200: 200,
  billets_100: 100,
  billets_50: 50,
  pieces_500: 500,
  pieces_200: 200,
  pieces_100: 100,
  pieces_50: 50,
  pieces_25: 25,
  pieces_20: 20,
  pieces_10: 10,
  pieces_5: 5,
  pieces_1: 1,
};

/** Configuration extraite du fichier centralisé */
const DEFAULT_SESSION_TIMEOUT_HOURS = CAISSE_THRESHOLDS.TIMEOUT_AUTO_CLOSE_HOURS;
const WARNING_INACTIVE_HOURS = CAISSE_THRESHOLDS.INACTIVITE_WARNING_HOURS;
const CRITICAL_INACTIVE_HOURS = CAISSE_THRESHOLDS.INACTIVITE_CRITICAL_HOURS;
const MAX_ECART_THRESHOLD = CAISSE_THRESHOLDS.MAX_ECART_SANS_ALERTE;

// Statuts terminaux — alignés avec le prédicat des contraintes uniques DB
const TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;

// ============================================================================
// GL RECONCILIATION GUARD
// ============================================================================

interface GlReconciliationCheck {
  operationalBalance: number;
  glBalance: number;
  discrepancy: number;
  isReconciled: boolean;
}

/**
 * Vérifie la cohérence entre le solde opérationnel des caisses et le GL (521xxx)
 * Appelé à l'ouverture/fermeture de session pour détecter les écarts
 */
async function checkCaisseGlReconciliation(): Promise<GlReconciliationCheck> {
  // Solde opérationnel: sessions OUVERTES uniquement
  const operationalResult = await db.execute(sql`
    SELECT COALESCE(SUM(
      COALESCE(CAST(s.montant_fermeture_theorique AS DECIMAL), CAST(s.montant_ouverture AS DECIMAL), 0)
    ), 0) as total
    FROM caisses c
    LEFT JOIN sessions_caisse s ON s.caisse_id = c.id AND s.statut NOT IN ('CLOSED', 'RECONCILIATION_PENDING', 'RECONCILIATION_COMPLETE') AND s.deleted_at IS NULL
  `);
  const operationalBalance = parseFloat((operationalResult.rows[0] as { total?: string })?.total || '0');

  // Solde GL: comptes 521xxx
  const glResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
      COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE pc.numero_compte LIKE '521%'
      AND e.statut = 'POSTED'
  `);
  const glBalance = parseFloat((glResult.rows[0] as { solde?: string })?.solde || '0');

  const discrepancy = Math.abs(operationalBalance - glBalance);
  const isReconciled = discrepancy <= MAX_ECART_THRESHOLD;

  return { operationalBalance, glBalance, discrepancy, isReconciled };
}

/**
 * Log et alerte si écart GL détecté à l'ouverture/fermeture de session
 */
async function logGlReconciliationStatus(context: string, sessionId?: string): Promise<void> {
  try {
    const check = await checkCaisseGlReconciliation();

    if (!check.isReconciled) {
      logger.warn({
        context,
        sessionId,
        operationalBalance: check.operationalBalance,
        glBalance: check.glBalance,
        discrepancy: check.discrepancy,
      }, '[GL GUARD] Écart détecté entre solde opérationnel et GL des caisses');
    } else {
      logger.debug({
        context,
        operationalBalance: check.operationalBalance,
        glBalance: check.glBalance,
      }, '[GL GUARD] Réconciliation OK');
    }
  } catch (error) {
    logger.error({ error, context }, '[GL GUARD] Erreur lors de la vérification GL');
  }
}

// ============================================================================
// VALIDATION DU BILLETAGE
// ============================================================================

interface BilletageValidationResult {
  isValid: boolean;
  calculatedTotal: number;
  providedTotal: number;
  difference: number;
  errors: string[];
}

interface BilletageCalculationResult {
  total: number;
  errors: string[];
}

function calculateBilletage(billetage: Record<string, number> | null | undefined): BilletageCalculationResult {
  const errors: string[] = [];
  let calculatedTotal = 0;

  if (!billetage || typeof billetage !== "object") {
    return { total: 0, errors };
  }

  // Calculer le total depuis le billetage
  for (const [key, count] of Object.entries(billetage)) {
    // Normalisation des clés pour supporter le camelCase généré par normalizeKeysDeep
    // Ex: billets_10000 (backend) vs billets10000 (frontend normalized)
    const normalizedKey = key.replace(/_/g, "");
    let value = BILLETAGE_VALUES[key];
    
    // Si pas trouvé avec la clé exacte, essayer de trouver une correspondance dans BILLETAGE_VALUES
    if (value === undefined) {
       const foundKey = Object.keys(BILLETAGE_VALUES).find((k) => k.replace(/_/g, "") === normalizedKey);
       if (foundKey) {
           value = BILLETAGE_VALUES[foundKey];
       } else {
           // Ignorer les clés inconnues
           continue; 
       }
    }

    const countNum = Number(count);

    if (isNaN(countNum)) {
      errors.push(`Valeur invalide pour ${key}: ${count}`);
      continue;
    }

    if (countNum < 0) {
      errors.push(`Quantité négative non autorisée pour ${key}: ${countNum}`);
      continue;
    }

    if (!Number.isInteger(countNum)) {
      errors.push(`Quantité non entière pour ${key}: ${countNum}`);
      continue;
    }

    calculatedTotal += countNum * value;
  }

  return { total: calculatedTotal, errors };
}

export function calculateBilletageTotal(
  billetage: Record<string, number> | null | undefined
): number {
  return calculateBilletage(billetage).total;
}

/**
 * Calcule le delta de solde pour une opération de caisse
 * Utilise la configuration centralisée pour la classification
 */
function calculateOperationDelta(op: {
  typeOperation: string;
  montant: string;
  reference?: string | null;
  description?: string | null;
}): number {
  // Utiliser la fonction centralisée avec contexte
  return getOperationDelta(op.typeOperation, op.montant, {
    reference: op.reference,
    description: op.description,
  });
}

/**
 * Valide et recalcule le billetage côté serveur
 * Empêche la manipulation du solde initial par le client
 */
export function validateBilletage(
  billetage: Record<string, number> | null | undefined,
  providedTotal: number
): BilletageValidationResult {
  if (!billetage || typeof billetage !== "object") {
    return {
      isValid: providedTotal === 0,
      calculatedTotal: 0,
      providedTotal,
      difference: providedTotal,
      errors: providedTotal !== 0 ? ["Billetage requis pour un solde initial non nul"] : [],
    };
  }

  const calculation = calculateBilletage(billetage);
  const calculatedTotal = calculation.total;
  const errors: string[] = [...calculation.errors];

  const difference = Math.abs(calculatedTotal - providedTotal);

  // Tolérance de 1 FCFA pour les arrondis
  const isValid = errors.length === 0 && difference <= 1;

  if (!isValid && difference > 1) {
    errors.push(
      `Incohérence billetage: calculé ${calculatedTotal} FCFA, fourni ${providedTotal} FCFA (différence: ${difference} FCFA)`
    );
  }

  return {
    isValid,
    calculatedTotal,
    providedTotal,
    difference,
    errors,
  };
}

// ============================================================================
// FERMETURE DE SESSION (ATOMIQUE)
// ============================================================================

type SessionRow = typeof sessionsCaisse.$inferSelect;

interface CloseSessionParams {
  sessionId: string;
  billetageFermeture: Record<string, number>;
  soldeReel: string;
  observations?: string;
  closedBy: string;
  closedReason?: "manual" | "admin" | "timeout";
  fundsKeptInCaisse?: boolean;
  transferToCoffreId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

interface CloseSessionResult {
  success: boolean;
  session?: SessionRow;
  ecart?: number;
  ecartAlert?: boolean;
  error?: string;
}

/**
 * Ferme une session de caisse de manière atomique
 * - Recalcule le solde théorique depuis les opérations
 * - Valide le billetage de fermeture
 * - Calcule l'écart et génère une alerte si nécessaire
 * - Met à jour le solde de la caisse physique
 * - Crée un mouvement d'ajustement si écart détecté
 */
export async function closeSessionAtomic(params: CloseSessionParams): Promise<CloseSessionResult> {
  const {
    sessionId,
    billetageFermeture,
    soldeReel,
    observations,
    closedBy,
    closedReason = "manual",
    fundsKeptInCaisse = true,
    transferToCoffreId,
    ipAddress,
    userAgent,
  } = params;

  const forcedCloseReason =
    closedReason === "timeout"
      ? ForcedCloseReason.TIMEOUT_AUTO
      : closedReason === "admin"
      ? ForcedCloseReason.ADMIN_FORCE
      : null;

  // Validation du billetage de fermeture
  const billetageValidation = validateBilletage(billetageFermeture, Number(soldeReel));

  if (!billetageValidation.isValid) {
    return {
      success: false,
      error: `Billetage de fermeture invalide: ${billetageValidation.errors.join("; ")}`,
    };
  }

  try {
    const result = await db.transaction(
      async (tx) => {
        // 1. Récupérer la session avec lock
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId))
          .for("update");

        if (!session) {
          throw new Error("Session introuvable");
        }

        if (session.closedAt) {
          throw new Error("Session déjà fermée");
        }

        // 2. Récupérer la caisse associée
        const [caisse] = await tx
          .select()
          .from(caisses)
          .where(eq(caisses.id, session.caisseId))
          .for("update");

        if (!caisse) {
          throw new Error("Caisse associée introuvable");
        }

        // 3. Récupérer toutes les opérations et recalculer le solde théorique
        const operations = await tx
          .select()
          .from(operationsCaisse)
          .where(eq(operationsCaisse.sessionId, sessionId));

        let soldeTheorique = Number(session.montantOuverture);

        for (const op of operations) {
          // Utiliser la fonction centralisée pour le calcul du delta
          const delta = calculateOperationDelta({
            typeOperation: op.typeOperation,
            montant: op.montant,
            reference: op.reference,
            description: op.description,
          });
          soldeTheorique += delta;
        }

        // 4. Calculer l'écart
        const soldeReelNum = billetageValidation.calculatedTotal;
        const ecart = soldeReelNum - soldeTheorique;
        const ecartAlert = Math.abs(ecart) > MAX_ECART_THRESHOLD;
        const ecartJustificationRequise = Math.abs(ecart) > CAISSE_THRESHOLDS.ECART_JUSTIFICATION_REQUISE;

        // 5. Créer un mouvement d'ajustement si écart significatif
        let mouvementAjustementId: string | null = null;
        if (Math.abs(ecart) > 0) {
          const sensAjustement = ecart > 0 ? "CREDIT" as const : "DEBIT" as const;
          const ecartTypePaiement = ecart > 0 ? "SESSION_SURPLUS" : "SESSION_DEFICIT";
          const [mouvementAjustement] = await tx.insert(mouvementsFinanciers).values({
            montant: Math.abs(ecart).toString(),
            sens: sensAjustement,
            sourceModule: "CAISSE" as const,
            agenceId: session.agenceId,
            sessionCaisseId: sessionId,
            typePaiement: ecartTypePaiement,
            methodePaiement: "CASH" as const,
            reference: `ADJ-${sessionId.substring(0, 8)}-${Date.now()}`,
            idempotencyKey: `adj-close-${sessionId}`,
            statut: StatutTransaction.POSTED,
            dateOperation: new Date(),
            requiresGlPosting: true,
            glPostingStatus: "PENDING",
            metadata: {
              type: "ECART_FERMETURE",
              soldeTheorique,
              soldeReel: soldeReelNum,
              ecart,
              ecartAlert,
              sessionId,
              caisseId: caisse.id,
              closedBy,
              observations,
            },
          }).returning();
          mouvementAjustementId = mouvementAjustement.id;

          // Créer l'opération d'ajustement
          await tx.insert(operationsCaisse).values({
            sessionId,
            mouvementId: mouvementAjustement.id,
            typeOperation: "ADJUSTMENT",
            montant: Math.abs(ecart).toString(),
            methodePaiement: "CASH",
            reference: mouvementAjustement.reference,
            description: `Ajustement écart de ${ecart > 0 ? "+" : ""}${ecart} FCFA à la fermeture`,
            statut: StatutTransaction.POSTED,
          });

          // GL posting for écart mouvement
          if (session.agenceId) {
            try {
              const glResult = await postGlForMouvement(tx, mouvementAjustement, session.agenceId, closedBy, {
                sessionId,
                caisseId: caisse.id,
                ecart,
                direction: ecart > 0 ? "SURPLUS" : "DEFICIT",
              });
              if (glResult) {
                await tx.update(mouvementsFinanciers)
                  .set({ glPostingStatus: "POSTED", glPostingError: null })
                  .where(eq(mouvementsFinanciers.id, mouvementAjustement.id));
              }
            } catch (glError: unknown) {
              const message = glError instanceof Error ? glError.message : "Unknown GL error";
              logger.error({ mouvementId: mouvementAjustement.id, error: message }, 'GL posting failed for ecart mouvement');
              await tx.update(mouvementsFinanciers)
                .set({ glPostingStatus: "FAILED", glPostingError: message })
                .where(eq(mouvementsFinanciers.id, mouvementAjustement.id));
            }
          }
        }

        // 6. Mettre à jour le solde de la caisse physique avec le solde réel compté
        // GUARD: Ne jamais écrire un solde négatif sur la caisse
        const caisseSoldeAvant = Number(caisse.solde || 0);
        const soldeFinal = Math.max(0, soldeReelNum);
        await tx
          .update(caisses)
          .set({
            solde: soldeFinal.toString(),
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, caisse.id));

        // 7. Mettre à jour la session
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSED",
            closedAt: new Date(),
            montantFermetureTheorique: soldeTheorique.toString(),
            montantFermetureDeclare: soldeReelNum.toString(),
            ecart: ecart.toString(),
            billetageFermeture,
            observations,
            forcedCloseReason,
            forceClosedBy: forcedCloseReason ? closedBy : null,
            forceClosedAt: forcedCloseReason ? new Date() : null,
            fundsKeptInCaisse,
            transferToCoffreId: transferToCoffreId || null,
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 8. Log d'audit détaillé
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: closedReason === "timeout" ? "TIMEOUT" : closedReason === "admin" ? "ADMIN_CLOSED" : "CLOSED",
          statutAvant: SessionComputedStatus.OPEN,
          statutApres: SessionComputedStatus.CLOSED,
          details: {
            soldeInitial: Number(session.montantOuverture),
            soldeTheorique,
            soldeReel: soldeReelNum,
            ecart,
            ecartAlert,
            ecartJustificationRequise,
            nbOperations: operations.length,
            billetageFermeture,
            validationBilletage: billetageValidation,
            observations,
            // Traçabilité caisse
            caisseId: caisse.id,
            caisseSoldeAvant,
            caisseSoldeApres: soldeReelNum,
            mouvementAjustementId,
            fundsKeptInCaisse,
            transferToCoffreId,
          },
          userId: closedBy,
          ipAddress,
          userAgent,
        });

        return {
          session: updatedSession,
          ecart,
          ecartAlert,
          ecartJustificationRequise,
          caisseSoldeAvant,
          caisseSoldeApres: soldeReelNum,
          mouvementAjustementId,
        };
      },
      {
        isolationLevel: "serializable", // Niveau plus strict pour éviter les race conditions
      }
    );

    // Vérification GL après fermeture réussie
    await logGlReconciliationStatus('SESSION_CLOSE_POST', result.session.id);

    return {
      success: true,
      session: result.session,
      ecart: result.ecart,
      ecartAlert: result.ecartAlert,
    };
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error closing session');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de la fermeture de la session"),
    };
  }
}

// ============================================================================
// HEARTBEAT & MONITORING
// ============================================================================

/**
 * Met à jour le heartbeat d'une session (appelé régulièrement par le frontend)
 */
export async function updateSessionHeartbeat(sessionId: string): Promise<boolean> {
  try {
    const [updated] = await db
      .update(sessionsCaisse)
      .set({ lastActivity: new Date() })
      .where(and(eq(sessionsCaisse.id, sessionId), notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES])))
      .returning();

    return !!updated;
  } catch (error) {
    logger.error({ err: error }, 'Error updating heartbeat');
    return false;
  }
}

/**
 * Récupère les sessions à risque (inactives depuis trop longtemps)
 */
export async function getRiskySessions(agenceId?: string): Promise<
  Array<{
    sessionId: string;
    caisseNom: string;
    caissierNom: string;
    hoursInactive: number;
    riskLevel: "WARNING" | "CRITICAL";
    soldeCurrent: number;
  }>
> {
  const warningThreshold = new Date();
  warningThreshold.setHours(warningThreshold.getHours() - WARNING_INACTIVE_HOURS);

  const conditions = [
    isNotNull(sessionsCaisse.openedAt),
    notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
    lt(sessionsCaisse.lastActivity, warningThreshold),
  ];
  if (agenceId) {
    conditions.push(eq(sessionsCaisse.agenceId, agenceId));
  }

  const sessions = await db
    .select({
      session: sessionsCaisse,
      caisseNom: caisses.nom,
      caissierNom: users.nom,
      caissierPrenom: users.prenom,
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(and(...conditions));

  const results = [];

  for (const row of sessions) {
    const lastActivity = row.session.lastActivity || row.session.openedAt;
    const hoursInactive = (Date.now() - new Date(lastActivity!).getTime()) / (1000 * 60 * 60);

    // Calculer le solde actuel
    const operations = await db
      .select()
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, row.session.id));

    let soldeCurrent = Number(row.session.montantOuverture);
    for (const op of operations) {
      soldeCurrent += calculateOperationDelta({
          typeOperation: op.typeOperation,
          montant: op.montant,
          reference: op.reference,
          description: op.description,
      });
    }

    results.push({
      sessionId: row.session.id,
      caisseNom: row.caisseNom || "Caisse inconnue",
      caissierNom: `${row.caissierNom || ""} ${row.caissierPrenom || ""}`.trim() || "Utilisateur inconnu",
      hoursInactive: Math.round(hoursInactive * 10) / 10,
      riskLevel: hoursInactive >= CRITICAL_INACTIVE_HOURS ? ("CRITICAL" as const) : ("WARNING" as const),
      soldeCurrent,
    });
  }

  return results.sort((a, b) => b.hoursInactive - a.hoursInactive);
}

/**
 * Ferme automatiquement les sessions expirées
 */
export async function closeExpiredSessions(
  timeoutHours: number = DEFAULT_SESSION_TIMEOUT_HOURS
): Promise<
  Array<{
    sessionId: string;
    caisseId: string;
    caissierId: string;
    hoursInactive: number;
  }>
> {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setHours(threshold.getHours() - timeoutHours);

  const expiredSessions = await db
    .select()
    .from(sessionsCaisse)
    .where(
      and(
        notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
        isNull(sessionsCaisse.deletedAt),
        or(
          lt(sessionsCaisse.timeoutAt, now),
          and(isNull(sessionsCaisse.timeoutAt), lt(sessionsCaisse.lastActivity, threshold))
        )
      )
    );

  const closedSessions = [];

  for (const session of expiredSessions) {
    // Calculer le solde théorique final
    const operations = await db
      .select()
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, session.id));

    let soldeTheorique = Number(session.montantOuverture);
    for (const op of operations) {
      soldeTheorique += calculateOperationDelta({
          typeOperation: op.typeOperation,
          montant: op.montant,
          reference: op.reference,
          description: op.description,
      });
    }

    // Fermer la session avec raison "timeout"
    // Pour une fermeture automatique, le montant déclaré = théorique (pas de comptage physique)
    // Tout le solde est reporté (pas de transfert vers coffre)
    await db
      .update(sessionsCaisse)
      .set({
        statut: "CLOSED",
        closedAt: now,
        montantFermetureTheorique: soldeTheorique.toString(),
        montantFermetureDeclare: soldeTheorique.toString(), // Égal au théorique pour éviter faux écarts
        montantPhysique: soldeTheorique.toString(),
        montantReporte: soldeTheorique.toString(),
        montantVersCoffre: "0",
        ecart: "0", // Pas d'écart pour fermeture auto
        forcedCloseReason: ForcedCloseReason.TIMEOUT_AUTO,
        forceClosedAt: now,
        forceClosedBy: null,
        fundsKeptInCaisse: soldeTheorique > 0,
        observations: `${session.observations || ""}\n[AUTO-FERMETURE] Session expirée après ${timeoutHours}h d'inactivité. Solde reporté: ${soldeTheorique} FCFA.`.trim(),
      })
      .where(eq(sessionsCaisse.id, session.id));

    // CRITIQUE: Mettre à jour la caisse physique avec le solde théorique comme fond reporté
    // Sans cela, le fond reporté affiché à la prochaine ouverture est erroné
    // GUARD: Ne jamais écrire un solde négatif — clamper à 0 minimum
    const soldeReporte = Math.max(0, soldeTheorique);
    await db
      .update(caisses)
      .set({
        solde: soldeReporte.toString(),
        statut: StatutCaisse.CLOSED,
        updatedAt: now,
      })
      .where(eq(caisses.id, session.caisseId));

    // Log d'audit
    await db.insert(sessionsCaisseAuditLogs).values({
      sessionId: session.id,
      action: "TIMEOUT",
      statutAvant: SessionComputedStatus.OPEN,
      statutApres: SessionComputedStatus.CLOSED,
      details: {
        timeoutHours,
        soldeInitial: Number(session.montantOuverture),
        soldeTheorique,
        nbOperations: operations.length,
        lastActivity: session.lastActivity,
      },
    });

    const lastActivity = session.lastActivity || session.openedAt;
    closedSessions.push({
      sessionId: session.id,
      caisseId: session.caisseId,
      caissierId: session.caissierId,
      hoursInactive: Math.round(((Date.now() - new Date(lastActivity!).getTime()) / (1000 * 60 * 60)) * 10) / 10,
    });
  }

  return closedSessions;
}

interface TemporaryCloseSessionParams {
  sessionId: string;
  closedBy: string;
  observation?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function closeSessionTemporarily(params: TemporaryCloseSessionParams): Promise<{ sessionId: string; soldeTheorique: number }> {
  const { sessionId, closedBy, observation, ipAddress, userAgent } = params;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .for("update");

    if (!session) {
      throw new Error("Session de caisse introuvable");
    }

    if (session.closedAt) {
      throw new Error("La session de caisse est déjà fermée");
    }

    const operations = await tx
      .select()
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, sessionId));

    let soldeTheorique = Number(session.montantOuverture || 0);
    for (const op of operations) {
      soldeTheorique += calculateOperationDelta({
        typeOperation: op.typeOperation,
        montant: op.montant,
        reference: op.reference,
        description: op.description,
      });
    }

    const [caisse] = await tx
      .select()
      .from(caisses)
      .where(eq(caisses.id, session.caisseId))
      .for("update");

    if (!caisse) {
      throw new Error("Caisse associée introuvable");
    }

    await tx
      .update(caisses)
      .set({
        solde: soldeTheorique.toString(),
        statut: StatutCaisse.CLOSED,
        updatedAt: now,
      })
      .where(eq(caisses.id, caisse.id));

    const mergedObservations = [session.observations?.trim(), observation?.trim()]
      .filter(Boolean)
      .join(" | ");

    await tx
      .update(sessionsCaisse)
      .set({
        closedAt: now,
        statut: StatutSessionCaisse.CLOSED,
        montantFermetureTheorique: soldeTheorique.toString(),
        montantFermetureDeclare: soldeTheorique.toString(),
        montantPhysique: soldeTheorique.toString(),
        montantVersCoffre: null,
        montantReporte: null,
        ecart: "0",
        observations: mergedObservations || null,
        fundsKeptInCaisse: false,
        transferToCoffreId: null,
        closingFinalizedAt: now,
        forceClosedBy: null,
        forceClosedAt: null,
        forcedCloseReason: null,
        soldeActuel: soldeTheorique.toString(),
      })
      .where(eq(sessionsCaisse.id, sessionId));

    await tx.insert(sessionsCaisseAuditLogs).values({
      sessionId,
      action: "CLOSED",
      statutAvant: SessionComputedStatus.OPEN,
      statutApres: SessionComputedStatus.CLOSED,
      details: {
        autoClosed: true,
        soldeInitial: Number(session.montantOuverture || 0),
        soldeTheorique,
        nbOperations: operations.length,
        observation,
      },
      userId: closedBy,
      ipAddress,
      userAgent,
    });

    return {
      sessionId,
      soldeTheorique,
    };
  });

  return result;
}

/**
 * Récupère les sessions avec écarts significatifs (pour monitoring)
 */
export async function getSessionsWithSignificantEcarts(
  threshold: number = MAX_ECART_THRESHOLD,
  agenceId?: string
): Promise<
  Array<{
    sessionId: string;
    caisseNom: string;
    caissierNom: string;
    ecart: number;
    closedAt: Date;
    severity: "HIGH" | "MEDIUM";
  }>
> {
  const conditions = [
    eq(sessionsCaisse.statut, "CLOSED"),
    sql`ABS(CAST(${sessionsCaisse.ecart} AS NUMERIC)) > ${threshold}`,
  ];
  if (agenceId) {
    conditions.push(eq(sessionsCaisse.agenceId, agenceId));
  }

  const sessions = await db
    .select({
      session: sessionsCaisse,
      caisseNom: caisses.nom,
      caissierNom: users.nom,
      caissierPrenom: users.prenom,
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(and(...conditions))
    .orderBy(desc(sessionsCaisse.closedAt))
    .limit(50);

  return sessions.map((row) => {
    const ecart = Number(row.session.ecart || 0);
    return {
      sessionId: row.session.id,
      caisseNom: row.caisseNom || "Caisse inconnue",
      caissierNom: `${row.caissierNom || ""} ${row.caissierPrenom || ""}`.trim() || "Utilisateur inconnu",
      ecart,
      closedAt: row.session.closedAt!,
      severity: Math.abs(ecart) > threshold * 2 ? ("HIGH" as const) : ("MEDIUM" as const),
    };
  });
}

// ============================================================================
// HISTORIQUE GLOBAL DES OPÉRATIONS DE CAISSE
// ============================================================================

export interface CaisseHistoriqueFilters {
  caisseId: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  typeOperation?: string;
  methodePaiement?: string;
}

export interface CaisseHistoriqueOperation {
  id: string;
  reference: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  description: string | null;
  statut: string;
  createdAt: Date;
  sessionId: string;
  // Client info (si disponible)
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    telephone: string | null;
  } | null;
  // Agent/Caissier info
  caissier: {
    id: string;
    nom: string;
    prenom: string | null;
  } | null;
  // Session info
  session: {
    id: string;
    openedAt: Date;
    closedAt: Date | null;
  };
  // Metadata (ex: détail remise agent)
  metadata?: Record<string, any> | null;
}

export interface CaisseHistoriqueResult {
  operations: CaisseHistoriqueOperation[];
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

/**
 * Récupère l'historique global des opérations d'une caisse
 * - Parcourt TOUTES les sessions (pas seulement la session active)
 * - Enrichit avec les données client et agent
 * - Supporte la pagination et les filtres de date
 */
export async function getCaisseHistorique(
  filters: CaisseHistoriqueFilters
): Promise<CaisseHistoriqueResult> {
  const {
    caisseId,
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    typeOperation,
    methodePaiement,
  } = filters;

  // 1. Récupérer toutes les sessions de cette caisse
  const sessionsSubquery = db
    .select({ id: sessionsCaisse.id })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.caisseId, caisseId));

  // 2. Construire les conditions de filtre
  const conditions = [
    sql`${operationsCaisse.sessionId} IN (SELECT id FROM sessions_caisse WHERE caisse_id = ${caisseId})`,
    isNull(operationsCaisse.deletedAt),
  ];

  if (startDate) {
    conditions.push(gte(operationsCaisse.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(operationsCaisse.createdAt, endDate));
  }

  if (typeOperation) {
    conditions.push(eq(operationsCaisse.typeOperation, typeOperation as TypeOperationCaisseDz));
  }

  if (methodePaiement) {
    conditions.push(eq(operationsCaisse.methodePaiement, methodePaiement as MethodePaiementDz));
  }

  const whereClause = and(...conditions);

  // 3. Compter le total
  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(operationsCaisse)
    .where(whereClause);

  const total = countResult?.count || 0;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // 4. Récupérer les opérations avec pagination
  const operationsRaw = await db
    .select({
      operation: operationsCaisse,
      session: {
        id: sessionsCaisse.id,
        openedAt: sessionsCaisse.openedAt,
        closedAt: sessionsCaisse.closedAt,
        caissierId: sessionsCaisse.caissierId,
      },
    })
    .from(operationsCaisse)
    .innerJoin(sessionsCaisse, eq(operationsCaisse.sessionId, sessionsCaisse.id))
    .where(whereClause)
    .orderBy(desc(operationsCaisse.createdAt))
    .limit(limit)
    .offset(offset);

  // 5. Enrichir avec les données client et caissier
  const operations: CaisseHistoriqueOperation[] = await Promise.all(
    operationsRaw.map(async (row) => {
      const op = row.operation;
      const sess = row.session;

      // Récupérer les infos client si disponible
      let clientInfo: CaisseHistoriqueOperation["client"] = null;
      if (op.clientId) {
        const [clientData] = await db
          .select({
            id: clients.id,
            nom: users.nom,
            prenom: users.prenom,
            telephone: users.telephone,
          })
          .from(clients)
          .leftJoin(users, eq(clients.userId, users.id))
          .where(eq(clients.id, op.clientId));

        if (clientData) {
          clientInfo = {
            id: clientData.id,
            nom: clientData.nom || "",
            prenom: clientData.prenom || null,
            telephone: clientData.telephone || null,
          };
        }
      }

      // Récupérer les infos du caissier
      let caissierInfo: CaisseHistoriqueOperation["caissier"] = null;
      if (sess.caissierId) {
        const [userData] = await db
          .select({
            id: users.id,
            nom: users.nom,
            prenom: users.prenom,
          })
          .from(users)
          .where(eq(users.id, sess.caissierId));

        if (userData) {
          caissierInfo = {
            id: userData.id,
            nom: userData.nom || "",
            prenom: userData.prenom || null,
          };
        }
      }

      return {
        id: op.id,
        reference: op.reference,
        typeOperation: op.typeOperation,
        montant: op.montant,
        methodePaiement: op.methodePaiement,
        modePaiement: op.methodePaiement,
        description: op.description,
        statut: op.statut,
        createdAt: op.createdAt,
        sessionId: op.sessionId,
        client: clientInfo,
        caissier: caissierInfo,
        // Flat properties for client compatibility
        clientNom: clientInfo?.nom || null,
        clientPrenom: clientInfo?.prenom || null,
        clientTelephone: clientInfo?.telephone || null,
        caissierNom: caissierInfo ? `${caissierInfo.prenom || ''} ${caissierInfo.nom || ''}`.trim() : null,
        session: {
          id: sess.id,
          openedAt: sess.openedAt!,
          closedAt: sess.closedAt,
        },
        metadata: op.metadata,
      };
    })
  );

  return {
    operations,
    total,
    totalPages,
    currentPage,
    limit,
  };
}

/**
 * Récupère le résumé statistique de l'historique d'une caisse
 */
export async function getCaisseHistoriqueSummary(caisseId: string): Promise<{
  totalOperations: number;
  totalEntrees: number;
  totalSorties: number;
  montantEntrees: number;
  montantSorties: number;
  soldeNet: number;
  dernierOperation: Date | null;
}> {
  const sessionsSubquery = db
    .select({ id: sessionsCaisse.id })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.caisseId, caisseId));

  // Exclure les opérations annulées et supprimées du résumé statistique
  // Les opérations annulées apparaissent dans l'historique (marquées "Annulé")
  // mais ne doivent pas fausser les totaux d'entrées/sorties
  const operations = await db
    .select({
      typeOperation: operationsCaisse.typeOperation,
      montant: operationsCaisse.montant,
      createdAt: operationsCaisse.createdAt,
    })
    .from(operationsCaisse)
    .where(
      and(
        sql`${operationsCaisse.sessionId} IN (SELECT id FROM sessions_caisse WHERE caisse_id = ${caisseId})`,
        isNull(operationsCaisse.deletedAt),
        isNull(operationsCaisse.annulledAt)
      )
    )
    .orderBy(desc(operationsCaisse.createdAt));

  let totalEntrees = 0;
  let totalSorties = 0;
  let montantEntrees = 0;
  let montantSorties = 0;

  for (const op of operations) {
    const montant = Number(op.montant);
    if (isIncomingOperation(op.typeOperation)) {
      totalEntrees++;
      montantEntrees += montant;
    } else if (isOutgoingOperation(op.typeOperation)) {
      totalSorties++;
      montantSorties += montant;
    }
  }

  return {
    totalOperations: operations.length,
    totalEntrees,
    totalSorties,
    montantEntrees,
    montantSorties,
    soldeNet: montantEntrees - montantSorties,
    dernierOperation: operations.length > 0 ? operations[0].createdAt : null,
  };
}
