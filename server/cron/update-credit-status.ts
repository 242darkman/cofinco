import { db } from "../db";
import { credits } from "@shared/schema";
import { sql, and, or, lt, inArray } from "drizzle-orm";

/**
 * Cron Job: Update Credit Status to "En retard"
 * Runs hourly to ensure data integrity for overdue credits
 * Uses transactions for ACID compliance
 */
export async function updateOverdueCredits() {
  const startTime = Date.now();
  console.log('[CRON] Starting credit status update job...');

  try {
    // Step 1: Find overdue credits using SQL for maximum performance
    // A credit is overdue if:
    // - Status is 'Actif', 'En cours', or 'En_cours'
    // - prochaine_echeance (next due date) is in the past
    const overdueCredits = await db
      .select({ id: credits.id, numeroCredit: credits.numeroCredit })
      .from(credits)
      .where(
        and(
          // Only active credits can become overdue
          or(
            sql`${credits.statut} = 'Actif'`,
            sql`${credits.statut} = 'En cours'`,
            sql`${credits.statut} = 'En_cours'`
          ),
          // Next payment is overdue
          sql`${credits.prochaineEcheance} < NOW()`
        )
      );

    if (overdueCredits.length === 0) {
      console.log('[CRON] No overdue credits found');
      return { success: true, updated: 0, duration: Date.now() - startTime };
    }

    console.log(`[CRON] Found ${overdueCredits.length} overdue credits`);

    // Step 2: Update credits in a transaction for ACID compliance
    const creditIds = overdueCredits.map(c => c.id);
    
    await db.transaction(async (tx) => {
      // Batch update all overdue credits
      await tx
        .update(credits)
        .set({ 
          statut: 'En retard',
          updatedAt: new Date()
        })
        .where(inArray(credits.id, creditIds));

      // Log audit trail (if audit table exists, otherwise skip)
      // TODO: Add audit logging if needed
      console.log(`[CRON] Updated ${creditIds.length} credits to 'En retard' status`);
    });

    const duration = Date.now() - startTime;
    console.log(`[CRON] Credit status update completed in ${duration}ms`);

    return {
      success: true,
      updated: creditIds.length,
      duration,
      creditIds
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
