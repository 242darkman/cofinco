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
  SendResult,
} from "./providers/provider.interface";
import { createLogger } from "../../lib/logger";
import { buildEmailAttachments } from "./notification-worker-email-attachments";

const logger = createLogger('NotifWorker');

// ============================================================================
// CONFIGURATION
// ============================================================================

const POLL_INTERVAL_MS = 2000; // Interroge la file toutes les 2 secondes
const BATCH_SIZE = 20; // Traite 20 tâches maximum par cycle
const LOCK_DURATION_MS = 60_000; // Verrouille une tâche pendant 60 secondes maximum
const BACKOFF_BASE_MS = 30_000; // Base de 30 secondes pour l'attente exponentielle
const MAX_ATTEMPTS = 5;

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;

// ============================================================================
// INSTANCES FOURNISSEURS INITIALISÉES À LA DEMANDE
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
// BOUCLE DU TRAITEMENT
// ============================================================================

/**
 * Traite les tâches de notification prêtes avec un verrou SQL concurrent-safe.
 *
 * Chaque tâche est verrouillée, rendue, envoyée puis marquée comme livrée ou replacée
 * dans la file avec attente exponentielle. Le `SKIP LOCKED` permet plusieurs
 * instances sans double traitement de la même tâche.
 *
 * @returns Le nombre de tâches envoyées avec succès pendant ce cycle.
 */
async function processNotificationJobs(): Promise<number> {
  try {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // Verrouille atomiquement un lot de tâches QUEUED prêtes à être traitées.
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

          // Enregistre l'accusé de livraison pour les fournisseurs compatibles.
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
      } catch (error: unknown) {
        // Erreur inattendue pendant le traitement de la tâche.
        const errorMessage = error instanceof Error ? error.message : "Unexpected error";
        await handleJobFailure(job, errorMessage);
      }
    }

    if (processedCount > 0) {
      logger.info({ processedCount, totalJobs: jobs.rows.length }, 'Processed notification jobs');
    }

    return processedCount;
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error in process loop');
    return 0;
  }
}

// ============================================================================
// TRAITEMENT DES TÂCHES
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
  } catch (err: unknown) {
    // Les erreurs de configuration sont permanentes : inutile de réessayer.
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not configured") || message.includes("settings incomplete")) {
      return { success: false, error: message, permanent: true };
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

  const attachments = await buildEmailAttachments(job.payload);
  const provider = getEmailProvider();
  return provider.send(job.recipient, subject, html, text,
    attachments.length > 0 ? { attachments } : undefined
  );
}

// ============================================================================
// MISES À JOUR DE STATUT
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
  // Les erreurs permanentes passent directement en FAILED, sans nouvelle tentative.
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

  // Attente exponentielle : 30 s, 60 s, 2 min, 4 min, 8 min.
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
      lastError: errorMsg.substring(0, 2000), // Tronque les erreurs longues.
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
// CYCLE DE VIE
// ============================================================================

/**
 * Démarre le processus de livraison des notifications.
 *
 * Le processus interroge périodiquement `notification_jobs` pour traiter les tâches
 * en attente.
 */
export function startNotificationWorker(): void {
  if (isRunning) {
    logger.info('Worker already running');
    return;
  }

  isRunning = true;
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Worker started');

  // Premier passage immédiat.
  processNotificationJobs();

  // Mise en place de l'interrogation périodique.
  pollInterval = setInterval(async () => {
    if (isRunning) {
      await processNotificationJobs();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Arrête proprement le processus de livraison des notifications.
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
 * Indique si le processus de notification est actif.
 */
export function isNotificationWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Compte les tâches de notification par statut pour la supervision.
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
 * Réessaie toutes les tâches DEAD_LETTER en les replaçant dans la file.
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
 * Réessaie une tâche DEAD_LETTER ou FAILED précise.
 *
 * @returns `true` si la tâche a été retrouvée et remise en file, sinon `false`.
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
