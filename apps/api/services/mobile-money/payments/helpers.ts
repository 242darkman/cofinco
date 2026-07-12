import { and, desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { sessionsCaisse, type PaymentIntent } from "@shared/schema";
import { resolveOperatorFromPhone } from "../providers/pawapay/pawapay-config";
import { MobileMoneyError, type MobileOperator } from "../types";
import { TypeOperationCaisse } from "@shared/enum/status-constants";

/**
 * Résout l'opérateur (MTN/AIRTEL) à partir du numéro de téléphone ou du paramètre provider.
 * Le paramètre provider a la priorité s'il est explicitement "MTN" ou "AIRTEL".
 * 
 * @param provider - L'opérateur spécifié
 * @param phone - Le numéro de téléphone
 * @returns L'opérateur résolu
 * @throws MobileMoneyError si l'opérateur ne peut être déterminé
 */
export function resolveOperator(provider: MobileOperator, phone: string): MobileOperator {
  if (provider === "MTN" || provider === "AIRTEL") {
    return provider;
  }
  
  const resolved = resolveOperatorFromPhone(phone);
  if (!resolved) {
    throw new MobileMoneyError(
      `Impossible de déterminer l'opérateur pour le numéro ${phone}`,
      "OPERATOR_RESOLUTION_FAILED",
      "PAWAPAY",
      false
    );
  }
  return resolved;
}

/**
 * Détermine le cas d'usage (use case) basé sur les entités liées au paiement.
 * 
 * @param params - Les identifiants optionnels liés (compte, crédit, tontine)
 * @returns Le cas d'usage sous forme de chaîne de caractères
 */
export function determineUseCase(params: {
  compteId?: string;
  creditId?: string;
  tontineId?: string;
}): string {
  if (params.creditId) return "CREDIT_REPAYMENT";
  if (params.tontineId) return "TONTINE_CONTRIBUTION";
  if (params.compteId) return "DEPOSIT_SAVINGS";
  return "DEPOSIT_SAVINGS";
}

/**
 * Détermine le type de paiement pour l'écriture comptable (mouvement).
 * 
 * @param intent - L'intention de paiement
 * @returns Le type de paiement sous forme de chaîne de caractères
 */
export function determineTypePaiement(intent: PaymentIntent): string {
  if (intent.creditId) return "CREDIT_REPAYMENT";
  if (intent.tontineId) return "TONTINE_CONTRIBUTION";
  if (intent.compteId) return "DEPOSIT_SAVINGS";
  return "DEPOSIT_SAVINGS";
}

/**
 * Mappe l'intention de paiement vers un type d'opération de caisse officiel.
 * 
 * @param intent - L'intention de paiement
 * @returns Le type d'opération de caisse
 */
export function mapToOperationType(intent: PaymentIntent): string {
  if (intent.type === "COLLECTION") {
    if (intent.creditId) return TypeOperationCaisse.CREDIT_REPAYMENT;
    if (intent.tontineId) return TypeOperationCaisse.TONTINE_CONTRIBUTION;
    return TypeOperationCaisse.DEPOSIT_SAVINGS;
  } else {
    if (intent.creditId) return TypeOperationCaisse.CREDIT_DISBURSEMENT;
    if (intent.tontineId) return TypeOperationCaisse.TONTINE_WITHDRAWAL;
    return TypeOperationCaisse.WITHDRAWAL_SAVINGS;
  }
}

/**
 * Trouve la session de caisse active la plus récente pour une agence donnée.
 * 
 * @param tx - La transaction de base de données
 * @param agenceId - L'identifiant de l'agence
 * @returns L'identifiant de la session ou null s'il n'y en a aucune d'active
 */
export async function findActiveSession(
  tx: PgTransaction<any, any, any>,
  agenceId: string
): Promise<{ id: string } | null> {
  const [session] = await tx
    .select({ id: sessionsCaisse.id })
    .from(sessionsCaisse)
    .where(
      and(
        eq(sessionsCaisse.agenceId, agenceId),
        eq(sessionsCaisse.statut, "OPEN")
      )
    )
    .orderBy(desc(sessionsCaisse.openedAt))
    .limit(1);

  return session || null;
}
