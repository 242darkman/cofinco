import { db } from "../../../db";
import { tontines, tontineTurns } from "@shared/schema";
import { eq, and, or, asc, sql } from "drizzle-orm";
import { TypeOperationCaisse } from "@shared/enum/status-constants";
import {
  processTontineContribution,
  processTontineDistribution,
  getMemberTontineState
} from "../../tontine-logic";
import type { TransactionHandlerContext, TransactionHandlerResult } from "../global-transaction-types";

/**
 * Gère toutes les transactions globales liées aux Tontines.
 * Inclut les cotisations et les retraits/distributions.
 */
export async function handleTontineTransaction(ctx: TransactionHandlerContext): Promise<TransactionHandlerResult> {
  const { tx, mouvement, payload, sessionCaisseId, userId } = ctx;
  let result: any;
  let additionalEventData: any = {};

  switch (payload.natureOperation) {
    case TypeOperationCaisse.TONTINE_CONTRIBUTION: {
      if (!payload.tontineId) throw new Error("ID Tontine requis");
      
      const state = await getMemberTontineState(payload.clientId, payload.tontineId);
      if (!state) throw new Error("Membre non trouvé dans cette tontine");

      const tontineResult = await processTontineContribution(tx, mouvement, {
        clientId: payload.clientId,
        tontineId: payload.tontineId,
        amountTotal: payload.amount,
        sessionCaisseId,
        userId,
        state
      });
      result = tontineResult.result;
      additionalEventData = tontineResult.additionalEventData;
      break;
    }

    case TypeOperationCaisse.TONTINE_WITHDRAWAL: {
       if (!payload.tontineId) throw new Error("ID Tontine requis");
       if (!payload.membreId) throw new Error("ID Membre requis");

       const tontine = await db.query.tontines.findFirst({
           where: eq(tontines.id, payload.tontineId)
       });

       if (!tontine) throw new Error("Tontine introuvable");

       let tourNumero: number;

       if (tontine.currentCycleId) {
         const [turn] = await db
           .select({ turnNumber: tontineTurns.turnNumber })
           .from(tontineTurns)
           .where(and(
             eq(tontineTurns.cycleId, tontine.currentCycleId),
             eq(tontineTurns.beneficiaryMemberId, payload.membreId!),
             or(
               eq(tontineTurns.status, 'SCHEDULED'),
               eq(tontineTurns.status, 'READY')
             )
           ))
           .orderBy(asc(tontineTurns.turnNumber))
           .limit(1);

         if (!turn) throw new Error("Aucun tour programmé pour ce membre dans le cycle actif");
         tourNumero = turn.turnNumber;
       } else {
         const [queryResult] = await db
           .select({
             tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number)
           })
           .from(tontines)
           .where(eq(tontines.id, payload.tontineId));
         tourNumero = queryResult.tourActuel;
       }

       const distResult = await processTontineDistribution(tx, mouvement, {
          tontineId: payload.tontineId,
          membreId: payload.membreId,
          clientId: payload.clientId,
          tourNumero,
          montantTotal: payload.amount,
          modeDistribution: "CASH_WITHDRAWAL",
          modePaiement: payload.paymentMethod,
          sessionCaisseId,
          userId,
          notes: payload.description,
          reference: mouvement.reference,
          tontineNom: tontine.nom
       });
       result = distResult.result;
       break;
    }

    default:
      throw new Error(`Opération tontine non supportée: ${payload.natureOperation}`);
  }

  return { result, additionalEventData };
}
