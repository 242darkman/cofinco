import {
  FinancialFrequency,
  type FinancialFrequencyType,
} from "@shared/enum/status-constants";

// Re-export the unified type for consumers
export type { FinancialFrequencyType };

export interface ScheduleEntry {
  /** 0-based index of this period */
  index: number;
  /** Due date for this installment/contribution */
  dueDate: Date;
  /** Human-readable label (e.g. "Échéance #3 - 15/02/2026") */
  label: string;
}

export interface GenerateScheduleParams {
  /** Start date of the credit/tontine */
  startDate: Date;
  /** Payment frequency */
  frequency: FinancialFrequencyType;
  /** Total number of periods to generate */
  totalPeriods: number;
  /** Label prefix (default: "Échéance") */
  labelPrefix?: string;
}

export interface ReminderOffset {
  /** Days before (negative) or after (positive) the due date */
  dayOffset: number;
  /** Template code for the notification */
  templateCode: string;
  /** Description for logs */
  label: string;
}

// ============================================================================
// CREDIT REMINDER OFFSETS (J-3, J, J+1, J+7, J+15, J+30)
// ============================================================================

export const CREDIT_REMINDER_OFFSETS: ReminderOffset[] = [
  { dayOffset: -3, templateCode: "CREDIT_REMINDER_J3", label: "Rappel J-3" },
  { dayOffset: 0, templateCode: "CREDIT_DUE_TODAY", label: "Échéance du jour" },
  { dayOffset: 1, templateCode: "CREDIT_OVERDUE_J1", label: "Retard J+1" },
  { dayOffset: 7, templateCode: "CREDIT_OVERDUE_J7", label: "Retard J+7" },
  { dayOffset: 15, templateCode: "CREDIT_OVERDUE_J15", label: "Retard J+15" },
  { dayOffset: 30, templateCode: "CREDIT_OVERDUE_J30", label: "Retard J+30" },
];

// ============================================================================
// TONTINE REMINDER OFFSETS (J-2, J, J+1)
// ============================================================================

export const TONTINE_REMINDER_OFFSETS: ReminderOffset[] = [
  { dayOffset: -2, templateCode: "TONTINE_REMINDER_J2", label: "Rappel J-2" },
  { dayOffset: 0, templateCode: "TONTINE_DUE_TODAY", label: "Cotisation du jour" },
  { dayOffset: 1, templateCode: "TONTINE_OVERDUE_J1", label: "Retard J+1" },
];

// ============================================================================
// INVESTIGATION REMINDER OFFSETS (J-3, J-1, J, J+1)
// ============================================================================

export const INVESTIGATION_REMINDER_OFFSETS: ReminderOffset[] = [
  { dayOffset: -3, templateCode: "INVESTIGATION_REMINDER_J3", label: "Rappel J-3" },
  { dayOffset: -1, templateCode: "INVESTIGATION_REMINDER_J1", label: "Rappel J-1" },
  { dayOffset: 0, templateCode: "INVESTIGATION_DUE_TODAY", label: "Échéance enquête" },
  { dayOffset: 1, templateCode: "INVESTIGATION_OVERDUE_J1", label: "Enquête en retard J+1" },
];

// ============================================================================
// CALENDAR-AWARE DATE ADVANCEMENT
// ============================================================================

/**
 * Advance a date by one period of the given frequency.
 * Calendar-aware: BI_MONTHLY uses 1st/15th pattern, MONTHLY uses setMonth, etc.
 *
 * @param date - The current date to advance FROM (not mutated)
 * @param frequency - The financial frequency
 * @returns A new Date advanced by one period
 */
export function advanceByFrequency(date: Date, frequency: FinancialFrequencyType): Date {
  const next = new Date(date);

  switch (frequency) {
    case FinancialFrequency.DAILY:
      next.setDate(next.getDate() + 1);
      break;

    case FinancialFrequency.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;

    case FinancialFrequency.BIWEEKLY:
      // Bihebdomadaire = toutes les 2 semaines = 14 jours
      next.setDate(next.getDate() + 14);
      break;

    case FinancialFrequency.BI_MONTHLY:
      // Bimensuel = 2x/mois: alternance 1er ↔ 15 du mois
      if (next.getDate() <= 15) {
        next.setDate(15);
      } else {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
      }
      break;

    case FinancialFrequency.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;

    case FinancialFrequency.QUARTERLY:
      next.setMonth(next.getMonth() + 3);
      break;

    default: {
      // Fallback mensuel
      next.setMonth(next.getMonth() + 1);
      break;
    }
  }

  return next;
}

