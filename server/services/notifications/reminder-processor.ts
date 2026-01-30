import { db } from "../../db";
import { notificationSchedules } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { enqueueNotification } from "./notification-service";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../../lib/logger";

const logger = createLogger('ReminderProcessor');

// ============================================================================
// REMINDER PROCESSOR
// Polls notification_schedules for PENDING entries with scheduledAt <= now,
// enqueues them as notification jobs, and marks them as SENT.
// ============================================================================

const POLL_BATCH_SIZE = 50;

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
      // Enqueue the notification job
      const correlationId = `sched-${schedule.id}-${uuidv4().slice(0, 8)}`;

      const jobCorrelationId = await enqueueNotification({
        channel: schedule.channel,
        templateCode: schedule.templateCode,
        recipient: schedule.recipient,
        payload: (schedule.payload as Record<string, unknown>) ?? {},
        userId: schedule.userId ?? undefined,
        agenceId: schedule.agenceId ?? undefined,
        correlationId,
      });

      // Mark as SENT and link to the notification job
      await db
        .update(notificationSchedules)
        .set({
          status: "SENT",
          notificationJobId: undefined, // correlationId links them
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
