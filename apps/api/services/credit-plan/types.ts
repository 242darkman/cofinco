import type Decimal from "decimal.js";

// ============================================================
// Plan Config (subset of creditPlans columns used by engine)
// ============================================================

export interface PlanConfig {
  // Duration & repayment
  dureeValeur: number;
  dureeUnite: "DAY" | "WEEK" | "MONTH";
  frequenceRemboursement: "DAILY" | "WEEKLY" | "BI_MONTHLY" | "MONTHLY" | "QUARTERLY";

  // Interest
  tauxInteret: string; // numeric as string
  interestMethod: "FLAT" | "DECLINING_BALANCE";
  interestRatePeriod: "DAILY" | "MONTHLY" | "ANNUAL";
  dayCountConvention: "ACT_365" | "ACT_360" | "30_360";
  interestRoundingMode: "ROUND" | "FLOOR" | "CEIL";
  interestRoundingUnit: number; // 1, 5, 10, 25, 50, 100
  amortizationType: "EQUAL_INSTALLMENTS" | "EQUAL_PRINCIPAL" | "INTEREST_ONLY_THEN_BALLOON";

  // Calendar & first due date
  firstDueRule: "NEXT_DAY" | "NEXT_BUSINESS_DAY" | "AFTER_N_DAYS" | "NEXT_WEEKDAY" | "END_OF_WEEK" | "END_OF_MONTH" | "CUSTOM_DATE_ALLOWED";
  gracePeriodDays: number;
  preferredWeekday: number | null; // 0=Sun ... 6=Sat
  calendarMode: "ALL_DAYS" | "BUSINESS_DAYS_ONLY" | "CUSTOM_WEEKDAYS";
  weekdaysMask: number; // bitmask
  shiftNonWorkingDay: "NEXT" | "PREVIOUS" | "NEAREST";
  allowManualFirstDueDate: boolean;
}

// ============================================================
// Fee configuration
// ============================================================

export interface FeeConfig {
  feeType: string;
  label: string | null;
  calcType: "FIXED" | "PERCENTAGE";
  value: string; // numeric as string
  minAmount: string | null;
  maxAmount: string | null;
  collectionMode: "UPFRONT" | "DEDUCTED_FROM_PRINCIPAL" | "SPREAD" | "ON_DISBURSEMENT";
}

// ============================================================
// Schedule input / output
// ============================================================

export interface ScheduleInput {
  principal: Decimal;
  disbursementDate: Date;
  plan: PlanConfig;
  fees: FeeConfig[];
  customFirstDueDate?: Date;
  holidays?: Set<string>; // "YYYY-MM-DD" strings
}

export interface ScheduleRow {
  number: number;
  date: Date;
  capitalPayment: Decimal;
  interestPayment: Decimal;
  feePayment: Decimal;
  totalPayment: Decimal;
  balanceAfter: Decimal;
}

export interface FeeBreakdown {
  feeType: string;
  label: string | null;
  amount: Decimal;
  collectionMode: string;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  summary: {
    totalCapital: Decimal;
    totalInterest: Decimal;
    totalFees: Decimal;
    totalDue: Decimal;
    numberOfInstallments: number;
  };
  upfrontFees: FeeBreakdown[];
}
