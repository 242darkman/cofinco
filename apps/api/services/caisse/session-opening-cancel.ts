import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  mouvementsFinanciers,
  operationsCaisse,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { StatutTransfertCoffre, StatutTransaction, STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { getWsInstance } from "../../ws-server";
import { updateCoffreBalance, updateCaisseBalance } from "../coffre/coffre-guard";
import { balanceService } from "../balance-service";
import { createLogger } from "../../lib/logger";
import { postGlForMouvement, AccountingRuleNotFoundError } from "../accounting-posting-service";

const logger = createLogger('SessionOpeningCancel');

export interface CancelRequestParams {
  sessionId: string;
  userId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Annulation d'une demande par le caissier (REQUESTING_FUNDS ou FUNDS_DISPATCHED)
 * Si les fonds ont déjà été envoyés (FUNDS_DISPATCHED), le transfert est
 * annulé et les fonds sont restitués au coffre-fort (historisé des deux côtés).
 */
export async function cancelOpeningRequest(params: CancelRequestParams): Promise<{
  success: boolean;
  error?: string;
  errorCode?: string;
}> {
  const { sessionId, userId, reason, ipAddress, userAgent } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer la session
      const [session] = await tx
        .select()
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId))
        .for("update");

      if (!session) {
        return {
          success: false,
          error: "Session introuvable",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      // 2. Vérifier que c'est bien le caissier de cette session
      if (session.caissierId !== userId) {
        return {
          success: false,
          error: "Vous n'êtes pas le caissier de cette session",
          errorCode: "PERMISSION_DENIED",
        };
      }

      // 3. Vérifier l'état (REQUESTING_FUNDS ou FUNDS_DISPATCHED peuvent être annulés)
      const statutActuel = session.statut;
      if (statutActuel !== "REQUESTING_FUNDS" && statutActuel !== "FUNDS_DISPATCHED") {
        const label = STATUT_SESSION_CAISSE_LABELS[statutActuel as StatutSessionCaisseType] || statutActuel;
        const guidance: Record<string, string> = {
          OPEN: "La session est déjà ouverte et ne peut plus être annulée.",
          CLOSING_COUNT: "La session est en cours de fermeture.",
          CLOSING_VALIDATION: "La session est en cours de fermeture.",
          CLOSED: "Cette session est déjà fermée.",
        };
        const detail = guidance[statutActuel] || "";
        return {
          success: false,
          error: `Impossible d'annuler la demande : la session est actuellement en statut « ${label} ». ${detail}`.trim(),
          errorCode: "INVALID_STATE",
        };
      }

      const isFundsDispatched = statutActuel === "FUNDS_DISPATCHED";
      const cancelReason = reason || "Annulé par le caissier";

      // Variables hoistées pour être accessibles dans la section WS (étape 7)
      let coffreBalanceAfterReversal: number | null = null;
      let caisseBalanceAfterReversal: number | null = null;
      let reversalCoffreId: string | null = null;
      let reversalMontant = 0;

      // 4. Annuler le transfert associé et restituer les fonds au coffre si nécessaire
      if (session.openingTransfertId) {
        // Récupérer le transfert dans la transaction pour le traiter directement
        const [transfert] = await tx
          .select()
          .from(transfertsCoffreCaisse)
          .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId))
          .for("update");

        if (transfert) {
          const montant = Number(transfert.montant);
          const wasExecuted = transfert.statut === StatutTransfertCoffre.EXECUTED || !!transfert.executedAt;
          const isCoffreSource = transfert.typeTransfert === "COFFRE_VERS_CAISSE";
          reversalMontant = montant;
          reversalCoffreId = transfert.coffreId;
          if (wasExecuted && isCoffreSource && montant > 0) {
            // Re-créditer le coffre-fort (annuler le débit)
            const coffreResult = await updateCoffreBalance(tx, transfert.coffreId, +montant);
            coffreBalanceAfterReversal = Number(coffreResult.solde);

            // Re-débiter la caisse (annuler le crédit)
            const caisseResult = await updateCaisseBalance(tx, transfert.caisseId, -montant);
            caisseBalanceAfterReversal = Number(caisseResult.solde);

            // Créer les mouvements d'annulation dans le ledger
            const refPrefix = `ANN-${Date.now().toString().slice(-6)}`;

            const [mouvementCoffreCredit] = await tx.insert(mouvementsFinanciers).values({
              montant: montant.toString(),
              sens: "CREDIT",
              sourceModule: "TRANSFERT",
              agenceId: transfert.agenceId,
              reference: `${refPrefix}-COFFRE-CREDIT`,
              idempotencyKey: `${transfert.id}-cancel-coffre-credit`,
              statut: StatutTransaction.POSTED,
              dateOperation: new Date(),
              metadata: {
                transfertId: transfert.id,
                coffreId: transfert.coffreId,
                type: "RESTITUTION_COFFRE",
                description: `Restitution coffre: annulation ouverture caisse — ${cancelReason}`,
                categorie: "Annulation Transfert",
                sessionId,
              },
            }).returning();

            const [mouvementCaisseDebit] = await tx.insert(mouvementsFinanciers).values({
              montant: montant.toString(),
              sens: "DEBIT",
              sourceModule: "TRANSFERT",
              agenceId: transfert.agenceId,
              reference: `${refPrefix}-CAISSE-DEBIT`,
              idempotencyKey: `${transfert.id}-cancel-caisse-debit`,
              statut: StatutTransaction.POSTED,
              dateOperation: new Date(),
              metadata: {
                transfertId: transfert.id,
                caisseId: transfert.caisseId,
                type: "RESTITUTION_CAISSE",
                description: `Reprise fonds caisse: annulation ouverture — ${cancelReason}`,
                categorie: "Annulation Transfert",
                sessionId,
              },
            }).returning();

            // Post GL entries for reversal mouvements (non-blocking)
            const agenceId = transfert.agenceId;
            if (agenceId) {
              for (const mouvement of [mouvementCoffreCredit, mouvementCaisseDebit]) {
                try {
                  const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
                    operationType: 'RESTITUTION',
                    sessionId,
                  });
                  if (glResult) {
                    logger.info({ mouvementId: mouvement.id, numeroPiece: glResult.numeroPiece }, 'GL posted for session cancellation');
                  }
                  await tx
                    .update(mouvementsFinanciers)
                    .set({ glPostingStatus: "POSTED" })
                    .where(eq(mouvementsFinanciers.id, mouvement.id));
                } catch (glError: unknown) {
                  const message = glError instanceof Error ? glError.message : "Unknown GL error";
                  const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
                  logger.warn({ mouvementId: mouvement.id, error: message }, `GL ${status.toLowerCase()} for session cancellation`);
                  await tx
                    .update(mouvementsFinanciers)
                    .set({ glPostingStatus: status, glPostingError: message })
                    .where(eq(mouvementsFinanciers.id, mouvement.id));
                }
              }
            }
          }

          // Annuler le transfert (REQUESTED/VALIDATED/EXECUTED → CANCELLED)
          await tx
            .update(transfertsCoffreCaisse)
            .set({
              statut: StatutTransfertCoffre.CANCELLED,
              reasonRejection: isFundsDispatched
                ? `Restitution coffre-fort: ${cancelReason}`
                : cancelReason,
              updatedAt: new Date(),
            })
            .where(eq(transfertsCoffreCaisse.id, session.openingTransfertId));

          // Audit côté transfert
          await tx.insert(transfertsCoffreAuditLogs).values({
            transfertId: session.openingTransfertId,
            action: wasExecuted ? "RESTITUTION_EXECUTED" : (isFundsDispatched ? "RESTITUTION_COFFRE" : "CANCELLED"),
            statutAvant: transfert.statut,
            statutApres: StatutTransfertCoffre.CANCELLED,
            details: {
              reason: cancelReason,
              restitution: isFundsDispatched || wasExecuted,
              reversed: wasExecuted,
              montant,
              caisseId: transfert.caisseId,
              coffreId: transfert.coffreId,
              sessionId,
            },
            userId,
            ipAddress,
            userAgent,
          });
        }
      }

      // 4b. Annuler toutes les opérations liées à cette session
      //     Sans ceci, les opérations POSTED de la session annulée polluent
      //     le dashboard caisse des sessions suivantes sur la même caisse physique.
      await tx
        .update(operationsCaisse)
        .set({
          statut: "CANCELLED",
          annulledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(operationsCaisse.sessionId, sessionId));

      // 5. Fermer la session
      //    IMPORTANT: Remettre à zéro les montants et openedAt car la caisse n'a jamais
      //    réellement ouvert. Sans ceci, la query dashboard comptabilise un solde fantôme
      //    via montantFermetureTheorique de la session.
      await tx
        .update(sessionsCaisse)
        .set({
          statut: "CLOSED",
          closedAt: new Date(),
          openedAt: null,
          montantOuverture: "0",
          montantFermetureTheorique: "0",
          observations: isFundsDispatched
            ? `Ouverture annulée après envoi des fonds: ${cancelReason}. Fonds restitués au coffre-fort.`
            : `Demande annulée: ${cancelReason}`,
          updatedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, sessionId));

      // 6. Log d'audit côté session
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId,
        action: isFundsDispatched ? "OPENING_CANCELLED_FUNDS_RETURNED" : "REQUEST_CANCELLED",
        statutAvant: statutActuel,
        statutApres: "CLOSED",
        details: {
          reason: cancelReason,
          restitution: isFundsDispatched,
          montant: isFundsDispatched ? Number(session.montantDemande) : undefined,
        },
        userId,
        ipAddress,
        userAgent,
      });

      // 7. Notifications temps réel (caisse + coffre + agence)
      try {
        const ws = getWsInstance();
        if (ws && session.agenceId) {
          const cancelType = isFundsDispatched ? 'OPENING_CANCELLED_FUNDS_RETURNED' : 'OPENING_CANCELLED';
          const montant = Number(session.montantDemande || 0);

          // A. Notifier le hook WS dédié caisse (toasts + callbacks onCaisseUpdate)
          ws.broadcastToAggregate('caisse', session.caisseId, {
            type: 'CAISSE_UPDATE',
            payload: {
              caisseId: session.caisseId,
              type: cancelType,
              sessionId,
              montant,
              restitution: isFundsDispatched,
            }
          });

          // B. Invalider les queries caisse pour TOUS les clients de l'agence
          //    (WebSocketContext gère CAISSE_UPDATE → invalidate sessions, active, pending, etc.)
          ws.broadcastToAgency(session.agenceId, {
            type: 'CAISSE_UPDATE',
            payload: {
              caisseId: session.caisseId,
              type: cancelType,
              sessionId,
              montant,
              restitution: isFundsDispatched,
            }
          });

          // C. Invalider les queries coffre pour TOUS les clients de l'agence
          //    (WebSocketContext gère REALTIME_EVENT coffre → invalidate transferts, stats, mouvements)
          ws.broadcastToAgency(session.agenceId, {
            type: 'REALTIME_EVENT',
            payload: {
              aggregateType: 'coffre',
              aggregateId: session.agenceId,
              event: cancelType,
              sessionId,
              caisseId: session.caisseId,
              montant,
              restitution: isFundsDispatched,
            }
          });

          // D. Activité en temps réel (fil d'activité agence)
          ws.broadcastToAgency(session.agenceId, {
            type: 'LIVE_ACTIVITY',
            payload: {
              action: isFundsDispatched
                ? `Ouverture annulée — Fonds restitués au coffre: ${montant.toLocaleString()} FCFA`
                : `Demande d'ouverture annulée par le caissier`,
              type: 'cancellation',
              timestamp: new Date().toISOString(),
            }
          });

          // E. BALANCE_UPDATED pour le dashboard principal (encaisse disponible)
          //    Sans ceci, le dashboard ne rafraîchit pas en temps réel après annulation
          if (coffreBalanceAfterReversal !== null && reversalCoffreId) {
            balanceService.broadcastBalanceUpdate({
              entityType: 'coffre',
              entityId: reversalCoffreId,
              agenceId: session.agenceId,
              newBalance: coffreBalanceAfterReversal,
              previousBalance: coffreBalanceAfterReversal - reversalMontant,
              mouvementRef: `ANN-COFFRE-${session.id}`,
              sourceModule: 'TRANSFERT',
              typePaiement: 'RESTITUTION_COFFRE',
            });
          }
          if (caisseBalanceAfterReversal !== null) {
            balanceService.broadcastBalanceUpdate({
              entityType: 'caisse',
              entityId: session.caisseId,
              agenceId: session.agenceId,
              newBalance: caisseBalanceAfterReversal,
              previousBalance: caisseBalanceAfterReversal + reversalMontant,
              mouvementRef: `ANN-CAISSE-${session.id}`,
              sourceModule: 'TRANSFERT',
              typePaiement: 'RESTITUTION_CAISSE',
            });
          }
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'WebSocket notification failed');
      }

      return { success: true };
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error in cancelOpeningRequest');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur interne"),
      errorCode: "DB_ERROR",
    };
  }
}
