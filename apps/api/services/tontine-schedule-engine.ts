/**
 * Tontine Schedule Engine
 *
 * Generates contribution and payout schedules for tontine groups,
 * reusing calendar utilities from the credit-plan module.
 */

import {
  isWorkingDay,
  shiftIfNonWorking,
  computeFirstDueDate,
  advanceDate,
  addDays,
  addMonths,
  formatDateKey,
  validateHolidays,
} from "./credit-plan/calendar-utils";
import type { PlanConfig } from "./credit-plan/types";

// ============================================================================
// Types
// ============================================================================

export interface TontineCalendarConfig {
  firstContributionRule: string;
  gracePeriodContribution: number;
  collectionCalendarMode: string;
  weekdaysMask: number;
  shiftNonWorkingDay: string;
  timezone: string;
  frequence: string; // DAILY, WEEKLY, BIWEEKLY, MONTHLY, BIMONTHLY, QUARTERLY
  intervalleCotisation: number;
  preferredWeekday?: number | null;
  distributionType: string;
  payoutFrequency: string; // SAME_AS_CONTRIBUTION, CUSTOM
  payoutDayRule?: string | null;
  nombreMembres: number;
}

export interface ScheduleEntry {
  periodNumber: number;
  dueDate: string; // YYYY-MM-DD
}

export interface TontineSchedulePreview {
  contributions: ScheduleEntry[];
  payouts: ScheduleEntry[];
  cycleEndDate: string;
  totalPeriods: number;
  totalRounds: number;
}

// ============================================================================
// Internal: Map tontine config to credit-plan PlanConfig for calendar-utils
// ============================================================================

function mapFirstContributionRule(rule: string): PlanConfig["firstDueRule"] {
  switch (rule) {
    case "ON_START_DATE":
      // No direct equivalent — handled specially below
      return "NEXT_DAY";
    case "AFTER_N_DAYS":
      return "AFTER_N_DAYS";
    case "NEXT_WEEKDAY":
      return "NEXT_WEEKDAY";
    case "END_OF_WEEK":
      return "END_OF_WEEK";
    case "END_OF_MONTH":
      return "END_OF_MONTH";
    case "CUSTOM_DATE_ALLOWED":
      return "CUSTOM_DATE_ALLOWED";
    default:
      return "NEXT_DAY";
  }
}

function mapFrequency(freq: string): PlanConfig["frequenceRemboursement"] {
  switch (freq) {
    case "DAILY":
      return "DAILY";
    case "WEEKLY":
      return "WEEKLY";
    case "BIWEEKLY":
      // calendar-utils doesn't have BIWEEKLY — we handle it manually
      return "WEEKLY";
    case "MONTHLY":
      return "MONTHLY";
    case "BIMONTHLY":
      // calendar-utils doesn't have BIMONTHLY — we handle manually
      return "MONTHLY";
    case "QUARTERLY":
      return "QUARTERLY";
    default:
      return "MONTHLY";
  }
}

/**
 * Build a partial PlanConfig for calendar-utils functions.
 */
