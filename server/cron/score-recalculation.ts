/**
 * CRON JOB - Weekly Score Recalculation
 *
 * Recalculates scores for ALL clients with a score state.
 * Ensures tenure-based scores (loyalty) stay accurate over time.
 *
 * Frequency: Every Sunday at 3 AM
 */

import cron from "node-cron";
import { db } from "../db";
import { clientScoreState } from "@shared/schema";
import { recalculateClientScore } from "../services/scoring-engine";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:ScoreRecalculation");

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

async function runBatchRecalculation(): Promise<void> {
  if (isRunning) {
    logger.warn("Previous score recalculation still running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const allStates = await db
      .select({ clientId: clientScoreState.clientId })
      .from(clientScoreState);

    const total = allStates.length;
    if (total === 0) {
      logger.info("No clients with score state, nothing to recalculate");
      return;
    }

    let success = 0;
    let errors = 0;
    const batchSize = 20;

    for (let i = 0; i < total; i += batchSize) {
      const batch = allStates.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async ({ clientId }) => {
          try {
            await recalculateClientScore(clientId, { source: "cron" });
            success++;
          } catch (err) {
            errors++;
            logger.error({ err, clientId }, "Failed to recalculate score");
          }
        })
      );
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.info(
      { total, success, errors, durationSeconds: duration },
      `Score recalculation complete: ${success}/${total} OK, ${errors} errors in ${duration}s`
    );
  } catch (err) {
    logger.error({ err }, "Fatal error in score recalculation cron");
  } finally {
    isRunning = false;
  }
}

export function startScoreRecalculationCron(): void {
  // Every Sunday at 3 AM
  cronJob = cron.schedule("0 3 * * 0", () => {
    runBatchRecalculation();
  });
  logger.info("Score recalculation cron started (weekly, Sunday 3 AM)");
}

export function stopScoreRecalculationCron(): void {
  cronJob?.stop();
  cronJob = null;
}
