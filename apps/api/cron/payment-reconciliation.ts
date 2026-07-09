/**
 * Payment Reconciliation Cron Job
 * Réconcilie les paiements PENDING en interrogeant pawaPay
 *
 * Fonctionnalités:
 * - Polling pawaPay getStatus() pour les paiements sans webhook
 * - Retry avec backoff exponentiel sur erreurs temporaires
 * - Expiration automatique des paiements timeout
 * - DLQ recovery: replay des provider_events non traités
 * - Logs structurés pour monitoring
 */

import cron from "node-cron";
import { paymentService } from "../services/mobile-money/payment-service";
import { providerRegistry } from "../services/mobile-money/provider-registry";
import * as storage from "../storage/mobile-money";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:PaymentReconciliation');

// Configuration
const RECONCILIATION_INTERVAL = process.env.RECONCILIATION_INTERVAL_MINUTES || "10";
const PENDING_THRESHOLD_MINUTES = parseInt(process.env.PENDING_THRESHOLD_MINUTES || "10", 10);
const MAX_RETRY_ATTEMPTS = parseInt(process.env.RECONCILIATION_MAX_RETRIES || "3", 10);
const RETRY_DELAY_MS = parseInt(process.env.RECONCILIATION_RETRY_DELAY_MS || "1000", 10);

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

// ============================================
// STRUCTURED LOGGING
// ============================================

interface ReconciliationLogEntry {
  timestamp: string;
  jobId: string;
  phase: "start" | "processing" | "complete" | "error";
  durationMs?: number;
  stats?: ReconciliationStats;
  error?: string;
}

interface ReconciliationStats {
  total: number;
  success: number;
  failed: number;
  expired: number;
  stillPending: number;
  errors: number;
}

interface IntentProcessingLog {
  intentId: string;
  provider: string;
  externalRef: string;
  previousStatus: string;
  newStatus: string;
  attempt: number;
  durationMs: number;
  error?: string;
}

function logReconciliation(entry: ReconciliationLogEntry): void {
  if (entry.phase === "error") {
    logger.error({ ...entry }, 'Reconciliation error');
  } else {
    logger.info({ ...entry }, 'Reconciliation status');
  }
}

function logIntentProcessing(entry: IntentProcessingLog): void {
  logger.info({ ...entry }, 'Intent processed');
}

// ============================================
// RETRY LOGIC
// ============================================

/**
 * Exécute une fonction avec retry et backoff exponentiel
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  delayMs: number = RETRY_DELAY_MS
): Promise<{ result: T; attempts: number } | { error: Error; attempts: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error as Error;

      // Ne pas retry sur certaines erreurs
      if (isNonRetryableError(error)) {
        return { error: lastError, attempts: attempt };
      }

      if (attempt < maxAttempts) {
        // Backoff exponentiel avec jitter
        const jitter = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
        const delay = delayMs * Math.pow(2, attempt - 1) * jitter;
        await sleep(delay);
      }
    }
  }

  return { error: lastError!, attempts: maxAttempts };
}

/**
 * Vérifie si une erreur ne doit pas être réessayée
 */
function isNonRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("not found") ||
      message.includes("invalid") ||
      message.includes("unauthorized") ||
      message.includes("forbidden")
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Réconcilie les paiements PENDING via pawaPay getStatus()
 * pawaPay utilise externalRef (= depositId/payoutId) pour les lookups
 */
