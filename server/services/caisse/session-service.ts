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
import { sessionsCaisse, sessionsCaisseAuditLogs, operationsCaisse, caisses, users, mouvementsFinanciers } from "@shared/schema";
import { eq, and, sql, desc, lt, gte, or, isNull, isNotNull } from "drizzle-orm";
import { ForcedCloseReason, SessionComputedStatus } from "@shared/enums";
import {
  getOperationDelta,
  CAISSE_THRESHOLDS,
  isIncomingOperation,
  isOutgoingOperation,
} from "@shared/config/caisse-operations";

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

/** Types d'opérations pour compatibilité - utiliser les fonctions centralisées */
const IN_TYPES = [
  "Versement", "Dépôt", "Encaissement", "Remboursement", "Cotisation",
  "Approvisionnement coffre", "Dépôt épargne", "Versement Épargne",
  "Versement Courant", "Versement Bloqué", "Remboursement crédit",
  "Frais Engagement", "Cotisation Tontine"
];

const OUT_TYPES = [
  "Retrait", "Décaissement", "Frais", "Sortie", "Versement coffre",
  "Retrait épargne", "Retrait Épargne", "Retrait Courant", "Retrait Bloqué",
  "Décaissement crédit", "Décaissement Prêt", "Retrait Tontine"
];

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
// OUVERTURE DE SESSION (ATOMIQUE)
// ============================================================================

interface OpenSessionParams {
  caissierId: string;
  caisseId: string;
  agenceId: string;
  soldeInitial: string;
  billetageOuverture: Record<string, number>;
  ipAddress?: string;
  userAgent?: string;
}

interface OpenSessionResult {
  success: boolean;
  session?: any;
  error?: string;
  errorCode?: "CAISSE_OCCUPIED" | "USER_HAS_SESSION" | "INVALID_BILLETAGE" | "CAISSE_NOT_FOUND" | "CAISSE_AGENCE_MISMATCH" | "DB_ERROR";
}

/**
 * Ouvre une session de caisse de manière atomique
 * - Vérifie qu'aucune session n'est déjà ouverte sur cette caisse
 * - Vérifie que l'utilisateur n'a pas déjà une session ouverte
 * - Valide le billetage côté serveur
 * - Utilise une transaction SERIALIZABLE pour éviter les race conditions
 */
