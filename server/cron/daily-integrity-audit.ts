/**
 * CRON JOB - Daily Integrity Audit
 *
 * Runs every day at 4 AM to detect accounting gaps:
 * - Mouvements without GL posting (MOUVEMENT_WITHOUT_GL)
 * - Balance mismatches (stored vs calculated)
 * - Orphan mouvements (without transactions)
 * - GL aggregate reconciliation (operational vs GL totals)
 *
 * Sends WebSocket alerts for critical findings and logs all results.
 */

import cron from "node-cron";
import { runReconciliation } from "../services/transaction-integrity-service";
import { runGlReconciliationCheck } from "./gl-reconciliation-monitor";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:DailyIntegrityAudit");

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

async function runDailyAudit(): Promise<void> {
  if (isRunning) {
    logger.warn("Previous daily audit still running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info("Starting daily integrity audit");

    // 1. Transaction integrity checks (includes MOUVEMENT_WITHOUT_GL)
    const integrityResult = await runReconciliation({
      checks: ["balance", "orphanMouvements", "mouvementsWithoutGl", "sessionBalance"],
    });

    // 2. GL aggregate reconciliation (operational vs GL totals)
    const glResult = await runGlReconciliationCheck();

    const durationMs = Date.now() - startTime;

    // 3. Alert on critical findings
    const criticalGlGaps = integrityResult.anomalies.filter(
      (a) => a.type === "MOUVEMENT_WITHOUT_GL"
    );

    if (criticalGlGaps.length > 0 || glResult.status === "CRITICAL") {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({
          type: "INTEGRITY_AUDIT_ALERT",
          payload: {
            timestamp: new Date().toISOString(),
            mouvementsWithoutGl: criticalGlGaps.length,
            glReconciliationStatus: glResult.status,
            totalDiscrepancy: glResult.totalDiscrepancy,
            totalAnomalies: integrityResult.totalAnomalies,
            criticalCount: integrityResult.criticalCount,
            durationMs,
          },
        });
      }

      logger.error(
        {
          mouvementsWithoutGl: criticalGlGaps.length,
          glStatus: glResult.status,
          totalDiscrepancy: glResult.totalDiscrepancy,
          durationMs,
        },
        "Daily audit: CRITICAL accounting gaps detected"
      );
    } else {
      logger.info(
        {
          totalAnomalies: integrityResult.totalAnomalies,
          criticalCount: integrityResult.criticalCount,
          glStatus: glResult.status,
          durationMs,
        },
        "Daily audit completed"
      );
    }
  } catch (error) {
    logger.error(
      { err: error, durationMs: Date.now() - startTime },
      "Daily integrity audit failed"
    );
  } finally {
    isRunning = false;
  }
}

export function startDailyIntegrityAuditCron(): void {
  if (cronJob) {
    logger.info("Daily integrity audit cron already running");
    return;
  }

  // Run daily at 4 AM
  cronJob = cron.schedule("0 4 * * *", async () => {
    await runDailyAudit();
  });

  logger.info("Daily integrity audit cron started (04:00 daily)");
}

export function stopDailyIntegrityAuditCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("Daily integrity audit cron stopped");
  }
}

export { runDailyAudit };
