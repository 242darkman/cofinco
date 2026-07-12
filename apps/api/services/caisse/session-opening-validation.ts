import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  configCoffreFort,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { StatutTransfertCoffre } from "@shared/enum/status-constants";
import { getWsInstance } from "../../ws-server";
import { createLogger } from "../../lib/logger";
import type { SessionRow, TransfertRow } from "./types";

const logger = createLogger('SessionOpeningValidation');

export interface ValidateOpeningParams {
  transfertId: string;
  validatorId: string;
  approved: boolean;
  reasonRejection?: string;
  billetage?: Record<string, number>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ValidateOpeningResult {
  success: boolean;
  session?: SessionRow;
  transfert?: TransfertRow;
  error?: string;
  errorCode?: string;
}

/**
 * PHASE B: Validation par le responsable coffre
 */
export async function validateOpeningTransfer(
  params: ValidateOpeningParams
): Promise<ValidateOpeningResult> {
  const {
    transfertId,
    validatorId,
    approved,
    reasonRejection,
    billetage,
    ipAddress,
    userAgent,
  } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer le transfert et vérifier qu'il s'agit d'un transfert d'ouverture
      const [transfert] = await tx
        .select()
        .from(transfertsCoffreCaisse)
        .where(eq(transfertsCoffreCaisse.id, transfertId))
        .for("update");

      if (!transfert) {
        return {
          success: false,
          error: "Transfert non trouvé",
          errorCode: "TRANSFERT_NOT_FOUND",
        };
      }

      if (!transfert.isOpeningFund) {
        return {
          success: false,
          error:
            "Ce transfert n'est pas un approvisionnement d'ouverture. Utilisez la route standard.",
          errorCode: "NOT_OPENING_FUND",
        };
      }

      if (transfert.statut !== StatutTransfertCoffre.REQUESTED) {
        return {
          success: false,
          error: `Ce transfert ne peut plus être validé car il a déjà été ${transfert.statut === "VALIDATED" ? "validé" : transfert.statut === "EXECUTED" ? "exécuté" : transfert.statut === "REJECTED" ? "rejeté" : transfert.statut === "CANCELLED" ? "annulé" : "traité"}.`,
          errorCode: "INVALID_TRANSITION",
        };
      }

      // 2. Vérifier la règle de séparation initiateur/valideur
      const [config] = await tx
        .select()
        .from(configCoffreFort)
        .where(eq(configCoffreFort.agenceId, transfert.agenceId));

      if (
        config?.separationInitiateurValideur &&
        transfert.requestedBy === validatorId
      ) {
        return {
          success: false,
          error: "Vous ne pouvez pas valider votre propre demande",
          errorCode: "SAME_USER_FORBIDDEN",
        };
      }

      // 3. Récupérer la session associée
      const [session] = transfert.sessionOuvertureId
        ? await tx
            .select()
            .from(sessionsCaisse)
            .where(eq(sessionsCaisse.id, transfert.sessionOuvertureId))
            .for("update")
        : [null];

      if (!session) {
        return {
          success: false,
          error: "Session d'ouverture associée non trouvée",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      const newStatut = approved
        ? StatutTransfertCoffre.VALIDATED
        : StatutTransfertCoffre.REJECTED;

      // 4. Mettre à jour le transfert
      const [updatedTransfert] = await tx
        .update(transfertsCoffreCaisse)
        .set({
          statut: newStatut,
          validatedBy: validatorId,
          validatedAt: new Date(),
          reasonRejection: approved ? null : reasonRejection,
          billetage: billetage || transfert.billetage,
          updatedAt: new Date(),
        })
        .where(eq(transfertsCoffreCaisse.id, transfertId))
        .returning();

      // 5. Mettre à jour la session selon le résultat
      let updatedSession;
      if (approved) {
        // Approuvé: passer la session en FUNDS_DISPATCHED
        [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "FUNDS_DISPATCHED",
            fundsDispatchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, session.id))
          .returning();

        // Log audit session
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId: session.id,
          action: "FUNDS_DISPATCHED",
          statutAvant: "REQUESTING_FUNDS",
          statutApres: "FUNDS_DISPATCHED",
          details: {
            transfertId,
            montant: transfert.montant,
            validatedBy: validatorId,
            billetage,
          },
          userId: validatorId,
          ipAddress,
          userAgent,
        });
      } else {
        // Rejeté: fermer la session
        [updatedSession] = await tx
          .update(sessionsCaisse)
          .set({
            statut: "CLOSED",
            closedAt: new Date(),
            observations: `Demande rejetée: ${reasonRejection || "Non spécifié"}`,
            updatedAt: new Date(),
          })
          .where(eq(sessionsCaisse.id, session.id))
          .returning();

        // Log audit session
        await tx.insert(sessionsCaisseAuditLogs).values({
          sessionId: session.id,
          action: "FUNDS_REJECTED",
          statutAvant: "REQUESTING_FUNDS",
          statutApres: "CLOSED",
          details: {
            transfertId,
            reasonRejection,
            validatedBy: validatorId,
          },
          userId: validatorId,
          ipAddress,
          userAgent,
        });
      }

      // 6. Log audit transfert
      await tx.insert(transfertsCoffreAuditLogs).values({
        transfertId,
        action: approved ? "VALIDATED" : "REJECTED",
        statutAvant: StatutTransfertCoffre.REQUESTED,
        statutApres: newStatut,
        details: {
          approved,
          reasonRejection,
          isOpeningFund: true,
          sessionId: session.id,
        },
        userId: validatorId,
        ipAddress,
        userAgent,
      });

      // 7. Notification WebSocket au caissier
      try {
        const ws = getWsInstance();
        if (ws && transfert.agenceId) {
          if (approved) {
            // Notifier le caissier que les fonds sont prêts
            ws.broadcastToAggregate('caisse', transfert.caisseId, {
              type: 'CAISSE_UPDATE',
              payload: {
                caisseId: transfert.caisseId,
                type: 'FUNDS_DISPATCHED',
                sessionId: session.id,
                montant: Number(transfert.montant),
              }
            });
          } else {
            // Notifier le caissier du rejet
            ws.broadcastToAggregate('caisse', transfert.caisseId, {
              type: 'CAISSE_UPDATE',
              payload: {
                caisseId: transfert.caisseId,
                type: 'FUNDS_REJECTED',
                sessionId: session.id,
                reason: reasonRejection,
              }
            });
          }

          // Activité en temps réel
          ws.broadcastToAgency(transfert.agenceId, {
            type: 'LIVE_ACTIVITY',
            payload: {
              action: approved
                ? `Fonds validés: ${Number(transfert.montant).toLocaleString()} FCFA`
                : `Demande rejetée: ${reasonRejection || 'Non spécifié'}`,
              type: approved ? 'validation' : 'rejection',
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'WebSocket notification failed');
      }

      return {
        success: true,
        session: updatedSession,
        transfert: updatedTransfert,
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error in validateOpeningTransfer');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur interne"),
      errorCode: "DB_ERROR",
    };
  }
}
