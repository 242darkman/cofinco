import { Decimal } from "decimal.js";
import type { ScheduleInput, ScheduleResult, ScheduleRow } from "./types";
import {
  computeFirstDueDate,
  advanceDate,
  computeNumberOfInstallments,
} from "./calendar-utils";
import {
  computeFlatSchedule,
  computeEqualInstallmentSchedule,
  computeEqualPrincipalSchedule,
  computeBalloonSchedule,
} from "./interest-calculators";
import {
  computeFees,
  sumDeductedFees,
  spreadFees,
  sumAllFees,
} from "./fee-calculator";

/**
 * Generate a full repayment schedule for a credit plan.
 *
 * This is the central computation function that:
 * 1. Computes the first due date
 * 2. Calculates interest based on method + amortization type
 * 3. Applies fee spreading
 * 4. Generates dated schedule rows with running balance
 */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const { principal, disbursementDate, plan, fees, customFirstDueDate, holidays } = input;

  // 1. Compute fees
  const feeBreakdowns = computeFees(fees, principal);
  const deducted = sumDeductedFees(feeBreakdowns);
  const effectivePrincipal = principal.minus(deducted);
  if (effectivePrincipal.lte(0)) {
    throw new Error("Le capital effectif après déduction des frais est nul ou négatif. Réduisez les frais déduits du capital.");
  }
  const totalFeesAmount = sumAllFees(feeBreakdowns);

  // 2. Compute number of installments
  const n = computeNumberOfInstallments(plan);

  // 3. Compute interest schedule based on method + amortization
  let capitalParts: Decimal[];
  let interestParts: Decimal[];
  let totalInterest: Decimal;

  if (plan.interestMethod === "FLAT") {
    const result = computeFlatSchedule(effectivePrincipal, plan);
    capitalParts = result.capitalParts;
    interestParts = result.interestParts;
    totalInterest = result.totalInterest;
  } else {
    // DECLINING_BALANCE
    switch (plan.amortizationType) {
      case "EQUAL_PRINCIPAL": {
        const result = computeEqualPrincipalSchedule(effectivePrincipal, plan);
        capitalParts = result.capitalParts;
        interestParts = result.interestParts;
        totalInterest = result.totalInterest;
        break;
      }
      case "INTEREST_ONLY_THEN_BALLOON": {
        const result = computeBalloonSchedule(effectivePrincipal, plan);
        capitalParts = result.capitalParts;
        interestParts = result.interestParts;
        totalInterest = result.totalInterest;
        break;
      }
      default: {
        // EQUAL_INSTALLMENTS (French amortization)
        const result = computeEqualInstallmentSchedule(effectivePrincipal, plan);
        capitalParts = result.capitalParts;
        interestParts = result.interestParts;
        totalInterest = result.totalInterest;
      }
    }
  }

  // 4. Spread fees across installments
  const spreadFeeParts = spreadFees(feeBreakdowns, n);

  // 5. Generate dated rows
  const firstDue = computeFirstDueDate(disbursementDate, plan, holidays, customFirstDueDate);
  const rows: ScheduleRow[] = [];
  let currentDate = firstDue;
  let balance = new Decimal(effectivePrincipal);

  for (let i = 0; i < n; i++) {
    const capital = capitalParts[i];
    const interest = interestParts[i];
    const fee = spreadFeeParts[i];
    balance = balance.minus(capital);
    if (balance.lt(0)) balance = new Decimal(0);

    rows.push({
      number: i + 1,
      date: new Date(currentDate),
      capitalPayment: capital,
      interestPayment: interest,
      feePayment: fee,
      totalPayment: capital.plus(interest).plus(fee),
      balanceAfter: balance,
    });

    if (i < n - 1) {
      currentDate = advanceDate(currentDate, plan, holidays);
    }
  }

  // 6. Build result
  const totalCapital = rows.reduce((acc, r) => acc.plus(r.capitalPayment), new Decimal(0));
  const totalFees = totalFeesAmount;
  const totalDue = totalCapital.plus(totalInterest).plus(totalFees);

  return {
    rows,
    summary: {
      totalCapital,
      totalInterest,
      totalFees,
      totalDue,
      numberOfInstallments: n,
    },
    upfrontFees: feeBreakdowns.filter(
      (f) => f.collectionMode === "UPFRONT" || f.collectionMode === "ON_DISBURSEMENT",
    ),
  };
}

/**
 * Build a legacy PlanConfig from credit fields (for backward compatibility with
 * existing credits that were created before the new plan system).
 */
export function buildLegacyPlanConfig(credit: {
  taux: string;
  duree: number;
  echeance?: string;
}): import("./types").PlanConfig {
  // Map legacy echeance string to frequency
  const freqMap: Record<string, import("./types").PlanConfig["frequenceRemboursement"]> = {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    BI_MONTHLY: "BI_MONTHLY",
    MONTHLY: "MONTHLY",
    QUARTERLY: "QUARTERLY",
  };

  return {
    dureeValeur: credit.duree,
    dureeUnite: "DAY",
    frequenceRemboursement: freqMap[credit.echeance || "DAILY"] || "DAILY",
    tauxInteret: credit.taux,
    interestMethod: "FLAT",
    interestRatePeriod: "MONTHLY",
    dayCountConvention: "30_360",
    interestRoundingMode: "ROUND",
    interestRoundingUnit: 1,
    amortizationType: "EQUAL_INSTALLMENTS",
    firstDueRule: "NEXT_DAY",
    gracePeriodDays: 0,
    preferredWeekday: null,
    calendarMode: "ALL_DAYS",
    weekdaysMask: 127,
    shiftNonWorkingDay: "NEXT",
    allowManualFirstDueDate: false,
  };
}
