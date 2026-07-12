import { db } from "../../db";
import { sql, eq, and } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import {
  selectTransfertForUpdate,
  checkMouvementAlreadyExists,
  TransfertAlreadyProcessedError,
  InsufficientFundsError,
  type DispatchResult,
} from "./executor-utils";

/**
 * Exécute le dispatch d'un transfert (départ en transit)
 * - Acquiert un verrou exclusif sur la ligne (FOR UPDATE NOWAIT)
 * - Vérifie l'état et l'idempotence
 * - Débite le coffre source
 * - Crée le mouvement financier
 * - Verrouille le transfert
 */
export async function executeDispatch(
  transfertId: string,
  userId: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string
): Promise<DispatchResult> {
  try {
    return await db.transaction(async (tx) => {
      const transfert = await selectTransfertForUpdate(tx, transfertId);

      if (!transfert) {
        return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
      }

      if (transfert.verrouille) {
        throw new TransfertAlreadyProcessedError(
          "Ce transfert a déjà été traité par un autre processus",
          transfertId
        );
      }

      if (transfert.statut !== "APPROVED_L2") {
        if (transfert.statut === "IN_TRANSIT" || transfert.statut === "RECEIVED" || transfert.statut === "RECEIVED_WITH_DISCREPANCY") {
          throw new TransfertAlreadyProcessedError(
            `Ce transfert a déjà été dispatché (statut actuel: ${transfert.statut})`,
            transfertId
          );
        }
        return {
          success: false,
          errorCode: "TIC_020",
          error: `Impossible de dispatcher un transfert en statut "${transfert.statut}"`,
        };
      }

      const mouvementExists = await checkMouvementAlreadyExists(
        tx,
        transfertId,
        "SORTIE_COFFRE_TRANSIT"
      );
      if (mouvementExists) {
        throw new TransfertAlreadyProcessedError(
          "Un mouvement de sortie existe déjà pour ce transfert",
          transfertId
        );
      }

      const coffreResult = await tx.execute(
        sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreSourceId} FOR UPDATE`
      );
      
      if (!coffreResult.rows || coffreResult.rows.length === 0) {
        return { success: false, errorCode: "TIC_006", error: "Coffre source introuvable" };
      }
      
      const coffreSource = coffreResult.rows[0] as Record<string, unknown>;
      const soldeSource = parseFloat((coffreSource.solde as string) || "0");
      const montant = parseFloat(transfert.montant?.toString() || "0");

      if (soldeSource < montant) {
        throw new InsufficientFundsError(soldeSource, montant);
      }

      const referenceSource = generateReference("TIC");
      const agenceIdSource = coffreSource.owner_id as string | null;
      const [mouvementSource] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: transfert.montant,
          sens: "CREDIT",
          reference: referenceSource,
          sourceModule: "INTER_COFFRE",
          typePaiement: "COFFRE_TRANSIT_OUT" as any,
          agenceId: agenceIdSource,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            transfertInterCoffreId: transfertId,
            type: "SORTIE_COFFRE_TRANSIT",
            coffreSourceId: transfert.coffreSourceId,
            coffreDestId: transfert.coffreDestinationId,
          },
        })
        .returning();

      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} - ${montant}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, transfert.coffreSourceId));

      if (!agenceIdSource) {
        throw new Error(`GL posting impossible: no agenceId on coffre source ${coffreSource.code}`);
      }
      const glResultDispatch = await postGlForMouvement(tx, mouvementSource, agenceIdSource, userId, {
        transfertInterCoffreId: transfertId,
        direction: "DISPATCH",
        coffreSourceCode: coffreSource.code as string,
      });
      if (glResultDispatch) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementSource.id));
      }

      const now = new Date();
      const updateResult = await tx
        .update(transfertsInterCoffres)
        .set({
          statut: "IN_TRANSIT",
          dispatchedBy: userId,
          dispatchedAt: now,
          mouvementSourceId: mouvementSource.id,
          dateComptable: now.toISOString().split("T")[0],
          verrouille: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(transfertsInterCoffres.id, transfertId),
            eq(transfertsInterCoffres.statut, "APPROVED_L2")
          )
        )
        .returning();

      if (updateResult.length === 0) {
        throw new TransfertAlreadyProcessedError(
          "Le transfert a été modifié par un autre processus pendant le traitement",
          transfertId
        );
      }

      await tx.insert(transfertsInterCoffresAuditLogs).values({
        transfertId,
        action: "DISPATCHED",
        statutAvant: "APPROVED_L2",
        statutApres: "IN_TRANSIT",
        details: {
          mouvementSourceId: mouvementSource.id,
          montant,
          soldeAvant: soldeSource,
          soldeApres: soldeSource - montant,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      return { success: true, mouvementSourceId: mouvementSource.id };
    });
  } catch (error) {
    if (error instanceof TransfertAlreadyProcessedError || error instanceof InsufficientFundsError) {
      return {
        success: false,
        errorCode: error.code,
        error: error.message,
      };
    }
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "55P03") {
      return {
        success: false,
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur. Veuillez réessayer.",
      };
    }
    throw error;
  }
}
