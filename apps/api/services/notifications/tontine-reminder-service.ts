import { db } from "../../db";
import {
  tontines,
  membresTontine,
  clients,
  notificationSchedules,
} from "@shared/schema";
import { users } from "@shared/schema/auth";
import { eq, and } from "drizzle-orm";
import {
  generateSchedule,
  generateRemindersForDueDate,
  TONTINE_REMINDER_OFFSETS,
  type FinancialFrequencyType,
} from "../schedule-generator";
import { FrequenceTontine } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";

const logger = createLogger('TontineReminder');

// ============================================================================
// TONTINE REMINDER SERVICE
// ============================================================================

/**
 * Generate and persist reminder schedules for all active members of a tontine.
 * Called when a tontine is activated or its schedule is recalculated.
 *
 * Idempotent: cancels previous version before inserting new one.
 */
export async function generateTontineReminderSchedule(tontineId: string): Promise<number> {
  // 1. Load tontine
  const [tontine] = await db
    .select()
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontine) {
    throw new Error(`Tontine ${tontineId} not found`);
  }

  if (tontine.statut !== "ACTIVE") {
    return 0;
  }

  const frequency = (tontine.frequence || FrequenceTontine.MONTHLY) as FinancialFrequencyType;
  const totalPeriods = tontine.nombreMembres; // One cycle per member

  // 2. Load active members with phone numbers
  const members = await db
    .select({
      membreId: membresTontine.id,
      clientId: membresTontine.clientId,
      telephone: users.telephone,
      userId: users.id,
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(
      and(
        eq(membresTontine.tontineId, tontineId),
        eq(membresTontine.statut, "ACTIVE")
      )
    );

  if (members.length === 0) {
    logger.warn({ tontineId }, 'No active members for tontine');
    return 0;
  }

  // 3. Generate schedule dates
  const schedule = generateSchedule({
    startDate: new Date(tontine.dateDebut),
    frequency,
    totalPeriods,
    labelPrefix: "Cotisation",
  });

  // 4. Cancel previous schedules + increment version
  const currentVersion = await getCurrentScheduleVersion(tontineId);
  const newVersion = currentVersion + 1;

  await cancelPreviousSchedules(tontineId, "Recalcul du calendrier de rappels tontine");

  // 5. Generate reminders for each member × each contribution date
  const remindersToInsert: Array<typeof notificationSchedules.$inferInsert> = [];

  for (const member of members) {
    if (!member.telephone) continue;

    for (const entry of schedule) {
      const reminders = generateRemindersForDueDate(entry.dueDate, TONTINE_REMINDER_OFFSETS);

      for (const r of reminders) {
        remindersToInsert.push({
          sourceType: "TONTINE",
          sourceId: tontineId,
          channel: "SMS",
          templateCode: r.templateCode,
          recipient: member.telephone,
          scheduledAt: r.reminderDate,
          dueDate: entry.dueDate,
          installmentIndex: entry.index,
          dayOffset: TONTINE_REMINDER_OFFSETS.find((o) => o.templateCode === r.templateCode)?.dayOffset ?? 0,
          status: "PENDING",
          payload: {
            tontineId,
            tontineName: tontine.nom,
            montantCotisation: tontine.montantCotisation,
            contributionLabel: entry.label,
            membreId: member.membreId,
          },
          scheduleVersion: newVersion,
          userId: member.userId,
          agenceId: tontine.agenceId,
        });
      }
    }
  }

  // 6. Batch insert
  if (remindersToInsert.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < remindersToInsert.length; i += BATCH_SIZE) {
      const batch = remindersToInsert.slice(i, i + BATCH_SIZE);
      await db.insert(notificationSchedules).values(batch);
    }
  }

  logger.info({ count: remindersToInsert.length, tontineName: tontine.nom, memberCount: members.length, version: newVersion }, 'Generated tontine reminders');

  return remindersToInsert.length;
}

/**
 * Cancel all PENDING reminders for a member who left the tontine.
 */
export async function cancelMemberReminders(
  tontineId: string,
  userId: string,
  reason: string = "Membre retiré"
): Promise<void> {
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
        eq(notificationSchedules.sourceId, tontineId),
        eq(notificationSchedules.sourceType, "TONTINE"),
        eq(notificationSchedules.userId, userId),
        eq(notificationSchedules.status, "PENDING")
      )
    );

  logger.info({ userId, tontineId, reason }, 'Cancelled reminders for user in tontine');
}

/**
 * Cancel all PENDING reminders for a tontine (closure, dissolution).
 */
export async function cancelTontineReminders(
  tontineId: string,
  reason: string = "Tontine clôturée"
): Promise<void> {
  await cancelPreviousSchedules(tontineId, reason);
  logger.info({ tontineId, reason }, 'Cancelled all reminders for tontine');
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
        eq(notificationSchedules.sourceType, "TONTINE")
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
        eq(notificationSchedules.sourceType, "TONTINE"),
        eq(notificationSchedules.status, "PENDING")
      )
    );
}
