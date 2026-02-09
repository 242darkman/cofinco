/**
 * Service de Workflow Sécurisé de Fermeture de Caisse (Caisse → Coffre)
 *
 * Implémente le workflow en 3 phases:
 * - Phase A: Gel de la session (CLOSING_COUNT) - Plus de transactions autorisées
 * - Phase B: Comptage à l'aveugle (CLOSING_VALIDATION) - Comparaison avec solde théorique
 * - Phase C: Décision de trésorerie et clôture (CLOSED) - Transfert vers coffre ou report
 *
 * RÈGLE D'OR: L'argent compté physiquement doit correspondre à:
 * MontantVersCoffre + MontantReporte = TotalPhysique
 *
 * CONTRAINTE D'AUDIT: Une fois le comptage soumis, impossible de revenir en arrière
 * pour cacher un écart de caisse.
 */

import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
  users,
  coffresForts,
  mouvementsFinanciers,
  operationsCaisse,
  comptageBillets,
  mmBalanceReconciliations,
  remisesTerrain,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, count, inArray } from "drizzle-orm";
import { StatutTransfertCoffre, StatutCaisse, isOperationCaisseEntree, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { calculateBilletageTotal } from "./session-service";
import { createMouvementFinancier } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { createLogger } from "../../lib/logger";
import { getDigitalCaisseSummary } from "../mobile-money/mm-caisse-service";
import { providerRegistry } from "../mobile-money/provider-registry";
import { agencyClosureService } from "./agency-closure-service";

const logger = createLogger('SessionClosing');

// ============================================================================
// TYPES
// ============================================================================

export interface InitiateCloseParams {
  sessionId: string;
  caissierId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateCloseResult {
  success: boolean;
  session?: any;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "PENDING_TRANSACTIONS"
    | "PENDING_REMISES"
    | "MM_DISCREPANCY"
    | "DB_ERROR";
  // Données additionnelles pour le frontend
  pendingRemises?: PendingRemiseInfo[];
  mmReconciliation?: MMReconciliationInfo;
}

// Types pour les vérifications additionnelles
export interface PendingRemiseInfo {
  id: string;
  reference: string;
  agentId: string;
  agentNom: string;
  montantDeclare: number;
  statut: string;
  createdAt: Date;
}

export interface MMReconciliationInfo {
  hasDiscrepancy: boolean;
  providers: {
    provider: 'MTN' | 'AIRTEL';
    expectedBalance: number;
    providerBalance: number | null;
    ecart: number;
    status: 'MATCHED' | 'DISCREPANCY' | 'API_FAILED';
  }[];
}

export interface SubmitCountParams {
  sessionId: string;
  caissierId: string;
  billetageFermeture: Record<string, number>;
  ecartJustification?: string; // Obligatoire si écart != 0
  ipAddress?: string;
  userAgent?: string;
}

export interface SubmitCountResult {
  success: boolean;
  session?: any;
  soldeTheorique?: number;
  montantPhysique?: number;
  ecart?: number;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "MISSING_JUSTIFICATION"
    | "DB_ERROR";
}

export interface FinalizeCloseParams {
  sessionId: string;
  caissierId: string;
  montantVersCoffre: number;
  montantReporte: number;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FinalizeCloseResult {
  success: boolean;
  session?: any;
  transfert?: any;
  bordereauUrl?: string;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "AMOUNT_MISMATCH"
    | "COFFRE_NOT_FOUND"
    | "DB_ERROR";
}

export interface SubmitVerificationCountParams {
  sessionId: string;
  verifierId: string;
  billetage: Record<string, number>;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SubmitVerificationCountResult {
  success: boolean;
  verificationTotal?: number;
  primaryTotal?: number;
  ecartVerification?: number;
  matched?: boolean;
  error?: string;
  errorCode?: string;
}

export interface SessionCountsResult {
  primary: { total: number; billetage: any; countedBy?: string; countedAt?: string } | null;
  verification: { total: number; billetage: any; countedBy?: string; countedAt?: string } | null;
  ecartVerification: number | null;
  matched: boolean | null;
}

export interface ValidateClosingTransferParams {
  transfertId: string;
  validatorId: string;
  approved: boolean;
  reasonRejection?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ValidateClosingTransferResult {
  success: boolean;
  session?: any;
  transfert?: any;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

// Seuil d'écart considéré comme "mineur" (en FCFA)
const ECART_MINEUR_SEUIL = 100;

// Seuil d'écart Mobile Money pour avertissement (en FCFA)
const MM_DISCREPANCY_THRESHOLD = 1000;

// ============================================================================
// SERVICE
// ============================================================================

export class SessionClosingService {
  private transfertService = new TransfertCoffreService();

  // ─────────────────────────────────────────────────────────────────────────
  // VÉRIFICATIONS PRÉ-CLÔTURE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie s'il y a des remises terrain en attente pour cette caisse
   */
  async checkPendingAgentRemises(caisseId: string): Promise<{
    hasPending: boolean;
    count: number;
    totalAmount: number;
    remises: PendingRemiseInfo[];
  }> {
    try {
      // Chercher les remises non réglées destinées à cette caisse
      const pendingRemises = await db.select({
        id: remisesTerrain.id,
        reference: remisesTerrain.reference,
        agentId: remisesTerrain.agentId,
        montantDeclare: remisesTerrain.montantDeclare,
        statut: remisesTerrain.statut,
        createdAt: remisesTerrain.createdAt,
        agentNom: users.nom,
      })
      .from(remisesTerrain)
      .leftJoin(users, eq(remisesTerrain.agentId, users.id))
      .where(and(
        eq(remisesTerrain.caisseDestinationId, caisseId),
        inArray(remisesTerrain.statut, ['DRAFT', 'PENDING', 'VALIDATED'])
      ));

      const totalAmount = pendingRemises.reduce(
        (sum, r) => sum + Number(r.montantDeclare || 0),
        0
      );

      return {
        hasPending: pendingRemises.length > 0,
        count: pendingRemises.length,
        totalAmount,
        remises: pendingRemises.map(r => ({
          id: r.id,
          reference: r.reference || '',
          agentId: r.agentId,
          agentNom: r.agentNom || 'Agent inconnu',
          montantDeclare: Number(r.montantDeclare || 0),
          statut: r.statut || '',
          createdAt: r.createdAt || new Date(),
        })),
      };
    } catch (error) {
      logger.warn({ err: error, caisseId }, 'Erreur vérification remises terrain');
      // En cas d'erreur, on ne bloque pas la clôture
      return { hasPending: false, count: 0, totalAmount: 0, remises: [] };
    }
  }

  /**
   * Vérifie les soldes Mobile Money et compare avec les fournisseurs
   */
  async checkMobileMoneyBalances(sessionId: string, agenceId: string): Promise<MMReconciliationInfo> {
    try {
      // Récupérer les soldes des caisses digitales
      const summary = await getDigitalCaisseSummary(agenceId);

      const providers: MMReconciliationInfo['providers'] = [];
      let hasDiscrepancy = false;

      // Vérifier MTN
      if (summary.mtn.total > 0) {
        try {
          const mtnProvider = providerRegistry.get('MTN');
          if (mtnProvider && typeof mtnProvider.getBalance === 'function') {
            const startTime = Date.now();
            const balance = await mtnProvider.getBalance();
            const responseTime = Date.now() - startTime;

            const expectedBalance = summary.mtn.total;
            const providerBalance = Number(balance.balance || 0);
            const ecart = providerBalance - expectedBalance;

            const status = Math.abs(ecart) > MM_DISCREPANCY_THRESHOLD ? 'DISCREPANCY' : 'MATCHED';
            if (status === 'DISCREPANCY') hasDiscrepancy = true;

            providers.push({
              provider: 'MTN',
              expectedBalance,
              providerBalance,
              ecart,
              status,
            });

            // Enregistrer la réconciliation
            await db.insert(mmBalanceReconciliations).values({
              sessionId,
              provider: 'MTN',
              expectedBalance: expectedBalance.toString(),
              providerBalance: providerBalance.toString(),
              ecart: ecart.toString(),
              apiCallSuccess: true,
              apiResponseTimeMs: responseTime.toString(),
              statut: status,
            });
          }
        } catch (error: any) {
          logger.warn({ err: error }, 'Erreur récupération balance MTN');
          providers.push({
            provider: 'MTN',
            expectedBalance: summary.mtn.total,
            providerBalance: null,
            ecart: 0,
            status: 'API_FAILED',
          });

          await db.insert(mmBalanceReconciliations).values({
            sessionId,
            provider: 'MTN',
            expectedBalance: summary.mtn.total.toString(),
            ecart: '0',
            apiCallSuccess: false,
            apiErrorMessage: error.message,
            statut: 'API_FAILED',
          });
        }
      }

      // Vérifier Airtel
      if (summary.airtel.total > 0) {
        try {
          const airtelProvider = providerRegistry.get('AIRTEL');
          if (airtelProvider && typeof airtelProvider.getBalance === 'function') {
            const startTime = Date.now();
            const balance = await airtelProvider.getBalance();
            const responseTime = Date.now() - startTime;

            const expectedBalance = summary.airtel.total;
            const providerBalance = Number(balance.balance || 0);
            const ecart = providerBalance - expectedBalance;

            const status = Math.abs(ecart) > MM_DISCREPANCY_THRESHOLD ? 'DISCREPANCY' : 'MATCHED';
            if (status === 'DISCREPANCY') hasDiscrepancy = true;

            providers.push({
              provider: 'AIRTEL',
              expectedBalance,
              providerBalance,
              ecart,
              status,
            });

            await db.insert(mmBalanceReconciliations).values({
              sessionId,
              provider: 'AIRTEL',
              expectedBalance: expectedBalance.toString(),
              providerBalance: providerBalance.toString(),
              ecart: ecart.toString(),
              apiCallSuccess: true,
              apiResponseTimeMs: responseTime.toString(),
              statut: status,
            });
          }
        } catch (error: any) {
          logger.warn({ err: error }, 'Erreur récupération balance Airtel');
          providers.push({
            provider: 'AIRTEL',
            expectedBalance: summary.airtel.total,
            providerBalance: null,
            ecart: 0,
            status: 'API_FAILED',
          });

          await db.insert(mmBalanceReconciliations).values({
            sessionId,
            provider: 'AIRTEL',
            expectedBalance: summary.airtel.total.toString(),
            ecart: '0',
            apiCallSuccess: false,
            apiErrorMessage: error.message,
            statut: 'API_FAILED',
          });
        }
      }

      // Mettre à jour la session avec le statut de réconciliation
      const mmStatus = hasDiscrepancy ? 'DISCREPANCY' : (providers.length > 0 ? 'MATCHED' : 'SKIPPED');
      await db.update(sessionsCaisse)
        .set({
          mmReconciliationStatus: mmStatus,
          mmReconciliationCompletedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, sessionId));

      return { hasDiscrepancy, providers };
    } catch (error) {
      logger.error({ err: error, sessionId, agenceId }, 'Erreur vérification balances MM');
      return { hasDiscrepancy: false, providers: [] };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE A: Initiation de la fermeture (Gel de la session)
  // ─────────────────────────────────────────────────────────────────────────
  async initiateClose(params: InitiateCloseParams): Promise<InitiateCloseResult> {
    const { sessionId, caissierId, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut OPEN
        if (session.statut !== "OPEN") {
          const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
          const guidance: Record<string, string> = {
            REQUESTING_FUNDS: "Veuillez attendre la validation du coffre avant d'utiliser la caisse.",
            FUNDS_DISPATCHED: "Les fonds ont été envoyés par le coffre. Veuillez d'abord confirmer la réception des fonds pour finaliser l'ouverture de votre session.",
            CLOSING_COUNT: "La session est déjà en cours de fermeture (phase de comptage).",
            CLOSING_VALIDATION: "La session est déjà en cours de fermeture (phase de validation).",
            CLOSED: "Cette session est déjà fermée.",
          };
          const detail = guidance[session.statut] || "";
          return {
            success: false,
            error: `Impossible de fermer la session : elle est actuellement en statut « ${label} ». ${detail}`.trim(),
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Vérifier qu'il n'y a pas de transactions en attente
        const [pendingCount] = await tx
          .select({ count: count() })
          .from(operationsCaisse)
          .where(
            and(
              eq(operationsCaisse.sessionId, sessionId),
              eq(operationsCaisse.statut, "PENDING" as any)
            )
          );

        if (pendingCount && Number(pendingCount.count) > 0) {
          return {
            success: false,
            error: `${pendingCount.count} transaction(s) en attente. Veuillez les traiter avant de fermer.`,
            errorCode: "PENDING_TRANSACTIONS" as const,
          };
        }

        // 4b. Vérifier les remises terrain en attente (hors transaction pour permettre lecture)
        const remisesCheck = await this.checkPendingAgentRemises(session.caisseId);
        if (remisesCheck.hasPending) {
          logger.info({
            caisseId: session.caisseId,
            pendingRemises: remisesCheck.count,
            totalAmount: remisesCheck.totalAmount,
          }, 'Remises terrain en attente détectées');

          return {
            success: false,
            error: `${remisesCheck.count} remise(s) terrain en attente de règlement. Total: ${remisesCheck.totalAmount.toLocaleString()} XOF. Veuillez les traiter avant de fermer.`,
            errorCode: "PENDING_REMISES" as const,
            pendingRemises: remisesCheck.remises,
          };
        }

        // 4c. Vérifier les soldes Mobile Money (informatif, ne bloque pas)
        let mmReconciliation: MMReconciliationInfo | undefined;
        if (session.agenceId) {
          mmReconciliation = await this.checkMobileMoneyBalances(sessionId, session.agenceId);
          if (mmReconciliation.hasDiscrepancy) {
            logger.warn({
              sessionId,
              agenceId: session.agenceId,
              providers: mmReconciliation.providers,
            }, 'Écart Mobile Money détecté lors de la clôture');
            // Note: On ne bloque pas la clôture pour les écarts MM, mais on les signale
          }
        }

        // 5. Calculer le solde théorique de fermeture
        // Solde théorique = Montant d'ouverture + Entrées - Sorties
        const operations = await tx
          .select()
          .from(operationsCaisse)
          .where(eq(operationsCaisse.sessionId, sessionId));

        let totalEntrees = 0;
        let totalSorties = 0;

        for (const op of operations) {
          const montant = Number(op.montant || 0);
          if (isOperationCaisseEntree(op.typeOperation)) {
            totalEntrees += montant;
          } else {
            totalSorties += montant;
          }
        }

        const montantOuverture = Number(session.montantOuverture || 0);
        const soldeTheorique = montantOuverture + totalEntrees - totalSorties;

        logger.info({ montantOuverture, totalEntrees, totalSorties, soldeTheorique }, 'Calcul solde theorique');

        // 6. Geler la session (passer en CLOSING_COUNT) avec le solde théorique calculé
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSING_COUNT" as any,
            closingInitiatedAt: new Date(),
            montantFermetureTheorique: soldeTheorique.toString(),
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 7. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSING_INITIATED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSING_COUNT",
          details: {
            montantOuverture,
            totalEntrees,
            totalSorties,
            soldeTheorique,
            mmReconciliation: mmReconciliation || null,
          },
          ipAddress,
          userAgent,
        });

        // 8. Mettre à jour la progression de clôture agence
        if (session.agenceId) {
          await agencyClosureService.updateClosureProgress(session.agenceId);
        }

        return {
          success: true,
          session: updatedSession,
          mmReconciliation,
        };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'initiateClose error');
      return {
        success: false,
        error: error.message || "Erreur lors de l'initiation de la fermeture",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE B: Soumission du comptage à l'aveugle (Blind Count)
  // ─────────────────────────────────────────────────────────────────────────
  async submitCount(params: SubmitCountParams): Promise<SubmitCountResult> {
    const {
      sessionId,
      caissierId,
      billetageFermeture,
      ecartJustification,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut CLOSING_COUNT
        if (session.statut !== "CLOSING_COUNT") {
          const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
          return {
            success: false,
            error: `Impossible de soumettre le comptage : la session est actuellement en statut « ${label} » et non en phase de comptage.`,
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Calculer le montant physique depuis le billetage
        const montantPhysique = calculateBilletageTotal(billetageFermeture);

        // 5. Récupérer le solde théorique
        const soldeTheorique = Number(session.montantFermetureTheorique || 0);

        // 6. Calculer l'écart
        const ecart = montantPhysique - soldeTheorique;

        // 7. Si écart non-nul, vérifier que la justification est fournie
        if (Math.abs(ecart) > 0 && !ecartJustification?.trim()) {
          return {
            success: false,
            error: `Un écart de ${ecart.toLocaleString('fr-FR')} FCFA a été détecté. Une justification est obligatoire.`,
            errorCode: "MISSING_JUSTIFICATION" as const,
            soldeTheorique,
            montantPhysique,
            ecart,
          };
        }

        // 8. Mettre à jour la session avec les données de comptage
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSING_VALIDATION" as any,
            billetageFermeture,
            montantFermetureDeclare: montantPhysique.toString(),
            montantPhysique: montantPhysique.toString(),
            ecart: ecart.toString(),
            ecartJustification: ecartJustification || null,
            countSubmittedAt: new Date(),
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 9. Enregistrer le Billetage de Fermeture dans comptage_billets
        await tx.insert(comptageBillets).values({
          sessionId: sessionId,
          typeComptage: "FERMETURE",
          billets10000: billetageFermeture["10000"] || 0,
          billets5000: billetageFermeture["5000"] || 0,
          billets2000: billetageFermeture["2000"] || 0,
          billets1000: billetageFermeture["1000"] || 0,
          billets500: billetageFermeture["500"] || 0,
          pieces250: billetageFermeture["250"] || 0,
          pieces100: billetageFermeture["100"] || 0,
          pieces50: billetageFermeture["50"] || 0,
          pieces25: billetageFermeture["25"] || 0,
          totalCalcule: montantPhysique.toString(),
          totalDeclare: montantPhysique.toString(),
          ecart: ecart.toString(),
          observations: ecartJustification || "Billetage de fermeture de session",
        });

        // 10. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "COUNT_SUBMITTED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSING_VALIDATION",
          details: {
            montantPhysique,
            soldeTheorique,
            ecart,
            ecartJustification,
          },
          ipAddress,
          userAgent,
        });

        // 11. Si écart significatif, créer une entrée dans l'historique des écarts
        if (Math.abs(ecart) > ECART_MINEUR_SEUIL) {
          await this.recordEcartAudit(tx, {
            sessionId,
            caissierId,
            agenceId: session.agenceId || undefined,
            soldeTheorique,
            montantPhysique,
            ecart,
            justification: ecartJustification || "",
            ipAddress,
            userAgent,
          });
        }

        return {
          success: true,
          session: updatedSession,
          soldeTheorique,
          montantPhysique,
          ecart,
        };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'submitCount error');
      return {
        success: false,
        error: error.message || "Erreur lors de la soumission du comptage",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE C: Finalisation de la fermeture (Décision de trésorerie)
  // ─────────────────────────────────────────────────────────────────────────
  async finalizeClose(params: FinalizeCloseParams): Promise<FinalizeCloseResult> {
    const {
      sessionId,
      caissierId,
      montantVersCoffre,
      montantReporte,
      observations,
      ipAddress,
      userAgent,
    } = params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer la session
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return {
            success: false,
            error: "Session introuvable",
            errorCode: "SESSION_NOT_FOUND" as const,
          };
        }

        // 2. Vérifier que c'est bien la session du caissier
        if (session.caissierId !== caissierId) {
          return {
            success: false,
            error: "Cette session ne vous appartient pas",
            errorCode: "NOT_YOUR_SESSION" as const,
          };
        }

        // 3. Vérifier que la session est en statut CLOSING_VALIDATION
        if (session.statut !== "CLOSING_VALIDATION") {
          const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
          return {
            success: false,
            error: `Impossible de finaliser la fermeture : la session est actuellement en statut « ${label} » et non en phase de validation.`,
            errorCode: "INVALID_STATUS" as const,
          };
        }

        // 4. Vérifier la cohérence des montants
        // MontantVersCoffre + MontantReporte DOIT = MontantPhysique
        const montantPhysique = Number(session.montantPhysique || 0);
        const totalDecision = montantVersCoffre + montantReporte;

        if (Math.abs(totalDecision - montantPhysique) > 1) {
          // Tolérance de 1 FCFA pour les arrondis
          return {
            success: false,
            error: `La somme (${totalDecision.toLocaleString('fr-FR')} FCFA) ne correspond pas au montant physique compté (${montantPhysique.toLocaleString('fr-FR')} FCFA)`,
            errorCode: "AMOUNT_MISMATCH" as const,
          };
        }

        let closingTransfert = null;

        // 5. Si transfert vers coffre, créer le transfert
        if (montantVersCoffre > 0) {
          // Récupérer le coffre-fort de l'agence
          const coffreFort = await this.transfertService.getOrCreateCoffreFort(
            session.agenceId!
          );

          if (!coffreFort) {
            return {
              success: false,
              error: "Coffre-fort introuvable pour cette agence",
              errorCode: "COFFRE_NOT_FOUND" as const,
            };
          }

          // Générer une référence unique pour le transfert
          const transfertReference = `TRF-CLS-${Date.now().toString(36).toUpperCase()}-${sessionId.substring(0, 4).toUpperCase()}`;

          // Créer le transfert CAISSE → COFFRE
          const [transfert] = await tx
            .insert(transfertsCoffreCaisse)
            .values({
              agenceId: session.agenceId!,
              coffreId: coffreFort.id,
              caisseId: session.caisseId,
              typeTransfert: "CAISSE_VERS_COFFRE" as any,
              montant: montantVersCoffre.toString(),
              motif: `Remise de clôture - Session ${sessionId.substring(0, 8)}`,
              reference: transfertReference,
              statut: StatutTransfertCoffre.REQUESTED as any,
              requestedBy: caissierId,
              sessionOuvertureId: null,
              isOpeningFund: false,
            })
            .returning();

          closingTransfert = transfert;

          // Log d'audit du transfert
          await tx.insert(transfertsCoffreAuditLogs).values({
            transfertId: transfert.id,
            action: "CREATED",
            userId: caissierId,
            statutApres: StatutTransfertCoffre.REQUESTED,
            details: {
              montant: montantVersCoffre,
              type: "CAISSE_VERS_COFFRE",
              motif: "Remise de clôture",
              sessionId,
            },
            ipAddress,
            userAgent,
          });
        }

        // 6. Si écart non-nul, créer l'écriture comptable d'écart
        const ecart = Number(session.ecart || 0);
        if (Math.abs(ecart) > 0) {
          await this.createEcartComptable(tx, {
            sessionId,
            caissierId,
            agenceId: session.agenceId!,
            caisseId: session.caisseId,
            ecart,
            justification: session.ecartJustification || "",
            ipAddress,
            userAgent,
          });
        }

        // 7. Créer le mouvement financier de clôture (requis par BALANCE_GUARD)
        // Ce mouvement représente l'ajustement du solde caisse lors de la fermeture
        const currentCaisseSolde = Number(
          (await tx.select({ solde: caisses.solde }).from(caisses).where(eq(caisses.id, session.caisseId)))[0]?.solde || 0
        );
        const balanceDelta = currentCaisseSolde - montantReporte;
        if (Math.abs(balanceDelta) > 0) {
          await createMouvementFinancier(
            tx,
            {
              agenceId: session.agenceId!,
              sens: balanceDelta > 0 ? "DEBIT" : "CREDIT",
              montant: Math.abs(balanceDelta).toString(),
              sourceModule: "CAISSE",
              typePaiement: "SESSION_CLOSING_TRANSFER",
              sessionCaisseId: sessionId,
              requiresGlPosting: false,
              metadata: {
                type: "CLOSING_BALANCE_ADJUSTMENT",
                sessionId,
                caisseId: session.caisseId,
                soldeBefore: currentCaisseSolde,
                soldeAfter: montantReporte,
                montantVersCoffre,
                montantReporte,
              },
            },
            caissierId
          );
        } else {
          // Balance unchanged — set flag manually to satisfy guard
          await tx.execute(sql`SELECT set_config('app.mouvement_created', 'true', true)`);
        }

        // 8. Mettre à jour la caisse physique
        // Le solde de la caisse = montant reporté (ce qui reste pour demain)
        // CRITIQUE: Mettre le statut à CLOSED et libérer le verrouillage
        await tx
          .update(caisses)
          .set({
            solde: montantReporte.toString(),
            statut: StatutCaisse.CLOSED,
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, session.caisseId));

        // 9. Fermer définitivement la session
        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSED" as any,
            closedAt: new Date(),
            closingFinalizedAt: new Date(),
            montantVersCoffre: montantVersCoffre.toString(),
            montantReporte: montantReporte.toString(),
            closingTransfertId: closingTransfert?.id || null,
            coffreValidationStatus: montantVersCoffre > 0 ? "PENDING" : null,
            fundsKeptInCaisse: montantReporte > 0,
            observations: observations
              ? `${session.observations || ""}\n[Clôture] ${observations}`.trim()
              : session.observations,
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        // 10. Créer log d'audit
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSED",
          userId: caissierId,
          statutAvant: session.statut,
          statutApres: "CLOSED",
          details: {
            montantVersCoffre,
            montantReporte,
            closingTransfertId: closingTransfert?.id,
          },
          ipAddress,
          userAgent,
        });

        return {
          success: true,
          session: updatedSession,
          transfert: closingTransfert,
        };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'finalizeClose error');
      return {
        success: false,
        error: error.message || "Erreur lors de la finalisation de la fermeture",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation du transfert de clôture par le responsable coffre
  // ─────────────────────────────────────────────────────────────────────────
  async validateClosingTransfer(
    params: ValidateClosingTransferParams
  ): Promise<ValidateClosingTransferResult> {
    const { transfertId, validatorId, approved, reasonRejection, ipAddress, userAgent } =
      params;

    try {
      return await db.transaction(async (tx) => {
        // 1. Récupérer le transfert
        const [transfert] = await tx
          .select()
          .from(transfertsCoffreCaisse)
          .where(eq(transfertsCoffreCaisse.id, transfertId));

        if (!transfert) {
          return {
            success: false,
            error: "Transfert introuvable",
            errorCode: "TRANSFERT_NOT_FOUND",
          };
        }

        // 2. Vérifier que c'est un transfert de fermeture
        if (transfert.typeTransfert !== "CAISSE_VERS_COFFRE") {
          return {
            success: false,
            error: "Ce n'est pas un transfert de fermeture",
            errorCode: "INVALID_TRANSFER_TYPE",
          };
        }

        // 3. Vérifier le statut
        if (transfert.statut !== StatutTransfertCoffre.REQUESTED) {
          return {
            success: false,
            error: `Ce transfert a déjà été traité (${transfert.statut === "VALIDATED" ? "validé" : transfert.statut === "EXECUTED" ? "exécuté" : transfert.statut === "REJECTED" ? "rejeté" : transfert.statut === "CANCELLED" ? "annulé" : transfert.statut}).`,
            errorCode: "ALREADY_PROCESSED",
          };
        }

        // 4. Vérifier que le validateur n'est pas l'initiateur
        if (transfert.requestedBy === validatorId) {
          return {
            success: false,
            error: "Vous ne pouvez pas valider votre propre transfert",
            errorCode: "SELF_VALIDATION",
          };
        }

        // 5. Récupérer la session liée
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.closingTransfertId, transfertId));

        if (approved) {
          // Valider et exécuter le transfert
          const validateResult = await this.transfertService.validateTransfert({
            transfertId,
            validatorId,
            approved: true,
            ipAddress,
            userAgent,
          });

          if (!validateResult.success) {
            return validateResult;
          }

          // Exécuter le transfert
          const executeResult = await this.transfertService.executeTransfert({
            transfertId,
            executorId: validatorId,
            ipAddress,
            userAgent,
          });

          if (!executeResult.success || !("transfert" in executeResult)) {
            return {
              success: false,
              error: "error" in executeResult ? executeResult.error : "Erreur d'exécution",
              errorCode: "errorCode" in executeResult ? executeResult.errorCode : "EXECUTE_ERROR",
            };
          }

          // Mettre à jour la session
          if (session) {
            await tx
              .update(sessionsCaisse)
              .set({
                coffreValidationStatus: "APPROVED",
                coffreValidatedBy: validatorId,
                coffreValidatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(sessionsCaisse.id, session.id));
          }

          return {
            success: true,
            session,
            transfert: executeResult.transfert,
          };
        } else {
          // Rejeter le transfert
          await tx
            .update(transfertsCoffreCaisse)
            .set({
              statut: StatutTransfertCoffre.REJECTED as any,
              validatedBy: validatorId,
              validatedAt: new Date(),
              reasonRejection: reasonRejection,
              updatedAt: new Date(),
            })
            .where(eq(transfertsCoffreCaisse.id, transfertId));

          // Mettre à jour la session
          if (session) {
            await tx
              .update(sessionsCaisse)
              .set({
                coffreValidationStatus: "REJECTED",
                coffreValidatedBy: validatorId,
                coffreValidatedAt: new Date(),
                observations: `${session.observations || ""}\n[Coffre Rejet] ${reasonRejection}`.trim(),
                updatedAt: new Date(),
              })
              .where(eq(sessionsCaisse.id, session.id));
          }

          // Log d'audit
          await tx.insert(transfertsCoffreAuditLogs).values({
            transfertId,
            action: "REJECTED",
            userId: validatorId,
            statutAvant: StatutTransfertCoffre.REQUESTED,
            statutApres: StatutTransfertCoffre.REJECTED,
            details: { reasonRejection },
            ipAddress,
            userAgent,
          });

          return {
            success: true,
            session,
            transfert: { ...transfert, statut: StatutTransfertCoffre.REJECTED },
          };
        }
      });
    } catch (error: any) {
      logger.error({ err: error }, 'validateClosingTransfer error');
      return {
        success: false,
        error: error.message || "Erreur lors de la validation du transfert",
        errorCode: "DB_ERROR",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Annuler le processus de fermeture (revenir à OPEN)
  // Uniquement possible en phase CLOSING_COUNT
  // ─────────────────────────────────────────────────────────────────────────
  async cancelClose(params: {
    sessionId: string;
    caissierId: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; session?: any; error?: string; errorCode?: string }> {
    const { sessionId, caissierId, reason, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));

        if (!session) {
          return { success: false, error: "Session introuvable", errorCode: "SESSION_NOT_FOUND" };
        }

        if (session.caissierId !== caissierId) {
          return { success: false, error: "Cette session ne vous appartient pas", errorCode: "NOT_YOUR_SESSION" };
        }

        // Ne peut annuler que si en CLOSING_COUNT
        if (session.statut !== "CLOSING_COUNT") {
          return {
            success: false,
            error: "Impossible d'annuler la fermeture à ce stade. Le comptage a déjà été validé.",
            errorCode: "INVALID_STATUS",
          };
        }

        const [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "OPEN" as any,
            closingInitiatedAt: null,
            lastActivity: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, sessionId))
          .returning();

        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "CLOSING_CANCELLED",
          userId: caissierId,
          statutAvant: "CLOSING_COUNT",
          statutApres: "OPEN",
          details: { reason },
          ipAddress,
          userAgent,
        });

        return { success: true, session: updatedSession };
      });
    } catch (error: any) {
      return { success: false, error: error.message, errorCode: "DB_ERROR" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Récupérer les sessions en cours de fermeture (pour supervision)
  // ─────────────────────────────────────────────────────────────────────────
  async getClosingSessionsForAgence(agenceId: string): Promise<any[]> {
    const sessions = await db
      .select({
        session: sessionsCaisse,
        caissier: {
          id: users.id,
          nom: users.nom,
          prenom: users.prenom,
        },
        caisse: {
          id: caisses.id,
          nom: caisses.nom,
        },
      })
      .from(sessionsCaisse)
      .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(
        and(
          eq(sessionsCaisse.agenceId, agenceId),
          sql`${sessionsCaisse.statut} IN ('CLOSING_COUNT', 'CLOSING_VALIDATION')`
        )
      )
      .orderBy(desc(sessionsCaisse.closingInitiatedAt));

    return sessions.map((row) => ({
      ...row.session,
      caissierNom: row.caissier ? `${row.caissier.prenom} ${row.caissier.nom}` : null,
      caisseNom: row.caisse?.nom,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers privés
  // ─────────────────────────────────────────────────────────────────────────

  private async recordEcartAudit(
    tx: any,
    params: {
      sessionId: string;
      caissierId: string;
      agenceId?: string;
      soldeTheorique: number;
      montantPhysique: number;
      ecart: number;
      justification: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    // Créer une entrée dans la table d'audit des écarts
    // Note: La table ecarts_caisse_audit doit exister (créée dans la migration)
    try {
      await tx.execute(sql`
        INSERT INTO ecarts_caisse_audit (
          session_id, caissier_id, agence_id,
          solde_theorique, montant_physique, ecart,
          justification, type_ecart, ip_address, user_agent
        ) VALUES (
          ${params.sessionId}, ${params.caissierId}, ${params.agenceId},
          ${params.soldeTheorique}, ${params.montantPhysique}, ${params.ecart},
          ${params.justification}, ${params.ecart > 0 ? "SURPLUS" : "DEFICIT"},
          ${params.ipAddress}, ${params.userAgent}
        )
      `);
    } catch (error) {
      logger.warn({ err: error }, 'Ecart audit recording failed (table may not exist)');
      // Ne pas bloquer le processus si la table d'audit n'existe pas encore
    }
  }

  private async createEcartComptable(
    tx: any,
    params: {
      sessionId: string;
      caissierId: string;
      agenceId: string;
      caisseId: string;
      ecart: number;
      justification: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    const { sessionId, caissierId, agenceId, caisseId, ecart, justification } = params;

    // Déterminer le type d'écriture (produit ou charge exceptionnelle)
    const isExcedent = ecart > 0;
    const montantAbsolu = Math.abs(ecart);

    try {
      // Créer le mouvement financier pour l'écart de caisse
      const typePaiement = isExcedent ? "SESSION_SURPLUS" : "SESSION_DEFICIT";
      const mouvement = await createMouvementFinancier(
        tx,
        {
          agenceId,
          sens: isExcedent ? "CREDIT" : "DEBIT",
          montant: montantAbsolu.toString(),
          sourceModule: "CAISSE",
          typePaiement,
          requiresGlPosting: true,
          metadata: {
            ecart,
            justification,
            type: isExcedent ? "EXCEDENT_CAISSE" : "DEFICIT_CAISSE",
            sessionId,
            caisseId,
          },
        },
        caissierId
      );

      // GL posting — write the accounting entry for this écart
      if (agenceId) {
        try {
          const glResult = await postGlForMouvement(tx, mouvement, agenceId, caissierId, {
            sessionId,
            caisseId,
            ecart,
            direction: isExcedent ? "SURPLUS" : "DEFICIT",
          });
          if (glResult) {
            await tx.update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED", glPostingError: null })
              .where(eq(mouvementsFinanciers.id, mouvement.id));
          }
        } catch (glError: unknown) {
          const message = glError instanceof Error ? glError.message : "Unknown GL error";
          logger.error({ mouvementId: mouvement.id, error: message }, 'GL posting failed for ecart mouvement');
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "FAILED", glPostingError: message })
            .where(eq(mouvementsFinanciers.id, mouvement.id));
          // Don't rethrow — closing should still succeed even if GL posting fails
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Ecart comptable creation failed');
      // Ne pas bloquer le processus, mais logger l'erreur
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICATION COUNT: Second blind count by a different user (supervisor)
  // ─────────────────────────────────────────────────────────────────────────
  async submitVerificationCount(params: SubmitVerificationCountParams): Promise<SubmitVerificationCountResult> {
    const { sessionId, verifierId, billetage, observations, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionId));
        if (!session) {
          return { success: false, error: "Session introuvable", errorCode: "SESSION_NOT_FOUND" };
        }

        // Must be in CLOSING_VALIDATION (after primary count)
        if (session.statut !== "CLOSING_VALIDATION") {
          return { success: false, error: "La session doit être en phase de validation pour un comptage de vérification", errorCode: "INVALID_STATUS" };
        }

        // Verifier must be different from the cashier
        if (session.caissierId === verifierId) {
          return { success: false, error: "Le vérificateur doit être différent du caissier", errorCode: "SAME_USER" };
        }

        // Check if verification already submitted
        const existingVerif = await tx
          .select()
          .from(comptageBillets)
          .where(and(eq(comptageBillets.sessionId, sessionId), eq(comptageBillets.typeComptage, "VERIFICATION")));

        if (existingVerif.length > 0) {
          return { success: false, error: "Un comptage de vérification a déjà été soumis pour cette session", errorCode: "ALREADY_VERIFIED" };
        }

        const verificationTotal = calculateBilletageTotal(billetage);
        const primaryTotal = Number(session.montantPhysique || 0);
        const ecartVerification = verificationTotal - primaryTotal;

        // Record verification count
        await tx.insert(comptageBillets).values({
          sessionId,
          typeComptage: "VERIFICATION",
          billets10000: billetage["10000"] || 0,
          billets5000: billetage["5000"] || 0,
          billets2000: billetage["2000"] || 0,
          billets1000: billetage["1000"] || 0,
          billets500: billetage["500"] || 0,
          pieces250: billetage["250"] || 0,
          pieces100: billetage["100"] || 0,
          pieces50: billetage["50"] || 0,
          pieces25: billetage["25"] || 0,
          totalCalcule: verificationTotal.toString(),
          totalDeclare: verificationTotal.toString(),
          ecart: ecartVerification.toString(),
          validePar: verifierId,
          dateValidation: new Date(),
          observations: observations || "Comptage de vérification",
        });

        // Audit log
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId,
          action: "VERIFICATION_COUNT_SUBMITTED",
          userId: verifierId,
          statutAvant: session.statut,
          statutApres: session.statut, // no status change
          details: {
            verificationTotal,
            primaryTotal,
            ecartVerification,
            matched: Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL,
          },
          ipAddress,
          userAgent,
        });

        return {
          success: true,
          verificationTotal,
          primaryTotal,
          ecartVerification,
          matched: Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL,
        };
      });
    } catch (error: any) {
      logger.error({ err: error }, 'submitVerificationCount error');
      return { success: false, error: error.message || "Erreur lors du comptage de vérification", errorCode: "DB_ERROR" };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET COUNTS: Retrieve primary and verification counts for a session
  // ─────────────────────────────────────────────────────────────────────────
  async getSessionCounts(sessionId: string): Promise<SessionCountsResult> {
    const counts = await db
      .select({
        typeComptage: comptageBillets.typeComptage,
        totalCalcule: comptageBillets.totalCalcule,
        ecart: comptageBillets.ecart,
        validePar: comptageBillets.validePar,
        dateValidation: comptageBillets.dateValidation,
        billets10000: comptageBillets.billets10000,
        billets5000: comptageBillets.billets5000,
        billets2000: comptageBillets.billets2000,
        billets1000: comptageBillets.billets1000,
        billets500: comptageBillets.billets500,
        pieces250: comptageBillets.pieces250,
        pieces100: comptageBillets.pieces100,
        pieces50: comptageBillets.pieces50,
        pieces25: comptageBillets.pieces25,
        observations: comptageBillets.observations,
        createdAt: comptageBillets.createdAt,
      })
      .from(comptageBillets)
      .where(eq(comptageBillets.sessionId, sessionId));

    const primary = counts.find(c => c.typeComptage === "FERMETURE");
    const verification = counts.find(c => c.typeComptage === "VERIFICATION");

    const primaryTotal = primary ? Number(primary.totalCalcule) : null;
    const verificationTotal = verification ? Number(verification.totalCalcule) : null;
    const ecartVerification = primaryTotal !== null && verificationTotal !== null
      ? verificationTotal - primaryTotal
      : null;

    return {
      primary: primary ? {
        total: Number(primary.totalCalcule),
        billetage: {
          "10000": primary.billets10000, "5000": primary.billets5000,
          "2000": primary.billets2000, "1000": primary.billets1000,
          "500": primary.billets500, "250": primary.pieces250,
          "100": primary.pieces100, "50": primary.pieces50,
          "25": primary.pieces25,
        },
        countedBy: primary.validePar || undefined,
        countedAt: primary.createdAt?.toISOString(),
      } : null,
      verification: verification ? {
        total: Number(verification.totalCalcule),
        billetage: {
          "10000": verification.billets10000, "5000": verification.billets5000,
          "2000": verification.billets2000, "1000": verification.billets1000,
          "500": verification.billets500, "250": verification.pieces250,
          "100": verification.pieces100, "50": verification.pieces50,
          "25": verification.pieces25,
        },
        countedBy: verification.validePar || undefined,
        countedAt: verification.createdAt?.toISOString(),
      } : null,
      ecartVerification,
      matched: ecartVerification !== null ? Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL : null,
    };
  }
}

// Export singleton instance
export const sessionClosingService = new SessionClosingService();
