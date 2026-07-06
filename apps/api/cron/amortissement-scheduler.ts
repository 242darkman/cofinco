/**
 * Cron Job: Monthly Amortissement (Depreciation) Calculation
 *
 * Runs on the 2nd of each month at 3:00 AM to calculate
 * depreciation for all fixed assets across agencies.
 * Posts GL entries: D681 / C28x.
 */

import { db } from "../db";
import { agences } from "@shared/schema/agences";
import { calculateAmortissements } from "../services/amortissement-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:Amortissements');

export async function runAmortissementCalculation() {
  const startTime = Date.now();
  logger.info('Starting monthly amortissement calculation...');

  try {
    const now = new Date();
    const periodeDate = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

    const allAgences = await db.select({ id: agences.id, nom: agences.nom }).from(agences);

    let totalDotations = 0;
    let totalImmos = 0;
    const errors: { agenceId: string; error: string }[] = [];

    for (const agence of allAgences) {
      try {
        const result = await calculateAmortissements(agence.id, periodeDate);
        totalDotations += result.totalDotations;
        totalImmos += result.immosTraitees;

        if (result.immosTraitees > 0) {
          logger.info({
            agenceId: agence.id,
            agence: agence.nom,
            immosTraitees: result.immosTraitees,
            totalDotations: result.totalDotations,
          }, 'Agency amortissement calculation complete');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ agenceId: agence.id, error: msg });
        logger.error({ agenceId: agence.id, err }, 'Failed amortissement for agency');
      }
    }

    const duration = Date.now() - startTime;
    logger.info({ duration, totalImmos, totalDotations, errors: errors.length }, 'Monthly amortissement completed');

    return { success: true, totalImmos, totalDotations, errors, duration };
  } catch (error) {
    logger.error({ err: error }, 'Fatal error in amortissement calculation');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown', duration: Date.now() - startTime };
  }
}

function shouldRunToday(): boolean {
  return new Date().getDate() === 2; // 2nd of the month
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let cronIntervalId: NodeJS.Timeout | null = null;

export function startAmortissementCron(): void {
  logger.info('Starting amortissement scheduler...');

  if (shouldRunToday()) {
    runAmortissementCalculation();
  }

  cronIntervalId = setInterval(() => {
    if (shouldRunToday()) {
      runAmortissementCalculation();
    }
  }, CHECK_INTERVAL_MS);

  logger.info('Amortissement scheduler configured (runs 2nd of each month)');
}

export function stopAmortissementCron(): void {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  logger.info('Amortissement scheduler stopped');
}
