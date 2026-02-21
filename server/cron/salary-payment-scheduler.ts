/**
 * Salary Payment Scheduler
 * Cron job pour le traitement des paiements salaires :
 * 1. Active les jobs SCHEDULED arrivés à échéance → QUEUED
 * 2. Traite les jobs QUEUED (CASH → caisse, MOBILE_MONEY → payout, TRANSFER/CHECK → attente)
 * 3. Récupère les jobs FAILED éligibles au retry → QUEUED
 */

import cron from "node-cron";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:SalaryPaymentScheduler");

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

/**
 * Démarre le cron job de traitement des paiements salaires.
 * Exécution toutes les minutes.
 */
export function startSalaryPaymentSchedulerCron(): void {
  cronJob = cron.schedule("* * * * *", async () => {
    if (isRunning) {
      logger.debug("Salary payment scheduler déjà en cours, skip");
      return;
    }

    isRunning = true;
    try {
      await runSalaryPaymentScheduler();
    } catch (error) {
      logger.error({ err: error }, "Erreur salary payment scheduler");
    } finally {
      isRunning = false;
    }
  });

  logger.info("Salary payment scheduler cron démarré (toutes les minutes)");
}

export function stopSalaryPaymentSchedulerCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("Salary payment scheduler cron arrêté");
  }
}

/**
 * Exécution manuelle (pour tests ou déclenchement admin).
 */
export async function runSalaryPaymentSchedulerNow(): Promise<{
  scheduled: number;
  queued: number;
  retried: number;
  errors: number;
}> {
  return runSalaryPaymentScheduler();
}

async function runSalaryPaymentScheduler(): Promise<{
  scheduled: number;
  queued: number;
  retried: number;
  errors: number;
}> {
  const {
    activateScheduledJobs,
    getQueuedJobs,
    getRetryableJobs,
    processQueuedJob,
  } = await import("../services/salary-payment-service");

  const stats = { scheduled: 0, queued: 0, retried: 0, errors: 0 };

  // 1. Activer les jobs SCHEDULED arrivés à échéance
  try {
    stats.scheduled = await activateScheduledJobs();
  } catch (error) {
    logger.error({ err: error }, "Erreur activation jobs SCHEDULED");
    stats.errors++;
  }

  // 2. Récupérer et requeue les jobs FAILED éligibles au retry
  try {
    const retryable = await getRetryableJobs();
    for (const job of retryable) {
      try {
        const { db } = await import("../db");
        const { salaryPaymentJobs, SalaryPaymentJobStatus } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        await db.update(salaryPaymentJobs).set({
          status: SalaryPaymentJobStatus.QUEUED,
          nextRetryAt: null,
          updatedAt: new Date(),
        }).where(eq(salaryPaymentJobs.id, job.id));

        stats.retried++;
      } catch (error) {
        logger.error({ jobId: job.id, err: error }, "Erreur requeue retry job");
        stats.errors++;
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Erreur récupération jobs retryable");
    stats.errors++;
  }

  // 3. Traiter les jobs QUEUED
  try {
    const queuedJobs = await getQueuedJobs();
    for (const job of queuedJobs) {
      try {
        await processQueuedJob(job);
        stats.queued++;
      } catch (error) {
        logger.error({ jobId: job.id, err: error }, "Erreur traitement job QUEUED");
        stats.errors++;
      }

      // Délai entre les traitements pour éviter de surcharger les APIs
      await sleep(200);
    }
  } catch (error) {
    logger.error({ err: error }, "Erreur récupération jobs QUEUED");
    stats.errors++;
  }

  if (stats.scheduled > 0 || stats.queued > 0 || stats.retried > 0) {
    logger.info(stats, "Salary payment scheduler terminé");
  }

  return stats;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
