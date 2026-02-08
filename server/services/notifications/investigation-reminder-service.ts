import { db } from "../../db";
import { notificationSchedules } from "@shared/schema";
import { enquetesCredit } from "@shared/schema/finance";
import { users } from "@shared/schema/auth";
import { eq, and } from "drizzle-orm";
import {
  generateRemindersForDueDate,
  INVESTIGATION_REMINDER_OFFSETS,
} from "../schedule-generator";
import { createLogger } from "../../lib/logger";

const logger = createLogger("InvestigationReminder");

// ============================================================================
// INVESTIGATION REMINDER SERVICE
// ============================================================================

/**
 * Generate and persist reminder schedules for an enquête deadline.
 * Called when an investigation is assigned to an agent with a dueDate.
 *
 * Reminders: J-3, J-1, J (day of), J+1 (overdue)
 * Channel: IN_APP (push to agent via WebSocket)
 *
 * Idempotent: cancels previous schedules before inserting new ones.
 */
export async function generateInvestigationReminderSchedule(
  enqueteId: string
): Promise<number> {
  // 1. Load enquête with agent info
  const [enqueteData] = await db
    .select({
      enquete: enquetesCredit,
      agentNom: users.nom,
      agentPrenom: users.prenom,
    })
    .from(enquetesCredit)
    .leftJoin(users, eq(enquetesCredit.assignedAgentId, users.id))
    .where(eq(enquetesCredit.id, enqueteId));

  if (!enqueteData) {
    throw new Error(`Investigation ${enqueteId} not found`);
  }

  const { enquete } = enqueteData;

  if (!enquete.dueDate) {
    logger.info({ enqueteId }, "No due date set, skipping reminders");
    return 0;
  }

  if (!enquete.assignedAgentId) {
    logger.warn({ enqueteId }, "No assigned agent, skipping reminders");
    return 0;
  }

  // Only generate for active investigations (ASSIGNED or IN_PROGRESS)
  const activeStatuses = ["ASSIGNED", "IN_PROGRESS"];
  if (enquete.statut && !activeStatuses.includes(enquete.statut)) {
    logger.info(
      { enqueteId, statut: enquete.statut },
      "Investigation not active, skipping reminders"
    );
    return 0;
  }

  // 2. Cancel any existing reminders for this investigation
  await cancelInvestigationReminders(enqueteId, "Recalcul des rappels");

  // 3. Compute next version
  const currentVersion = await getCurrentScheduleVersion(enqueteId);
  const newVersion = currentVersion + 1;

  // 4. Generate reminder entries for the due date
  const dueDate = new Date(enquete.dueDate);
  const reminders = generateRemindersForDueDate(
    dueDate,
    INVESTIGATION_REMINDER_OFFSETS
  );

  const remindersToInsert: Array<typeof notificationSchedules.$inferInsert> =
    [];

  for (const r of reminders) {
    remindersToInsert.push({
      sourceType: "INVESTIGATION",
      sourceId: enqueteId,
      channel: "IN_APP",
      templateCode: r.templateCode,
      recipient: enquete.assignedAgentId, // userId of the agent
      scheduledAt: r.reminderDate,
      dueDate,
      installmentIndex: 0,
      dayOffset:
        INVESTIGATION_REMINDER_OFFSETS.find(
          (o) => o.templateCode === r.templateCode
        )?.dayOffset ?? 0,
      status: "PENDING",
      payload: {
        enqueteId,
        demandeId: enquete.demandeId,
        clientId: enquete.clientId,
        objetCredit: enquete.objetCredit,
        montantDemande: enquete.montantDemande,
        priority: enquete.priority,
        agentId: enquete.assignedAgentId,
      },
      scheduleVersion: newVersion,
      userId: enquete.assignedAgentId,
      agenceId: undefined,
    });
  }

  // 5. Insert
  if (remindersToInsert.length > 0) {
    await db.insert(notificationSchedules).values(remindersToInsert);
  }

  logger.info(
    { count: remindersToInsert.length, enqueteId, version: newVersion },
    "Generated investigation reminders"
  );

  return remindersToInsert.length;
}

/**
 * Cancel all PENDING reminder schedules for an investigation.
 * Called on: investigation completed, cancelled, or schedule recalculation.
 */
export async function cancelInvestigationReminders(
  enqueteId: string,
  reason: string = "Enquête terminée"
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
        eq(notificationSchedules.sourceId, enqueteId),
        eq(notificationSchedules.sourceType, "INVESTIGATION"),
        eq(notificationSchedules.status, "PENDING")
      )
    );
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function getCurrentScheduleVersion(
  sourceId: string
): Promise<number> {
  const [result] = await db
    .select({ maxVersion: notificationSchedules.scheduleVersion })
    .from(notificationSchedules)
    .where(
      and(
        eq(notificationSchedules.sourceId, sourceId),
        eq(notificationSchedules.sourceType, "INVESTIGATION")
      )
    )
    .orderBy(notificationSchedules.scheduleVersion)
    .limit(1);

  return result?.maxVersion ?? 0;
}
