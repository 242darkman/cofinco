import cron from "node-cron";
import { applyLatePenalties } from "../services/tontine-production-service";
import { db } from "../db";
import { tontines, TontineStatus } from "@shared/schema/tontines";
import { eq, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:TontineAutoPenalties");

let task: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

export function startTontineAutoPenaltiesCron() {
  if (task) {
    logger.info("Tontine auto-penalties cron already running");
    return;
  }

  // Run daily at 6 AM
  logger.info("Starting tontine auto-penalties cron (0 6 * * *)");

  task = cron.schedule("0 6 * * *", async () => {
    if (isRunning) {
      logger.debug("Tontine auto-penalties job already in progress, skipping");
      return;
    }

    isRunning = true;
    logger.info("Running tontine auto-penalties job...");

    try {
      // Get distinct agenceIds from active tontines
      const activeTontines = await db
        .selectDistinct({ agenceId: tontines.agenceId })
        .from(tontines)
        .where(
          eq(tontines.statut, TontineStatus.ACTIVE),
        );

      const agenceIds = activeTontines
        .map((t) => t.agenceId)
        .filter((id): id is string => !!id);

      let totalApplied = 0;
      let totalSkipped = 0;

      for (const agenceId of agenceIds) {
        try {
          const result = await applyLatePenalties(agenceId);
          totalApplied += result.applied;
          totalSkipped += result.skipped;
        } catch (error) {
          logger.error({ err: error, agenceId }, "Error applying penalties for agency");
        }
      }

      if (totalApplied > 0 || totalSkipped > 0) {
        logger.info(
          { applied: totalApplied, skipped: totalSkipped, agencies: agenceIds.length },
          "Tontine auto-penalties completed"
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Error in tontine auto-penalties cron");
    } finally {
      isRunning = false;
    }
  });
}

export function stopTontineAutoPenaltiesCron() {
  if (task) {
    task.stop();
    task = null;
    logger.info("Stopped tontine auto-penalties cron");
  }
}