export async function openSessionAtomic(params: OpenSessionParams): Promise<OpenSessionResult> {
  const { caissierId, caisseId, agenceId, soldeInitial, billetageOuverture, ipAddress, userAgent } = params;

  // 1. Validation du billetage côté serveur
  const billetageValidation = validateBilletage(billetageOuverture, Number(soldeInitial));

  if (!billetageValidation.isValid) {
    return {
      success: false,
      error: billetageValidation.errors.join("; "),
      errorCode: "INVALID_BILLETAGE",
    };
  }

  try {
    // 2. Transaction atomique avec niveau d'isolation SERIALIZABLE
    const result = await db.transaction(
      async (tx) => {
        // Vérifier si la caisse est déjà occupée (avec lock implicite via la contrainte unique)
        const [existingCaisseSession] = await tx
          .select()
          .from(sessionsCaisse)
          .where(and(eq(sessionsCaisse.caisseId, caisseId), isNull(sessionsCaisse.closedAt)));

        if (existingCaisseSession) {
          throw new Error("CAISSE_OCCUPIED:Cette caisse est déjà occupée par une autre session");
        }

        // Vérifier si l'utilisateur a déjà une session ouverte
        const [existingUserSession] = await tx
          .select()
          .from(sessionsCaisse)
          .where(and(eq(sessionsCaisse.caissierId, caissierId), isNull(sessionsCaisse.closedAt)));

        if (existingUserSession) {
          throw new Error("USER_HAS_SESSION:Vous avez déjà une session ouverte sur une autre caisse");
        }

        const [caisse] = await tx.select().from(caisses).where(eq(caisses.id, caisseId));
        if (!caisse) {
          throw new Error("CAISSE_NOT_FOUND:Caisse introuvable");
        }

        if (agenceId && caisse.agenceId && caisse.agenceId !== agenceId) {
          throw new Error("CAISSE_AGENCE_MISMATCH:La caisse ne correspond pas à l'agence sélectionnée");
        }

        const sessionAgenceId = caisse.agenceId || agenceId;
        const caisseSoldeAvant = Number(caisse.solde || 0);
        const openingEcart = billetageValidation.calculatedTotal - caisseSoldeAvant;

        // Calculer le timeout (12h par défaut)
        const timeoutAt = new Date();
        timeoutAt.setHours(timeoutAt.getHours() + DEFAULT_SESSION_TIMEOUT_HOURS);

        // Créer la session avec le solde recalculé côté serveur
        const [newSession] = await tx
          .insert(sessionsCaisse)
          .values({
            caissierId,
            caisseId,
            agenceId: sessionAgenceId,
            soldeInitial: billetageValidation.calculatedTotal.toString(),
            soldeTheorique: billetageValidation.calculatedTotal.toString(),
            billetageOuverture,
            openedAt: new Date(),
            lastActivity: new Date(),
            timeoutAt,
          })
          .returning();

        // Log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId: newSession.id,
          action: "OPENED",
          statutApres: SessionComputedStatus.OPEN,
          details: {
            soldeInitial: billetageValidation.calculatedTotal,
            soldeInitialFourni: Number(soldeInitial),
            billetageOuverture,
            caisseId,
            agenceId: sessionAgenceId,
            validationBilletage: billetageValidation,
            caisseSoldeAvant,
            openingEcart,
          },
          userId: caissierId,
          ipAddress,
          userAgent,
        });

        return newSession;
      },
      {
        isolationLevel: "serializable",
      }
    );

    return {
      success: true,
      session: result,
    };
  } catch (error: any) {
    // Parser les erreurs personnalisées
    if (error.message?.startsWith("CAISSE_OCCUPIED:")) {
      return {
        success: false,
        error: error.message.replace("CAISSE_OCCUPIED:", ""),
        errorCode: "CAISSE_OCCUPIED",
      };
    }
    if (error.message?.startsWith("USER_HAS_SESSION:")) {
      return {
        success: false,
        error: error.message.replace("USER_HAS_SESSION:", ""),
        errorCode: "USER_HAS_SESSION",
      };
    }
    if (error.message?.startsWith("CAISSE_NOT_FOUND:")) {
      return {
        success: false,
        error: error.message.replace("CAISSE_NOT_FOUND:", ""),
        errorCode: "CAISSE_NOT_FOUND",
      };
    }
    if (error.message?.startsWith("CAISSE_AGENCE_MISMATCH:")) {
      return {
        success: false,
        error: error.message.replace("CAISSE_AGENCE_MISMATCH:", ""),
        errorCode: "CAISSE_AGENCE_MISMATCH",
      };
    }

    // Erreur de contrainte unique (race condition attrapée par la DB)
    if (error.code === "23505") {
      // unique_violation
      if (error.constraint?.includes("caisse")) {
        return {
          success: false,
          error: "Cette caisse vient d'être ouverte par un autre utilisateur",
          errorCode: "CAISSE_OCCUPIED",
        };
      }
      if (error.constraint?.includes("user")) {
        return {
          success: false,
          error: "Vous venez d'ouvrir une session sur une autre caisse",
          errorCode: "USER_HAS_SESSION",
        };
      }
    }

    console.error("Erreur ouverture session:", error);
    return {
      success: false,
      error: error.message || "Erreur lors de l'ouverture de la session",
      errorCode: "DB_ERROR",
    };
  }
}