function toPlanConfig(config: TontineCalendarConfig): PlanConfig {
  return {
    dureeValeur: 0, // Not used for tontines
    dureeUnite: "MONTH",
    frequenceRemboursement: mapFrequency(config.frequence),
    tauxInteret: "0",
    interestMethod: "FLAT",
    interestRatePeriod: "MONTHLY",
    dayCountConvention: "30_360",
    interestRoundingMode: "ROUND",
    interestRoundingUnit: 1,
    amortizationType: "EQUAL_INSTALLMENTS",
    firstDueRule: mapFirstContributionRule(config.firstContributionRule),
    gracePeriodDays: config.gracePeriodContribution,
    preferredWeekday: config.preferredWeekday ?? null,
    calendarMode: config.collectionCalendarMode as PlanConfig["calendarMode"],
    weekdaysMask: config.weekdaysMask,
    shiftNonWorkingDay: config.shiftNonWorkingDay as PlanConfig["shiftNonWorkingDay"],
    allowManualFirstDueDate: config.firstContributionRule === "CUSTOM_DATE_ALLOWED",
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute the first contribution date from the start date + calendar config.
 */
export function computeFirstContributionDate(
  startDate: Date,
  config: TontineCalendarConfig,
  holidays?: Set<string>,
  customDate?: Date,
): Date {
  // Special case: ON_START_DATE means contribution is due on the start date itself
  if (config.firstContributionRule === "ON_START_DATE") {
    const planConfig = toPlanConfig(config);
    if (planConfig.calendarMode !== "ALL_DAYS") {
      return shiftIfNonWorking(startDate, planConfig, holidays);
    }
    return new Date(startDate);
  }

  const planConfig = toPlanConfig(config);
  return computeFirstDueDate(startDate, planConfig, holidays, customDate);
}

/**
 * Advance a date by one contribution period, respecting calendar rules.
 * Handles BIWEEKLY and BIMONTHLY which are not natively in calendar-utils.
 */
export function advanceTontineDate(
  current: Date,
  config: TontineCalendarConfig,
  holidays?: Set<string>,
): Date {
  const planConfig = toPlanConfig(config);
  const multiplier = config.intervalleCotisation || 1;

  let next: Date;

  // Handle frequencies not directly supported by calendar-utils
  if (config.frequence === "BIWEEKLY") {
    next = addDays(current, 14 * multiplier);
  } else if (config.frequence === "BIMONTHLY") {
    next = addMonths(current, 2 * multiplier);
  } else if (multiplier > 1) {
    // Apply multiplier: advance N times
    next = new Date(current);
    for (let i = 0; i < multiplier; i++) {
      next = advanceDate(next, planConfig, holidays);
    }
    return next; // advanceDate already handles shift
  } else {
    return advanceDate(current, planConfig, holidays);
  }

  // Apply working day shift for non-standard frequencies
  if (planConfig.calendarMode !== "ALL_DAYS") {
    next = shiftIfNonWorking(next, planConfig, holidays);
  }

  return next;
}

/**
 * Determine how many contribution periods a cycle should have.
 */
function computeTotalPeriods(config: TontineCalendarConfig): number {
  switch (config.distributionType) {
    case "ROTATIVE_SUSU":
      // One period per member (each member receives once)
      return config.nombreMembres;
    case "ACCUMULATIVE_END":
      // Fixed number of periods, payout at the end
      return config.nombreMembres;
    case "MIXED":
      // Rotation + final pot — same as rotative
      return config.nombreMembres;
    default:
      return config.nombreMembres;
  }
}

/**
 * Generate a full schedule preview for a tontine cycle.
 *
 * Returns arrays of contribution dates and payout dates.
 */
export function generateTontineSchedulePreview(
  startDate: Date,
  config: TontineCalendarConfig,
  holidays?: Set<string>,
  customFirstDate?: Date,
): TontineSchedulePreview {
  if (holidays) {
    validateHolidays(holidays);
  }

  const totalPeriods = computeTotalPeriods(config);
  const contributions: ScheduleEntry[] = [];
  const payouts: ScheduleEntry[] = [];

  // Generate contribution dates
  let currentDate = computeFirstContributionDate(startDate, config, holidays, customFirstDate);

  for (let i = 1; i <= totalPeriods; i++) {
    contributions.push({
      periodNumber: i,
      dueDate: formatDateKey(currentDate),
    });

    if (i < totalPeriods) {
      currentDate = advanceTontineDate(currentDate, config, holidays);
    }
  }

  const cycleEndDate = formatDateKey(currentDate);

  // Generate payout dates
  switch (config.distributionType) {
    case "ROTATIVE_SUSU": {
      // One payout per period (same dates as contributions for SAME_AS_CONTRIBUTION)
      if (config.payoutFrequency === "SAME_AS_CONTRIBUTION") {
        for (let i = 0; i < totalPeriods; i++) {
          payouts.push({
            periodNumber: i + 1,
            dueDate: contributions[i].dueDate,
          });
        }
      } else {
        // Custom payout frequency — generate separate dates
        let payoutDate = computeFirstContributionDate(startDate, config, holidays, customFirstDate);
        for (let i = 1; i <= totalPeriods; i++) {
          payouts.push({
            periodNumber: i,
            dueDate: formatDateKey(payoutDate),
          });
          if (i < totalPeriods) {
            payoutDate = advanceTontineDate(payoutDate, config, holidays);
          }
        }
      }
      break;
    }

    case "ACCUMULATIVE_END": {
      // Single payout at the end of the cycle
      payouts.push({
        periodNumber: totalPeriods,
        dueDate: cycleEndDate,
      });
      break;
    }

    case "MIXED": {
      // Rotation payouts for all but the last period, final period is accumulative
      for (let i = 0; i < totalPeriods - 1; i++) {
        payouts.push({
          periodNumber: i + 1,
          dueDate: contributions[i].dueDate,
        });
      }
      // Final accumulative payout
      payouts.push({
        periodNumber: totalPeriods,
        dueDate: cycleEndDate,
      });
      break;
    }

    default: {
      // Default: same as ROTATIVE_SUSU
      for (let i = 0; i < totalPeriods; i++) {
        payouts.push({
          periodNumber: i + 1,
          dueDate: contributions[i].dueDate,
        });
      }
    }
  }

  return {
    contributions,
    payouts,
    cycleEndDate,
    totalPeriods,
    totalRounds: payouts.length,
  };
}
