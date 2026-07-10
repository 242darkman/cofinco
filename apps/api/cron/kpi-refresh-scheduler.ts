/**
 * KPI Refresh Cron — filet de sécurité du rafraîchissement temps réel.
 *
 * Le worker KPI est normalement déclenché par les événements outbox.
 * Ce cron garantit qu'un snapshot de la période courante ne reste jamais
 * obsolète plus de N minutes, même si aucun événement ne circule (données
 * modifiées hors outbox, redémarrage, événement manqué).
 *
 * Idempotent et non concurrent : il ne fait que marquer les KPI « dirty » ;
 * le worker (debounce + verrou consultatif) fait le travail.
 */
import cron from "node-cron";
import { createLogger } from "../lib/logger";
import { markKpiDirty } from "../services/kpi/kpi-refresh-worker";

const logger = createLogger("Cron:KpiRefresh");

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron. Cadence par défaut : toutes les 10 minutes,
 * surchargeable via KPI_REFRESH_CRON (expression cron standard).
 */
export function startKpiRefreshCron(): void {
  const expression = process.env.KPI_REFRESH_CRON || "*/10 * * * *";

  if (!cron.validate(expression)) {
    logger.error({ expression }, "Expression KPI_REFRESH_CRON invalide — cron KPI non démarré");
    return;
  }

  cronJob = cron.schedule(expression, () => {
    markKpiDirty("cron-safety-net");
  }, {
    timezone: "Africa/Brazzaville",
  });

  logger.info({ expression }, "KPI refresh cron scheduled (filet de sécurité)");

  // Amorçage au démarrage : garantit un snapshot frais après un déploiement,
  // sans attendre le premier événement ni le premier tick cron.
  setTimeout(() => {
    markKpiDirty("startup");
  }, 15_000); // 15s après démarrage, le temps que la DB et le WS soient prêts
}

export function stopKpiRefreshCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("KPI refresh cron stopped");
  }
}
