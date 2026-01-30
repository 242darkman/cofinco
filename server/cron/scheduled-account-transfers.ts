/**
 * Cron Job: Scheduled Account Transfers
 *
 * Execute les virements programmes de maniere robuste:
 * - 02h30 quotidien: execution principale
 * - Toutes les 5 min: nettoyage verrous orphelins
 *
 * Ce job est safe en multi-instances grace au SELECT FOR UPDATE SKIP LOCKED.
 */

import cron from "node-cron";
import {
  processScheduledTransfers,
  cleanupStaleProcessingLocks,
  getScheduledTransfersHealth,
} from "../services/scheduled-transfers-service";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:ScheduledAccountTransfers');

let mainCronJob: ReturnType<typeof cron.schedule> | null = null;
let cleanupCronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Demarre les cron jobs pour les virements programmes.
 * - Job principal: 02h30 quotidien
 * - Job nettoyage: toutes les 5 minutes
 */
export function startScheduledAccountTransfersCron() {
  // Job principal - Execution des virements
  mainCronJob = cron.schedule("30 2 * * *", async () => {
    logger.info('Demarrage du job d\'execution');

    try {
      const results = await processScheduledTransfers(new Date());

      const success = results.filter((r) => r.success && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      const failed = results.filter((r) => !r.success).length;

      logger.info({ success, skipped, failed }, `Termine: ${success} succes, ${skipped} ignores, ${failed} echecs`);

      // Log des echecs
      results
        .filter((r) => !r.success && !r.skipped)
        .forEach((r) => logger.error({ id: r.id, error: r.error }, `Echec ${r.id}`));

      // Broadcast WebSocket pour mise a jour UI
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "SCHEDULED_TRANSFERS_BATCH_COMPLETED",
          payload: {
            success,
            skipped,
            failed,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Erreur critique');
    }
  });

  // Job de nettoyage - Verrous orphelins (workers crashes)
  cleanupCronJob = cron.schedule("*/5 * * * *", async () => {
    try {
      const cleaned = await cleanupStaleProcessingLocks(10);
      if (cleaned > 0) {
        logger.info({ cleaned }, `${cleaned} verrous orphelins nettoyes`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Erreur nettoyage verrous');
    }
  });

  logger.info('Cron jobs demarres (02h30 + cleanup 5min)');
}

/**
 * Arrete les cron jobs.
 */
export function stopScheduledAccountTransfersCron() {
  if (mainCronJob) {
    mainCronJob.stop();
    mainCronJob = null;
  }
  if (cleanupCronJob) {
    cleanupCronJob.stop();
    cleanupCronJob = null;
  }
  logger.info('Cron jobs arretes');
}

/**
 * Execute manuellement le traitement des virements.
 * Utile pour tests et debugging.
 */
export async function runScheduledTransfersManually() {
  logger.info('Execution manuelle');
  const results = await processScheduledTransfers(new Date());

  const success = results.filter((r) => r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info({ success, skipped, failed }, `Execution manuelle terminee: ${success} succes, ${skipped} ignores, ${failed} echecs`);

  return results;
}

/**
 * Retourne les statistiques de sante du systeme.
 */
export async function getScheduledTransfersStatus() {
  return getScheduledTransfersHealth();
}
