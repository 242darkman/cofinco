import { operationsCaisse } from "@shared/schema";
import { validateUserId, updateSessionSolde } from "../../ledger";
import { TypeOperationCaisse } from "@shared/enum/status-constants";
import type { TransactionHandlerContext, TransactionHandlerResult } from "../global-transaction-types";

/**
 * Gère les transactions globales diverses (Encaissements, Décaissements).
 */
export async function handleMiscTransaction(ctx: TransactionHandlerContext): Promise<TransactionHandlerResult> {
  const { tx, mouvement, payload, sessionCaisseId, userId } = ctx;
  let result: any;
  let additionalEventData: any = {};

  switch (payload.natureOperation) {
    case TypeOperationCaisse.MISC_COLLECTION:
    case TypeOperationCaisse.MISC_DISBURSEMENT: {
       if (sessionCaisseId) {
          const sens = payload.natureOperation === TypeOperationCaisse.MISC_COLLECTION ? 1 : -1;
          const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, payload.amount * sens);
          additionalEventData.nouveauSoldeSession = nouveauSolde;
          
          const validatedUserId = await validateUserId(tx, userId);
          const [op] = await tx.insert(operationsCaisse).values({
              sessionId: sessionCaisseId,
              mouvementId: mouvement.id,
              typeOperation: payload.natureOperation as any,
              montant: payload.amount.toString(),
              methodePaiement: "CASH",
              reference: `DIV-${mouvement.reference}`,
              description: payload.description || "Opération Divers",
              createdBy: validatedUserId
          }).returning();
          result = op;
       }
       break;
    }
    
    default:
      throw new Error(`Opération diverse non supportée: ${payload.natureOperation}`);
  }

  return { result, additionalEventData };
}
