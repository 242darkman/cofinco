import { db } from "../../db";
import { notificationJobs, notificationDeliveryReceipts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  renderSmsTemplate,
  renderEmailTemplate,
} from "./templates/template-engine";
import { MtnSmsProvider } from "./providers/sms-mtn.provider";
import { SmtpEmailProvider } from "./providers/email.provider";
import type {
  SmsProvider,
  EmailProvider,
  SendResult,
} from "./providers/provider.interface";

// ============================================================================
// CONFIGURATION
// ============================================================================

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const BATCH_SIZE = 20; // Process 20 jobs per poll cycle
const LOCK_DURATION_MS = 60_000; // Lock a job for 60 seconds max
const BACKOFF_BASE_MS = 30_000; // 30s base for exponential backoff
const MAX_ATTEMPTS = 5;

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;

// ============================================================================
// PROVIDER INSTANCES (lazy-initialized singletons)
// ============================================================================

let mtnSms: MtnSmsProvider | null = null;
let smtpEmail: SmtpEmailProvider | null = null;

function getSmsProvider(): SmsProvider {
  if (!mtnSms) mtnSms = new MtnSmsProvider();
  return mtnSms;
}

function getEmailProvider(): EmailProvider {
  if (!smtpEmail) smtpEmail = new SmtpEmailProvider();
  return smtpEmail;
}

// ============================================================================
// WORKER LOOP
// ============================================================================

/**
 * Process pending notification jobs using SELECT FOR UPDATE SKIP LOCKED.
 * This ensures safe concurrent processing (even if multiple instances run).
 *
 * Flow per job:
 * 1. Lock and mark as PROCESSING
 * 2. Render template (SMS or Email)
 * 3. Send via provider
 * 4. On success: mark SENT + store delivery receipt
 * 5. On failure: increment attempts + exponential backoff OR move to DEAD_LETTER
 */