/**
 * Compute approximate number of days per period for a given frequency.
 * Used for delay calculations where calendar precision is not required.
 */
export function getApproxDaysPerPeriod(frequency: FinancialFrequencyType): number {
  switch (frequency) {
    case FinancialFrequency.DAILY:
      return 1;
    case FinancialFrequency.WEEKLY:
      return 7;
    case FinancialFrequency.BIWEEKLY:
      return 14;
    case FinancialFrequency.BI_MONTHLY:
      return 15; // 2x/mois ≈ 15 jours
    case FinancialFrequency.MONTHLY:
      return 30;
    case FinancialFrequency.QUARTERLY:
      return 90;
    default:
      return 30;
  }
}

// ============================================================================
// SCHEDULE GENERATION
// ============================================================================

/**
 * Generate a full schedule of due dates for a credit or tontine.
 * Uses calendar-aware date advancement for BI_MONTHLY.
 *
 * @returns Array of ScheduleEntry sorted chronologically
 */
export function generateSchedule(params: GenerateScheduleParams): ScheduleEntry[] {
  const { startDate, frequency, totalPeriods, labelPrefix = "Échéance" } = params;
  const entries: ScheduleEntry[] = [];

  let currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < totalPeriods; i++) {
    // First installment = one period after start
    currentDate = advanceByFrequency(currentDate, frequency);

    entries.push({
      index: i,
      dueDate: new Date(currentDate),
      label: `${labelPrefix} #${i + 1} - ${formatDateFR(currentDate)}`,
    });
  }

  return entries;
}

/**
 * Generate reminder dates for a single due date based on offsets.
 *
 * @param dueDate - The installment/contribution due date
 * @param offsets - Array of reminder offsets to generate
 * @returns Array of { reminderDate, templateCode, label }
 */
export function generateRemindersForDueDate(
  dueDate: Date,
  offsets: ReminderOffset[]
): Array<{ reminderDate: Date; templateCode: string; label: string }> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return offsets
    .map((offset) => {
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() + offset.dayOffset);
      reminderDate.setHours(0, 0, 0, 0);
      return {
        reminderDate,
        templateCode: offset.templateCode,
        label: offset.label,
      };
    })
    .filter((r) => r.reminderDate >= now); // Only future reminders
}

/**
 * Generate all reminder entries for a full credit schedule.
 *
 * @returns Flat array of all reminders across all installments, sorted by date
 */
export function generateCreditReminders(params: GenerateScheduleParams): Array<{
  installmentIndex: number;
  dueDate: Date;
  reminderDate: Date;
  templateCode: string;
  label: string;
}> {
  const schedule = generateSchedule(params);
  const allReminders: Array<{
    installmentIndex: number;
    dueDate: Date;
    reminderDate: Date;
    templateCode: string;
    label: string;
  }> = [];

  for (const entry of schedule) {
    const reminders = generateRemindersForDueDate(entry.dueDate, CREDIT_REMINDER_OFFSETS);
    for (const r of reminders) {
      allReminders.push({
        installmentIndex: entry.index,
        dueDate: entry.dueDate,
        reminderDate: r.reminderDate,
        templateCode: r.templateCode,
        label: r.label,
      });
    }
  }

  return allReminders.sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime());
}

/**
 * Generate all reminder entries for a full tontine cycle.
 *
 * @returns Flat array of all reminders across all contributions, sorted by date
 */
export function generateTontineReminders(params: GenerateScheduleParams): Array<{
  contributionIndex: number;
  dueDate: Date;
  reminderDate: Date;
  templateCode: string;
  label: string;
}> {
  const schedule = generateSchedule({
    ...params,
    labelPrefix: params.labelPrefix || "Cotisation",
  });

  const allReminders: Array<{
    contributionIndex: number;
    dueDate: Date;
    reminderDate: Date;
    templateCode: string;
    label: string;
  }> = [];

  for (const entry of schedule) {
    const reminders = generateRemindersForDueDate(entry.dueDate, TONTINE_REMINDER_OFFSETS);
    for (const r of reminders) {
      allReminders.push({
        contributionIndex: entry.index,
        dueDate: entry.dueDate,
        reminderDate: r.reminderDate,
        templateCode: r.templateCode,
        label: r.label,
      });
    }
  }

  return allReminders.sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime());
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateFR(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