async function reconcilePendingPayments(): Promise<void> {
  if (isRunning) {
    logReconciliation({
      timestamp: new Date().toISOString(),
      jobId: "skipped",
      phase: "start",
      error: "Previous run still in progress",
    });
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  const jobId = `recon-${Date.now()}`;

  const stats: ReconciliationStats = {
    total: 0,
    success: 0,
    failed: 0,
    expired: 0,
    stillPending: 0,
    errors: 0,
  };

  logReconciliation({
    timestamp: new Date().toISOString(),
    jobId,
    phase: "start",
  });

  try {
    // 1. Récupérer les intents PENDING depuis plus de X minutes
    const pendingIntents = await storage.getPendingIntentsOlderThan(PENDING_THRESHOLD_MINUTES);

    if (pendingIntents.length === 0) {
      logReconciliation({
        timestamp: new Date().toISOString(),
        jobId,
        phase: "complete",
        durationMs: Date.now() - startTime,
        stats: { ...stats, total: 0 },
      });
      return;
    }

    stats.total = pendingIntents.length;

    logReconciliation({
      timestamp: new Date().toISOString(),
      jobId,
      phase: "processing",
      stats: { ...stats },
    });

    // 2. Obtenir le provider pawaPay
    const pawaPayProvider = providerRegistry.getPawaPay();

    // 3. Pour chaque intent, interroger pawaPay avec retry
    for (const intent of pendingIntents) {
      const intentStartTime = Date.now();

      try {
        // pawaPay utilise notre externalRef (= depositId/payoutId) pour les lookups
        const lookupRef = intent.externalRef;

        if (!lookupRef) {
          logIntentProcessing({
            intentId: intent.id,
            provider: intent.provider,
            externalRef: "",
            previousStatus: "PENDING",
            newStatus: "error",
            attempt: 0,
            durationMs: Date.now() - intentStartTime,
            error: "No externalRef for pawaPay lookup",
          });
          stats.errors++;
          continue;
        }

        // Interroger pawaPay avec retry
        const statusResult = await withRetry(
          () => pawaPayProvider.getStatus(lookupRef),
          MAX_RETRY_ATTEMPTS,
          RETRY_DELAY_MS
        );

        if ("error" in statusResult) {
          logIntentProcessing({
            intentId: intent.id,
            provider: intent.provider,
            externalRef: lookupRef,
            previousStatus: "PENDING",
            newStatus: "error",
            attempt: statusResult.attempts,
            durationMs: Date.now() - intentStartTime,
            error: statusResult.error.message,
          });
          stats.errors++;
          continue;
        }

        const statusResponse = statusResult.result;

        // Traiter selon le statut
        let newStatus: string = statusResponse.status;

        switch (statusResponse.status) {
          case "SUCCESS":
            await paymentService.handleReconciliationSuccess(intent, statusResponse);
            stats.success++;
            break;

          case "FAILED":
            await storage.updatePaymentIntent(intent.id, {
              status: "FAILED",
              errorCode: statusResponse.errorCode,
              errorMessage: statusResponse.errorMessage,
              confirmedAt: new Date(),
            });
            stats.failed++;
            break;

          case "EXPIRED":
            await storage.updatePaymentIntent(intent.id, {
              status: "EXPIRED",
              confirmedAt: new Date(),
            });
            stats.expired++;
            break;

          case "PENDING":
          default:
            // Vérifier si le timeout est dépassé
            if (intent.expireAt && new Date() > intent.expireAt) {
              await storage.updatePaymentIntent(intent.id, {
                status: "EXPIRED",
                errorMessage: "Payment timeout exceeded",
                confirmedAt: new Date(),
              });
              newStatus = "EXPIRED (timeout)";
              stats.expired++;
            } else {
              stats.stillPending++;
            }
            break;
        }

        logIntentProcessing({
          intentId: intent.id,
          provider: intent.provider,
          externalRef: lookupRef,
          previousStatus: "PENDING",
          newStatus,
          attempt: statusResult.attempts,
          durationMs: Date.now() - intentStartTime,
        });

        // Petit délai entre les appels pour éviter de surcharger pawaPay
        await sleep(200);
      } catch (error) {
        logIntentProcessing({
          intentId: intent.id,
          provider: intent.provider,
          externalRef: intent.externalRef || "",
          previousStatus: "PENDING",
          newStatus: "error",
          attempt: 1,
          durationMs: Date.now() - intentStartTime,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        stats.errors++;
      }
    }

    logReconciliation({
      timestamp: new Date().toISOString(),
      jobId,
      phase: "complete",
      durationMs: Date.now() - startTime,
      stats,
    });
  } catch (error) {
    logReconciliation({
      timestamp: new Date().toISOString(),
      jobId,
      phase: "error",
      durationMs: Date.now() - startTime,
      stats,
      error: error instanceof Error ? error.message : "Critical error",
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Expire les intents qui ont dépassé leur timeout
 */
async function expireTimedOutPayments(): Promise<void> {
  const startTime = Date.now();

  try {
    const expiredIntents = await storage.getExpiredIntents();

    if (expiredIntents.length === 0) {
      return;
    }

    logger.info({
      timestamp: new Date().toISOString(),
      count: expiredIntents.length,
      intentIds: expiredIntents.map(i => i.id),
    }, `Expiring ${expiredIntents.length} timed out payments`);

    for (const intent of expiredIntents) {
      await storage.updatePaymentIntent(intent.id, {
        status: "EXPIRED",
        errorMessage: "Payment timeout exceeded",
        confirmedAt: new Date(),
      });

      logIntentProcessing({
        intentId: intent.id,
        provider: intent.provider,
        externalRef: intent.externalRef || "",
        previousStatus: "PENDING",
        newStatus: "EXPIRED (timeout)",
        attempt: 0,
        durationMs: 0,
      });
    }

    logger.info({ count: expiredIntents.length, durationMs: Date.now() - startTime }, `Expired ${expiredIntents.length} payments`);
  } catch (error) {
    logger.error({
      err: error,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    }, 'Error expiring payments');
  }
}

/**
 * DLQ Recovery: Replay des provider_events non traités
 * Récupère les événements webhook qui n'ont pas été traités avec succès
 * et tente de les rejouer via le paymentService
 */
async function recoverUnprocessedEvents(): Promise<void> {
  const startTime = Date.now();

  try {
    const unprocessedEvents = await storage.getUnprocessedEvents();

    if (unprocessedEvents.length === 0) {
      return;
    }

    logger.info({ count: unprocessedEvents.length }, 'DLQ recovery: found unprocessed events');

    let recovered = 0;
    let failed = 0;

    for (const event of unprocessedEvents) {
      try {
        // Skip events older than 24h (likely orphans)
        const ageMs = Date.now() - (event.receivedAt?.getTime() || 0);
        if (ageMs > 24 * 60 * 60 * 1000) {
          await storage.markEventProcessed(event.id, undefined, "EXPIRED_DLQ");
          continue;
        }

        // Replay the webhook payload through the payment service
        await paymentService.handleWebhook(
          event.payload,
          JSON.stringify(event.payload), // Reconstruct raw body from stored payload
          event.signature || "",
          {} // Headers not available for DLQ replay
        );

        recovered++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await storage.markEventProcessed(event.id, undefined, `DLQ_RETRY_FAILED: ${errorMsg}`);
        logger.warn({ eventId: event.id, err: error }, 'DLQ recovery: event replay failed');
      }
    }

    logger.info({ recovered, failed, durationMs: Date.now() - startTime }, 'DLQ recovery complete');
  } catch (error) {
    logger.error({ err: error, durationMs: Date.now() - startTime }, 'DLQ recovery error');
  }
}

/**
 * Démarre le cron job de réconciliation
 */
export function startPaymentReconciliationCron(): void {
  if (cronJob) {
    logger.info('Cron already running');
    return;
  }

  // Exécuter toutes les X minutes
  const cronExpression = `*/${RECONCILIATION_INTERVAL} * * * *`;

  cronJob = cron.schedule(cronExpression, async () => {
    await reconcilePendingPayments();
    await expireTimedOutPayments();
    // DLQ recovery: toutes les heures seulement
    const currentMinute = new Date().getMinutes();
    if (currentMinute < parseInt(RECONCILIATION_INTERVAL, 10)) {
      await recoverUnprocessedEvents();
    }
  });

  logger.info({ interval: RECONCILIATION_INTERVAL }, `Cron job started (every ${RECONCILIATION_INTERVAL} minutes)`);
}

/**
 * Arrête le cron job
 */
export function stopPaymentReconciliationCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Cron job stopped');
  }
}

/**
 * Force une exécution immédiate de la réconciliation
 * Utile pour les tests ou les interventions manuelles
 */
export async function runReconciliationNow(): Promise<void> {
  logger.info('Manual run triggered');
  await reconcilePendingPayments();
  await expireTimedOutPayments();
}

export default {
  startPaymentReconciliationCron,
  stopPaymentReconciliationCron,
  runReconciliationNow,
};
