/**
 * Credit Lifecycle Service — C19 (Provisionnement) & C20 (Radiation/Write-off)
 *
 * C19: Provisionnement créances douteuses
 *   - When a credit is LATE beyond a threshold (e.g. 90 days), create a provision
 *   - GL: Debit 691 (Provisions créances douteuses) / Credit 2917 (Provisions dépréciation prêts)
 *   - Reversal when credit is regularised: Debit 2917 / Credit 79 (Reprises provisions)
 *
 * C20: Radiation (write-off) crédit irrécouvrable
 *   - When a credit is deemed irrecoverable (e.g. 365+ days late, manual decision)
 *   - GL: Debit 672 (Pertes créances irrécouvrables) / Credit 2711 (Prêts - Principal)
 *   - If a provision existed, reverse it first (C19b)
 *   - Transition credit to CLOSED
 */

import { db } from "../db";
import { credits, echeancesCredits } from "@shared/schema";
import { sql, eq, and, lte } from "drizzle-orm";
import {
  validateCreditTransition,
  CreditStatus,
} from "@shared/machines/credit-workflow";
import { executeWithLedger, updateCreditSolde } from "./ledger";
import { dispatchDomainEvent } from "./notifications/domain-events/event-registry";
import { createLogger } from "../lib/logger";
import { D, roundMoney } from "../lib/money";

const logger = createLogger('CreditLifecycle');

// ============================================================================
// C19: PROVISIONNEMENT CRÉANCES DOUTEUSES
// ============================================================================

/** Default provision rates by days-late bracket (OHADA/COBAC norms) */
const PROVISION_BRACKETS = [
  { minDays: 90, maxDays: 180, rate: 25 },   // 25% provision
  { minDays: 181, maxDays: 270, rate: 50 },   // 50% provision
  { minDays: 271, maxDays: 360, rate: 75 },   // 75% provision
  { minDays: 361, maxDays: null, rate: 100 },  // 100% provision
];

export interface ProvisionResult {
  creditId: string;
  provisionAmount: string;
  rate: number;
  daysLate: number;
}

/**
 * C19: Provision a single credit with GL posting.
 *
 * Creates a mouvement CREDIT_PROVISION with:
 *   Debit 691 (Provisions créances douteuses)
 *   Credit 2917 (Provisions pour dépréciation des prêts)
 */
