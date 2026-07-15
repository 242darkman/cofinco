import { db } from "../../db";
import { sql, eq } from "drizzle-orm";
import {
  coffresForts,
  evacuationsCoffre,
  evacuationsCoffreAuditLogs,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { StatutEvacuationCoffre } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";
import {
  EvacuationAlreadyProcessedError,
  selectEvacuationForUpdate,
  checkMouvementAlreadyExists,
  type DepositResult
} from "./execution-helpers";

const logger = createLogger("EvacuationCoffre:Deposit");

/**
 * Exécute le dépôt d'une évacuation.
 * Comptabilité selon destination:
 * - BANQUE: Débit 512 / Crédit 581
 * - COFFRE_CENTRAL: Débit 531 / Crédit 581
 * - TRANSPORTEUR: Débit 512 / Crédit 581
 */
export async function executeDeposit(
  evacuationId: string,
  userId: string,
  userRole: string,
  depositData: {
    montantDepose: number;
    referenceBordereau?: string;
    referenceRecuTransporteur?: string;
    heureDepot?: string;
    commentaireDepot?: string;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<DepositResult> {
  try {
    return await db.transaction(async (tx) => {
      const evacuation = await selectEvacuationForUpdate(tx, evacuationId);

      if (!evacuation) {
        return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
      }

      if (evacuation.statut !== StatutEvacuationCoffre.IN_TRANSIT) {
        if (evacuation.statut === StatutEvacuationCoffre.DEPOSITED) {
          throw new EvacuationAlreadyProcessedError("Dépôt déjà enregistré", evacuationId);
        }
        return {
          success: false,
          errorCode: "EVC_020",
          error: `Impossible d'enregistrer le dépôt pour statut "${evacuation.statut}"`,
        };
      }

      const mouvExists = await checkMouvementAlreadyExists(tx, evacuationId, "DEPOT_EVACUATION");
      if (mouvExists) {
        throw new EvacuationAlreadyProcessedError("Un mouvement de dépôt existe déjà", evacuationId);
      }

      let eventType: string;
      switch (evacuation.typeDestination) {
        case "BANQUE":
          eventType = "EVACUATION_COFFRE_BANQUE";
          break;
        case "COFFRE_CENTRAL":
          eventType = "EVACUATION_COFFRE_CENTRAL";
          break;
        case "TRANSPORTEUR":
          eventType = "EVACUATION_COFFRE_TRANSPORTEUR";
          break;
        default:
          return { success: false, errorCode: "EVC_019", error: `Type de destination inconnu: ${evacuation.typeDestination}` };
      }

      const montantDepose = depositData.montantDepose;
      const montantOriginal = parseFloat(evacuation.montantCompte || evacuation.montant || "0");

      const refDepot = generateReference("EVC");
      const [mouvementDepot] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montantDepose.toString(),
          sens: "DEBIT",
          reference: refDepot,
          sourceModule: "EVACUATION_COFFRE" as any,
          typePaiement: "COFFRE_TRANSIT_IN" as any,
          agenceId: evacuation.agenceId,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            evacuationCoffreId: evacuationId,
            type: "DEPOT_EVACUATION",
            typeDestination: evacuation.typeDestination,
            referenceBordereau: depositData.referenceBordereau,
          },
        })
        .returning();

      if (evacuation.typeDestination === "COFFRE_CENTRAL" && evacuation.coffreDestinationId) {
        await tx
          .update(coffresForts)
          .set({
            solde: sql`${coffresForts.solde} + ${montantDepose}`,
            updatedAt: new Date(),
          })
          .where(eq(coffresForts.id, evacuation.coffreDestinationId));
      }

      const glResultDeposit = await postGlForMouvement(tx, mouvementDepot, evacuation.agenceId, userId, {
        evacuationCoffreId: evacuationId,
        direction: "DEPOSIT",
        typeDestination: evacuation.typeDestination,
        eventType,
      });
      if (glResultDeposit) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementDepot.id));
      }

      const ecart = montantDepose - montantOriginal;

      const now = new Date();
      await tx
        .update(evacuationsCoffre)
        .set({
          statut: StatutEvacuationCoffre.DEPOSITED,
          depositedBy: userId,
          depositedAt: now,
          heureDepot: depositData.heureDepot || now.toTimeString().slice(0, 8),
          montantDepose: montantDepose.toString(),
          referenceBordereau: depositData.referenceBordereau,
          referenceRecuTransporteur: depositData.referenceRecuTransporteur,
          commentaireDepot: depositData.commentaireDepot,
          mouvementDepotId: mouvementDepot.id,
          updatedAt: now,
        })
        .where(eq(evacuationsCoffre.id, evacuationId));

      await tx.insert(evacuationsCoffreAuditLogs).values({
        evacuationId,
        action: "DEPOSITED",
        statutAvant: StatutEvacuationCoffre.IN_TRANSIT,
        statutApres: StatutEvacuationCoffre.DEPOSITED,
        details: {
          mouvementDepotId: mouvementDepot.id,
          montantDepose,
          montantOriginal,
          ecart,
          referenceBordereau: depositData.referenceBordereau,
          typeDestination: evacuation.typeDestination,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      logger.info({ evacuationId, montantDepose, ecart, mouvementId: mouvementDepot.id }, "Dépôt exécuté");

      return { success: true, mouvementDepotId: mouvementDepot.id, ecart };
    });
  } catch (error) {
    if (error instanceof EvacuationAlreadyProcessedError) throw error;
    logger.error({ evacuationId, error }, "Erreur lors du dépôt");
    throw error;
  }
}
