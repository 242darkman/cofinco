import { db } from "../db";
import { sessionsCaisse } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { executeWithLedger } from "./ledger";
import { TypeOperationCaisse, MethodePaiement, StatutSessionCaisse } from "@shared/enum/status-constants";

import type { GlobalTransactionPayload, TransactionHandlerContext } from "./global-transaction/global-transaction-types";
import { handleTontineTransaction } from "./global-transaction/handlers/tontine-handler";
import { handleAccountTransaction } from "./global-transaction/handlers/account-handler";
import { handleCreditTransaction } from "./global-transaction/handlers/credit-handler";
import { handleMiscTransaction } from "./global-transaction/handlers/misc-handler";

/**
 * Service de gestion globale des transactions financières (Switch Central).
 * Garantit l'atomicité des opérations (ACID) en encapsulant la logique
 * de chaque domaine (Caisse, Tontine, Épargne, Crédit) via `executeWithLedger`.
 */
export class GlobalTransactionService {
  
  /**
   * Traite une transaction globale.
   * Agit comme un orchestrateur garantissant les propriétés ACID et les règles comptables.
   * 
   * @param userId - ID de l'utilisateur effectuant la transaction
   * @param payload - Détails de la transaction
   * @returns Le résultat de la transaction métier spécifique
   */
  static async process(userId: string | undefined, payload: GlobalTransactionPayload) {
    // Sanitize payload: convert empty strings to undefined for UUID fields
    const sanitizeUuid = (val: string | undefined) => (val && val.trim() !== "" ? val : undefined);
    
    payload.clientId = sanitizeUuid(payload.clientId)!; // Required based on validation below
    payload.targetId = sanitizeUuid(payload.targetId);
    payload.tontineId = sanitizeUuid(payload.tontineId);
    payload.membreId = sanitizeUuid(payload.membreId);
    payload.compteId = sanitizeUuid(payload.compteId);
    payload.creditId = sanitizeUuid(payload.creditId);

    // 1. Validation de base
    if (!payload.amount || payload.amount <= 0) {
      throw new Error("Le montant doit être supérieur à 0");
    }
    if (!payload.clientId) {
      throw new Error("Client requis");
    }

    // 2. Validation Session Caisse (si ESPÈCES)
    let sessionCaisseId: string | undefined;
    let resolvedAgenceId: string | undefined = payload.agenceId;

    if (payload.paymentMethod === MethodePaiement.CASH) {
      if (!userId) {
         throw new Error("Utilisateur requis pour les opérations en espèces");
      }

      const session = await db.query.sessionsCaisse.findFirst({
        where: and(
          eq(sessionsCaisse.caissierId, userId),
          eq(sessionsCaisse.statut, StatutSessionCaisse.OPEN)
        )
      });

      if (!session) {
        throw new Error("Aucune session de caisse ouverte pour cet agent");
      }
      sessionCaisseId = session.id;

      // Derive agenceId from session if not explicitly provided
      if (!resolvedAgenceId && session.agenceId) {
        resolvedAgenceId = session.agenceId;
      }

      // Vérification Solde Caisse pour les SORTIES
      const isSortie = [
        TypeOperationCaisse.TONTINE_WITHDRAWAL,
        TypeOperationCaisse.WITHDRAWAL_SAVINGS,
        TypeOperationCaisse.WITHDRAWAL_CURRENT,
        TypeOperationCaisse.WITHDRAWAL_BLOCKED,
        TypeOperationCaisse.CREDIT_DISBURSEMENT,
        TypeOperationCaisse.LOAN_DISBURSEMENT,
        TypeOperationCaisse.MISC_DISBURSEMENT
      ].includes(payload.natureOperation as any);

      if (isSortie) {
        const soldeActuel = Number(session.montantFermetureTheorique || 0);
        if (soldeActuel < payload.amount) {
          throw new Error(`Fonds insuffisants en caisse. Disponible: ${soldeActuel}`);
        }
      }
    }

    // 3. Routage & Exécution (Switch Central)
    let sourceModule: any = "CAISSE";
    if (payload.natureOperation.startsWith("TONTINE")) sourceModule = "TONTINE";
    else if (payload.natureOperation.includes("SAVINGS") || payload.natureOperation.includes("CURRENT")) sourceModule = "EPARGNE";
    else if (payload.natureOperation.includes("LOAN") || payload.natureOperation.includes("CREDIT")) sourceModule = "CREDIT";

    return await executeWithLedger(
      sourceModule,
      {
        montant: payload.amount.toString(),
        sens: this.getSensByOperation(payload.natureOperation),
        clientId: payload.clientId,
        sessionCaisseId,
        agenceId: resolvedAgenceId,
        typePaiement: payload.natureOperation,
        methodePaiement: payload.paymentMethod,
        compteId: payload.compteId,
        tontineId: payload.tontineId,
        creditId: payload.creditId,
        referenceExterne: payload.referenceExterne || payload.numeroTransaction,
        metadata: {
          description: payload.description,
          telephone: payload.numeroTelephone,
        },
      },
      async (tx, mouvement) => {
        const ctx: TransactionHandlerContext = {
          tx,
          mouvement,
          payload,
          sessionCaisseId,
          userId
        };

        if (payload.natureOperation.startsWith("TONTINE")) {
          return await handleTontineTransaction(ctx);
        } else if (
          payload.natureOperation.includes("SAVINGS") ||
          payload.natureOperation.includes("CURRENT") ||
          payload.natureOperation.includes("BLOCKED")
        ) {
          return await handleAccountTransaction(ctx);
        } else if (
          payload.natureOperation.includes("LOAN") ||
          payload.natureOperation.includes("CREDIT")
        ) {
          return await handleCreditTransaction(ctx);
        } else if (
          payload.natureOperation.startsWith("MISC_")
        ) {
          return await handleMiscTransaction(ctx);
        } else {
          throw new Error(`Opération non supportée: ${payload.natureOperation}`);
        }
      },
      userId
    );
  }

  /**
   * Détermine le sens comptable (CRÉDIT/DÉBIT) en fonction du type d'opération.
   * 
   * @param op - Type de l'opération
   * @returns "CREDIT" (entrée de fonds) ou "DEBIT" (sortie de fonds)
   */
  static getSensByOperation(op: string): "CREDIT" | "DEBIT" {
     const entrees = [
         TypeOperationCaisse.TONTINE_CONTRIBUTION,
         TypeOperationCaisse.DEPOSIT_SAVINGS,
         TypeOperationCaisse.DEPOSIT_CURRENT,
         TypeOperationCaisse.DEPOSIT_BLOCKED,
         TypeOperationCaisse.MISC_COLLECTION,
         TypeOperationCaisse.LOAN_REPAYMENT,
         TypeOperationCaisse.CREDIT_REPAYMENT,
         TypeOperationCaisse.ENGAGEMENT_FEE
     ];
     return entrees.includes(op as any) ? "CREDIT" : "DEBIT";
  }
}
