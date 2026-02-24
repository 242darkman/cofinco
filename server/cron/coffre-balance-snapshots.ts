/**
 * Coffre Balance Snapshots Cron Job
 *
 * Captures daily end-of-day snapshots of all coffre-fort balances.
 * Runs every day at 23:55 to capture the day's closing balance.
 * Also runs on startup to ensure today's snapshot exists.
 */

import cron from "node-cron";
import { captureBalanceSnapshots, backfillSnapshots } from "../services/coffre/snapshot-service";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:CoffreBalanceSnapshots");

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

async function runSnapshotCapture(): Promise<void> {
  if (isRunning) {
    logger.info("Snapshot capture already in progress, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info("Starting daily coffre balance snapshot capture");
    const result = await captureBalanceSnapshots(undefined, "scheduled");
    const duration = Date.now() - startTime;
    logger.info(
      { coffreCount: result.coffreCount, agencyCount: result.agencyCount, durationMs: duration },
      "Daily coffre balance snapshot complete",
    );
  } catch (err) {
    logger.error({ err }, "Failed to capture daily coffre balance snapshots");
  } finally {
    isRunning = false;
  }
}

/**
 * Start the cron job.
 * Schedule: every day at 23:55 (capture end-of-day balances)
 * Also captures on startup for today.
 */
export function startCoffreBalanceSnapshotsCron(): void {
  // Daily at 23:55
  cronJob = cron.schedule("55 23 * * *", runSnapshotCapture, {
    scheduled: true,
    timezone: "Africa/Brazzaville",
  });

  logger.info("Coffre balance snapshots cron scheduled (daily 23:55 Africa/Brazzaville)");

  // Capture today's snapshot on startup (non-blocking)
  setTimeout(async () => {
    try {
      await runSnapshotCapture();
    } catch (err) {
      logger.error({ err }, "Startup snapshot capture failed");
    }
  }, 10_000); // 10s after startup to let DB connections settle
}

export function stopCoffreBalanceSnapshotsCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("Coffre balance snapshots cron stopped");
  }
}