// ============================================================================
// FERMETURE DE SESSION (ATOMIQUE)
// ============================================================================

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
  session?: any;
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

        let soldeTheorique = Number(session.soldeInitial);

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
          const sensAjustement = ecart > 0 ? "Crédit" as const : "Débit" as const;
          const [mouvementAjustement] = await tx.insert(mouvementsFinanciers).values({
            montant: Math.abs(ecart).toString(),
            sens: sensAjustement,
            sourceModule: "CAISSE" as const,
            agenceId: session.agenceId,
            sessionCaisseId: sessionId,
            typePaiement: "Ajustement" as any,
            methodePaiement: "Espèces" as const,
            reference: `ADJ-${sessionId.substring(0, 8)}-${Date.now()}`,
            idempotencyKey: `adj-close-${sessionId}`,
            statut: "Posté" as const,
            dateOperation: new Date(),
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
            typeOperation: "Ajustement",
            montant: Math.abs(ecart).toString(),
            methodePaiement: "Espèces",
            reference: mouvementAjustement.reference,
            description: `Ajustement écart de ${ecart > 0 ? "+" : ""}${ecart} FCFA à la fermeture`,
            statut: "Posté",
          });
        }

        // 6. Mettre à jour le solde de la caisse physique avec le solde réel compté
        const caisseSoldeAvant = Number(caisse.solde || 0);
        await tx
          .update(caisses)
          .set({
            solde: soldeReelNum.toString(),
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, caisse.id));

        // 7. Mettre à jour la session
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            closedAt: new Date(),
            soldeTheorique: soldeTheorique.toString(),
            soldeReel: soldeReelNum.toString(),
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
            soldeInitial: Number(session.soldeInitial),
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

    return {
      success: true,
      session: result.session,
      ecart: result.ecart,
      ecartAlert: result.ecartAlert,
    };
  } catch (error: any) {
    console.error("Erreur fermeture session:", error);
    return {
      success: false,
      error: error.message || "Erreur lors de la fermeture de la session",
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
      .where(and(eq(sessionsCaisse.id, sessionId), isNull(sessionsCaisse.closedAt)))
      .returning();

    return !!updated;
  } catch (error) {
    console.error("Erreur mise à jour heartbeat:", error);
    return false;
  }
}

/**
 * Récupère les sessions à risque (inactives depuis trop longtemps)
 */
export async function getRiskySessions(): Promise<
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
    .where(
      and(
        isNotNull(sessionsCaisse.openedAt),
        isNull(sessionsCaisse.closedAt),
        lt(sessionsCaisse.lastActivity, warningThreshold)
      )
    );

  const results = [];

  for (const row of sessions) {
    const lastActivity = row.session.lastActivity || row.session.openedAt;
    const hoursInactive = (Date.now() - new Date(lastActivity!).getTime()) / (1000 * 60 * 60);

    // Calculer le solde actuel
    const operations = await db
      .select()
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, row.session.id));

    let soldeCurrent = Number(row.session.soldeInitial);
    for (const op of operations) {
      const montant = Number(op.montant);
      if (IN_TYPES.includes(op.typeOperation)) {
        soldeCurrent += montant;
      } else if (OUT_TYPES.includes(op.typeOperation)) {
        soldeCurrent -= montant;
      }
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
        isNull(sessionsCaisse.closedAt),
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

    let soldeTheorique = Number(session.soldeInitial);
    for (const op of operations) {
      const montant = Number(op.montant);
      if (IN_TYPES.includes(op.typeOperation)) {
        soldeTheorique += montant;
      } else if (OUT_TYPES.includes(op.typeOperation)) {
        soldeTheorique -= montant;
      }
    }

    // Fermer la session avec raison "timeout"
    await db
      .update(sessionsCaisse)
      .set({
        closedAt: now,
        soldeTheorique: soldeTheorique.toString(),
        forcedCloseReason: ForcedCloseReason.TIMEOUT_AUTO,
        forceClosedAt: now,
        forceClosedBy: null,
        observations: `${session.observations || ""}\n[AUTO-FERMETURE] Session expirée après ${timeoutHours}h d'inactivité.`.trim(),
      })
      .where(eq(sessionsCaisse.id, session.id));

    // Log d'audit
    await db.insert(sessionsCaisseAuditLogs).values({
      sessionId: session.id,
      action: "TIMEOUT",
      statutAvant: SessionComputedStatus.OPEN,
      statutApres: SessionComputedStatus.CLOSED,
      details: {
        timeoutHours,
        soldeInitial: Number(session.soldeInitial),
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

/**
 * Récupère les sessions avec écarts significatifs (pour monitoring)
 */
export async function getSessionsWithSignificantEcarts(
  threshold: number = MAX_ECART_THRESHOLD
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
    .where(
      and(
        isNotNull(sessionsCaisse.closedAt),
        sql`ABS(CAST(${sessionsCaisse.ecart} AS NUMERIC)) > ${threshold}`
      )
    )
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
