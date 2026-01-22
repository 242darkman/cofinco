import { db } from "../db";
import { credits } from "@shared/schema";
import { sql, and, or, lt, inArray, eq } from "drizzle-orm";
import {
  validateCreditTransition,
  CreditTransitionError,
  CreditStatus,
} from "@shared/machines/credit-workflow";

/**
 * Cron Job: Update Credit Status to "En retard"
 * Runs hourly to ensure data integrity for overdue credits
 * Uses transactions for ACID compliance
 *
 * State Machine: ACTIVE -> LATE is allowed by credit-workflow.ts
 */
export async function updateOverdueCredits() {
  const startTime = Date.now();
  console.log('[CRON] Starting credit status update job...');

  try {
    // Step 1: Find overdue credits using SQL for maximum performance
    // A credit is overdue if:
    // - Status is 'ACTIVE' (Greenfield: only EN values)
    // - prochaine_echeance (next due date) is in the past
    const overdueCredits = await db
      .select({ id: credits.id, numeroCredit: credits.numeroCredit, statut: credits.statut })
      .from(credits)
      .where(
        and(
          // Only active credits can become overdue
          sql`${credits.statut} = 'ACTIVE'`,
          // Next payment is overdue
          sql`${credits.prochaineEcheance} < NOW()`
        )
      );

    if (overdueCredits.length === 0) {
      console.log('[CRON] No overdue credits found');
      return { success: true, updated: 0, duration: Date.now() - startTime };
    }

    console.log(`[CRON] Found ${overdueCredits.length} overdue credits`);

    // Step 2: Validate each credit can transition to LATE using state machine
    const validCreditIds: string[] = [];
    const skippedCredits: Array<{ id: string; reason: string }> = [];

    for (const credit of overdueCredits) {
      try {
        // State Machine Guard: Validate transition ACTIVE -> LATE
        validateCreditTransition(credit.statut, CreditStatus.LATE);
        validCreditIds.push(credit.id);
      } catch (error) {
        if (error instanceof CreditTransitionError) {
          skippedCredits.push({ id: credit.id, reason: error.message });
          console.warn(`[CRON] Skipping credit ${credit.numeroCredit}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    if (validCreditIds.length === 0) {
      console.log('[CRON] No credits eligible for LATE status transition');
      return { success: true, updated: 0, skipped: skippedCredits.length, duration: Date.now() - startTime };
    }

    // Step 3: Update credits in a transaction for ACID compliance
    await db.transaction(async (tx) => {
      // Batch update all valid credits
      await tx
        .update(credits)
        .set({
          statut: CreditStatus.LATE, // Use standardized EN value
          updatedAt: new Date()
        })
        .where(inArray(credits.id, validCreditIds));

      console.log(`[CRON] Updated ${validCreditIds.length} credits to 'LATE' status`);
    });

    const duration = Date.now() - startTime;
    console.log(`[CRON] Credit status update completed in ${duration}ms`);

    return {
      success: true,
      updated: validCreditIds.length,
      skipped: skippedCredits.length,
      duration,
      creditIds: validCreditIds
    };

  } catch (error) {
    console.error('[CRON] Error updating credit statuses:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    };
  }
}

/**
 * Optional: Calculate and apply late payment penalties
 * Can be called after status update if configured
 */
export async function applyLatePenalties(creditIds: string[]) {
  // TODO: Implement penalty calculation based on business rules
  // For now, this is a placeholder
  console.log('[CRON] Late penalty application not yet configured');
  return { applied: 0 };
}

/**
 * Scheduler: Run credit status update hourly
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let cronIntervalId: NodeJS.Timeout | null = null;

export function startCreditStatusUpdateCron(): void {
  console.log('[CRON] Starting credit status update job...');
  
  // Run immediately on startup
  updateOverdueCredits();
  
  // Schedule hourly execution
  cronIntervalId = setInterval(updateOverdueCredits, CHECK_INTERVAL_MS);
  
  console.log('[CRON] Credit status update configured: runs every hour');
}

export function stopCreditStatusUpdateCron(): void {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  console.log('[CRON] Credit status update job stopped');
}
