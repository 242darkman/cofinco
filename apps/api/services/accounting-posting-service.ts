/**
 * Accounting Posting Service
 *
 * This is the central posting engine for the SYSCOHADA-compliant accounting module.
 * It handles:
 * - Creating GL entries with idempotency (no double-posting)
 * - Period validation (cannot post to closed periods)
 * - Balance validation (debit must equal credit)
 * - Automatic posting from business transactions using accounting rules
 * - Reversal (extourne) functionality
 * - Piece number generation (concurrent-safe)
 */

import { db } from "../db";
import { eq, and, sql, isNull, or, desc, asc, gte, lte } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  ecritures,
  lignesEcritures,
  journaux,
  planComptable,
  glPostingLinks,
  glPeriods,
  glSequences,
  accountingRules,
  exercices,
  type PostEntryRequest,
  type PostEntryResult,
  type PostEntryLine,
  type AccountingRule,
  type GrandLivreEntry,
  type GrandLivreResponse,
  type BalanceEntry,
  type BalanceResponse,
  EntryStatus,
  PeriodStatus,
} from "@shared/schema";
import { mouvementsFinanciers, type MouvementFinancier } from "@shared/schema/finance";
import { agentsTerrain } from "@shared/schema/operations";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";

const logger = createLogger('AccountingPosting');

// ============================================================================
// ERRORS
// ============================================================================

/** Thrown when no accounting rule matches a mouvement — must be handled, never silenced */
export class AccountingRuleNotFoundError extends Error {
  public readonly sourceModule: string | null;
  public readonly typePaiement: string | null;
  public readonly methodePaiement: string | null;

  constructor(mouvement: MouvementFinancier) {
    super(
      `No accounting rule found for: sourceModule=${mouvement.sourceModule}, ` +
      `typePaiement=${mouvement.typePaiement}, methodePaiement=${mouvement.methodePaiement}`
    );
    this.name = "AccountingRuleNotFoundError";
    this.sourceModule = mouvement.sourceModule;
    this.typePaiement = mouvement.typePaiement;
    this.methodePaiement = mouvement.methodePaiement;
  }
}