async function processNotificationJobs(): Promise<number> {
  try {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // Atomically lock a batch of QUEUED jobs that are ready for processing
    const jobs = await db.execute<{
      id: string;
      channel: string;
      template_code: string;
      recipient: string;
      payload: Record<string, unknown>;
      status: string;
      attempts: number;
      max_attempts: number;
      correlation_id: string;
      agence_id: string | null;
      user_id: string | null;
    }>(sql`
      UPDATE notification_jobs
      SET locked_at = ${now},
          locked_until = ${lockUntil},
          status = 'PROCESSING'
      WHERE id IN (
        SELECT id FROM notification_jobs
        WHERE status = 'QUEUED'
          AND next_attempt_at <= ${now}
          AND (locked_until IS NULL OR locked_until < ${now})
        ORDER BY next_attempt_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    if (!jobs.rows || jobs.rows.length === 0) {
      return 0;
    }

    let processedCount = 0;

    for (const job of jobs.rows) {
      try {
        let result: SendResult;

        if (job.channel === "SMS") {
          result = await processSmsJob(job);
        } else if (job.channel === "EMAIL") {
          result = await processEmailJob(job);
        } else {
          result = {
            success: false,
            error: `Unsupported channel: ${job.channel}`,
          };
        }

        if (result.success) {
          await markJobSent(job.id, result);

          // Store delivery receipt for providers that support it (MTN)
          if (result.requestId) {
            await db
              .insert(notificationDeliveryReceipts)
              .values({
                notificationJobId: job.id,
                requestId: result.requestId,
                senderAddress: "tel:+242COFIN",
                receiverAddress: job.recipient,
                status: "PENDING",
                rawResponse: result.rawResponse,
              })
              .onConflictDoNothing();
          }

          processedCount++;
        } else {
          await handleJobFailure(job, result.error || "Unknown error", result.rawResponse);
        }
      } catch (error: any) {
        // Unexpected error processing this job
        await handleJobFailure(job, error.message || "Unexpected error");
      }
    }

    if (processedCount > 0) {
      console.log(
        `[NotifWorker] Processed ${processedCount}/${jobs.rows.length} jobs`
      );
    }

    return processedCount;
  } catch (error: any) {
    console.error("[NotifWorker] Error in process loop:", error.message);
    return 0;
  }
}

// ============================================================================
// JOB PROCESSORS
// ============================================================================

async function processSmsJob(job: {
  template_code: string;
  recipient: string;
  payload: Record<string, unknown>;
  correlation_id: string;
}): Promise<SendResult> {
  const rendered = await renderSmsTemplate(
    job.template_code,
    job.payload
  );
  const provider = getSmsProvider();
  return provider.send(job.recipient, rendered, {
    correlationId: job.correlation_id,
  });
}

async function processEmailJob(job: {
  template_code: string;
  recipient: string;
  payload: Record<string, unknown>;
}): Promise<SendResult> {
  const { subject, html, text } = await renderEmailTemplate(
    job.template_code,
    job.payload
  );
  const provider = getEmailProvider();
  return provider.send(job.recipient, subject, html, text);
}

// ============================================================================
// STATUS UPDATES
// ============================================================================

async function markJobSent(jobId: string, result: SendResult): Promise<void> {
  await db
    .update(notificationJobs)
    .set({
      status: "SENT",
      processedAt: new Date(),
      providerResponse: result.rawResponse ?? { messageId: result.messageId },
      lockedAt: null,
      lockedUntil: null,
    })
    .where(eq(notificationJobs.id, jobId));
}

async function handleJobFailure(
  job: { id: string; attempts: number; max_attempts: number },
  errorMsg: string,
  rawResponse?: unknown
): Promise<void> {
  const newAttempts = (job.attempts || 0) + 1;
  const isDeadLetter = newAttempts >= (job.max_attempts || MAX_ATTEMPTS);

  // Exponential backoff: 30s, 60s, 2m, 4m, 8m
  const nextAttemptAt = isDeadLetter
    ? null
    : new Date(
        Date.now() + BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1)
      );

  await db
    .update(notificationJobs)
    .set({
      status: isDeadLetter ? "DEAD_LETTER" : "QUEUED",
      attempts: newAttempts,
      lastError: errorMsg.substring(0, 2000), // Truncate long errors
      nextAttemptAt,
      lockedAt: null,
      lockedUntil: null,
      providerResponse: rawResponse ?? undefined,
    })
    .where(eq(notificationJobs.id, job.id));

  if (isDeadLetter) {
    console.error(
      `[NotifWorker] Job ${job.id} moved to DEAD_LETTER after ${newAttempts} attempts: ${errorMsg.substring(0, 200)}`
    );
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Start the notification delivery worker.
 * Polls `notification_jobs` table every 2 seconds for QUEUED jobs.
 */
export function startNotificationWorker(): void {
  if (isRunning) {
    console.log("[NotifWorker] Already running");
    return;
  }

  isRunning = true;
  console.log("[NotifWorker] Worker started (poll interval: 2s)");

  // Initial run
  processNotificationJobs();

  // Set up polling
  pollInterval = setInterval(async () => {
    if (isRunning) {
      await processNotificationJobs();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the notification delivery worker gracefully.
 */
export function stopNotificationWorker(): void {
  if (!isRunning) return;

  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log("[NotifWorker] Worker stopped");
}

/**
 * Check if the worker is running.
 */
export function isNotificationWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Get counts of jobs by status (for monitoring).
 */
export async function getNotificationJobCounts(): Promise<
  Record<string, number>
> {
  const result = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*)::text as count
    FROM notification_jobs
    GROUP BY status
  `);

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }
  return counts;
}

/**
 * Retry all DEAD_LETTER jobs (reset attempts and status to QUEUED).
 */
export async function retryDeadLetterJobs(): Promise<number> {
  const result = await db
    .update(notificationJobs)
    .set({
      status: "QUEUED",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedUntil: null,
    })
    .where(eq(notificationJobs.status, "DEAD_LETTER"))
    .returning();

  return result.length;
}
