import type { PlanConfig } from "./types";

/**
 * Format a Date as "YYYY-MM-DD" for holiday lookup.
 */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Check if a date is a working day according to plan config + holidays.
 */
export function isWorkingDay(
  date: Date,
  plan: Pick<PlanConfig, "calendarMode" | "weekdaysMask">,
  holidays?: Set<string>,
): boolean {
  if (plan.calendarMode === "ALL_DAYS") return true;

  const dow = date.getDay(); // 0=Sun ... 6=Sat

  if (plan.calendarMode === "BUSINESS_DAYS_ONLY") {
    // Mon-Fri only
    if (dow === 0 || dow === 6) return false;
  } else if (plan.calendarMode === "CUSTOM_WEEKDAYS") {
    // Check bitmask: bit 0 = Sunday, bit 6 = Saturday
    if ((plan.weekdaysMask & (1 << dow)) === 0) return false;
  }

  // Check holidays
  if (holidays && holidays.has(formatDateKey(date))) return false;

  return true;
}

/**
 * Shift a date to the nearest working day according to the plan's rule.
 */
export function shiftIfNonWorking(
  date: Date,
  plan: Pick<PlanConfig, "calendarMode" | "weekdaysMask" | "shiftNonWorkingDay">,
  holidays?: Set<string>,
): Date {
  if (isWorkingDay(date, plan, holidays)) return date;

  if (plan.shiftNonWorkingDay === "NEXT") {
    return shiftForward(date, plan, holidays);
  }

  if (plan.shiftNonWorkingDay === "PREVIOUS") {
    return shiftBackward(date, plan, holidays);
  }

  // NEAREST: try both directions, pick closest
  const forward = shiftForward(date, plan, holidays);
  const backward = shiftBackward(date, plan, holidays);
  const diffForward = forward.getTime() - date.getTime();
  const diffBackward = date.getTime() - backward.getTime();
  return diffForward <= diffBackward ? forward : backward;
}

function shiftForward(
  date: Date,
  plan: Pick<PlanConfig, "calendarMode" | "weekdaysMask">,
  holidays?: Set<string>,
): Date {
  const d = new Date(date);
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, plan, holidays)) return new Date(d);
  }
  return new Date(date); // fallback
}

function shiftBackward(
  date: Date,
  plan: Pick<PlanConfig, "calendarMode" | "weekdaysMask">,
  holidays?: Set<string>,
): Date {
  const d = new Date(date);
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() - 1);
    if (isWorkingDay(d, plan, holidays)) return new Date(d);
  }
  return new Date(date); // fallback
}

// ============================================================
// First due date computation
// ============================================================

/**
 * Compute the first due date for a credit based on disbursement date and plan config.
 */
export function computeFirstDueDate(
  disbursementDate: Date,
  plan: PlanConfig,
  holidays?: Set<string>,
  customDate?: Date,
): Date {
  let result: Date;

  switch (plan.firstDueRule) {
    case "NEXT_DAY":
      result = addDays(disbursementDate, 1);
      break;

    case "NEXT_BUSINESS_DAY":
      result = addDays(disbursementDate, 1);
      while (!isWorkingDay(result, plan, holidays)) {
        result = addDays(result, 1);
      }
      return result; // already a working day, skip final shift

    case "AFTER_N_DAYS":
      result = addDays(disbursementDate, Math.max(plan.gracePeriodDays, 1));
      break;

    case "NEXT_WEEKDAY": {
      const target = plan.preferredWeekday ?? 1; // default Monday
      result = nextDayOfWeek(disbursementDate, target);
      break;
    }

    case "END_OF_WEEK":
      result = endOfWeek(disbursementDate);
      break;

    case "END_OF_MONTH":
      result = endOfMonth(disbursementDate);
      break;

    case "CUSTOM_DATE_ALLOWED":
      if (customDate && customDate > disbursementDate) {
        result = new Date(customDate);
      } else {
        result = addDays(disbursementDate, 1);
      }
      break;

    default:
      result = addDays(disbursementDate, 1);
  }

  // Apply non-working-day shift if calendar mode is not ALL_DAYS
  if (plan.calendarMode !== "ALL_DAYS") {
    result = shiftIfNonWorking(result, plan, holidays);
  }

  return result;
}

// ============================================================
// Date advancement for subsequent installments
// ============================================================

/**
 * Advance a date by one repayment period, then shift if non-working day.
 */
export function advanceDate(
  current: Date,
  plan: PlanConfig,
  holidays?: Set<string>,
): Date {
  let next: Date;

  switch (plan.frequenceRemboursement) {
    case "DAILY":
      next = addDays(current, 1);
      break;

    case "WEEKLY":
      next = addDays(current, 7);
      break;

    case "BI_MONTHLY":
      // Standardized: if day < 15 -> go to 15th, else -> 1st of next month
      if (current.getDate() < 15) {
        next = new Date(current.getFullYear(), current.getMonth(), 15);
      } else {
        next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
      break;

    case "MONTHLY":
      next = addMonths(current, 1);
      break;

    case "QUARTERLY":
      next = addMonths(current, 3);
      break;

    default:
      next = addMonths(current, 1);
  }

  if (plan.calendarMode !== "ALL_DAYS") {
    next = shiftIfNonWorking(next, plan, holidays);
  }

  return next;
}

// ============================================================
// Number of installments calculation
// ============================================================

/**
 * Calculate the number of installments from duration + frequency.
 */
export function computeNumberOfInstallments(plan: PlanConfig): number {
  // Convert duration to days first
  let totalDays: number;
  switch (plan.dureeUnite) {
    case "DAY":
      totalDays = plan.dureeValeur;
      break;
    case "WEEK":
      totalDays = plan.dureeValeur * 7;
      break;
    case "MONTH":
      totalDays = plan.dureeValeur * 30; // approximate
      break;
    default:
      totalDays = plan.dureeValeur;
  }

  // Divide by frequency period
  switch (plan.frequenceRemboursement) {
    case "DAILY":
      return totalDays;
    case "WEEKLY":
      return Math.max(1, Math.round(totalDays / 7));
    case "BI_MONTHLY":
      return Math.max(1, Math.round(totalDays / 15));
    case "MONTHLY":
      // If duration is in months, use directly
      if (plan.dureeUnite === "MONTH") return plan.dureeValeur;
      return Math.max(1, Math.round(totalDays / 30));
    case "QUARTERLY":
      if (plan.dureeUnite === "MONTH") return Math.max(1, Math.round(plan.dureeValeur / 3));
      return Math.max(1, Math.round(totalDays / 90));
    default:
      return Math.max(1, totalDays);
  }
}

// ============================================================
// Date helpers (pure, no external deps)
// ============================================================

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const dayOfMonth = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28)
  if (d.getDate() < dayOfMonth) {
    d.setDate(0); // go to last day of previous month
  }
  return d;
}

function nextDayOfWeek(date: Date, targetDay: number): Date {
  const d = new Date(date);
  const current = d.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(date: Date): Date {
  // End of week = next Saturday
  return nextDayOfWeek(date, 6);
}

function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return d;
}