/** Thrown when GL account referenced by a rule doesn't exist in plan comptable */
export class GlAccountNotFoundError extends Error {
  constructor(accountNumber: string, side: "debit" | "credit") {
    super(`GL account not found: ${accountNumber} (${side})`);
    this.name = "GlAccountNotFoundError";
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface PostFromMouvementRequest {
  mouvement: MouvementFinancier;
  agenceId: string;
  userId?: string;
  additionalMetadata?: Record<string, any>;
}

export interface ReverseEntryRequest {
  ecritureId: string;
  reason: string;
  userId?: string;
  agenceId: string;
}

export interface ReverseEntryResult {
  originalEcritureId: string;
  reversalEcritureId: string;
  numeroPiece: string;
}

export interface ClosePeriodRequest {
  agenceId: string;
  year: number;
  month: number;
  userId: string;
  notes?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the next piece number for a journal (concurrent-safe)
 */
async function getNextPieceNumber(
  tx: PgTransaction<any, any, any>,
  agenceId: string,
  journalCode: string,
  year: number
): Promise<string> {
  // Use raw SQL to call the database function for concurrent-safe sequence
  const result = await tx.execute(
    sql`SELECT get_next_piece_number(${agenceId}::uuid, ${journalCode}, ${year}) as piece_number`
  );

  const pieceNumber = (result.rows[0] as Record<string, unknown>)?.piece_number as string | undefined;
  if (!pieceNumber) {
    // Fallback: manual increment if function doesn't exist
    const [seq] = await tx
      .insert(glSequences)
      .values({
        agenceId,
        journalCode,
        year,
        lastNumber: 1,
      })
      .onConflictDoUpdate({
        target: [glSequences.agenceId, glSequences.journalCode, glSequences.year],
        set: {
          lastNumber: sql`${glSequences.lastNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const num = seq?.lastNumber || 1;
    return `${journalCode}-${year}-${String(num).padStart(6, "0")}`;
  }

  return pieceNumber;
}

/**
 * Get or create the current exercice (fiscal year)
 */
async function getOrCreateExercice(
  tx: PgTransaction<any, any, any>,
  agenceId: string,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const code = year.toString();

  // Try to find existing
  const [existing] = await tx
    .select()
    .from(exercices)
    .where(
      and(
        eq(exercices.code, code),
        or(eq(exercices.agenceId, agenceId), isNull(exercices.agenceId))
      )
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  // Create new exercice
  const [created] = await tx
    .insert(exercices)
    .values({
      code,
      dateDebut: `${year}-01-01`,
      dateFin: `${year}-12-31`,
      statut: "OPEN",
      description: `Exercice ${year}`,
      agenceId,
    })
    .returning();

  return created.id;
}

/**
 * Get or create the period for a date
 */
async function getOrCreatePeriod(
  tx: PgTransaction<any, any, any>,
  agenceId: string,
  date: Date,
  exerciceId: string
): Promise<{ periodId: string; isClosed: boolean }> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  // Month names in French
  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  // Calculate period dates
  const dateDebut = new Date(year, month - 1, 1);
  const dateFin = new Date(year, month, 0); // Last day of month

  // Try to find existing
  const [existing] = await tx
    .select()
    .from(glPeriods)
    .where(
      and(
        eq(glPeriods.agenceId, agenceId),
        eq(glPeriods.year, year),
        eq(glPeriods.month, month)
      )
    )
    .limit(1);

  if (existing) {
    const isClosed = existing.statut === PeriodStatus.CLOSED || existing.statut === PeriodStatus.LOCKED;
    return { periodId: existing.id, isClosed };
  }

  // Create new period
  const [created] = await tx
    .insert(glPeriods)
    .values({
      agenceId,
      exerciceId,
      year,
      month,
      name: `${monthNames[month - 1]} ${year}`,
      dateDebut: dateDebut.toISOString().split("T")[0],
      dateFin: dateFin.toISOString().split("T")[0],
      statut: PeriodStatus.OPEN,
    })
    .returning();

  return { periodId: created.id, isClosed: false };
}

/**
 * Check if a source has already been posted (idempotency)
 */
async function checkIdempotency(
  tx: PgTransaction<any, any, any>,
  agenceId: string,
  sourceType: string,
  sourceId: string
): Promise<string | null> {
  const [existing] = await tx
    .select({ ecritureId: glPostingLinks.ecritureId })
    .from(glPostingLinks)
    .where(
      and(
        eq(glPostingLinks.agenceId, agenceId),
        eq(glPostingLinks.sourceType, sourceType),
        eq(glPostingLinks.sourceId, sourceId)
      )
    )
    .limit(1);

  return existing?.ecritureId || null;
}

/**
 * Find matching accounting rule for a business event
 */
async function findMatchingRule(
  tx: PgTransaction<any, any, any>,
  agenceId: string,
  sourceType: string,
  eventType: string,
  paymentMethod?: string,
  provider?: string
): Promise<AccountingRule | null> {
  // Build conditions for rule matching
  // Rules are matched by: sourceType, eventType, paymentMethod (optional), provider (optional)
  // More specific rules (with paymentMethod/provider) have higher priority

  const rules = await tx
    .select()
    .from(accountingRules)
    .where(
      and(
        eq(accountingRules.active, true),
        eq(accountingRules.sourceType, sourceType),
        eq(accountingRules.eventType, eventType),
        or(isNull(accountingRules.agenceId), eq(accountingRules.agenceId, agenceId))
      )
    )
    .orderBy(asc(accountingRules.priority));

  // Filter rules by paymentMethod and provider
  for (const rule of rules) {
    // Check payment method match
    if (rule.paymentMethod && paymentMethod && rule.paymentMethod !== paymentMethod) {
      continue;
    }
    // Check provider match
    if (rule.provider && provider && rule.provider !== provider) {
      continue;
    }
    // If rule has specific paymentMethod/provider but we don't have it, skip
    if (rule.paymentMethod && !paymentMethod) {
      continue;
    }
    if (rule.provider && !provider) {
      continue;
    }

    return rule;
  }

  // If no specific match, try to find a rule without paymentMethod/provider constraints
  for (const rule of rules) {
    if (!rule.paymentMethod && !rule.provider) {
      return rule;
    }
  }

  return null;
}

/**
 * Get account ID by account number
 */
async function getAccountByNumber(
  tx: PgTransaction<any, any, any>,
  numeroCompte: string,
  agenceId?: string
): Promise<{ id: string; numeroCompte: string; intitule: string } | null> {
  const [account] = await tx
    .select({
      id: planComptable.id,
      numeroCompte: planComptable.numeroCompte,
      intitule: planComptable.intitule,
    })
    .from(planComptable)
    .where(
      and(
        eq(planComptable.numeroCompte, numeroCompte),
        eq(planComptable.actif, true),
        or(isNull(planComptable.agenceId), agenceId ? eq(planComptable.agenceId, agenceId) : sql`true`)
      )
    )
    .limit(1);

  return account || null;
}

/**
 * Get journal by code
 */
async function getJournalByCode(
  tx: PgTransaction<any, any, any>,
  journalCode: string,
  agenceId?: string
): Promise<{ id: string; code: string; intitule: string } | null> {
  const [journal] = await tx
    .select({
      id: journaux.id,
      code: journaux.code,
      intitule: journaux.intitule,
    })
    .from(journaux)
    .where(
      and(
        eq(journaux.code, journalCode),
        eq(journaux.actif, true),
        or(isNull(journaux.agenceId), agenceId ? eq(journaux.agenceId, agenceId) : sql`true`)
      )
    )
    .limit(1);

  return journal || null;
}

// ============================================================================
// TRANSACTIONAL GL POSTING (called from within executeWithLedger)
// ============================================================================

/**
 * Resolve generic GL account number (e.g. "573") to agent-specific sub-account
 * (e.g. "573BZV001") if the mouvement is agent-related.
 *
 * For non-agent operations, returns the original account number unchanged.
 */
async function resolveAgentGlAccount(
  tx: PgTransaction<any, any, any>,
  accountNumber: string,
  mouvement: MouvementFinancier,
): Promise<string> {
  // Only resolve the generic agent parent account
  if (accountNumber !== "573" || !mouvement.agentId) return accountNumber;

  const [agent] = await tx
    .select({ currentGlAccountId: agentsTerrain.currentGlAccountId })
    .from(agentsTerrain)
    .where(eq(agentsTerrain.id, mouvement.agentId))
    .limit(1);

  if (!agent?.currentGlAccountId) {
    logger.warn(
      { agentId: mouvement.agentId, mouvementId: mouvement.id },
      'Agent has no GL sub-account, falling back to generic 573',
    );
    return accountNumber;
  }

  const [glAccount] = await tx
    .select({ numeroCompte: planComptable.numeroCompte })
    .from(planComptable)
    .where(eq(planComptable.id, agent.currentGlAccountId))
    .limit(1);

  if (!glAccount) {
    logger.warn(
      { agentId: mouvement.agentId, glAccountId: agent.currentGlAccountId },
      'GL sub-account not found in planComptable, falling back to generic 573',
    );
    return accountNumber;
  }

  return glAccount.numeroCompte;
}

/**
 * Post a GL entry for a mouvement within an existing transaction.
 *
 * This is the preferred entry point for all automated GL posting from
 * business flows. It:
 * - Checks idempotency (returns null if already posted)
 * - Finds matching accounting rule (throws AccountingRuleNotFoundError if none)
 * - Resolves dynamic GL sub-accounts (e.g. agent-specific 573xxx)
 * - Creates ecriture + lines + gl_posting_links
 *
 * @throws AccountingRuleNotFoundError — no rule matches
 * @throws GlAccountNotFoundError — rule references a non-existent account
 * @throws Error — journal not found or period closed
 */
export async function postGlForMouvement(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  agenceId: string,
  userId?: string,
  additionalMetadata?: Record<string, any>
): Promise<PostEntryResult | null> {
  // 1. Idempotency check — already posted is OK (return null silently)
  const existingEcritureId = await checkIdempotency(tx, agenceId, "MOUVEMENT", mouvement.id);
  if (existingEcritureId) {
    logger.info({ mouvementId: mouvement.id }, 'Mouvement already posted');
    return null;
  }

  // 2. Find matching accounting rule — THROWS if none found
  // eventType can be provided in additionalMetadata, otherwise use typePaiement
  const eventType = additionalMetadata?.eventType || mouvement.typePaiement || "UNKNOWN";

  const rule = await findMatchingRule(
    tx,
    agenceId,
    "MOUVEMENT",
    eventType,
    mouvement.methodePaiement || undefined,
    additionalMetadata?.provider || undefined
  );

  if (!rule) {
    throw new AccountingRuleNotFoundError(mouvement);
  }

  // 3. Resolve dynamic GL sub-accounts (e.g. agent 573 → 573BZV001)
  const resolvedDebitNum = await resolveAgentGlAccount(tx, rule.debitAccount, mouvement);
  const resolvedCreditNum = await resolveAgentGlAccount(tx, rule.creditAccount, mouvement);

  // 4. Get accounts — THROWS if not found
  const debitAccount = await getAccountByNumber(tx, resolvedDebitNum, agenceId);
  if (!debitAccount) {
    throw new GlAccountNotFoundError(resolvedDebitNum, "debit");
  }
  const creditAccount = await getAccountByNumber(tx, resolvedCreditNum, agenceId);
  if (!creditAccount) {
    throw new GlAccountNotFoundError(resolvedCreditNum, "credit");
  }

  // 4. Get journal
  const journal = await getJournalByCode(tx, rule.journalCode, agenceId);
  if (!journal) {
    throw new Error(`Journal not found: ${rule.journalCode}`);
  }

  // 5. Build description from template
  const amount = parseFloat(mouvement.montant);
  if (!amount || amount <= 0 || isNaN(amount)) {
    logger.warn({ mouvementId: mouvement.id, montant: mouvement.montant }, 'Skipping GL posting: montant is 0 or invalid');
    return null;
  }

  let description = rule.descriptionTemplate || rule.name;
  description = description
    .replace("{clientName}", additionalMetadata?.clientName || "Client")
    .replace("{creditNumber}", additionalMetadata?.creditNumber || mouvement.creditId || "")
    .replace("{tontineName}", additionalMetadata?.tontineName || "Tontine")
    .replace("{reference}", mouvement.reference || "");

  // 6. Build entry lines (simple 2-line debit/credit)
  const lines: PostEntryLine[] = [
    {
      compteId: debitAccount.id,
      numeroCompte: debitAccount.numeroCompte,
      libelle: description,
      debit: amount,
      credit: 0,
      refExterne: mouvement.reference,
    },
    {
      compteId: creditAccount.id,
      numeroCompte: creditAccount.numeroCompte,
      libelle: description,
      debit: 0,
      credit: amount,
      refExterne: mouvement.reference,
    },
  ];

  // 7. Get or create exercice and period
  const entryDate = mouvement.dateOperation ? new Date(mouvement.dateOperation) : new Date();
  const exerciceId = await getOrCreateExercice(tx, agenceId, entryDate);
  const { periodId, isClosed } = await getOrCreatePeriod(tx, agenceId, entryDate, exerciceId);

  if (isClosed) {
    throw new Error(`Period is closed for date ${entryDate.toISOString().split("T")[0]}, cannot post mouvement ${mouvement.id}`);
  }

  const year = entryDate.getFullYear();
  const numeroPiece = await getNextPieceNumber(tx, agenceId, rule.journalCode, year);

  // 8. Build metadata
  const metadata = {
    ...additionalMetadata,
    mouvementReference: mouvement.reference,
    sourceModule: mouvement.sourceModule,
    typePaiement: mouvement.typePaiement,
    methodePaiement: mouvement.methodePaiement,
    clientId: mouvement.clientId,
    compteId: mouvement.compteId,
    creditId: mouvement.creditId,
    tontineId: mouvement.tontineId,
    ruleCode: rule.code,
    ruleName: rule.name,
  };

  // 9. Create ecriture
  const [ecriture] = await tx
    .insert(ecritures)
    .values({
      exerciceId,
      journalId: journal.id,
      dateEcriture: entryDate.toISOString().split("T")[0],
      numeroPiece,
      libelle: description,
      statut: EntryStatus.POSTED,
      sourceType: "MOUVEMENT",
      sourceId: mouvement.id,
      mouvementId: mouvement.id,
      metadata,
      agenceId,
      createdBy: userId,
      validatedBy: userId,
      validatedAt: new Date(),
    })
    .returning();

  // 10. Create lines
  for (const line of lines) {
    if (line.debit === 0 && line.credit === 0) continue;
    await tx.insert(lignesEcritures).values({
      ecritureId: ecriture.id,
      compteId: line.compteId,
      numeroCompte: line.numeroCompte,
      libelle: line.libelle,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      refExterne: line.refExterne,
    });
  }

  // 11. Create idempotency link (with new fields)
  await tx.insert(glPostingLinks).values({
    agenceId,
    sourceType: "MOUVEMENT",
    sourceId: mouvement.id,
    ecritureId: ecriture.id,
    mouvementId: mouvement.id,
    status: "POSTED",
    attempts: 1,
  });

  // 12. Update period stats
  await tx
    .update(glPeriods)
    .set({
      totalDebits: sql`${glPeriods.totalDebits} + ${amount}`,
      totalCredits: sql`${glPeriods.totalCredits} + ${amount}`,
      entryCount: sql`${glPeriods.entryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(glPeriods.id, periodId));

  logger.info({ mouvementId: mouvement.id, numeroPiece, ruleCode: rule.code }, 'GL posted mouvement');

  return {
    ecritureId: ecriture.id,
    numeroPiece,
    totalDebit: amount,
    totalCredit: amount,
    lineCount: 2,
  };
}

/**
 * Post a multi-line GL entry within an existing transaction.
 * Used for complex entries like payroll (multiple debit/credit lines).
 *
 * @throws Error — if entry is not balanced, journal not found, or period closed
 */
export async function postMultiLineEntry(
  tx: PgTransaction<any, any, any>,
  request: Omit<PostEntryRequest, "sourceType"> & { sourceType?: string }
): Promise<PostEntryResult> {
  const {
    agenceId, sourceId, journalCode, entryDate, description,
    lines, metadata, mouvementId, userId,
    sourceType = "MOUVEMENT",
  } = request;

  // 1. Idempotency check
  const existingEcritureId = await checkIdempotency(tx, agenceId, sourceType, sourceId);
  if (existingEcritureId) {
    const [existing] = await tx.select().from(ecritures).where(eq(ecritures.id, existingEcritureId)).limit(1);
    if (existing) {
      const existingLines = await tx.select().from(lignesEcritures).where(eq(lignesEcritures.ecritureId, existing.id));
      return {
        ecritureId: existing.id,
        numeroPiece: existing.numeroPiece,
        totalDebit: existingLines.reduce((s, l) => s + parseFloat(l.debit), 0),
        totalCredit: existingLines.reduce((s, l) => s + parseFloat(l.credit), 0),
        lineCount: existingLines.length,
      };
    }
  }

  // 2. Validate balance
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Entry is not balanced: debit=${totalDebit}, credit=${totalCredit}`);
  }

  // 3. Get journal
  const journal = await getJournalByCode(tx, journalCode, agenceId);
  if (!journal) {
    throw new Error(`Journal not found: ${journalCode}`);
  }

  // 4. Get exercice & period
  const exerciceId = await getOrCreateExercice(tx, agenceId, entryDate);
  const { periodId, isClosed } = await getOrCreatePeriod(tx, agenceId, entryDate, exerciceId);
  if (isClosed) {
    throw new Error(`Period is closed for date ${entryDate.toISOString().split("T")[0]}`);
  }

  const year = entryDate.getFullYear();
  const numeroPiece = await getNextPieceNumber(tx, agenceId, journalCode, year);

  // 5. Create ecriture
  const [ecriture] = await tx
    .insert(ecritures)
    .values({
      exerciceId,
      journalId: journal.id,
      dateEcriture: entryDate.toISOString().split("T")[0],
      numeroPiece,
      libelle: description,
      statut: EntryStatus.POSTED,
      sourceType,
      sourceId,
      mouvementId,
      metadata: metadata || {},
      agenceId,
      createdBy: userId,
      validatedBy: userId,
      validatedAt: new Date(),
    })
    .returning();

  // 6. Create lines
  for (const line of lines) {
    if (line.debit === 0 && line.credit === 0) continue;
    await tx.insert(lignesEcritures).values({
      ecritureId: ecriture.id,
      compteId: line.compteId,
      numeroCompte: line.numeroCompte,
      libelle: line.libelle,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      refExterne: line.refExterne,
    });
  }

  // 7. Idempotency link
  await tx.insert(glPostingLinks).values({
    agenceId,
    sourceType,
    sourceId,
    ecritureId: ecriture.id,
    mouvementId,
    status: "POSTED",
    attempts: 1,
  });

  // 8. Update period stats
  await tx
    .update(glPeriods)
    .set({
      totalDebits: sql`${glPeriods.totalDebits} + ${totalDebit}`,
      totalCredits: sql`${glPeriods.totalCredits} + ${totalCredit}`,
      entryCount: sql`${glPeriods.entryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(glPeriods.id, periodId));

  return { ecritureId: ecriture.id, numeroPiece, totalDebit, totalCredit, lineCount: lines.filter(l => l.debit !== 0 || l.credit !== 0).length };
}

// ============================================================================
// MAIN POSTING FUNCTIONS
// ============================================================================

/**
 * Post an accounting entry
 *
 * This is the core function that creates a GL entry with full validation:
 * - Idempotency check (no double-posting)
 * - Period validation (cannot post to closed period)
 * - Balance validation (debit = credit)
 * - Atomic transaction
 */
export async function postEntry(request: PostEntryRequest): Promise<PostEntryResult> {
  const result = await db.transaction(async (tx) => {
    const { agenceId, sourceType, sourceId, journalCode, entryDate, description, lines, metadata, mouvementId, userId } = request;

    // 1. Check idempotency
    const existingEcritureId = await checkIdempotency(tx, agenceId, sourceType, sourceId);
    if (existingEcritureId) {
      // Already posted, return existing entry info
      const [existing] = await tx
        .select()
        .from(ecritures)
        .where(eq(ecritures.id, existingEcritureId))
        .limit(1);

      if (existing) {
        const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
        const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
        return {
          ecritureId: existing.id,
          numeroPiece: existing.numeroPiece,
          totalDebit,
          totalCredit,
          lineCount: lines.length,
        };
      }
    }

    // 2. Filter zero-amount lines and validate balance
    const nonZeroLines = lines.filter(l => l.debit !== 0 || l.credit !== 0);
    if (nonZeroLines.length === 0) {
      throw new Error('All entry lines are zero — nothing to post');
    }

    const totalDebit = nonZeroLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = nonZeroLines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Entry is not balanced: Debit=${totalDebit}, Credit=${totalCredit}`);
    }

    // 3. Get journal
    const journal = await getJournalByCode(tx, journalCode, agenceId);
    if (!journal) {
      throw new Error(`Journal not found: ${journalCode}`);
    }

    // 4. Get or create exercice
    const exerciceId = await getOrCreateExercice(tx, agenceId, entryDate);

    // 5. Check period is open
    const { periodId, isClosed } = await getOrCreatePeriod(tx, agenceId, entryDate, exerciceId);
    if (isClosed) {
      throw new Error(`Period is closed for date: ${entryDate.toISOString().split("T")[0]}. Use reversal (extourne) instead.`);
    }

    // 6. Generate piece number
    const year = entryDate.getFullYear();
    const numeroPiece = await getNextPieceNumber(tx, agenceId, journalCode, year);

    // 7. Create ecriture (entry header)
    const [ecriture] = await tx
      .insert(ecritures)
      .values({
        exerciceId,
        journalId: journal.id,
        dateEcriture: entryDate.toISOString().split("T")[0],
        numeroPiece,
        libelle: description,
        statut: EntryStatus.POSTED,
        sourceType,
        sourceId,
        mouvementId,
        metadata: metadata || {},
        agenceId,
        createdBy: userId,
        validatedBy: userId,
        validatedAt: new Date(),
      })
      .returning();

    // 8. Create lignes (entry lines — already filtered for zero)
    for (const line of nonZeroLines) {
      await tx.insert(lignesEcritures).values({
        ecritureId: ecriture.id,
        compteId: line.compteId,
        numeroCompte: line.numeroCompte,
        libelle: line.libelle || description,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
        refExterne: line.refExterne,
      });
    }

    // 9. Create idempotency link
    await tx.insert(glPostingLinks).values({
      agenceId,
      sourceType,
      sourceId,
      ecritureId: ecriture.id,
    });

    // 10. Update period statistics
    await tx
      .update(glPeriods)
      .set({
        totalDebits: sql`${glPeriods.totalDebits} + ${totalDebit}`,
        totalCredits: sql`${glPeriods.totalCredits} + ${totalCredit}`,
        entryCount: sql`${glPeriods.entryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(glPeriods.id, periodId));

    logger.info({ numeroPiece, sourceType, sourceId }, 'Posted entry');

    return {
      ecritureId: ecriture.id,
      numeroPiece,
      totalDebit,
      totalCredit,
      lineCount: lines.length,
    };
  });

  // Emit WebSocket event after transaction commits
  try {
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "ACCOUNTING_UPDATE",
        payload: { type: 'gl_entry_posted', id: result.ecritureId, numeroPiece: result.numeroPiece },
      });
    }
  } catch {
    // Don't let WS failure break accounting flow
  }

  return result;
}

/**
 * Post an entry automatically from a mouvement financier.
 * Uses accounting rules to determine the correct accounts.
 *
 * This is the standalone version (creates its own transaction).
 * For use within an existing transaction, use postGlForMouvement() instead.
 *
 * @throws AccountingRuleNotFoundError — no rule matches the mouvement
 * @throws GlAccountNotFoundError — rule references a non-existent account
 */
export async function postFromMouvement(request: PostFromMouvementRequest): Promise<PostEntryResult | null> {
  const { mouvement, agenceId, userId, additionalMetadata } = request;

  const result = await db.transaction(async (tx) => {
    return postGlForMouvement(tx, mouvement, agenceId, userId, additionalMetadata);
  });

  // Emit WebSocket event after transaction commits (only if entry was actually posted)
  if (result) {
    try {
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "ACCOUNTING_UPDATE",
          payload: { type: 'gl_entry_posted', id: result.ecritureId, numeroPiece: result.numeroPiece },
        });
      }
    } catch {
      // Don't let WS failure break accounting flow
    }
  }

  return result;
}

/**
 * Reverse (extourne) an existing entry
 * Creates a new entry that cancels out the original
 */
export async function reverseEntry(request: ReverseEntryRequest): Promise<ReverseEntryResult> {
  const { ecritureId, reason, userId, agenceId } = request;

  return await db.transaction(async (tx) => {
    // 1. Get the original entry
    const [original] = await tx
      .select()
      .from(ecritures)
      .where(eq(ecritures.id, ecritureId))
      .limit(1);

    if (!original) {
      throw new Error(`Entry not found: ${ecritureId}`);
    }

    if (original.statut === EntryStatus.REVERSED) {
      throw new Error(`Entry already reversed: ${ecritureId}`);
    }

    // 2. Get original lines
    const originalLines = await tx
      .select()
      .from(lignesEcritures)
      .where(eq(lignesEcritures.ecritureId, ecritureId));

    if (originalLines.length === 0) {
      throw new Error(`No lines found for entry: ${ecritureId}`);
    }

    // 3. Get exercice and period for reversal date (today)
    const reversalDate = new Date();
    const exerciceId = await getOrCreateExercice(tx, agenceId, reversalDate);
    const { periodId, isClosed } = await getOrCreatePeriod(tx, agenceId, reversalDate, exerciceId);

    if (isClosed) {
      throw new Error(`Current period is closed. Cannot create reversal.`);
    }

    // 4. Generate piece number for reversal (use OD journal for reversals)
    const year = reversalDate.getFullYear();
    const numeroPiece = await getNextPieceNumber(tx, agenceId, "OD", year);

    // 5. Get OD journal
    const journal = await getJournalByCode(tx, "OD", agenceId);
    if (!journal) {
      throw new Error("OD (Opérations Diverses) journal not found");
    }

    // 6. Create reversal entry
    const [reversal] = await tx
      .insert(ecritures)
      .values({
        exerciceId,
        journalId: journal.id,
        dateEcriture: reversalDate.toISOString().split("T")[0],
        numeroPiece,
        libelle: `EXTOURNE: ${original.libelle}`,
        statut: EntryStatus.POSTED,
        reversalOfId: ecritureId,
        reversalReason: reason,
        sourceType: "REVERSAL",
        sourceId: ecritureId,
        metadata: {
          originalPiece: original.numeroPiece,
          originalDate: original.dateEcriture,
          reversalReason: reason,
        },
        agenceId,
        createdBy: userId,
        validatedBy: userId,
        validatedAt: new Date(),
      })
      .returning();

    // 7. Create reversed lines (swap debit/credit)
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of originalLines) {
      const debit = parseFloat(line.credit); // Swap: original credit becomes debit
      const credit = parseFloat(line.debit); // Swap: original debit becomes credit

      totalDebit += debit;
      totalCredit += credit;

      await tx.insert(lignesEcritures).values({
        ecritureId: reversal.id,
        compteId: line.compteId,
        numeroCompte: line.numeroCompte,
        libelle: `EXTOURNE: ${line.libelle || ""}`,
        debit: debit.toString(),
        credit: credit.toString(),
        refExterne: `REV-${line.refExterne || ""}`,
      });
    }

    // 8. Mark original as reversed
    await tx
      .update(ecritures)
      .set({
        statut: EntryStatus.REVERSED,
        reversedById: reversal.id,
      })
      .where(eq(ecritures.id, ecritureId));

    // 9. Update period stats
    await tx
      .update(glPeriods)
      .set({
        totalDebits: sql`${glPeriods.totalDebits} + ${totalDebit}`,
        totalCredits: sql`${glPeriods.totalCredits} + ${totalCredit}`,
        entryCount: sql`${glPeriods.entryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(glPeriods.id, periodId));

    logger.info({ originalNumeroPiece: original.numeroPiece, reversalNumeroPiece: numeroPiece }, 'Reversed entry');

    return {
      originalEcritureId: ecritureId,
      reversalEcritureId: reversal.id,
      numeroPiece,
    };
  });
}

/**
 * Close a period
 */
export async function closePeriod(request: ClosePeriodRequest): Promise<void> {
  const { agenceId, year, month, userId, notes } = request;

  await db.transaction(async (tx) => {
    // 1. Get the period
    const [period] = await tx
      .select()
      .from(glPeriods)
      .where(
        and(
          eq(glPeriods.agenceId, agenceId),
          eq(glPeriods.year, year),
          eq(glPeriods.month, month)
        )
      )
      .for("update")
      .limit(1);

    if (!period) {
      throw new Error(`Period not found: ${month}/${year}`);
    }

    if (period.statut === PeriodStatus.CLOSED || period.statut === PeriodStatus.LOCKED) {
      throw new Error(`Period already closed: ${month}/${year}`);
    }

    // 2. Calculate final totals
    const totals = await tx
      .select({
        totalDebit: sql<string>`COALESCE(SUM(${lignesEcritures.debit}), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${lignesEcritures.credit}), 0)`,
        count: sql<number>`COUNT(DISTINCT ${ecritures.id})`,
      })
      .from(lignesEcritures)
      .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
      .where(
        and(
          eq(ecritures.agenceId, agenceId),
          eq(ecritures.statut, EntryStatus.POSTED),
          gte(ecritures.dateEcriture, period.dateDebut),
          lte(ecritures.dateEcriture, period.dateFin)
        )
      );

    const totalDebit = parseFloat(totals[0]?.totalDebit || "0");
    const totalCredit = parseFloat(totals[0]?.totalCredit || "0");
    const entryCount = totals[0]?.count || 0;

    // 3. Close the period
    await tx
      .update(glPeriods)
      .set({
        statut: PeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
        closureNotes: notes,
        totalDebits: totalDebit.toString(),
        totalCredits: totalCredit.toString(),
        entryCount,
        updatedAt: new Date(),
      })
      .where(eq(glPeriods.id, period.id));

    logger.info({ month, year, entryCount }, 'Closed period');
  });
}

// ============================================================================
// GRAND LIVRE (General Ledger) QUERIES
// ============================================================================

/**
 * Get Grand Livre for an account with running balance
 */
export async function getGrandLivre(
  compteId: string,
  agenceId: string,
  dateDebut: string,
  dateFin: string,
  page: number = 1,
  pageSize: number = 50
): Promise<GrandLivreResponse> {
  // 1. Get account info
  const [compte] = await db
    .select()
    .from(planComptable)
    .where(eq(planComptable.id, compteId))
    .limit(1);

  if (!compte) {
    throw new Error(`Account not found: ${compteId}`);
  }

  // 2. Get opening balance (sum of all entries before dateDebut)
  const openingResult = await db
    .select({
      totalDebit: sql<string>`COALESCE(SUM(${lignesEcritures.debit}), 0)`,
      totalCredit: sql<string>`COALESCE(SUM(${lignesEcritures.credit}), 0)`,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .where(
      and(
        eq(lignesEcritures.compteId, compteId),
        eq(ecritures.statut, EntryStatus.POSTED),
        sql`${ecritures.dateEcriture} < ${dateDebut}`,
        or(eq(ecritures.agenceId, agenceId), isNull(ecritures.agenceId))
      )
    );

  const openingDebit = parseFloat(openingResult[0]?.totalDebit || "0");
  const openingCredit = parseFloat(openingResult[0]?.totalCredit || "0");
  const soldeOuverture = openingDebit - openingCredit;

  // 3. Get total count for pagination
  const countResult = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .where(
      and(
        eq(lignesEcritures.compteId, compteId),
        eq(ecritures.statut, EntryStatus.POSTED),
        gte(ecritures.dateEcriture, dateDebut),
        lte(ecritures.dateEcriture, dateFin),
        or(eq(ecritures.agenceId, agenceId), isNull(ecritures.agenceId))
      )
    );

  const total = countResult[0]?.count || 0;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;

  // 4. Get entries with running balance using window function
  const entries = await db
    .select({
      id: lignesEcritures.id,
      dateEcriture: ecritures.dateEcriture,
      numeroPiece: ecritures.numeroPiece,
      journalCode: journaux.code,
      journalIntitule: journaux.intitule,
      ecritureLibelle: ecritures.libelle,
      ligneLibelle: lignesEcritures.libelle,
      debit: lignesEcritures.debit,
      credit: lignesEcritures.credit,
      sourceType: ecritures.sourceType,
      sourceId: ecritures.sourceId,
      refExterne: lignesEcritures.refExterne,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .innerJoin(journaux, eq(ecritures.journalId, journaux.id))
    .where(
      and(
        eq(lignesEcritures.compteId, compteId),
        eq(ecritures.statut, EntryStatus.POSTED),
        gte(ecritures.dateEcriture, dateDebut),
        lte(ecritures.dateEcriture, dateFin),
        or(eq(ecritures.agenceId, agenceId), isNull(ecritures.agenceId))
      )
    )
    .orderBy(asc(ecritures.dateEcriture), asc(ecritures.numeroPiece))
    .limit(pageSize)
    .offset(offset);

  // 5. Calculate running balance and totals
  let runningBalance = soldeOuverture;
  let totalDebits = 0;
  let totalCredits = 0;

  const formattedEntries: GrandLivreEntry[] = entries.map((entry) => {
    const debit = parseFloat(entry.debit);
    const credit = parseFloat(entry.credit);

    totalDebits += debit;
    totalCredits += credit;
    runningBalance += debit - credit;

    return {
      id: entry.id,
      dateEcriture: entry.dateEcriture,
      numeroPiece: entry.numeroPiece,
      journalCode: entry.journalCode,
      journalIntitule: entry.journalIntitule,
      ecritureLibelle: entry.ecritureLibelle,
      ligneLibelle: entry.ligneLibelle || "",
      debit,
      credit,
      soldeProgressif: runningBalance,
      sourceType: entry.sourceType || undefined,
      sourceId: entry.sourceId || undefined,
      refExterne: entry.refExterne || undefined,
    };
  });

  return {
    compteId: compte.id,
    numeroCompte: compte.numeroCompte,
    intitule: compte.intitule,
    classe: compte.classe,
    typeCompte: compte.typeCompte,
    sensNormal: compte.sensNormal || "",
    soldeOuverture,
    totalDebits,
    totalCredits,
    soldeFinal: soldeOuverture + totalDebits - totalCredits,
    entries: formattedEntries,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Get Balance Générale (Trial Balance)
 */
export async function getBalance(
  agenceId: string,
  dateDebut: string,
  dateFin: string,
  classeFilter?: number
): Promise<BalanceResponse> {
  // Build conditions
  const conditions = [
    eq(ecritures.statut, EntryStatus.POSTED),
    gte(ecritures.dateEcriture, dateDebut),
    lte(ecritures.dateEcriture, dateFin),
    or(eq(ecritures.agenceId, agenceId), isNull(ecritures.agenceId)),
  ];

  if (classeFilter) {
    conditions.push(eq(planComptable.classe, classeFilter));
  }

  // Query with aggregation
  const results = await db
    .select({
      compteId: planComptable.id,
      numeroCompte: planComptable.numeroCompte,
      intitule: planComptable.intitule,
      classe: planComptable.classe,
      typeCompte: planComptable.typeCompte,
      sensNormal: planComptable.sensNormal,
      totalDebit: sql<string>`COALESCE(SUM(${lignesEcritures.debit}), 0)`,
      totalCredit: sql<string>`COALESCE(SUM(${lignesEcritures.credit}), 0)`,
    })
    .from(planComptable)
    .leftJoin(lignesEcritures, eq(planComptable.id, lignesEcritures.compteId))
    .leftJoin(ecritures, and(
      eq(lignesEcritures.ecritureId, ecritures.id),
      ...conditions
    ))
    .where(eq(planComptable.actif, true))
    .groupBy(
      planComptable.id,
      planComptable.numeroCompte,
      planComptable.intitule,
      planComptable.classe,
      planComptable.typeCompte,
      planComptable.sensNormal
    )
    .orderBy(asc(planComptable.numeroCompte));

  // Format entries and calculate totals
  let totalDebits = 0;
  let totalCredits = 0;
  let totalSoldeDebiteur = 0;
  let totalSoldeCrediteur = 0;

  const entries: BalanceEntry[] = results
    .filter(r => parseFloat(r.totalDebit) !== 0 || parseFloat(r.totalCredit) !== 0)
    .map((r) => {
      const debit = parseFloat(r.totalDebit);
      const credit = parseFloat(r.totalCredit);
      const soldeDebiteur = debit > credit ? debit - credit : 0;
      const soldeCrediteur = credit > debit ? credit - debit : 0;

      totalDebits += debit;
      totalCredits += credit;
      totalSoldeDebiteur += soldeDebiteur;
      totalSoldeCrediteur += soldeCrediteur;

      return {
        compteId: r.compteId,
        numeroCompte: r.numeroCompte,
        intitule: r.intitule,
        classe: r.classe,
        typeCompte: r.typeCompte,
        sensNormal: r.sensNormal || "",
        totalDebit: debit,
        totalCredit: credit,
        soldeDebiteur,
        soldeCrediteur,
      };
    });

  return {
    entries,
    totals: {
      totalDebits,
      totalCredits,
      totalSoldeDebiteur,
      totalSoldeCrediteur,
      isBalanced: Math.abs(totalSoldeDebiteur - totalSoldeCrediteur) < 0.01,
    },
    dateDebut,
    dateFin,
  };
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  postEntry,
  postFromMouvement,
  postGlForMouvement,
  postMultiLineEntry,
  reverseEntry,
  closePeriod,
  getGrandLivre,
  getBalance,
};
