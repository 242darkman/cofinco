import { Decimal } from "decimal.js";
import { D, splitEvenly } from "../../lib/money";
import type { PlanConfig, ScheduleRow } from "./types";
import { computeNumberOfInstallments } from "./calendar-utils";

// ============================================================
// Rate normalization
// ============================================================

/**
 * Normalize the plan's interest rate to a per-period rate (Decimal).
 *
 * The "period" depends on frequenceRemboursement:
 *   DAILY → 1 day, WEEKLY → 7 days, BI_MONTHLY → 15 days, MONTHLY → 30 days, QUARTERLY → 90 days
 */
export function normalizeToPeriodicRate(plan: PlanConfig): Decimal {
  const rate = D(plan.tauxInteret).div(100);

  // Approximate period length in days
  const periodDays = getPeriodDays(plan.frequenceRemboursement);

  switch (plan.interestRatePeriod) {
    case "DAILY":
      // Rate is already per-day, multiply by period length
      return rate.times(periodDays);

    case "MONTHLY":
      // Rate is per-month
      if (plan.frequenceRemboursement === "MONTHLY") return rate;
      if (plan.frequenceRemboursement === "QUARTERLY") return rate.times(3);
      // Convert monthly to daily then to period
      return rate.div(30).times(periodDays);

    case "ANNUAL": {
      const denom = plan.dayCountConvention === "ACT_360" ? 360 : plan.dayCountConvention === "ACT_365" ? 365 : 360;
      if (plan.dayCountConvention === "30_360" && plan.frequenceRemboursement === "MONTHLY") {
        return rate.div(12);
      }
      if (plan.dayCountConvention === "30_360" && plan.frequenceRemboursement === "QUARTERLY") {
        return rate.div(4);
      }
      return rate.div(denom).times(periodDays);
    }

    default:
      return rate;
  }
}

function getPeriodDays(freq: PlanConfig["frequenceRemboursement"]): number {
  switch (freq) {
    case "DAILY": return 1;
    case "WEEKLY": return 7;
    case "BI_MONTHLY": return 15;
    case "MONTHLY": return 30;
    case "QUARTERLY": return 90;
    default: return 30;
  }
}

// ============================================================
// Rounding
// ============================================================

/**
 * Round an amount according to plan's rounding config.
 */
export function roundAmount(value: Decimal, plan: PlanConfig): Decimal {
  const unit = plan.interestRoundingUnit;

  if (unit <= 1) {
    // Round to 0 decimals for FCFA-type currencies
    const rm = plan.interestRoundingMode === "FLOOR"
      ? Decimal.ROUND_DOWN
      : plan.interestRoundingMode === "CEIL"
        ? Decimal.ROUND_UP
        : Decimal.ROUND_HALF_UP;
    return value.toDecimalPlaces(0, rm);
  }

  // Round to nearest unit (5, 10, 25, 50, 100)
  const divided = value.div(unit);
  const rm = plan.interestRoundingMode === "FLOOR"
    ? Decimal.ROUND_DOWN
    : plan.interestRoundingMode === "CEIL"
      ? Decimal.ROUND_UP
      : Decimal.ROUND_HALF_UP;
  return divided.toDecimalPlaces(0, rm).times(unit);
}

// ============================================================
// FLAT interest (current behavior)
// ============================================================

/**
 * Flat interest: totalInterest = principal * rate
 * Split evenly across N installments.
 */
export function computeFlatSchedule(
  principal: Decimal,
  plan: PlanConfig,
): { capitalParts: Decimal[]; interestParts: Decimal[]; totalInterest: Decimal } {
  const n = computeNumberOfInstallments(plan);
  const rate = D(plan.tauxInteret).div(100);
  const totalInterest = roundAmount(principal.times(rate), plan);
  const capitalParts = splitEvenly(principal, n);
  const interestParts = splitEvenly(totalInterest, n);
  return { capitalParts, interestParts, totalInterest };
}

// ============================================================
// DECLINING BALANCE + EQUAL INSTALLMENTS (French amortization)
// ============================================================

