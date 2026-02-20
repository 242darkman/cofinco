import { db } from "../db";
import { credits, echeancesCredits } from "@shared/schema";
import { creditPenaltyStructures } from "@shared/schema/settings";
import { sql, and, or, lt, lte, inArray, eq, isNull } from "drizzle-orm";
import {
  validateCreditTransition,
  CreditTransitionError,
  CreditStatus,
} from "@shared/machines/credit-workflow";
import { executeWithLedger, updateCreditSolde } from "../services/ledger";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { createLogger } from "../lib/logger";
import { D, roundMoney } from "../lib/money";

const logger = createLogger('Cron:CreditStatus');

/**
 * Cron Job: Update Credit Status to "En retard"
 * Runs hourly to ensure data integrity for overdue credits
 * Uses transactions for ACID compliance
 *
 * State Machine: ACTIVE -> LATE is allowed by credit-workflow.ts
 */
export async function updateOverdueCredits() {
  const startTime = Date.now();
  logger.info('Starting credit status update job...');

  try {
    // Step 1: Find overdue credits using SQL for maximum performance
    // A credit is overdue if:
    // - Status is 'ACTIVE' (Greenfield: only EN values)
    // - prochaine_echeance (next due date) is in the past
    const overdueCredits = await db
      .select({ id: credits.id, clientId: credits.clientId, agenceId: credits.agenceId, numeroCredit: credits.numeroCredit, statut: credits.statut })
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
      logger.info('No overdue credits found');
      return { success: true, updated: 0, duration: Date.now() - startTime };
    }

    logger.info({ count: overdueCredits.length }, 'Found overdue credits');

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
          logger.warn({ creditId: credit.id, numeroCredit: credit.numeroCredit, reason: error.message }, 'Skipping credit');
        } else {
          throw error;
        }
      }
    }

    if (validCreditIds.length === 0) {
      logger.info({ skipped: skippedCredits.length }, 'No credits eligible for LATE status transition');
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

      logger.info({ count: validCreditIds.length }, 'Updated credits to LATE status');
    });

    const duration = Date.now() - startTime;
    logger.info({ duration, updated: validCreditIds.length }, 'Credit status update completed');

    // Domain event: credits marked as overdue
    if (validCreditIds.length > 0) {
      dispatchDomainEvent({
        type: "CREDIT_OVERDUE",
        data: {
          creditIds: validCreditIds,
          count: validCreditIds.length,
        },
        timestamp: new Date(),
      });

      // Apply late penalties (C18) — runs after status transition
      const penaltyResult = await applyLatePenalties(validCreditIds);
      logger.info({ penalties: penaltyResult }, 'Penalties applied after status update');

      // Score events: INCIDENT_RETARD for each credit marked late
      try {
        const { recordScoreEvent } = await import('../services/scoring-engine');
        const today = new Date().toISOString().slice(0, 10);
        for (const credit of overdueCredits) {
          if (validCreditIds.includes(credit.id) && credit.clientId) {
            await recordScoreEvent({
              clientId: credit.clientId,
              agenceId: credit.agenceId ?? undefined,
              eventType: 'INCIDENT_RETARD',
              refId: `late-${credit.id}-${today}`,
              refType: 'credit',
              metadata: { creditId: credit.id, numeroCredit: credit.numeroCredit },
            }).catch(err => logger.error({ err, creditId: credit.id }, 'Scoring event error (late credit)'));
          }
        }
      } catch (err) {
        logger.error({ err }, 'Scoring events batch error (late credits)');
      }
    }

    // Score events: INCIDENT_DEFAUT for credits LATE > 90 days
    try {
      const defaultedCredits = await db
        .select({ id: credits.id, clientId: credits.clientId, agenceId: credits.agenceId, numeroCredit: credits.numeroCredit })
        .from(credits)
        .where(and(
          sql`${credits.statut} = 'LATE'`,
          sql`${credits.prochaineEcheance} < NOW() - INTERVAL '90 days'`
        ));

      if (defaultedCredits.length > 0) {
        const { recordScoreEvent } = await import('../services/scoring-engine');
        const month = new Date().toISOString().slice(0, 7); // monthly idempotency
        for (const credit of defaultedCredits) {
          if (credit.clientId) {
            await recordScoreEvent({
              clientId: credit.clientId,
              agenceId: credit.agenceId ?? undefined,
              eventType: 'INCIDENT_DEFAUT',
              refId: `defaut-${credit.id}-${month}`,
              refType: 'credit',
              metadata: { creditId: credit.id, numeroCredit: credit.numeroCredit },
            }).catch(err => logger.error({ err, creditId: credit.id }, 'Scoring event error (defaulted credit)'));
          }
        }
        logger.info({ count: defaultedCredits.length }, 'Defaulted credits scored');
      }
    } catch (err) {
      logger.error({ err }, 'Scoring events error (defaulted credits)');
    }

    return {
      success: true,
      updated: validCreditIds.length,
      skipped: skippedCredits.length,
      duration,
      creditIds: validCreditIds
    };

  } catch (error) {
    logger.error({ err: error }, 'Error updating credit statuses');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    };
  }
}

/**
 * C18: Calculate and apply late payment penalties with GL posting.
 *
 * For each overdue echeance that hasn't been penalised yet:
 *  1. Looks up the applicable penalty structure (credit_penalty_structures)
 *  2. Calculates penalty (FIXED or PERCENTAGE of the overdue amount)
 *  3. Records via executeWithLedger → mouvement CREDIT_LATE_PENALTY
 *     GL: Debit 2711 (Prêts - Principal) / Credit 7073 (Pénalités de retard)
 *  4. Updates echeances_credits.penalite_montant
 *  5. Increases credits.solde_restant by the penalty amount
 */
