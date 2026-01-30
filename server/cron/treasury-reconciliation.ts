/**
 * Treasury Reconciliation Cron Job
 *
 * Exécute la réconciliation périodique GL vs Opérationnel
 * pour détecter les écarts entre le Grand Livre et les caches opérationnels.
 *
 * Fonctionnalités:
 * - Réconciliation planifiée (par défaut toutes les 30 minutes)
 * - Détection des écarts par agence et global
 * - Alertes WebSocket pour les écarts MAJOR/CRITICAL
 * - Logs structurés pour monitoring et audit
 */

import cron from "node-cron";
import { treasuryReconciliationService, type TreasuryReconciliationReport } from "../services/treasury/treasury-reconciliation-service";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:TreasuryReconciliation");

// Configuration
const RECONCILIATION_INTERVAL_MINUTES = parseInt(
  process.env.TREASURY_RECONCILIATION_INTERVAL_MINUTES || "30",
  10
);
const ENABLE_ON_STARTUP = process.env.TREASURY_RECONCILIATION_ON_STARTUP !== "false";

let cronJob: ReturnType<typeof cron.schedule> | null = null;

// ============================================================================
// CRON EXECUTION
// ============================================================================

/**
 * Exécute la réconciliation Treasury
 */
async function runTreasuryReconciliation(): Promise<void> {
  if (treasuryReconciliationService.isReconciliationRunning()) {
    logger.info("Réconciliation déjà en cours, ignoré");
    return;
  }

  const startTime = Date.now();

  try {
    logger.info("Démarrage réconciliation Treasury planifiée");

    const report = await treasuryReconciliationService.runFullReconciliation();

    // Log le résumé
    logger.info(
      {
        runId: report.runId,
        durationMs: report.durationMs,
        totalAgences: report.totalAgences,
        ok: report.summary.ok,
        minor: report.summary.minor,
        major: report.summary.major,
        critical: report.summary.critical,
        globalStatus: report.globalReconciliation?.status,
      },
      "Réconciliation Treasury terminée"
    );

    // Alerter si des problèmes critiques
    if (report.summary.critical > 0) {
      logger.error(
        {
          criticalCount: report.summary.critical,
          totalEcart: report.summary.totalEcartAbsolu,
        },
        "ALERTE: Écarts critiques détectés dans la réconciliation Treasury!"
      );
    } else if (report.summary.major > 0) {
      logger.warn(
        {
          majorCount: report.summary.major,
          totalEcart: report.summary.totalEcartAbsolu,
        },
        "Écarts majeurs détectés dans la réconciliation Treasury"
      );
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        durationMs: Date.now() - startTime,
      },
      "Erreur lors de la réconciliation Treasury"
    );
  }
}

// ============================================================================
// CRON MANAGEMENT
// ============================================================================

/**
 * Démarre le cron job de réconciliation Treasury
 */
export function startTreasuryReconciliationCron(): void {
  if (cronJob) {
    logger.info("Cron Treasury déjà démarré");
    return;
  }

  // Construire l'expression cron
  // Pour les intervalles < 60 minutes: */X * * * * (toutes les X minutes)
  // Pour les intervalles >= 60 minutes: 0 */X * * * (toutes les X heures)
  const expression =
    RECONCILIATION_INTERVAL_MINUTES >= 60
      ? `0 */${Math.floor(RECONCILIATION_INTERVAL_MINUTES / 60)} * * *`
      : `*/${RECONCILIATION_INTERVAL_MINUTES} * * * *`;

  cronJob = cron.schedule(expression, async () => {
    await runTreasuryReconciliation();
  });

  logger.info(
    {
      intervalMinutes: RECONCILIATION_INTERVAL_MINUTES,
      cronExpression: expression,
    },
    `Cron Treasury démarré (toutes les ${RECONCILIATION_INTERVAL_MINUTES} minutes)`
  );

  // Exécuter au démarrage si configuré (avec délai pour laisser le temps à l'app de s'initialiser)
  if (ENABLE_ON_STARTUP && process.env.NODE_ENV !== "test") {
    const startupDelay = 30_000; // 30 secondes
    logger.info(
      { delayMs: startupDelay },
      "Réconciliation Treasury planifiée au démarrage"
    );
    setTimeout(() => runTreasuryReconciliation(), startupDelay);
  }
}

/**
 * Arrête le cron job
 */
export function stopTreasuryReconciliationCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("Cron Treasury arrêté");
  }
}

/**
 * Force une exécution immédiate de la réconciliation
 */
export async function runTreasuryReconciliationNow(): Promise<TreasuryReconciliationReport> {
  logger.info("Réconciliation Treasury manuelle déclenchée");
  return treasuryReconciliationService.runFullReconciliation();
}

/**
 * Récupère le dernier rapport de réconciliation
 */
export function getLastTreasuryReconciliationReport(): TreasuryReconciliationReport | null {
  return treasuryReconciliationService.getLastReport();
}

/**
 * Vérifie si le cron est en cours d'exécution
 */
export function isTreasuryReconciliationRunning(): boolean {
  return treasuryReconciliationService.isReconciliationRunning();
}

export default {
  startTreasuryReconciliationCron,
  stopTreasuryReconciliationCron,
  runTreasuryReconciliationNow,
  getLastTreasuryReconciliationReport,
  isTreasuryReconciliationRunning,
};
