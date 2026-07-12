import { db } from "../../../db";
import { comptes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TypeOperationCaisse } from "@shared/enum/status-constants";
import {
  processCompteDepot,
  processCompteRetrait,
  canDeposit,
  canWithdraw
} from "../../comptes";
import type { TransactionHandlerContext, TransactionHandlerResult } from "../global-transaction-types";

/**
 * Gère toutes les transactions de dépôt et de retrait sur les comptes clients
 * (Épargne, Courant, Bloqué).
 */
export async function handleAccountTransaction(ctx: TransactionHandlerContext): Promise<TransactionHandlerResult> {
  const { tx, mouvement, payload, sessionCaisseId, userId } = ctx;
  let result: any;
  let additionalEventData: any = {};

  switch (payload.natureOperation) {
    case TypeOperationCaisse.DEPOSIT_SAVINGS:
    case TypeOperationCaisse.DEPOSIT_CURRENT: 
    case TypeOperationCaisse.DEPOSIT_BLOCKED: {
      if (!payload.compteId) throw new Error("ID Compte requis");
      
      const compte = await db.query.comptes.findFirst({ where: eq(comptes.id, payload.compteId) });
      if (!compte) throw new Error("Compte introuvable");
      
      const check = canDeposit(compte);
      if (!check.allowed) throw new Error(check.reason);

      const opResult = await processCompteDepot(tx, mouvement, {
        compteId: payload.compteId,
        montant: payload.amount,
        sessionCaisseId,
        observations: payload.description,
        typePaiement: payload.natureOperation,
        methodePaiement: payload.paymentMethod,
        userId
      });
      result = opResult.result;
      additionalEventData = opResult.additionalEventData;
      break;
    }

    case TypeOperationCaisse.WITHDRAWAL_SAVINGS:
    case TypeOperationCaisse.WITHDRAWAL_CURRENT:
    case TypeOperationCaisse.WITHDRAWAL_BLOCKED: {
       if (!payload.compteId) throw new Error("ID Compte requis");

       const compte = await db.query.comptes.findFirst({ where: eq(comptes.id, payload.compteId) });
       if (!compte) throw new Error("Compte introuvable");

       const check = canWithdraw(compte);
       if (!check.allowed) throw new Error(check.reason);

       if (Number(compte.soldeCourant) < payload.amount) {
           throw new Error("Solde compte insuffisant");
       }

       const opResult = await processCompteRetrait(tx, mouvement, {
         compteId: payload.compteId,
         montant: payload.amount,
         sessionCaisseId,
         observations: payload.description,
         typePaiement: payload.natureOperation,
         methodePaiement: payload.paymentMethod,
         userId
       });
       result = opResult.result;
       additionalEventData = opResult.additionalEventData;
       break;
    }

    default:
      throw new Error(`Opération compte non supportée: ${payload.natureOperation}`);
  }

  return { result, additionalEventData };
}
