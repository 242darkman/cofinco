import { db } from "../../db";
import { sql, eq, and } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  reconciliationsLiaison,
  tachesRegularisation,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import {
  TypeTacheRegularisation,
  StatutTacheRegularisation,
  Priorite,
} from "@shared/enum/status-constants";
import {
  selectTransfertForUpdate,
  checkMouvementAlreadyExists,
  getOrCreateCompteLiaison,
  TransfertAlreadyProcessedError,
  type ReceiveResult,
} from "./executor-utils";

/**
 * Exécute la réception d'un transfert
 * - Acquiert un verrou exclusif sur la ligne (FOR UPDATE NOWAIT)
 * - Vérifie l'état et l'idempotence
 * - Crédite le coffre destination
 * - Crée les mouvements financiers
 * - Gère les écarts
 * - Crée la réconciliation
 */
export async function executeReceive(
  transfertId: string,
  userId: string,
  userRole: string,
  data: {
    montantRecu: number;
    conforme: boolean;
    commentaire?: string;
    motifEcart?: string;
    heureReception?: string;
  },
  ipAddress?: string,
  userAgent?: string
): Promise<ReceiveResult> {
  try {
    return await db.transaction(async (tx) => {
      const transfert = await selectTransfertForUpdate(tx, transfertId);

      if (!transfert) {
        return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
      }

      if (transfert.statut !== "IN_TRANSIT") {
        if (transfert.statut === "RECEIVED" || transfert.statut === "RECEIVED_WITH_DISCREPANCY") {
          throw new TransfertAlreadyProcessedError(
            `Ce transfert a déjà été réceptionné (statut actuel: ${transfert.statut})`,
            transfertId
          );
        }
        return {
          success: false,
          errorCode: "TIC_020",
          error: `Impossible de réceptionner un transfert en statut "${transfert.statut}"`,
        };
      }

      const mouvementExists = await checkMouvementAlreadyExists(
        tx,
        transfertId,
        "ENTREE_COFFRE_RECEPTION"
      );
      if (mouvementExists) {
        throw new TransfertAlreadyProcessedError(
          "Un mouvement d'entrée existe déjà pour ce transfert",
          transfertId
        );
      }

      const montantAttendu = parseFloat(transfert.montant?.toString() || "0");
      const montantRecu = data.montantRecu;
      const ecart = montantAttendu - montantRecu;

      const [coffreSourceResult, coffreDestResult] = await Promise.all([
        tx.execute(sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreSourceId}`),
        tx.execute(sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreDestinationId} FOR UPDATE`),
      ]);

      if (!coffreSourceResult.rows?.length || !coffreDestResult.rows?.length) {
        return { success: false, errorCode: "TIC_006", error: "Coffre introuvable" };
      }

      const coffreSource = coffreSourceResult.rows[0] as Record<string, unknown>;
      const coffreDest = coffreDestResult.rows[0] as Record<string, unknown>;

      const referenceDest = generateReference("TIC");
      const agenceIdDest = coffreDest.owner_id as string | null;
      const [mouvementDest] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montantRecu.toString(),
          sens: "DEBIT",
          reference: referenceDest,
          sourceModule: "INTER_COFFRE",
          typePaiement: "COFFRE_TRANSIT_IN" as any,
          agenceId: agenceIdDest,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            transfertInterCoffreId: transfertId,
            type: "ENTREE_COFFRE_RECEPTION",
            coffreSourceId: transfert.coffreSourceId,
            coffreDestId: transfert.coffreDestinationId,
            ecart,
          },
        })
        .returning();

      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} + ${montantRecu}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, transfert.coffreDestinationId));

      if (!agenceIdDest) {
        throw new Error(`GL posting impossible: no agenceId on coffre destination ${coffreDest.code}`);
      }
      const glResultReceive = await postGlForMouvement(tx, mouvementDest, agenceIdDest, userId, {
        transfertInterCoffreId: transfertId,
        direction: "RECEIVE",
        coffreDestCode: coffreDest.code as string,
        ecart,
      });
      if (glResultReceive) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementDest.id));
      }

      const compteLiaisonSource = await getOrCreateCompteLiaison(tx, {
        ownerType: coffreSource.owner_type as any,
        ownerId: coffreSource.owner_id as string | undefined,
        code: coffreSource.code as string,
        nom: coffreSource.nom as string,
      });
      const compteLiaisonDest = await getOrCreateCompteLiaison(tx, {
        ownerType: coffreDest.owner_type as any,
        ownerId: coffreDest.owner_id as string | undefined,
        code: coffreDest.code as string,
        nom: coffreDest.nom as string,
      });

      const statutReconciliation = ecart === 0 ? "RECONCILED" : "DISCREPANCY_DETECTED";
      const [reconciliation] = await tx
        .insert(reconciliationsLiaison)
        .values({
          compteLiaisonSourceId: compteLiaisonSource?.id,
          compteLiaisonDestId: compteLiaisonDest?.id,
          transfertId,
          montant: montantRecu.toString(),
          dateOperation: transfert.dateComptable || new Date().toISOString().split("T")[0],
          statut: statutReconciliation,
          dateRapprochement: ecart === 0 ? new Date() : null,
          rapprochePar: ecart === 0 ? userId : null,
        })
        .returning();

      let tacheId: string | undefined;
      if (ecart !== 0) {
        const priorite =
          Math.abs(ecart) > 100000
            ? Priorite.CRITICAL
            : Math.abs(ecart) > 50000
              ? Priorite.HIGH
              : Priorite.NORMAL;
        const [tache] = await tx
          .insert(tachesRegularisation)
          .values({
            transfertId,
            type: TypeTacheRegularisation.ECART_RECEPTION,
            description: `Écart de ${ecart.toLocaleString()} ${transfert.devise} sur transfert ${transfert.reference}. Attendu: ${montantAttendu.toLocaleString()}, Reçu: ${montantRecu.toLocaleString()}`,
            montantEcart: ecart.toString(),
            priorite,
            statut: StatutTacheRegularisation.OPEN,
          })
          .returning();
        tacheId = tache.id;
      }

      const now = new Date();
      const nouveauStatut = data.conforme ? "RECEIVED" : "RECEIVED_WITH_DISCREPANCY";

      const updateResult = await tx
        .update(transfertsInterCoffres)
        .set({
          statut: nouveauStatut,
          receivedBy: userId,
          receivedAt: now,
          heureReception: data.heureReception,
          montantRecu: montantRecu.toString(),
          conforme: data.conforme,
          commentaireReception: data.commentaire,
          ecartMontant: ecart !== 0 ? ecart.toString() : null,
          motifEcart: data.motifEcart,
          mouvementDestinationId: mouvementDest.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(transfertsInterCoffres.id, transfertId),
            eq(transfertsInterCoffres.statut, "IN_TRANSIT")
          )
        )
        .returning();

      if (updateResult.length === 0) {
        throw new TransfertAlreadyProcessedError(
          "Le transfert a été modifié par un autre processus pendant le traitement",
          transfertId
        );
      }

      const action = data.conforme ? "RECEIVED" : "RECEIVED_WITH_DISCREPANCY";
      await tx.insert(transfertsInterCoffresAuditLogs).values({
        transfertId,
        action,
        statutAvant: "IN_TRANSIT",
        statutApres: nouveauStatut,
        details: {
          mouvementDestId: mouvementDest.id,
          montantAttendu,
          montantRecu,
          ecart,
          conforme: data.conforme,
          reconciliationId: reconciliation.id,
          tacheId,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      return {
        success: true,
        mouvementDestId: mouvementDest.id,
        reconciliationId: reconciliation.id,
        tacheId,
        ecart,
      };
    });
  } catch (error) {
    if (error instanceof TransfertAlreadyProcessedError) {
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
