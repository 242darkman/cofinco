import { db } from "../../db";
import { sql, eq, and } from "drizzle-orm";
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
  InsufficientFundsError,
  selectEvacuationForUpdate,
  checkMouvementAlreadyExists,
  type DispatchResult
} from "./execution-helpers";

const logger = createLogger("EvacuationCoffre:Dispatch");

/**
 * Exécute le dispatch d'une évacuation.
 * Comptabilité: Débit 581 (transit) / Crédit 531 (coffre)
 */
export async function executeDispatch(
  evacuationId: string,
  userId: string,
  userRole: string,
  dispatchData: {
    agentsTransport?: Array<{ userId?: string; nom: string; contact: string; fonction?: string }>;
    heureDepart?: string;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<DispatchResult> {
  try {
    return await db.transaction(async (tx) => {
      const evacuation = await selectEvacuationForUpdate(tx, evacuationId);

      if (!evacuation) {
        return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
      }

      if (evacuation.verrouille) {
        throw new EvacuationAlreadyProcessedError(
          "Cette évacuation a déjà été traitée",
          evacuationId,
        );
      }

      if (evacuation.statut !== StatutEvacuationCoffre.PREPARED) {
        if (evacuation.statut === StatutEvacuationCoffre.IN_TRANSIT ||
            evacuation.statut === StatutEvacuationCoffre.DEPOSITED) {
          throw new EvacuationAlreadyProcessedError(
            `Évacuation déjà expédiée (statut: ${evacuation.statut})`,
            evacuationId,
          );
        }
        return {
          success: false,
          errorCode: "EVC_020",
          error: `Impossible d'expédier une évacuation en statut "${evacuation.statut}"`,
        };
      }

      const mouvExists = await checkMouvementAlreadyExists(tx, evacuationId, "SORTIE_COFFRE_EVACUATION");
      if (mouvExists) {
        throw new EvacuationAlreadyProcessedError("Un mouvement de sortie existe déjà", evacuationId);
      }

      const coffreResult = await tx.execute(
        sql`SELECT * FROM coffres_forts WHERE id = ${evacuation.coffreSourceId} FOR UPDATE`,
      );
      if (!coffreResult.rows || coffreResult.rows.length === 0) {
        return { success: false, errorCode: "EVC_006", error: "Coffre source introuvable" };
      }
      const coffreSource = coffreResult.rows[0] as Record<string, unknown>;

      const soldeSource = parseFloat((coffreSource.solde as string) || "0");
      const montant = parseFloat(evacuation.montantCompte || evacuation.montant || "0");

      if (soldeSource < montant) {
        throw new InsufficientFundsError(soldeSource, montant);
      }

      const refTransit = generateReference("EVC");
      const agenceId = evacuation.agenceId;

      const [mouvementTransit] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montant.toString(),
          sens: "CREDIT",
          reference: refTransit,
          sourceModule: "EVACUATION_COFFRE" as any,
          typePaiement: "COFFRE_TRANSIT_OUT" as any,
          agenceId,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            evacuationCoffreId: evacuationId,
            type: "SORTIE_COFFRE_EVACUATION",
            coffreSourceId: evacuation.coffreSourceId,
            typeDestination: evacuation.typeDestination,
          },
        })
        .returning();

      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} - ${montant}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, evacuation.coffreSourceId));

      const glResultDispatch = await postGlForMouvement(tx, mouvementTransit, agenceId, userId, {
        evacuationCoffreId: evacuationId,
        direction: "DISPATCH",
        coffreSourceCode: coffreSource.code as string,
        eventType: "EVACUATION_COFFRE_OUT",
      });
      if (glResultDispatch) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementTransit.id));
      }

      const now = new Date();
      const updateResult = await tx
        .update(evacuationsCoffre)
        .set({
          statut: StatutEvacuationCoffre.IN_TRANSIT,
          dispatchedBy: userId,
          dispatchedAt: now,
          heureDepart: dispatchData.heureDepart || now.toTimeString().slice(0, 8),
          agentsTransport: dispatchData.agentsTransport || undefined,
          mouvementTransitId: mouvementTransit.id,
          dateComptable: now.toISOString().split("T")[0],
          verrouille: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(evacuationsCoffre.id, evacuationId),
            eq(evacuationsCoffre.statut, StatutEvacuationCoffre.PREPARED),
          ),
        )
        .returning();

      if (updateResult.length === 0) {
        throw new EvacuationAlreadyProcessedError(
          "L'évacuation a été modifiée par un autre processus",
          evacuationId,
        );
      }

      await tx.insert(evacuationsCoffreAuditLogs).values({
        evacuationId,
        action: "DISPATCHED",
        statutAvant: StatutEvacuationCoffre.PREPARED,
        statutApres: StatutEvacuationCoffre.IN_TRANSIT,
        details: {
          mouvementTransitId: mouvementTransit.id,
          montant,
          soldeAvant: soldeSource,
          soldeApres: soldeSource - montant,
          agentsTransport: dispatchData.agentsTransport,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      logger.info({ evacuationId, montant, mouvementId: mouvementTransit.id }, "Dispatch exécuté");

      return { success: true, mouvementTransitId: mouvementTransit.id };
    });
  } catch (error) {
    if (error instanceof EvacuationAlreadyProcessedError || error instanceof InsufficientFundsError) {
      throw error;
    }
    logger.error({ evacuationId, error }, "Erreur lors du dispatch");
    throw error;
  }
}