/**
 * Annuite constante: PMT = P * r / (1 - (1+r)^-n)
 */
export function computeEqualInstallmentSchedule(
  principal: Decimal,
  plan: PlanConfig,
): { capitalParts: Decimal[]; interestParts: Decimal[]; totalInterest: Decimal } {
  const n = computeNumberOfInstallments(plan);
  const r = normalizeToPeriodicRate(plan);

  // Handle zero rate edge case
  if (r.isZero()) {
    const capitalParts = splitEvenly(principal, n);
    const interestParts = capitalParts.map(() => new Decimal(0));
    return { capitalParts, interestParts, totalInterest: new Decimal(0) };
  }

  // PMT = P * r / (1 - (1+r)^(-n))
  const onePlusR = new Decimal(1).plus(r);
  const denominator = new Decimal(1).minus(onePlusR.pow(-n));
  if (denominator.abs().lt(1e-12)) {
    // Degenerate case: treat as equal principal split
    const capitalParts = splitEvenly(principal, n);
    const interestParts = capitalParts.map(() => new Decimal(0));
    return { capitalParts, interestParts, totalInterest: new Decimal(0) };
  }
  const pmt = roundAmount(principal.times(r).div(denominator), plan);

  const capitalParts: Decimal[] = [];
  const interestParts: Decimal[] = [];
  let balance = new Decimal(principal);
  let totalInterest = new Decimal(0);

  for (let i = 0; i < n; i++) {
    const interest = roundAmount(balance.times(r), plan);
    let capital: Decimal;

    if (i === n - 1) {
      // Last installment: absorb rounding remainder
      capital = balance;
    } else {
      capital = pmt.minus(interest);
      if (capital.gt(balance)) capital = balance;
    }

    capitalParts.push(capital);
    interestParts.push(interest);
    totalInterest = totalInterest.plus(interest);
    balance = balance.minus(capital);
    if (balance.lt(0)) balance = new Decimal(0);
  }

  return { capitalParts, interestParts, totalInterest };
}

// ============================================================
// DECLINING BALANCE + EQUAL PRINCIPAL
// ============================================================

/**
 * Equal principal: fixed capital per installment, decreasing interest.
 */
export function computeEqualPrincipalSchedule(
  principal: Decimal,
  plan: PlanConfig,
): { capitalParts: Decimal[]; interestParts: Decimal[]; totalInterest: Decimal } {
  const n = computeNumberOfInstallments(plan);
  const r = normalizeToPeriodicRate(plan);
  const fixedCapital = splitEvenly(principal, n);

  const interestParts: Decimal[] = [];
  let balance = new Decimal(principal);
  let totalInterest = new Decimal(0);

  for (let i = 0; i < n; i++) {
    const interest = roundAmount(balance.times(r), plan);
    interestParts.push(interest);
    totalInterest = totalInterest.plus(interest);
    balance = balance.minus(fixedCapital[i]);
    if (balance.lt(0)) balance = new Decimal(0);
  }

  return { capitalParts: fixedCapital, interestParts, totalInterest };
}

// ============================================================
// INTEREST ONLY THEN BALLOON
// ============================================================

/**
 * Interest-only for N-1 periods, then full principal + interest on last.
 */
export function computeBalloonSchedule(
  principal: Decimal,
  plan: PlanConfig,
): { capitalParts: Decimal[]; interestParts: Decimal[]; totalInterest: Decimal } {
  const n = computeNumberOfInstallments(plan);
  const r = normalizeToPeriodicRate(plan);
  const periodicInterest = roundAmount(principal.times(r), plan);

  const capitalParts: Decimal[] = [];
  const interestParts: Decimal[] = [];
  let totalInterest = new Decimal(0);

  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      // Last installment: principal + interest
      capitalParts.push(principal);
    } else {
      capitalParts.push(new Decimal(0));
    }
    interestParts.push(periodicInterest);
    totalInterest = totalInterest.plus(periodicInterest);
  }

  return { capitalParts, interestParts, totalInterest };
}
