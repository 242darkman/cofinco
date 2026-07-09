/**
 * Cron Job: Monthly Credit Provision Calculation
 *
 * Runs on the 1st of each month at 2:00 AM to calculate
 * COBAC-compliant provisions for all agencies.
 * Posts GL entries: D691/C2917 (dotation) or D2917/C79 (reprise).
 */

import { db } from "../db";
import { agences } from "@shared/schema/agences";
import { calculateProvisions } from "../services/provision-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:Provisions');

/**
 * Calculate provisions for all agencies.
 * Called on the 1st of each month for the previous month's closing date.
 */
export async function runProvisionCalculation() {
  const startTime = Date.now();
  logger.info('Starting monthly provision calculation...');

  try {
    // Last day of the previous month
    const now = new Date();
    const periodeDate = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of prev month

    // Get all agencies
    const allAgences = await db.select({ id: agences.id, nom: agences.nom }).from(agences);

    let totalDotations = 0;
    let totalReprises = 0;
    let totalCredits = 0;
    const errors: { agenceId: string; error: string }[] = [];

    for (const agence of allAgences) {
      try {
        const result = await calculateProvisions(agence.id, periodeDate);
        totalDotations += result.totalDotations;
        totalReprises += result.totalReprises;
        totalCredits += result.creditsTraites;

        logger.info({
          agenceId: agence.id,
          agence: agence.nom,
          creditsTraites: result.creditsTraites,
          dotations: result.totalDotations,
          reprises: result.totalReprises,
        }, 'Agency provision calculation complete');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ agenceId: agence.id, error: msg });
        logger.error({ agenceId: agence.id, agence: agence.nom, err }, 'Failed to calculate provisions for agency');
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      duration,
      agences: allAgences.length,
      totalCredits,
      totalDotations,
      totalReprises,
      errors: errors.length,
    }, 'Monthly provision calculation completed');

    return { success: true, totalCredits, totalDotations, totalReprises, errors, duration };
  } catch (error) {
    logger.error({ err: error }, 'Fatal error in provision calculation');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', duration: Date.now() - startTime };
  }
}

/**
 * Check if today is the 1st of the month (trigger provision calculation).
 */
function shouldRunToday(): boolean {
  return new Date().getDate() === 1;
}

// Schedule: check daily at 2:00 AM, run only on the 1st
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cronIntervalId: NodeJS.Timeout | null = null;

export function startProvisionCron(): void {
  logger.info('Starting provision scheduler...');

  // Check on startup (if today is the 1st)
  if (shouldRunToday()) {
    runProvisionCalculation();
  }

  // Schedule daily check
  cronIntervalId = setInterval(() => {
    if (shouldRunToday()) {
      runProvisionCalculation();
    }
  }, CHECK_INTERVAL_MS);

  logger.info('Provision scheduler configured (runs 1st of each month)');
}

export function stopProvisionCron(): void {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  logger.info('Provision scheduler stopped');
}
