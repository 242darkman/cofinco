/**
 * Payment Reconciliation Cron Job
 * Réconcilie les paiements PENDING en interrogeant les providers
 *
 * Fonctionnalités:
 * - Polling des providers pour les paiements sans webhook
 * - Retry avec backoff exponentiel sur erreurs temporaires
 * - Expiration automatique des paiements timeout
 * - Logs structurés pour monitoring
 */

import cron from "node-cron";
import { paymentService } from "../services/mobile-money/payment-service";
import { providerRegistry } from "../services/mobile-money/provider-registry";
import * as storage from "../storage/mobile-money";

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
  providerRef: string;
  previousStatus: string;
  newStatus: string;
  attempt: number;
  durationMs: number;
  error?: string;
}

function logReconciliation(entry: ReconciliationLogEntry): void {
  const level = entry.phase === "error" ? "error" : "info";
  console[level](`[Payment Reconciliation]`, entry);
}

function logIntentProcessing(entry: IntentProcessingLog): void {
  console.log(`[Payment Reconciliation] Intent processed`, entry);
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
    // Erreurs qui ne peuvent pas être résolues par retry
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
 * Réconcilie les paiements PENDING
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

    // 2. Pour chaque intent, interroger le provider avec retry
    for (const intent of pendingIntents) {
      const intentStartTime = Date.now();

      try {
        const provider = providerRegistry.get(intent.provider);

        if (!provider) {
          logIntentProcessing({
            intentId: intent.id,
            provider: intent.provider,
            providerRef: intent.providerRef || "",
            previousStatus: "PENDING",
            newStatus: "error",
            attempt: 0,
            durationMs: Date.now() - intentStartTime,
            error: "Provider not found",
          });
          stats.errors++;
          continue;
        }

        if (!intent.providerRef) {
          logIntentProcessing({
            intentId: intent.id,
            provider: intent.provider,
            providerRef: "",
            previousStatus: "PENDING",
            newStatus: "error",
            attempt: 0,
            durationMs: Date.now() - intentStartTime,
            error: "No providerRef",
          });
          stats.errors++;
          continue;
        }

        // Interroger le provider avec retry
        const statusResult = await withRetry(
          () => provider.getStatus(intent.providerRef!),
          MAX_RETRY_ATTEMPTS,
          RETRY_DELAY_MS
        );

        if ("error" in statusResult) {
          logIntentProcessing({
            intentId: intent.id,
            provider: intent.provider,
            providerRef: intent.providerRef,
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
          providerRef: intent.providerRef,
          previousStatus: "PENDING",
          newStatus,
          attempt: statusResult.attempts,
          durationMs: Date.now() - intentStartTime,
        });

        // Petit délai entre les appels pour éviter de surcharger les providers
        await sleep(200);
      } catch (error) {
        logIntentProcessing({
          intentId: intent.id,
          provider: intent.provider,
          providerRef: intent.providerRef || "",
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

    console.log(`[Payment Reconciliation] Expiring ${expiredIntents.length} timed out payments`, {
      timestamp: new Date().toISOString(),
      count: expiredIntents.length,
      intentIds: expiredIntents.map(i => i.id),
    });

    for (const intent of expiredIntents) {
      await storage.updatePaymentIntent(intent.id, {
        status: "EXPIRED",
        errorMessage: "Payment timeout exceeded",
        confirmedAt: new Date(),
      });

      logIntentProcessing({
        intentId: intent.id,
        provider: intent.provider,
        providerRef: intent.providerRef || "",
        previousStatus: "PENDING",
        newStatus: "EXPIRED (timeout)",
        attempt: 0,
        durationMs: 0,
      });
    }

    console.log(`[Payment Reconciliation] Expired ${expiredIntents.length} payments in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("[Payment Reconciliation] Error expiring payments:", {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
  }
}

/**
 * Réconciliation avancée via l'API Transactions Summary d'Airtel
 * Compare les transactions du provider avec nos intents PENDING
 * Utile pour les webhooks manqués
 */
async function reconcileWithProviderSummary(): Promise<void> {
  const startTime = Date.now();

  try {
    // Récupérer le provider Airtel
    const airtelProvider = providerRegistry.get("AIRTEL");

    // Vérifier si le provider supporte getTransactionsSummary
    if (!airtelProvider || !("getTransactionsSummary" in airtelProvider)) {
      return; // Provider sans API summary, skip
    }

    // Calculer la période de réconciliation (dernières 24h)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    console.log(`[Payment Reconciliation] Fetching Airtel transactions summary...`);

    // Récupérer les transactions du provider
    const summary = await (airtelProvider as {
      getTransactionsSummary: (
        startDate: string,
        endDate: string
      ) => Promise<{
        transactions: Array<{
          id: string;
          transaction_id: string;
          airtel_money_id: string;
          status: string;
          amount: string;
          reference?: string;
        }>;
        totalCount: number;
      }>;
    }).getTransactionsSummary(formatDate(startDate), formatDate(endDate));

    if (!summary.transactions || summary.transactions.length === 0) {
      console.log("[Payment Reconciliation] No Airtel transactions in summary");
      return;
    }

    console.log(
      `[Payment Reconciliation] Found ${summary.transactions.length} Airtel transactions to check`
    );

    // Récupérer nos intents PENDING pour Airtel
    const pendingAirtelIntents = await storage.getPendingIntentsByProvider("AIRTEL");

    if (pendingAirtelIntents.length === 0) {
      return;
    }

    // Créer un index pour lookup rapide
    const pendingByRef = new Map(
      pendingAirtelIntents.map((intent) => [intent.providerRef, intent])
    );
    const pendingByExternalRef = new Map(
      pendingAirtelIntents.map((intent) => [intent.externalRef, intent])
    );

    let reconciled = 0;

    // Pour chaque transaction du provider
    for (const tx of summary.transactions) {
      // Chercher l'intent correspondant
      const intent =
        pendingByRef.get(tx.id) ||
        pendingByRef.get(tx.transaction_id) ||
        pendingByExternalRef.get(tx.reference || "");

      if (!intent) {
        continue; // Transaction non liée à nos intents
      }

      // Normaliser le statut
      const normalizedStatus = airtelProvider.normalizeStatus
        ? airtelProvider.normalizeStatus(tx.status)
        : tx.status.toUpperCase();

      if (normalizedStatus === "PENDING") {
        continue; // Toujours en attente côté provider
      }

      // Mettre à jour notre intent
      if (normalizedStatus === "SUCCESS") {
        await paymentService.handleReconciliationSuccess(intent, {
          providerTxnId: tx.airtel_money_id,
        });
        reconciled++;
      } else if (normalizedStatus === "FAILED" || normalizedStatus === "EXPIRED") {
        await storage.updatePaymentIntent(intent.id, {
          status: normalizedStatus,
          confirmedAt: new Date(),
          errorMessage: `Reconciled from provider summary (status: ${tx.status})`,
        });
        reconciled++;
      }
    }

    console.log(
      `[Payment Reconciliation] Summary reconciliation complete: ${reconciled} intents updated in ${Date.now() - startTime}ms`
    );
  } catch (error) {
    console.error("[Payment Reconciliation] Summary reconciliation error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
  }
}

/**
 * Démarre le cron job de réconciliation
 */
export function startPaymentReconciliationCron(): void {
  if (cronJob) {
    console.log("[Payment Reconciliation] Cron already running");
    return;
  }

  // Exécuter toutes les X minutes
  const cronExpression = `*/${RECONCILIATION_INTERVAL} * * * *`;

  cronJob = cron.schedule(cronExpression, async () => {
    await reconcilePendingPayments();
    await expireTimedOutPayments();
    // Réconciliation via API summary (Airtel) - toutes les heures seulement
    const currentMinute = new Date().getMinutes();
    if (currentMinute < parseInt(RECONCILIATION_INTERVAL, 10)) {
      await reconcileWithProviderSummary();
    }
  });

  console.log(`[Payment Reconciliation] Cron job started (every ${RECONCILIATION_INTERVAL} minutes)`);
}

/**
 * Arrête le cron job
 */
export function stopPaymentReconciliationCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[Payment Reconciliation] Cron job stopped");
  }
}

/**
 * Force une exécution immédiate de la réconciliation
 * Utile pour les tests ou les interventions manuelles
 */
export async function runReconciliationNow(): Promise<void> {
  console.log("[Payment Reconciliation] Manual run triggered");
  await reconcilePendingPayments();
  await expireTimedOutPayments();
}

export default {
  startPaymentReconciliationCron,
  stopPaymentReconciliationCron,
  runReconciliationNow,
};
