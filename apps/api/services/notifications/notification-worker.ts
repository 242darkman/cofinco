import { db } from "../../db";
import { notificationJobs, notificationDeliveryReceipts } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import {
  renderSmsTemplate,
  renderEmailTemplate,
} from "./templates/template-engine";
import { MtnSmsProvider } from "./providers/sms-mtn.provider";
import { SmtpEmailProvider } from "./providers/email.provider";
import type {
  SmsProvider,
  EmailProvider,
  EmailAttachment,
  SendResult,
} from "./providers/provider.interface";
import { createLogger } from "../../lib/logger";
import { getLogoBuffer } from "../../lib/company-logo";
import { StorageService } from "../storage-service";

const logger = createLogger('NotifWorker');

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
                senderAddress: "tel:+242MicroFlex",
                receiverAddress: job.recipient,
                status: "PENDING",
                rawResponse: result.rawResponse,
              })
              .onConflictDoNothing();
          }

          processedCount++;
        } else {
          await handleJobFailure(job, result.error || "Unknown error", result.rawResponse, result.permanent);
        }
      } catch (error: any) {
        // Unexpected error processing this job
        await handleJobFailure(job, error.message || "Unexpected error");
      }
    }

    if (processedCount > 0) {
      logger.info({ processedCount, totalJobs: jobs.rows.length }, 'Processed notification jobs');
    }

    return processedCount;
  } catch (error: any) {
    logger.error({ err: error }, 'Error in process loop');
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
  try {
    const rendered = await renderSmsTemplate(
      job.template_code,
      job.payload
    );
    const provider = getSmsProvider();
    return provider.send(job.recipient, rendered, {
      correlationId: job.correlation_id,
    });
  } catch (err: any) {
    // "not configured" / "settings incomplete" → permanent, no point retrying
    if (err.message?.includes("not configured") || err.message?.includes("settings incomplete")) {
      return { success: false, error: err.message, permanent: true };
    }
    throw err;
  }
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

  // Build attachments list
  const attachments: EmailAttachment[] = [];

  // Always include company logo as inline CID (for <img src="cid:company-logo">)
  const logoBuffer = getLogoBuffer();
  if (logoBuffer) {
    attachments.push({
      filename: 'microflex-logo.png',
      content: logoBuffer,
      contentType: 'image/png',
      cid: 'company-logo',
    });
  }

  // Resolve storage-based file attachments from payload._attachments
  const payloadAttachments = job.payload._attachments;
  if (Array.isArray(payloadAttachments)) {
    for (const att of payloadAttachments as Array<{ storageKey: string; filename: string; contentType?: string }>) {
      try {
        const obj = await StorageService.getPrivateObject(att.storageKey);
        const bytes = await obj.Body!.transformToByteArray();
        attachments.push({
          filename: att.filename,
          content: Buffer.from(bytes),
          contentType: att.contentType || 'application/pdf',
        });
      } catch (err) {
        logger.warn({ err, storageKey: att.storageKey }, 'Failed to fetch attachment from storage');
      }
    }
  }

  const provider = getEmailProvider();
  return provider.send(job.recipient, subject, html, text,
    attachments.length > 0 ? { attachments } : undefined
  );
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
  rawResponse?: unknown,
  permanent?: boolean
): Promise<void> {
  // Permanent errors (provider not configured) → FAILED immediately, no retries
  if (permanent) {
    await db
      .update(notificationJobs)
      .set({
        status: "FAILED",
        attempts: (job.attempts || 0) + 1,
        lastError: errorMsg.substring(0, 2000),
        nextAttemptAt: null,
        lockedAt: null,
        lockedUntil: null,
        providerResponse: rawResponse ?? undefined,
      })
      .where(eq(notificationJobs.id, job.id));

    logger.warn({ jobId: job.id, error: errorMsg.substring(0, 200) }, 'Job failed permanently (provider not configured)');
    return;
  }

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
    logger.error({ jobId: job.id, attempts: newAttempts, error: errorMsg.substring(0, 200) }, 'Job moved to DEAD_LETTER');
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
    logger.info('Worker already running');
    return;
  }

  isRunning = true;
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Worker started');

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

  logger.info('Worker stopped');
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

/**
 * Retry a single DEAD_LETTER or FAILED job by ID.
 * Returns true if the job was found and re-queued, false otherwise.
 */
export async function retrySingleJob(jobId: string): Promise<boolean> {
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
    .where(
      and(
        eq(notificationJobs.id, jobId),
        or(
          eq(notificationJobs.status, "DEAD_LETTER"),
          eq(notificationJobs.status, "FAILED")
        )
      )
    )
    .returning();

  return result.length > 0;
}
