/**
 * Exercice Cloture Service — Fiscal Year Closing Workflow
 *
 * 5-step sequential process:
 * 1. CLOSE_PERIODS — Close all open monthly periods
 * 2. CALC_PROVISIONS — Final provision calculation
 * 3. GENERATE_RESULT — Determine net result, zero P&L accounts to compte 13
 * 4. GENERATE_RAN — Report à Nouveau (opening balances for N+1)
 * 5. LOCK — Lock all periods, close exercice
 */

import { db } from "../db";
import { eq, and, sql, or, isNull, asc } from "drizzle-orm";
import {
  exercices,
  exerciceClotureSteps,
  glPeriods,
  ecritures,
  lignesEcritures,
  planComptable,
  PeriodStatus,
  EntryStatus,
  ClotureStep,
  ClotureStepStatus,
  type PostEntryLine,
} from "@shared/schema";
import { closePeriod, postMultiLineEntry } from "./accounting-posting-service";
import { calculateProvisions } from "./provision-service";
import { createLogger } from "../lib/logger";
import { D, roundMoney, isEffectivelyZero } from "../lib/money";

const logger = createLogger('ExerciceCloture');

// ============================================================================
// TYPES
// ============================================================================

export interface ClotureResult {
  exerciceId: string;
  success: boolean;
  steps: { step: string; statut: string; duration?: number; error?: string }[];
  resultatNet?: number;
}

