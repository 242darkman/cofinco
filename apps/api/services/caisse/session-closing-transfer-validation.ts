import { db } from "../../db";
import {
  sessionsCaisse,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { StatutTransfertCoffre } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { createLogger } from "../../lib/logger";
import type { SessionRow, TransfertRow } from "./types";

const logger = createLogger('SessionClosingTransferValidation');
const transfertService = new TransfertCoffreService();

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
  session?: SessionRow;
  transfert?: TransfertRow;
  error?: string;
  errorCode?: string;
}

/**
 * Validation du transfert de clôture par le responsable coffre
 */
export async function validateClosingTransfer(
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
        const validateResult = await transfertService.validateTransfert({
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
        const executeResult = await transfertService.executeTransfert({
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
            statut: StatutTransfertCoffre.REJECTED,
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
  } catch (error: unknown) {
    logger.error({ err: error }, 'validateClosingTransfer error');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de la validation du transfert"),
      errorCode: "DB_ERROR",
    };
  }
}
