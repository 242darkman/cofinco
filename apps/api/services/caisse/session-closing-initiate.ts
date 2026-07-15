import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  operationsCaisse,
} from "@shared/schema";
import { eq, and, count } from "drizzle-orm";
import { isOperationCaisseEntree, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";
import { agencyClosureService } from "./agency-closure-service";
import { checkPendingAgentRemises, checkMobileMoneyBalances, type MMReconciliationInfo, type PendingRemiseInfo } from "./session-closing-checks";
import type { SessionRow } from "./types";

const logger = createLogger('SessionClosingInitiate');

export interface InitiateCloseParams {
  sessionId: string;
  caissierId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateCloseResult {
  success: boolean;
  session?: SessionRow;
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

// ─────────────────────────────────────────────────────────────────────────
// PHASE A: Initiation de la fermeture (Gel de la session)
// ─────────────────────────────────────────────────────────────────────────
export async function initiateClose(params: InitiateCloseParams): Promise<InitiateCloseResult> {
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
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      // 2. Vérifier que c'est bien la session du caissier
      if (session.caissierId !== caissierId) {
        return {
          success: false,
          error: "Cette session ne vous appartient pas",
          errorCode: "NOT_YOUR_SESSION",
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
          errorCode: "INVALID_STATUS",
        };
      }

      // 4. Vérifier qu'il n'y a pas de transactions en attente
      const [pendingCount] = await tx
        .select({ count: count() })
        .from(operationsCaisse)
        .where(
          and(
            eq(operationsCaisse.sessionId, sessionId),
            eq(operationsCaisse.statut, "PENDING")
          )
        );

      if (pendingCount && Number(pendingCount.count) > 0) {
        return {
          success: false,
          error: `${pendingCount.count} transaction(s) en attente. Veuillez les traiter avant de fermer.`,
          errorCode: "PENDING_TRANSACTIONS",
        };
      }

      // 4b. Vérifier les remises terrain en attente (hors transaction pour permettre lecture)
      const remisesCheck = await checkPendingAgentRemises(session.caisseId);
      if (remisesCheck.hasPending) {
        logger.info({
          caisseId: session.caisseId,
          pendingRemises: remisesCheck.count,
          totalAmount: remisesCheck.totalAmount,
        }, 'Remises terrain en attente détectées');

        return {
          success: false,
          error: `${remisesCheck.count} remise(s) terrain en attente de règlement. Total: ${remisesCheck.totalAmount.toLocaleString()} XOF. Veuillez les traiter avant de fermer.`,
          errorCode: "PENDING_REMISES",
          pendingRemises: remisesCheck.remises,
        };
      }

      // 4c. Vérifier les soldes Mobile Money (informatif, ne bloque pas)
      let mmReconciliation: MMReconciliationInfo | undefined;
      if (session.agenceId) {
        mmReconciliation = await checkMobileMoneyBalances(sessionId, session.agenceId);
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
          statut: "CLOSING_COUNT",
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
  } catch (error: unknown) {
    logger.error({ err: error }, 'initiateClose error');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de l'initiation de la fermeture"),
      errorCode: "DB_ERROR",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Annuler le processus de fermeture (revenir à OPEN)
// Uniquement possible en phase CLOSING_COUNT
// ─────────────────────────────────────────────────────────────────────────
export async function cancelClose(params: {
  sessionId: string;
  caissierId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ success: boolean; session?: SessionRow; error?: string; errorCode?: string }> {
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
          statut: "OPEN",
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
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message, errorCode: "DB_ERROR" };
  }
}