export interface ClotureStatus {
  exerciceId: string;
  exerciceCode: string;
  exerciceStatut: string;
  steps: {
    step: string;
    statut: string;
    startedAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
    details: unknown;
  }[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Execute full closing workflow for an exercice.
 */
export async function clotureExercice(
  exerciceId: string,
  agenceId: string,
  userId: string,
): Promise<ClotureResult> {
  logger.info({ exerciceId, agenceId }, 'Starting exercice closing');

  // 1. Validate exercice
  const [exercice] = await db
    .select()
    .from(exercices)
    .where(eq(exercices.id, exerciceId))
    .limit(1);

  if (!exercice) throw new Error(`Exercice ${exerciceId} non trouvé`);
  if (exercice.statut === 'CLOSED') throw new Error(`Exercice ${exercice.code} déjà clôturé`);

  // Set exercice to CLOSING
  await db.update(exercices).set({ statut: 'CLOSING' }).where(eq(exercices.id, exerciceId));

  // Initialize steps
  const allSteps = [
    ClotureStep.CLOSE_PERIODS,
    ClotureStep.CALC_PROVISIONS,
    ClotureStep.GENERATE_RESULT,
    ClotureStep.GENERATE_RAN,
    ClotureStep.LOCK,
  ];

  for (const step of allSteps) {
    await db.insert(exerciceClotureSteps).values({
      exerciceId,
      agenceId,
      step,
      statut: ClotureStepStatus.PENDING,
      createdBy: userId,
    }).onConflictDoNothing();
  }

  const stepResults: { step: string; statut: string; duration?: number; error?: string }[] = [];
  let resultatNet: number | undefined;

  // Execute steps sequentially
  for (const step of allSteps) {
    const startTime = Date.now();

    try {
      await updateStepStatus(exerciceId, step, ClotureStepStatus.RUNNING);

      switch (step) {
        case ClotureStep.CLOSE_PERIODS:
          await stepClosePeriods(exerciceId, agenceId, userId);
          break;
        case ClotureStep.CALC_PROVISIONS:
          await stepCalcProvisions(exerciceId, agenceId, exercice.dateFin, userId);
          break;
        case ClotureStep.GENERATE_RESULT:
          resultatNet = await stepGenerateResult(exerciceId, agenceId, exercice.dateFin, userId);
          break;
        case ClotureStep.GENERATE_RAN:
          await stepGenerateRAN(exerciceId, agenceId, exercice, userId);
          break;
        case ClotureStep.LOCK:
          await stepLock(exerciceId, agenceId);
          break;
      }

      const duration = Date.now() - startTime;
      await updateStepStatus(exerciceId, step, ClotureStepStatus.DONE, { duration });
      stepResults.push({ step, statut: 'DONE', duration });
      logger.info({ step, duration }, 'Cloture step completed');
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await updateStepStatus(exerciceId, step, ClotureStepStatus.ERROR, undefined, errorMsg);
      stepResults.push({ step, statut: 'ERROR', duration, error: errorMsg });
      logger.error({ step, err: error }, 'Cloture step failed');

      // Stop on error — don't proceed to next step
      return { exerciceId, success: false, steps: stepResults };
    }
  }

  logger.info({ exerciceId, resultatNet }, 'Exercice closing completed');
  return { exerciceId, success: true, steps: stepResults, resultatNet };
}

/**
 * Execute a single closing step (for retry after error).
 */
export async function executeClotureStep(
  exerciceId: string,
  agenceId: string,
  step: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const [exercice] = await db.select().from(exercices).where(eq(exercices.id, exerciceId)).limit(1);
  if (!exercice) throw new Error(`Exercice ${exerciceId} non trouvé`);

  try {
    await updateStepStatus(exerciceId, step, ClotureStepStatus.RUNNING);

    switch (step) {
      case ClotureStep.CLOSE_PERIODS:
        await stepClosePeriods(exerciceId, agenceId, userId);
        break;
      case ClotureStep.CALC_PROVISIONS:
        await stepCalcProvisions(exerciceId, agenceId, exercice.dateFin, userId);
        break;
      case ClotureStep.GENERATE_RESULT:
        await stepGenerateResult(exerciceId, agenceId, exercice.dateFin, userId);
        break;
      case ClotureStep.GENERATE_RAN:
        await stepGenerateRAN(exerciceId, agenceId, exercice, userId);
        break;
      case ClotureStep.LOCK:
        await stepLock(exerciceId, agenceId);
        break;
      default:
        throw new Error(`Étape inconnue: ${step}`);
    }

    await updateStepStatus(exerciceId, step, ClotureStepStatus.DONE);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await updateStepStatus(exerciceId, step, ClotureStepStatus.ERROR, undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get closing status for an exercice.
 */
export async function getClotureStatus(exerciceId: string): Promise<ClotureStatus> {
  const [exercice] = await db.select().from(exercices).where(eq(exercices.id, exerciceId)).limit(1);
  if (!exercice) throw new Error(`Exercice ${exerciceId} non trouvé`);

  const steps = await db
    .select()
    .from(exerciceClotureSteps)
    .where(eq(exerciceClotureSteps.exerciceId, exerciceId))
    .orderBy(asc(exerciceClotureSteps.createdAt));

  return {
    exerciceId,
    exerciceCode: exercice.code,
    exerciceStatut: exercice.statut || 'OPEN',
    steps: steps.map(s => ({
      step: s.step,
      statut: s.statut,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      errorMessage: s.errorMessage,
      details: s.details,
    })),
  };
}

// ============================================================================
// STEP IMPLEMENTATIONS
// ============================================================================

/**
 * Step 1: Close all open periods for the exercice.
 */
async function stepClosePeriods(exerciceId: string, agenceId: string, userId: string): Promise<void> {
  const openPeriods = await db
    .select()
    .from(glPeriods)
    .where(
      and(
        eq(glPeriods.exerciceId, exerciceId),
        eq(glPeriods.agenceId, agenceId),
        eq(glPeriods.statut, PeriodStatus.OPEN),
      )
    )
    .orderBy(asc(glPeriods.year), asc(glPeriods.month));

  for (const period of openPeriods) {
    await closePeriod({
      agenceId,
      year: period.year,
      month: period.month,
      userId,
      notes: `Clôture automatique - fermeture exercice ${exerciceId}`,
    });
  }

  logger.info({ periodsCount: openPeriods.length }, 'All periods closed');
}

/**
 * Step 2: Calculate final provisions.
 */
async function stepCalcProvisions(
  exerciceId: string,
  agenceId: string,
  dateFin: string,
  userId: string,
): Promise<void> {
  const periodeDate = new Date(dateFin);
  const result = await calculateProvisions(agenceId, periodeDate, userId);
  logger.info({
    creditsTraites: result.creditsTraites,
    dotations: result.totalDotations,
    reprises: result.totalReprises,
  }, 'Final provisions calculated');
}

/**
 * Step 3: Determine net result and transfer P&L to account 13.
 * Creates a multi-line entry that zeros all class 6/7 accounts,
 * with the net result going to account 13 (Résultat net).
 */
async function stepGenerateResult(
  exerciceId: string,
  agenceId: string,
  dateFin: string,
  userId: string,
): Promise<number> {
  // Get all class 6 & 7 account balances for this exercice
  const accountBalances = await db.execute(sql`
    SELECT
      pc.id AS compte_id,
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      pc.sens_normal,
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM plan_comptable pc
    LEFT JOIN lignes_ecritures le ON le.compte_id = pc.id
    LEFT JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
      AND ec.exercice_id = ${exerciceId}
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
    WHERE pc.classe IN (6, 7)
      AND pc.actif = true
      AND (pc.agence_id = ${agenceId} OR pc.agence_id IS NULL)
    GROUP BY pc.id, pc.numero_compte, pc.intitule, pc.classe, pc.sens_normal
    HAVING COALESCE(SUM(le.debit::numeric), 0) != 0 OR COALESCE(SUM(le.credit::numeric), 0) != 0
    ORDER BY pc.numero_compte
  `);

  const rows = accountBalances.rows as Array<{
    compte_id: string;
    numero_compte: string;
    intitule: string;
    classe: number;
    sens_normal: string;
    total_debit: string;
    total_credit: string;
  }>;

  if (rows.length === 0) {
    logger.info('No P&L accounts with balances — nothing to close');
    return 0;
  }

  // Get account 13 (Résultat net)
  const [compte13] = await db
    .select({ id: planComptable.id, numeroCompte: planComptable.numeroCompte })
    .from(planComptable)
    .where(
      and(
        eq(planComptable.numeroCompte, '13'),
        or(eq(planComptable.agenceId, agenceId), isNull(planComptable.agenceId)),
      )
    )
    .limit(1);

  if (!compte13) throw new Error('Compte 13 (Résultat net) non trouvé dans le plan comptable');

  // Build closing lines: reverse each account's balance
  const lines: PostEntryLine[] = [];
  let totalCharges = D(0); // debit - credit for class 6
  let totalProduits = D(0); // credit - debit for class 7

  for (const row of rows) {
    const debit = D(row.total_debit);
    const credit = D(row.total_credit);
    const solde = debit.minus(credit);

    if (isEffectivelyZero(solde)) continue;

    if (row.classe === 6) {
      totalCharges = totalCharges.plus(solde); // positive = charge
    } else {
      totalProduits = totalProduits.plus(credit.minus(debit)); // positive = produit
    }

    // Reverse the account: if debit-heavy → credit it, and vice versa
    lines.push({
      compteId: row.compte_id,
      numeroCompte: row.numero_compte,
      libelle: `Clôture ${row.intitule}`,
      debit: solde.lt(0) ? parseFloat(roundMoney(solde.abs())) : 0,
      credit: solde.gt(0) ? parseFloat(roundMoney(solde)) : 0,
    });
  }

  // Net result = Produits - Charges
  const resultatNet = totalProduits.minus(totalCharges);
  const resultatNetNum = parseFloat(roundMoney(resultatNet.abs()));

  if (resultatNetNum > 0.01) {
    // Counterpart on account 13
    if (resultatNet.gt(0)) {
      // Bénéfice → credit compte 13
      lines.push({
        compteId: compte13.id,
        numeroCompte: '13',
        libelle: `Résultat net de l'exercice (bénéfice)`,
        debit: 0,
        credit: resultatNetNum,
      });
    } else {
      // Perte → debit compte 13
      lines.push({
        compteId: compte13.id,
        numeroCompte: '13',
        libelle: `Résultat net de l'exercice (perte)`,
        debit: resultatNetNum,
        credit: 0,
      });
    }
  }

  // Post the closing entry
  if (lines.length > 0) {
    await db.transaction(async (tx) => {
      await postMultiLineEntry(tx, {
        agenceId,
        sourceType: "CLOTURE",
        sourceId: `CLOTURE-${exerciceId}`,
        journalCode: "OD",
        entryDate: new Date(dateFin),
        description: `Détermination du résultat - Exercice ${exerciceId}`,
        lines,
        metadata: {
          exerciceId,
          resultatNet: parseFloat(roundMoney(resultatNet)),
          type: 'DETERMINATION_RESULTAT',
        },
        userId,
      });
    });
  }

  const result = parseFloat(roundMoney(resultatNet));
  logger.info({
    totalCharges: parseFloat(roundMoney(totalCharges)),
    totalProduits: parseFloat(roundMoney(totalProduits)),
    resultatNet: result,
    accountsClosed: lines.length - 1,
  }, 'Result determined');

  return result;
}

/**
 * Step 4: Generate Report à Nouveau (opening balances for N+1).
 * - Transfer balance sheet accounts (class 1-5) to next exercice
 * - Transfer account 13 to account 12
 */
async function stepGenerateRAN(
  exerciceId: string,
  agenceId: string,
  exercice: { code: string; dateFin: string },
  userId: string,
): Promise<void> {
  const nextYear = parseInt(exercice.code) + 1;

  // Get or create next exercice
  let [nextExercice] = await db
    .select()
    .from(exercices)
    .where(
      and(
        eq(exercices.code, nextYear.toString()),
        or(eq(exercices.agenceId, agenceId), isNull(exercices.agenceId)),
      )
    )
    .limit(1);

  if (!nextExercice) {
    [nextExercice] = await db
      .insert(exercices)
      .values({
        code: nextYear.toString(),
        dateDebut: `${nextYear}-01-01`,
        dateFin: `${nextYear}-12-31`,
        statut: "OPEN",
        description: `Exercice ${nextYear}`,
        agenceId,
      })
      .returning();
  }

  // 1. Transfer account 13 → account 12
  const [compte12] = await db
    .select({ id: planComptable.id })
    .from(planComptable)
    .where(
      and(
        eq(planComptable.numeroCompte, '12'),
        or(eq(planComptable.agenceId, agenceId), isNull(planComptable.agenceId)),
      )
    )
    .limit(1);

  const [compte13] = await db
    .select({ id: planComptable.id })
    .from(planComptable)
    .where(
      and(
        eq(planComptable.numeroCompte, '13'),
        or(eq(planComptable.agenceId, agenceId), isNull(planComptable.agenceId)),
      )
    )
    .limit(1);

  if (compte12 && compte13) {
    // Get balance of account 13
    const [bal13] = await db.execute(sql`
      SELECT
        COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
        COALESCE(SUM(le.credit::numeric), 0) AS total_credit
      FROM lignes_ecritures le
      JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
      WHERE le.numero_compte = '13'
        AND ec.exercice_id = ${exerciceId}
        AND ec.agence_id = ${agenceId}
        AND ec.statut = 'POSTED'
    `).then(r => r.rows as Array<{ total_debit: string; total_credit: string }>);

    const solde13 = D(bal13?.total_credit || '0').minus(D(bal13?.total_debit || '0'));

    if (!isEffectivelyZero(solde13)) {
      const amount = parseFloat(roundMoney(solde13.abs()));
      const transferLines: PostEntryLine[] = [];

      if (solde13.gt(0)) {
        // Bénéfice: D13 / C12
        transferLines.push(
          { compteId: compte13.id, numeroCompte: '13', libelle: 'Affectation résultat', debit: amount, credit: 0 },
          { compteId: compte12.id, numeroCompte: '12', libelle: 'Report à nouveau (bénéfice)', debit: 0, credit: amount },
        );
      } else {
        // Perte: D12 / C13
        transferLines.push(
          { compteId: compte12.id, numeroCompte: '12', libelle: 'Report à nouveau (perte)', debit: amount, credit: 0 },
          { compteId: compte13.id, numeroCompte: '13', libelle: 'Affectation résultat', debit: 0, credit: amount },
        );
      }

      await db.transaction(async (tx) => {
        await postMultiLineEntry(tx, {
          agenceId,
          sourceType: "RAN",
          sourceId: `RAN-13-${exerciceId}`,
          journalCode: "AN",
          entryDate: new Date(`${nextYear}-01-01`),
          description: `Affectation résultat exercice ${exercice.code}`,
          lines: transferLines,
          metadata: { exerciceId, type: 'AFFECTATION_RESULTAT' },
          userId,
        });
      });
    }
  }

  // 2. Generate opening balances for all class 1-5 accounts
  const balanceSheetAccounts = await db.execute(sql`
    SELECT
      pc.id AS compte_id,
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM plan_comptable pc
    LEFT JOIN lignes_ecritures le ON le.compte_id = pc.id
    LEFT JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
      AND ec.date_ecriture <= ${exercice.dateFin}
    WHERE pc.classe IN (1, 2, 3, 4, 5)
      AND pc.actif = true
      AND pc.numero_compte NOT IN ('12', '13')
      AND (pc.agence_id = ${agenceId} OR pc.agence_id IS NULL)
    GROUP BY pc.id, pc.numero_compte, pc.intitule, pc.classe
    HAVING ABS(COALESCE(SUM(le.debit::numeric), 0) - COALESCE(SUM(le.credit::numeric), 0)) > 0.01
    ORDER BY pc.numero_compte
  `);

  const bsRows = balanceSheetAccounts.rows as Array<{
    compte_id: string;
    numero_compte: string;
    intitule: string;
    classe: number;
    total_debit: string;
    total_credit: string;
  }>;

  if (bsRows.length > 0) {
    const openingLines: PostEntryLine[] = [];

    for (const row of bsRows) {
      const solde = D(row.total_debit).minus(D(row.total_credit));
      if (isEffectivelyZero(solde)) continue;

      openingLines.push({
        compteId: row.compte_id,
        numeroCompte: row.numero_compte,
        libelle: `À-nouveau ${row.intitule}`,
        debit: solde.gt(0) ? parseFloat(roundMoney(solde)) : 0,
        credit: solde.lt(0) ? parseFloat(roundMoney(solde.abs())) : 0,
      });
    }

    // Balance the entry — any imbalance goes to account 12
    if (openingLines.length > 0 && compte12) {
      const totalDebit = openingLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = openingLines.reduce((s, l) => s + l.credit, 0);
      const diff = totalDebit - totalCredit;

      if (Math.abs(diff) > 0.01) {
        openingLines.push({
          compteId: compte12.id,
          numeroCompte: '12',
          libelle: 'Report à nouveau (équilibrage)',
          debit: diff < 0 ? Math.abs(diff) : 0,
          credit: diff > 0 ? diff : 0,
        });
      }

      await db.transaction(async (tx) => {
        await postMultiLineEntry(tx, {
          agenceId,
          sourceType: "RAN",
          sourceId: `RAN-BS-${exerciceId}`,
          journalCode: "AN",
          entryDate: new Date(`${nextYear}-01-01`),
          description: `À-nouveaux bilan exercice ${exercice.code}`,
          lines: openingLines,
          metadata: { exerciceId, type: 'A_NOUVEAUX_BILAN', accountCount: openingLines.length },
          userId,
        });
      });
    }
  }

  logger.info({ nextYear, balanceSheetAccounts: bsRows.length }, 'RAN generated');
}

/**
 * Step 5: Lock all periods and close exercice.
 */
async function stepLock(exerciceId: string, agenceId: string): Promise<void> {
  // Lock all periods
  await db
    .update(glPeriods)
    .set({ statut: PeriodStatus.LOCKED, updatedAt: new Date() })
    .where(
      and(
        eq(glPeriods.exerciceId, exerciceId),
        eq(glPeriods.agenceId, agenceId),
      )
    );

  // Close exercice
  await db
    .update(exercices)
    .set({ statut: 'CLOSED' })
    .where(eq(exercices.id, exerciceId));

  logger.info({ exerciceId }, 'Exercice locked and closed');
}

// ============================================================================
// HELPERS
// ============================================================================

async function updateStepStatus(
  exerciceId: string,
  step: string,
  statut: string,
  details?: Record<string, unknown>,
  errorMessage?: string,
): Promise<void> {
  await db
    .update(exerciceClotureSteps)
    .set({
      statut,
      ...(statut === ClotureStepStatus.RUNNING ? { startedAt: new Date() } : {}),
      ...(statut === ClotureStepStatus.DONE ? { completedAt: new Date() } : {}),
      ...(details ? { details } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    })
    .where(
      and(
        eq(exerciceClotureSteps.exerciceId, exerciceId),
        eq(exerciceClotureSteps.step, step),
      )
    );
}
