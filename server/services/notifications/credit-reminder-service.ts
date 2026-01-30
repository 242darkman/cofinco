import { db } from "../../db";
import { credits, clients, notificationSchedules } from "@shared/schema";
import { users } from "@shared/schema/auth";
import { eq, and } from "drizzle-orm";
import { StatutCredit, FrequenceRemboursement } from "@shared/enum/status-constants";
import {
  generateSchedule,
  generateRemindersForDueDate,
  CREDIT_REMINDER_OFFSETS,
  type FinancialFrequencyType,
} from "../schedule-generator";
import { createLogger } from "../../lib/logger";

const logger = createLogger('CreditReminder');

// ============================================================================
// CREDIT REMINDER SERVICE
// ============================================================================

/**
 * Generate and persist reminder schedules for a credit.
 * Called when a credit is activated (ACTIVE status) or schedule is recalculated.
 *
 * Idempotent: cancels previous version before inserting new one.
 */
export async function generateCreditReminderSchedule(creditId: string): Promise<number> {
  // 1. Load credit with client phone
  const [creditData] = await db
    .select({
      credit: credits,
      telephone: users.telephone,
      userId: users.id,
    })
    .from(credits)
    .innerJoin(clients, eq(credits.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(eq(credits.id, creditId));

  if (!creditData) {
    throw new Error(`Credit ${creditId} not found or has no linked user`);
  }

  const { credit, telephone, userId } = creditData;

  if (!telephone) {
    logger.warn({ creditId }, 'No phone for credit, skipping SMS schedules');
    return 0;
  }

  // Only generate for active credits
  if (credit.statut !== StatutCredit.ACTIVE && credit.statut !== StatutCredit.LATE) {
    return 0;
  }

  if (!credit.dateDebut) {
    logger.warn({ creditId }, 'Credit has no start date');
    return 0;
  }

  const frequency = (credit.echeance || FrequenceRemboursement.MONTHLY) as FinancialFrequencyType;
  const totalPeriods = credit.duree || 1;

  // 2. Generate schedule entries
  const schedule = generateSchedule({
    startDate: new Date(credit.dateDebut),
    frequency,
    totalPeriods,
    labelPrefix: "Échéance",
  });

  // 3. Compute next version (cancel old ones)
  const currentVersion = await getCurrentScheduleVersion(creditId);
  const newVersion = currentVersion + 1;

  // Cancel all PENDING entries for the old version
  await cancelPreviousSchedules(creditId, "Recalcul du calendrier de rappels");

  // 4. Generate reminder entries for each due date
  const remindersToInsert: Array<typeof notificationSchedules.$inferInsert> = [];

  for (const entry of schedule) {
    const reminders = generateRemindersForDueDate(entry.dueDate, CREDIT_REMINDER_OFFSETS);

    for (const r of reminders) {
      remindersToInsert.push({
        sourceType: "CREDIT",
        sourceId: creditId,
        channel: "SMS",
        templateCode: r.templateCode,
        recipient: telephone,
        scheduledAt: r.reminderDate,
        dueDate: entry.dueDate,
        installmentIndex: entry.index,
        dayOffset: CREDIT_REMINDER_OFFSETS.find((o) => o.templateCode === r.templateCode)?.dayOffset ?? 0,
        status: "PENDING",
        payload: {
          creditId,
          numeroCredit: credit.numeroCredit,
          montantEcheance: credit.montantEcheance,
          installmentLabel: entry.label,
        },
        scheduleVersion: newVersion,
        userId,
        agenceId: credit.agenceId,
      });
    }
  }

  // 5. Batch insert
  if (remindersToInsert.length > 0) {
    // Insert in batches of 100 to avoid query size limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < remindersToInsert.length; i += BATCH_SIZE) {
      const batch = remindersToInsert.slice(i, i + BATCH_SIZE);
      await db.insert(notificationSchedules).values(batch);
    }
  }

  logger.info({ count: remindersToInsert.length, numeroCredit: credit.numeroCredit, version: newVersion }, 'Generated credit reminders');

  return remindersToInsert.length;
}

/**
 * Cancel all PENDING reminder schedules for a credit.
 * Called on: credit closure, manual cancellation, schedule recalculation.
 */
export async function cancelCreditReminders(
  creditId: string,
  reason: string = "Crédit clôturé"
): Promise<void> {
  await cancelPreviousSchedules(creditId, reason);
  logger.info({ creditId, reason }, 'Cancelled all reminders for credit');
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function getCurrentScheduleVersion(sourceId: string): Promise<number> {
  const [result] = await db
    .select({ maxVersion: notificationSchedules.scheduleVersion })
    .from(notificationSchedules)
    .where(
      and(
        eq(notificationSchedules.sourceId, sourceId),
        eq(notificationSchedules.sourceType, "CREDIT")
      )
    )
    .orderBy(notificationSchedules.scheduleVersion)
    .limit(1);

  return result?.maxVersion ?? 0;
}

async function cancelPreviousSchedules(sourceId: string, reason: string): Promise<void> {
  await db
    .update(notificationSchedules)
    .set({
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationSchedules.sourceId, sourceId),
        eq(notificationSchedules.sourceType, "CREDIT"),
        eq(notificationSchedules.status, "PENDING")
      )
    );
}
