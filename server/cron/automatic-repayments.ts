import cron from "node-cron";
import { processAutomaticCreditRepayments } from "../services/automatic-repayment-service";
import { processAutomaticTontineContributions } from "../services/automatic-tontine-service";

let automaticRepaymentsTask: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

export function startAutomaticRepaymentsCron() {
  if (automaticRepaymentsTask) {
    console.log("Automatic repayments cron already running");
    return;
  }

  // Run every hour at minute 15: '15 * * * *'
  // Or run daily? '0 6 * * *' (6 AM)
  // Let's stick to hourly to catch funds deposits quickly.
  console.log("Starting automatic repayments cron (0 * * * *)");
  
  automaticRepaymentsTask = cron.schedule("0 * * * *", async () => {
    if (isRunning) {
      console.log("Automatic repayments job already in progress, skipping");
      return;
    }

    isRunning = true;
    console.log("Running automatic repayments job...");

    try {
      // 1. Credit Repayments
      const creditResults = await processAutomaticCreditRepayments();
      if (creditResults.processed > 0) {
        console.log(`Automatic Credit Repayments: ${creditResults.success} success, ${creditResults.failed} failed`);
      }

      // 2. Tontine Contributions
      const tontineResults = await processAutomaticTontineContributions();
      if (tontineResults.processed > 0) {
         console.log(`Automatic Tontine Contributions: ${tontineResults.success} success, ${tontineResults.failed} failed`);
      }

    } catch (error) {
      console.error("Error in automatic repayments cron:", error);
    } finally {
      isRunning = false;
    }
  });
}

export function stopAutomaticRepaymentsCron() {
  if (automaticRepaymentsTask) {
    automaticRepaymentsTask.stop();
    automaticRepaymentsTask = null;
    console.log("Stopped automatic repayments cron");
  }
}
