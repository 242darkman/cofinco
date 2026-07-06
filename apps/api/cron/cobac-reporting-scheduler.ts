/**
 * Cron Job: Monthly COBAC Prudential Ratios Calculation
 *
 * Runs on the 3rd of each month at 3:00 AM to calculate
 * COBAC-mandated prudential ratios for all agencies.
 * Stores snapshots in ratios_prudentiels and logs alerts.
 */

import { db } from "../db";
import { agences } from "@shared/schema/agences";
import { calculateCobacRatios } from "../services/cobac-ratios-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:CobacReporting');

/**
 * Calculate COBAC ratios for all agencies.
 * Called on the 3rd of each month for the last day of the previous month.
 */
export async function runCobacReporting() {
  const startTime = Date.now();
  logger.info('Starting monthly COBAC ratio calculation...');

  try {
    // Last day of the previous month
    const now = new Date();
    const periodeDate = new Date(now.getFullYear(), now.getMonth(), 0);

    const allAgences = await db.select({ id: agences.id, nom: agences.nom }).from(agences);

    let totalAlerts = 0;
    let breaches = 0;
    const errors: { agenceId: string; error: string }[] = [];

    for (const agence of allAgences) {
      try {
        const result = await calculateCobacRatios(agence.id, periodeDate);
        const agencyBreaches = result.alerts.filter(a => a.status === 'BREACH').length;
        totalAlerts += result.alerts.length;
        breaches += agencyBreaches;

        if (agencyBreaches > 0) {
          logger.warn({
            agenceId: agence.id,
            agence: agence.nom,
            breaches: result.alerts.filter(a => a.status === 'BREACH'),
          }, 'COBAC ratio breaches detected');
        }

        logger.info({
          agenceId: agence.id,
          agence: agence.nom,
          roe: result.ratios.roe,
          roa: result.ratios.roa,
          solvabilite: result.ratios.ratioSolvabilite,
          alertCount: result.alerts.length,
        }, 'Agency COBAC ratios calculated');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ agenceId: agence.id, error: msg });
        logger.error({ agenceId: agence.id, agence: agence.nom, err }, 'Failed to calculate COBAC ratios');
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      duration,
      agences: allAgences.length,
      totalAlerts,
      breaches,
      errors: errors.length,
    }, 'Monthly COBAC ratio calculation completed');

    return { success: true, agences: allAgences.length, totalAlerts, breaches, errors, duration };
  } catch (error) {
    logger.error({ err: error }, 'Fatal error in COBAC ratio calculation');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', duration: Date.now() - startTime };
  }
}

/**
 * Check if today is the 3rd of the month (trigger COBAC calculation).
 * Runs on the 3rd to ensure provisions (1st) and amortissements (2nd) are done first.
 */
function shouldRunToday(): boolean {
  return new Date().getDate() === 3;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cronIntervalId: NodeJS.Timeout | null = null;

export function startCobacReportingCron(): void {
  logger.info('Starting COBAC reporting scheduler...');

  if (shouldRunToday()) {
    runCobacReporting();
  }

  cronIntervalId = setInterval(() => {
    if (shouldRunToday()) {
      runCobacReporting();
    }
  }, CHECK_INTERVAL_MS);

  logger.info('COBAC reporting scheduler configured (runs 3rd of each month)');
}

export function stopCobacReportingCron(): void {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  logger.info('COBAC reporting scheduler stopped');
}
