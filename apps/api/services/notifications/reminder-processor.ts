import { db } from "../../db";
import { notificationSchedules } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { enqueueNotification, sendInAppNotification } from "./notification-service";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../../lib/logger";

const logger = createLogger('ReminderProcessor');

// ============================================================================
// REMINDER PROCESSOR
// Polls notification_schedules for PENDING entries with scheduledAt <= now,
// enqueues them as notification jobs, and marks them as SENT.
// ============================================================================

const POLL_BATCH_SIZE = 50;

// Template → human-readable notification content
const INVESTIGATION_TEMPLATES: Record<string, { titre: string; message: (p: any) => string; priorite: "LOW" | "NORMAL" | "HIGH" | "URGENT" }> = {
  INVESTIGATION_REMINDER_J3: {
    titre: "Enquête — Échéance dans 3 jours",
    message: (p) => `L'enquête crédit${p.objetCredit ? ` (${p.objetCredit})` : ""} arrive à échéance dans 3 jours.`,
    priorite: "NORMAL",
  },
  INVESTIGATION_REMINDER_J1: {
    titre: "Enquête — Échéance demain",
    message: (p) => `L'enquête crédit${p.objetCredit ? ` (${p.objetCredit})` : ""} arrive à échéance demain.`,
    priorite: "HIGH",
  },
  INVESTIGATION_DUE_TODAY: {
    titre: "Enquête — Échéance aujourd'hui",
    message: (p) => `L'enquête crédit${p.objetCredit ? ` (${p.objetCredit})` : ""} arrive à échéance aujourd'hui.`,
    priorite: "URGENT",
  },
  INVESTIGATION_OVERDUE_J1: {
    titre: "Enquête en retard",
    message: (p) => `L'enquête crédit${p.objetCredit ? ` (${p.objetCredit})` : ""} a dépassé son échéance.`,
    priorite: "URGENT",
  },
};

/**
 * Process all due reminders. Called by a cron/interval scheduler.
 *
 * @returns Number of reminders processed
 */
export async function processDueReminders(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  errors: Array<{ scheduleId: string; error: unknown }>;
}> {
  const now = new Date();
  const results = { processed: 0, sent: 0, skipped: 0, errors: [] as Array<{ scheduleId: string; error: unknown }> };

  // Fetch PENDING schedules that are due
  const dueSchedules = await db
    .select()
    .from(notificationSchedules)
    .where(
      and(
        eq(notificationSchedules.status, "PENDING"),
        lte(notificationSchedules.scheduledAt, now)
      )
    )
    .limit(POLL_BATCH_SIZE);

  for (const schedule of dueSchedules) {
    results.processed++;

    try {
      if (schedule.channel === "IN_APP") {
        // IN_APP: send directly via sendInAppNotification (real-time WebSocket)
        const template = INVESTIGATION_TEMPLATES[schedule.templateCode];
        const payload = (schedule.payload as Record<string, unknown>) ?? {};

        await sendInAppNotification({
          userId: schedule.recipient, // recipient = agentId for IN_APP
          type: schedule.templateCode,
          titre: template?.titre || "Rappel enquête",
          message: template?.message(payload) || "Vous avez un rappel pour une enquête crédit.",
          lien: payload.enqueteId ? `/agent/enquetes` : undefined,
          priorite: template?.priorite || "NORMAL",
          referenceId: (payload.enqueteId as string) || schedule.sourceId,
          referenceType: "INVESTIGATION",
        });
      } else {
        // SMS/EMAIL: enqueue as notification job
        const correlationId = `sched-${schedule.id}-${uuidv4().slice(0, 8)}`;

        await enqueueNotification({
          channel: schedule.channel,
          templateCode: schedule.templateCode,
          recipient: schedule.recipient,
          payload: (schedule.payload as Record<string, unknown>) ?? {},
          userId: schedule.userId ?? undefined,
          agenceId: schedule.agenceId ?? undefined,
          correlationId,
        });
      }

      // Mark as SENT
      await db
        .update(notificationSchedules)
        .set({
          status: "SENT",
          updatedAt: new Date(),
        })
        .where(eq(notificationSchedules.id, schedule.id));

      results.sent++;
    } catch (error: unknown) {
      logger.error({ scheduleId: schedule.id, err: error }, 'Error processing schedule');

      // Mark as SKIPPED to avoid re-processing broken entries indefinitely
      await db
        .update(notificationSchedules)
        .set({
          status: "SKIPPED",
          cancelReason: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(notificationSchedules.id, schedule.id));

      results.skipped++;
      results.errors.push({ scheduleId: schedule.id, error });
    }
  }

  if (results.processed > 0) {
    logger.info({ processed: results.processed, sent: results.sent, skipped: results.skipped }, 'Processed reminders');
  }

  return results;
}

/**
 * Start the reminder processor on an interval.
 * Should be called once at server startup.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 60s)
 * @returns Cleanup function to stop the processor
 */
export function startReminderProcessor(intervalMs: number = 60_000): () => void {
  logger.info({ intervalMs }, 'Reminder processor started');

  const timer = setInterval(async () => {
    try {
      await processDueReminders();
    } catch (error: unknown) {
      logger.error({ err: error }, 'Unhandled error in poll cycle');
    }
  }, intervalMs);

  return () => {
    clearInterval(timer);
    logger.info('Reminder processor stopped');
  };
}
