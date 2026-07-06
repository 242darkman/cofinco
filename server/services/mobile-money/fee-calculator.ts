/**
 * Mobile Money Fee Calculator
 * Calcule les frais MicroFlex facturés au client pour les opérations Mobile Money.
 *
 * Formule: fee = max(minFee, min(maxFee, feeFixed + amount × feePct / 100))
 * Arrondi: Math.round() car XAF a 0 décimales.
 *
 * Distinct des frais pawaPay (aggregator fee) qui sont le coût MicroFlex.
 */

import { db } from "../../db";
import { mmFeeSchedules } from "@shared/schema/mm-fee-schedules";
import { eq, and } from "drizzle-orm";
import type { MobileOperator } from "./types";
import type { FeeOption } from "@shared/schema/mm-fee-schedules";
import { createLogger } from "../../lib/logger";

const logger = createLogger("FeeCalculator");

export interface FeeEstimate {
  /** Frais calculés (arrondi FCFA) */
  feeAmount: number;
  /** Taux % utilisé */
  feeRate: number;
  /** Composant fixe utilisé */
  feeFixed: number;
  /** Total débité de la source (téléphone pour collection, compte pour payout) */
  montantBrut: number;
  /** Montant crédité à la destination (compte pour collection, téléphone pour payout) */
  montantNet: number;
  /** Option appliquée */
  feeOption: FeeOption;
}

/**
 * Calcule les frais pour une opération Mobile Money.
 *
 * @param amount - Montant de base saisi par l'utilisateur
 * @param provider - Opérateur mobile (MTN ou AIRTEL)
 * @param direction - COLLECTION (argent entrant) ou PAYOUT (argent sortant)
 * @param feeOption - CLIENT_PAYS (frais ajoutés) ou FEES_DEDUCTED (frais déduits)
 */
export async function calculateFee(
  amount: number,
  provider: MobileOperator,
  direction: "COLLECTION" | "PAYOUT",
  feeOption: FeeOption,
): Promise<FeeEstimate> {
  // Lookup active fee schedule for this provider + direction
  const [schedule] = await db
    .select()
    .from(mmFeeSchedules)
    .where(
      and(
        eq(mmFeeSchedules.provider, provider),
        eq(mmFeeSchedules.direction, direction),
        eq(mmFeeSchedules.active, true),
      ),
    )
    .limit(1);

  if (!schedule) {
    logger.warn({ provider, direction }, "No active fee schedule found, returning zero fee");
    return {
      feeAmount: 0,
      feeRate: 0,
      feeFixed: 0,
      montantBrut: amount,
      montantNet: amount,
      feeOption,
    };
  }

  const feePct = parseFloat(schedule.feePct);
  const feeFixed = parseFloat(schedule.feeFixed);
  const minFee = parseFloat(schedule.minFee);
  const maxFee = parseFloat(schedule.maxFee);

  // Formula: max(minFee, min(maxFee, feeFixed + amount × feePct / 100))
  const rawFee = feeFixed + (amount * feePct) / 100;
  const clampedFee = Math.max(minFee, Math.min(maxFee, rawFee));
  // XAF has 0 decimal places
  const feeAmount = Math.round(clampedFee);

  let montantBrut: number;
  let montantNet: number;

  if (feeOption === "CLIENT_PAYS") {
    // Client pays fee on top of the base amount
    // Collection: phone debited (amount + fee), account credited (amount)
    // Payout: account debited (amount + fee), phone receives (amount)
    montantBrut = amount + feeAmount;
    montantNet = amount;
  } else {
    // Fees deducted from the base amount
    // Collection: phone debited (amount), account credited (amount - fee)
    // Payout: account debited (amount), phone receives (amount - fee)
    montantBrut = amount;
    montantNet = amount - feeAmount;
  }

  return {
    feeAmount,
    feeRate: feePct,
    feeFixed,
    montantBrut,
    montantNet,
    feeOption,
  };
}