export async function provisionCredit(
  creditId: string,
  userId?: string,
): Promise<ProvisionResult | null> {
  // 1. Fetch credit info
  const [credit] = await db
    .select({
      id: credits.id,
      numeroCredit: credits.numeroCredit,
      clientId: credits.clientId,
      agenceId: credits.agenceId,
      soldeRestant: credits.soldeRestant,
      statut: credits.statut,
      prochaineEcheance: credits.prochaineEcheance,
    })
    .from(credits)
    .where(eq(credits.id, creditId));

  if (!credit || !credit.agenceId) {
    logger.warn({ creditId }, 'Credit not found or missing agenceId');
    return null;
  }

  if (credit.statut !== CreditStatus.LATE) {
    logger.warn({ creditId, statut: credit.statut }, 'Credit not in LATE status, skipping provision');
    return null;
  }

  // 2. Calculate days late from first overdue echeance
  const [firstOverdue] = await db
    .select({ dateEcheance: echeancesCredits.dateEcheance })
    .from(echeancesCredits)
    .where(
      and(
        eq(echeancesCredits.creditId, creditId),
        sql`${echeancesCredits.statut} IN ('LATE', 'PARTIALLY_PAID')`,
        lte(echeancesCredits.dateEcheance, new Date()),
      )
    )
    .orderBy(echeancesCredits.dateEcheance)
    .limit(1);

  if (!firstOverdue) return null;

  const daysLate = Math.floor(
    (Date.now() - firstOverdue.dateEcheance.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 3. Find applicable provision bracket
  const bracket = PROVISION_BRACKETS.find(
    b => daysLate >= b.minDays && (b.maxDays === null || daysLate <= b.maxDays)
  );

  if (!bracket) {
    logger.debug({ creditId, daysLate }, 'Days late below provision threshold (90 days)');
    return null;
  }

  // 4. Calculate provision amount
  const soldeRestant = D(credit.soldeRestant);
  const provisionAmount = soldeRestant.times(bracket.rate).dividedBy(100);
  const provisionStr = roundMoney(provisionAmount);

  if (provisionAmount.lte(0)) return null;

  // 5. Post GL entry
  await executeWithLedger(
    "SYSTEME",
    {
      montant: provisionStr,
      sens: "DEBIT",
      clientId: credit.clientId,
      creditId: credit.id,
      agenceId: credit.agenceId,
      typePaiement: "CREDIT_PROVISION",
      metadata: {
        daysLate,
        provisionRate: bracket.rate,
        soldeRestant: credit.soldeRestant,
        creditNumber: credit.numeroCredit,
        clientName: credit.clientId,
        eventType: 'CREDIT_PROVISION',
      },
      idempotencyKey: `PROVISION-${creditId}-${bracket.rate}-${new Date().toISOString().slice(0, 7)}`,
    },
    async (_tx, _mouvement) => {
      // Provision is off-balance — no solde_restant change on the credit.
      // The GL entries (691/2917) track the provision.
      return { result: { provisionAmount: provisionStr, rate: bracket.rate } };
    },
    userId,
  );

  logger.info({
    creditId,
    daysLate,
    rate: bracket.rate,
    provisionAmount: provisionStr,
  }, 'Credit provision posted to GL');

  return {
    creditId,
    provisionAmount: provisionStr,
    rate: bracket.rate,
    daysLate,
  };
}

/**
 * C19 batch: Provision all eligible credits (LATE > 90 days).
 * Designed to be called by a cron job (e.g. monthly).
 */
export async function provisionOverdueCredits(userId?: string) {
  logger.info('Starting batch credit provisioning');

  // Find all LATE credits with oldest overdue echeance > 90 days ago
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const lateCreditIds = await db
    .select({ id: credits.id })
    .from(credits)
    .where(eq(credits.statut, CreditStatus.LATE));

  const results: ProvisionResult[] = [];
  for (const { id } of lateCreditIds) {
    try {
      const result = await provisionCredit(id, userId);
      if (result) results.push(result);
    } catch (error) {
      logger.error({ creditId: id, err: error }, 'Failed to provision credit');
    }
  }

  logger.info({ provisioned: results.length }, 'Batch provisioning completed');
  return { provisioned: results.length, results };
}

/**
 * C19b: Reverse a provision when credit is regularised (paid or rescheduled).
 *
 * GL: Debit 2917 (Provisions dépréciation prêts) / Credit 79 (Reprises provisions)
 */
export async function reverseProvision(
  creditId: string,
  provisionAmount: string,
  reason: string,
  userId?: string,
): Promise<void> {
  const [credit] = await db
    .select({
      id: credits.id,
      numeroCredit: credits.numeroCredit,
      clientId: credits.clientId,
      agenceId: credits.agenceId,
    })
    .from(credits)
    .where(eq(credits.id, creditId));

  if (!credit || !credit.agenceId) return;

  await executeWithLedger(
    "SYSTEME",
    {
      montant: provisionAmount,
      sens: "CREDIT",
      clientId: credit.clientId,
      creditId: credit.id,
      agenceId: credit.agenceId,
      typePaiement: "CREDIT_PROVISION_REVERSAL",
      metadata: {
        reason,
        creditNumber: credit.numeroCredit,
        clientName: credit.clientId,
        eventType: 'CREDIT_PROVISION_REVERSAL',
      },
      idempotencyKey: `PROV_REV-${creditId}-${Date.now()}`,
    },
    async (_tx, _mouvement) => {
      return { result: { reversed: provisionAmount } };
    },
    userId,
  );

  logger.info({ creditId, provisionAmount, reason }, 'Provision reversed with GL posting');
}

// ============================================================================
// C20: RADIATION / WRITE-OFF CRÉDIT IRRÉCOUVRABLE
// ============================================================================

export interface WriteOffResult {
  creditId: string;
  writeOffAmount: string;
  provisionReversed: string | null;
  previousStatus: string;
}

/**
 * C20: Write off an irrecoverable credit.
 *
 * 1. If a provision existed, reverse it first (C19b)
 * 2. Post write-off: Debit 672 (Pertes créances irrécouvrables) / Credit 2711 (Prêts - Principal)
 * 3. Set credit solde_restant to 0
 * 4. Transition credit to CLOSED
 *
 * This is an administrative action — requires userId and explicit decision.
 */
export async function writeOffCredit(
  creditId: string,
  userId: string,
  reason: string = 'Crédit irrécouvrable — radiation',
  existingProvisionAmount?: string,
): Promise<WriteOffResult> {
  // 1. Fetch credit
  const [credit] = await db
    .select({
      id: credits.id,
      numeroCredit: credits.numeroCredit,
      clientId: credits.clientId,
      agenceId: credits.agenceId,
      soldeRestant: credits.soldeRestant,
      statut: credits.statut,
    })
    .from(credits)
    .where(eq(credits.id, creditId));

  if (!credit) throw new Error(`Credit ${creditId} not found`);
  if (!credit.agenceId) throw new Error(`Credit ${creditId} missing agenceId`);

  // 2. Validate state transition LATE → CLOSED (or ACTIVE → CLOSED)
  validateCreditTransition(credit.statut, CreditStatus.CLOSED);

  const writeOffAmount = D(credit.soldeRestant);
  if (writeOffAmount.lte(0)) {
    throw new Error(`Credit ${creditId} has no remaining balance to write off`);
  }

  const writeOffStr = roundMoney(writeOffAmount);

  // 3. Reverse provision if one exists
  let provisionReversed: string | null = null;
  if (existingProvisionAmount && D(existingProvisionAmount).gt(0)) {
    await reverseProvision(creditId, existingProvisionAmount, 'Write-off — provision reversal', userId);
    provisionReversed = existingProvisionAmount;
  }

  // 4. Post write-off via executeWithLedger
  await executeWithLedger(
    "SYSTEME",
    {
      montant: writeOffStr,
      sens: "CREDIT",
      clientId: credit.clientId,
      creditId: credit.id,
      agenceId: credit.agenceId,
      typePaiement: "CREDIT_WRITEOFF",
      metadata: {
        reason,
        previousStatus: credit.statut,
        creditNumber: credit.numeroCredit,
        clientName: credit.clientId,
        provisionReversed,
        eventType: 'CREDIT_WRITEOFF',
      },
      idempotencyKey: `WRITEOFF-${creditId}-${Date.now()}`,
    },
    async (tx, _mouvement) => {
      // Zero out the credit balance
      await updateCreditSolde(tx, credit.id, -writeOffAmount.toNumber());

      // Transition to CLOSED
      await tx
        .update(credits)
        .set({
          statut: CreditStatus.CLOSED,
          dateSolde: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(credits.id, credit.id));

      return { result: { writeOffAmount: writeOffStr } };
    },
    userId,
  );

  // 5. Dispatch domain event
  dispatchDomainEvent({
    type: "CREDIT_OVERDUE", // reuse existing event type
    data: {
      creditIds: [creditId],
      count: 1,
      action: 'WRITE_OFF',
      amount: writeOffStr,
      reason,
    },
    timestamp: new Date(),
  });

  logger.info({
    creditId,
    writeOffAmount: writeOffStr,
    provisionReversed,
    reason,
  }, 'Credit written off with GL posting');

  return {
    creditId,
    writeOffAmount: writeOffStr,
    provisionReversed,
    previousStatus: credit.statut,
  };
}
