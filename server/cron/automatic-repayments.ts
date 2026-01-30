import cron from "node-cron";
import { processAutomaticCreditRepayments } from "../services/automatic-repayment-service";
import { processAutomaticTontineContributions } from "../services/automatic-tontine-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:AutoRepayments');

let automaticRepaymentsTask: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

export function startAutomaticRepaymentsCron() {
  if (automaticRepaymentsTask) {
    logger.info('Automatic repayments cron already running');
    return;
  }

  // Run every hour at minute 15: '15 * * * *'
  // Or run daily? '0 6 * * *' (6 AM)
  // Let's stick to hourly to catch funds deposits quickly.
  logger.info('Starting automatic repayments cron (0 * * * *)');

  automaticRepaymentsTask = cron.schedule("0 * * * *", async () => {
    if (isRunning) {
      logger.debug('Automatic repayments job already in progress, skipping');
      return;
    }

    isRunning = true;
    logger.info('Running automatic repayments job...');

    try {
      // 1. Credit Repayments
      const creditResults = await processAutomaticCreditRepayments();
      if (creditResults.processed > 0) {
        logger.info({ success: creditResults.success, failed: creditResults.failed }, 'Automatic Credit Repayments completed');
      }

      // 2. Tontine Contributions
      const tontineResults = await processAutomaticTontineContributions();
      if (tontineResults.processed > 0) {
         logger.info({ success: tontineResults.success, failed: tontineResults.failed }, 'Automatic Tontine Contributions completed');
      }

    } catch (error) {
      logger.error({ err: error }, 'Error in automatic repayments cron');
    } finally {
      isRunning = false;
    }
  });
}

export function stopAutomaticRepaymentsCron() {
  if (automaticRepaymentsTask) {
    automaticRepaymentsTask.stop();
    automaticRepaymentsTask = null;
    logger.info('Stopped automatic repayments cron');
  }
}
