import { Decimal } from "decimal.js";
import { D, splitEvenly } from "../../lib/money";
import type { FeeConfig, FeeBreakdown } from "./types";

/**
 * Compute the actual fee amounts from plan fee configs and principal.
 */
export function computeFees(
  fees: FeeConfig[],
  principal: Decimal,
): FeeBreakdown[] {
  return fees.map((fee) => {
    let amount: Decimal;

    if (fee.calcType === "FIXED") {
      amount = D(fee.value);
      if (amount.lt(0)) {
        throw new Error(`Le montant du frais "${fee.label || fee.feeType}" ne peut pas être négatif`);
      }
    } else {
      // PERCENTAGE of principal
      const pct = D(fee.value);
      if (pct.lt(0) || pct.gt(100)) {
        throw new Error(`Le pourcentage du frais "${fee.label || fee.feeType}" doit être entre 0 et 100`);
      }
      amount = principal.times(pct).div(100);
    }

    // Apply min/max caps
    if (fee.minAmount) {
      const min = D(fee.minAmount);
      if (amount.lt(min)) amount = min;
    }
    if (fee.maxAmount) {
      const max = D(fee.maxAmount);
      if (amount.gt(max)) amount = max;
    }

    // Round to integer (FCFA)
    amount = amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    return {
      feeType: fee.feeType,
      label: fee.label,
      amount,
      collectionMode: fee.collectionMode,
    };
  });
}

/**
 * Sum all upfront fees (UPFRONT + ON_DISBURSEMENT).
 */
export function sumUpfrontFees(feeBreakdowns: FeeBreakdown[]): Decimal {
  return feeBreakdowns
    .filter((f) => f.collectionMode === "UPFRONT" || f.collectionMode === "ON_DISBURSEMENT")
    .reduce((acc, f) => acc.plus(f.amount), new Decimal(0));
}

/**
 * Sum fees deducted from principal.
 */
export function sumDeductedFees(feeBreakdowns: FeeBreakdown[]): Decimal {
  return feeBreakdowns
    .filter((f) => f.collectionMode === "DEDUCTED_FROM_PRINCIPAL")
    .reduce((acc, f) => acc.plus(f.amount), new Decimal(0));
}

/**
 * Spread SPREAD-mode fees evenly across N installments.
 * Returns an array of per-installment fee amounts.
 */
export function spreadFees(feeBreakdowns: FeeBreakdown[], numberOfInstallments: number): Decimal[] {
  const totalSpread = feeBreakdowns
    .filter((f) => f.collectionMode === "SPREAD")
    .reduce((acc, f) => acc.plus(f.amount), new Decimal(0));

  if (totalSpread.isZero()) {
    return Array.from({ length: numberOfInstallments }, () => new Decimal(0));
  }

  return splitEvenly(totalSpread, numberOfInstallments);
}

/**
 * Total of all fees regardless of collection mode.
 */
export function sumAllFees(feeBreakdowns: FeeBreakdown[]): Decimal {
  return feeBreakdowns.reduce((acc, f) => acc.plus(f.amount), new Decimal(0));
}