export async function applyLatePenalties(creditIds: string[]) {
  if (creditIds.length === 0) return { applied: 0, totalAmount: '0' };

  logger.info({ creditIds: creditIds.length }, 'Starting late penalty application');
  let applied = 0;
  let totalPenalties = D(0);

  for (const creditId of creditIds) {
    try {
      // 1. Fetch credit with its agence
      const [credit] = await db
        .select({
          id: credits.id,
          numeroCredit: credits.numeroCredit,
          clientId: credits.clientId,
          agenceId: credits.agenceId,
          typeCredit: credits.typeCredit,
          soldeRestant: credits.soldeRestant,
        })
        .from(credits)
        .where(eq(credits.id, creditId));

      if (!credit || !credit.agenceId) continue;

      // 2. Find overdue echeances not yet penalised
      const overdueEcheances = await db
        .select()
        .from(echeancesCredits)
        .where(
          and(
            eq(echeancesCredits.creditId, creditId),
            lte(echeancesCredits.dateEcheance, new Date()),
            sql`${echeancesCredits.statut} IN ('LATE', 'PARTIALLY_PAID')`,
            // Only echeances that haven't been penalised yet
            sql`COALESCE(${echeancesCredits.penaliteMontant}::NUMERIC, 0) = 0`
          )
        );

      if (overdueEcheances.length === 0) continue;

      // 3. Lookup penalty structure (first matching active rule)
      const [penaltyStructure] = await db
        .select()
        .from(creditPenaltyStructures)
        .where(
          and(
            eq(creditPenaltyStructures.isActive, true),
            // Match by grace period — only apply if late beyond grace
            sql`${creditPenaltyStructures.gracePeriodDays} <= EXTRACT(DAY FROM NOW() - ${overdueEcheances[0].dateEcheance}::TIMESTAMP)`
          )
        )
        .limit(1);

      // If no penalty structure configured, use default 2% flat
      const penaltyRate = penaltyStructure
        ? { type: penaltyStructure.penaltyType, amount: D(penaltyStructure.amount), max: penaltyStructure.maxPenalty ? D(penaltyStructure.maxPenalty) : null }
        : { type: 'PERCENTAGE', amount: D(2), max: null }; // 2% default

      // 4. Calculate and post penalty for each overdue echeance
      for (const echeance of overdueEcheances) {
        const overdueAmount = D(echeance.montantTotal).minus(D(echeance.montantPaye));
        if (overdueAmount.lte(0)) continue;

        let penaltyAmount: ReturnType<typeof D>;
        if (penaltyRate.type === 'FIXED') {
          penaltyAmount = penaltyRate.amount;
        } else {
          // PERCENTAGE (default)
          penaltyAmount = overdueAmount.times(penaltyRate.amount).dividedBy(100);
        }

        // Apply cap if defined
        if (penaltyRate.max && penaltyAmount.gt(penaltyRate.max)) {
          penaltyAmount = penaltyRate.max;
        }

        // Minimum penalty = 100 FCFA
        if (penaltyAmount.lt(100)) penaltyAmount = D(100);

        const penaltyStr = roundMoney(penaltyAmount);

        // 5. Post GL entry via executeWithLedger
        await executeWithLedger(
          "CREDIT",
          {
            montant: penaltyStr,
            sens: "DEBIT",
            clientId: credit.clientId,
            creditId: credit.id,
            agenceId: credit.agenceId,
            typePaiement: "CREDIT_LATE_PENALTY",
            metadata: {
              echeanceId: echeance.id,
              numeroEcheance: echeance.numeroEcheance,
              daysLate: Math.floor((Date.now() - echeance.dateEcheance.getTime()) / (1000 * 60 * 60 * 24)),
              overdueAmount: overdueAmount.toString(),
              creditNumber: credit.numeroCredit,
              clientName: credit.clientId,
              eventType: 'CREDIT_LATE_PENALTY',
            },
            idempotencyKey: `PENALTY-${echeance.id}-${new Date().toISOString().slice(0, 10)}`,
          },
          async (tx, mouvement) => {
            // Update echeance penalty amount
            await tx
              .update(echeancesCredits)
              .set({ penaliteMontant: penaltyStr })
              .where(eq(echeancesCredits.id, echeance.id));

            // Increase credit solde_restant by penalty amount
            await updateCreditSolde(tx, credit.id, penaltyAmount.toNumber());

            return { result: { penaltyAmount: penaltyStr } };
          }
        );

        applied++;
        totalPenalties = totalPenalties.plus(penaltyAmount);

        logger.info({
          creditId: credit.id,
          echeanceId: echeance.id,
          penaltyAmount: penaltyStr,
        }, 'Late penalty applied with GL posting');
      }
    } catch (error) {
      logger.error({ creditId, err: error }, 'Failed to apply penalty for credit');
      // Continue with next credit — don't stop the batch
    }
  }

  logger.info({ applied, totalAmount: roundMoney(totalPenalties) }, 'Late penalty application completed');
  return { applied, totalAmount: roundMoney(totalPenalties) };
}

/**
 * Scheduler: Run credit status update hourly
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let cronIntervalId: NodeJS.Timeout | null = null;

export function startCreditStatusUpdateCron(): void {
  logger.info('Starting credit status update job...');

  // Run immediately on startup
  updateOverdueCredits();

  // Schedule hourly execution
  cronIntervalId = setInterval(updateOverdueCredits, CHECK_INTERVAL_MS);

  logger.info({ intervalMinutes: CHECK_INTERVAL_MS / 60000 }, 'Credit status update configured');
}

export function stopCreditStatusUpdateCron(): void {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  logger.info('Credit status update job stopped');
}
