/**
 * Service d'Intégrité des Transactions
 *
 * Complète les services existants de réconciliation des soldes:
 * - server/services/caisse/reconciliation-service.ts (soldes caisses)
 * - server/cron/balance-reconciliation.ts (job planifié)
 *
 * Ce service se concentre sur l'INTÉGRITÉ des données transactionnelles:
 * - Sens vs TypePaiement (fix du bug TRANSFER_IN affichant DEBIT)
 * - Mouvements orphelins (sans transaction associée)
 * - Transactions sans mouvement
 * - Doublons potentiels
 * - Cohérence compte/solde
 */

import { db } from "../db";
import {
  transactionsCompte,
  mouvementsFinanciers,
  comptes,
  sessionsCaisse,
  operationsCaisse,
} from "@shared/schema";
import { eq, sql, desc, isNull, and, gte, lte, ne } from "drizzle-orm";
import { deriveSensFromType } from "@shared/config/transaction-labels";
import { createLogger } from "../lib/logger";

const logger = createLogger("TransactionIntegrity");

// ============================================================================
// TYPES
// ============================================================================

export interface ReconciliationAnomaly {
  type: AnomalyType;
  severity: "critical" | "warning" | "info";
  entityType: string;
  entityId: string;
  description: string;
  details: Record<string, unknown>;
  detectedAt: Date;
  autoFixable: boolean;
}

export type AnomalyType =
  | "SENS_MISMATCH"
  | "SENS_MISSING"
  | "BALANCE_MISMATCH"
  | "ORPHAN_MOUVEMENT"
  | "ORPHAN_TRANSACTION"
  | "DUPLICATE_TRANSACTION"
  | "SESSION_BALANCE_MISMATCH"
  | "NEGATIVE_BALANCE"
  | "MISSING_MOUVEMENT_ID"
  | "MOUVEMENT_WITHOUT_GL";

export interface ReconciliationResult {
  runAt: Date;
  duration: number;
  checks: {
    name: string;
    status: "passed" | "failed" | "warning";
    count: number;
    anomalies: number;
  }[];
  totalAnomalies: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  anomalies: ReconciliationAnomaly[];
  fixedCount?: number;
}

export interface ReconciliationOptions {
  fix?: boolean;
  checks?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  compteId?: string;
  limit?: number;
}

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

/**
 * Check 1: Sens vs TypePaiement consistency
 */
async function checkSensConsistency(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  const conditions = [];
  if (options.dateFrom) {
    conditions.push(gte(transactionsCompte.createdAt, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(transactionsCompte.createdAt, options.dateTo));
  }
  if (options.compteId) {
    conditions.push(eq(transactionsCompte.compteId, options.compteId));
  }

  const transactions = await db
    .select({
      id: transactionsCompte.id,
      sens: transactionsCompte.sens,
      typePaiement: transactionsCompte.typePaiement,
      compteId: transactionsCompte.compteId,
      montant: transactionsCompte.montant,
      createdAt: transactionsCompte.createdAt,
    })
    .from(transactionsCompte)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(options.limit || 10000);

  for (const tx of transactions) {
    const expectedSens = deriveSensFromType(tx.typePaiement);

    if (!tx.sens) {
      anomalies.push({
        type: "SENS_MISSING",
        severity: "warning",
        entityType: "transaction_compte",
        entityId: tx.id,
        description: `Transaction sans sens défini`,
        details: {
          typePaiement: tx.typePaiement,
          expectedSens,
          montant: tx.montant,
          compteId: tx.compteId,
        },
        detectedAt: new Date(),
        autoFixable: true,
      });
    } else if (tx.sens !== expectedSens) {
      anomalies.push({
        type: "SENS_MISMATCH",
        severity: "critical",
        entityType: "transaction_compte",
        entityId: tx.id,
        description: `Sens incorrect: ${tx.sens} au lieu de ${expectedSens}`,
        details: {
          typePaiement: tx.typePaiement,
          currentSens: tx.sens,
          expectedSens,
          montant: tx.montant,
          compteId: tx.compteId,
        },
        detectedAt: new Date(),
        autoFixable: true,
      });
    }
  }

  return anomalies;
}

/**
 * Check 2: Account balance consistency
 * Recalculates balance from transactions and compares with stored value
 */
async function checkBalanceConsistency(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  // Get all accounts (or specific one)
  const conditions = options.compteId ? [eq(comptes.id, options.compteId)] : [];

  const accounts = await db
    .select({
      id: comptes.id,
      numeroCompte: comptes.numeroCompte,
      soldeCourant: comptes.soldeCourant,
      clientId: comptes.clientId,
    })
    .from(comptes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(options.limit || 1000);

  for (const account of accounts) {
    // Calculate balance from transactions
    const result = await db
      .select({
        totalCredit: sql<string>`COALESCE(SUM(CASE WHEN sens = 'CREDIT' THEN montant::numeric ELSE 0 END), 0)`,
        totalDebit: sql<string>`COALESCE(SUM(CASE WHEN sens = 'DEBIT' THEN montant::numeric ELSE 0 END), 0)`,
      })
      .from(transactionsCompte)
      .where(eq(transactionsCompte.compteId, account.id));

    const totalCredit = parseFloat(result[0]?.totalCredit || "0");
    const totalDebit = parseFloat(result[0]?.totalDebit || "0");
    const calculatedBalance = totalCredit - totalDebit;
    const storedBalance = parseFloat(account.soldeCourant || "0");

    // Allow small floating point differences (< 0.01)
    const diff = Math.abs(calculatedBalance - storedBalance);
    if (diff >= 0.01) {
      anomalies.push({
        type: "BALANCE_MISMATCH",
        severity: "critical",
        entityType: "compte",
        entityId: account.id,
        description: `Écart de solde: stocké ${storedBalance.toFixed(2)}, calculé ${calculatedBalance.toFixed(2)}`,
        details: {
          numeroCompte: account.numeroCompte,
          storedBalance,
          calculatedBalance,
          difference: diff,
          totalCredit,
          totalDebit,
        },
        detectedAt: new Date(),
        autoFixable: false, // Need manual review
      });
    }

    // Check for negative balance (warning only for some account types)
    if (storedBalance < 0) {
      anomalies.push({
        type: "NEGATIVE_BALANCE",
        severity: "warning",
        entityType: "compte",
        entityId: account.id,
        description: `Solde négatif: ${storedBalance.toFixed(2)}`,
        details: {
          numeroCompte: account.numeroCompte,
          soldeCourant: storedBalance,
        },
        detectedAt: new Date(),
        autoFixable: false,
      });
    }
  }

  return anomalies;
}

/**
 * Check 3: Orphan mouvements (mouvements without transactions)
 */
async function checkOrphanMouvements(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  const conditions = [];
  if (options.dateFrom) {
    conditions.push(gte(mouvementsFinanciers.createdAt, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(mouvementsFinanciers.createdAt, options.dateTo));
  }

  // Find mouvements that have compteId but no matching transaction
  const orphans = await db.execute(sql`
    SELECT mf.id, mf.reference, mf.montant, mf.sens, mf.compte_id, mf.created_at
    FROM mouvements_financiers mf
    LEFT JOIN transactions_compte tc ON tc.mouvement_id = mf.id
    WHERE mf.compte_id IS NOT NULL
      AND tc.id IS NULL
      AND mf.statut != 'REVERSED'
    ORDER BY mf.created_at DESC
    LIMIT ${options.limit || 100}
  `);

  for (const orphan of orphans.rows as any[]) {
    anomalies.push({
      type: "ORPHAN_MOUVEMENT",
      severity: "warning",
      entityType: "mouvement_financier",
      entityId: orphan.id,
      description: `Mouvement sans transaction compte associée`,
      details: {
        reference: orphan.reference,
        montant: orphan.montant,
        sens: orphan.sens,
        compteId: orphan.compte_id,
        createdAt: orphan.created_at,
      },
      detectedAt: new Date(),
      autoFixable: false,
    });
  }

  return anomalies;
}

/**
 * Check 4: Transactions without mouvement
 */
async function checkTransactionsWithoutMouvement(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  const transactions = await db
    .select({
      id: transactionsCompte.id,
      compteId: transactionsCompte.compteId,
      typePaiement: transactionsCompte.typePaiement,
      montant: transactionsCompte.montant,
      createdAt: transactionsCompte.createdAt,
    })
    .from(transactionsCompte)
    .where(isNull(transactionsCompte.mouvementId))
    .limit(options.limit || 100);

  for (const tx of transactions) {
    anomalies.push({
      type: "MISSING_MOUVEMENT_ID",
      severity: "info",
      entityType: "transaction_compte",
      entityId: tx.id,
      description: `Transaction sans mouvement associé`,
      details: {
        typePaiement: tx.typePaiement,
        montant: tx.montant,
        compteId: tx.compteId,
        createdAt: tx.createdAt,
      },
      detectedAt: new Date(),
      autoFixable: false,
    });
  }

  return anomalies;
}

/**
 * Check 5: Session caisse balance consistency
 */
async function checkSessionBalances(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  // Get open sessions
  const sessions = await db
    .select({
      id: sessionsCaisse.id,
      montantOuverture: sessionsCaisse.montantOuverture,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      caisseId: sessionsCaisse.caisseId,
    })
    .from(sessionsCaisse)
    .where(isNull(sessionsCaisse.closedAt))
    .limit(options.limit || 50);

  for (const session of sessions) {
    // Calculate expected balance from operations
    const result = await db
      .select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN type_operation IN ('DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'INITIAL_DEPOSIT', 'CREDIT_REPAYMENT', 'TONTINE_CONTRIBUTION') THEN montant::numeric ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN type_operation IN ('WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'CREDIT_DISBURSEMENT', 'TONTINE_WITHDRAWAL') THEN montant::numeric ELSE 0 END), 0)`,
      })
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, session.id));

    const totalIn = parseFloat(result[0]?.totalIn || "0");
    const totalOut = parseFloat(result[0]?.totalOut || "0");
    const opening = parseFloat(session.montantOuverture || "0");
    const calculatedBalance = opening + totalIn - totalOut;
    const storedBalance = parseFloat(session.montantFermetureTheorique || "0");

    const diff = Math.abs(calculatedBalance - storedBalance);
    if (diff >= 0.01) {
      anomalies.push({
        type: "SESSION_BALANCE_MISMATCH",
        severity: "critical",
        entityType: "session_caisse",
        entityId: session.id,
        description: `Écart solde session: stocké ${storedBalance.toFixed(2)}, calculé ${calculatedBalance.toFixed(2)}`,
        details: {
          caisseId: session.caisseId,
          montantOuverture: opening,
          totalIn,
          totalOut,
          storedBalance,
          calculatedBalance,
          difference: diff,
        },
        detectedAt: new Date(),
        autoFixable: false,
      });
    }
  }

  return anomalies;
}

/**
 * Check 6: Potential duplicates
 */
async function checkDuplicates(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  // Find transactions with same compte, montant, typePaiement within 1 minute
  const duplicates = await db.execute(sql`
    SELECT
      t1.id as id1,
      t2.id as id2,
      t1.compte_id,
      t1.montant,
      t1.type_paiement,
      t1.created_at as created_at_1,
      t2.created_at as created_at_2
    FROM transactions_compte t1
    JOIN transactions_compte t2 ON
      t1.compte_id = t2.compte_id
      AND t1.montant = t2.montant
      AND t1.type_paiement = t2.type_paiement
      AND t1.id < t2.id
      AND ABS(EXTRACT(EPOCH FROM (t1.created_at - t2.created_at))) < 60
    WHERE t1.reversal_of_id IS NULL
      AND t2.reversal_of_id IS NULL
    ORDER BY t1.created_at DESC
    LIMIT ${options.limit || 50}
  `);

  for (const dup of duplicates.rows as any[]) {
    anomalies.push({
      type: "DUPLICATE_TRANSACTION",
      severity: "warning",
      entityType: "transaction_compte",
      entityId: dup.id1,
      description: `Doublon potentiel détecté`,
      details: {
        transaction1: dup.id1,
        transaction2: dup.id2,
        compteId: dup.compte_id,
        montant: dup.montant,
        typePaiement: dup.type_paiement,
        timeDiff: Math.abs(new Date(dup.created_at_2).getTime() - new Date(dup.created_at_1).getTime()) / 1000,
      },
      detectedAt: new Date(),
      autoFixable: false,
    });
  }

  return anomalies;
}

/**
 * Check 7: Mouvements without GL posting link
 * Every POSTED mouvement should have a corresponding gl_posting_links entry.
 * Mouvements without GL = potential accounting gap.
 */
async function checkMouvementsWithoutGl(options: ReconciliationOptions): Promise<ReconciliationAnomaly[]> {
  const anomalies: ReconciliationAnomaly[] = [];

  const dateConditions: string[] = [];
  if (options.dateFrom) {
    dateConditions.push(`mf.created_at >= '${options.dateFrom.toISOString()}'`);
  }
  if (options.dateTo) {
    dateConditions.push(`mf.created_at <= '${options.dateTo.toISOString()}'`);
  }

  const whereExtra = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

  const orphans = await db.execute(sql.raw(`
    SELECT mf.id, mf.reference, mf.montant, mf.sens, mf.type_paiement,
           mf.source_module, mf.gl_posting_status, mf.created_at
    FROM mouvements_financiers mf
    LEFT JOIN gl_posting_links gpl ON gpl.mouvement_id = mf.id
    WHERE mf.statut = 'POSTED'
      AND gpl.id IS NULL
      AND mf.gl_posting_status IS DISTINCT FROM 'POSTED'
      ${whereExtra}
    ORDER BY mf.created_at DESC
    LIMIT ${options.limit || 200}
  `));

  for (const row of orphans.rows as any[]) {
    anomalies.push({
      type: "MOUVEMENT_WITHOUT_GL",
      severity: "critical",
      entityType: "mouvement_financier",
      entityId: row.id,
      description: `Mouvement POSTED sans écriture GL (${row.type_paiement}, ${row.montant} FCFA)`,
      details: {
        reference: row.reference,
        montant: row.montant,
        sens: row.sens,
        typePaiement: row.type_paiement,
        sourceModule: row.source_module,
        glPostingStatus: row.gl_posting_status,
        createdAt: row.created_at,
      },
      detectedAt: new Date(),
      autoFixable: false,
    });
  }

  return anomalies;
}

// ============================================================================
// FIX FUNCTIONS
// ============================================================================

async function fixSensAnomalies(anomalies: ReconciliationAnomaly[]): Promise<number> {
  let fixedCount = 0;

  const sensAnomalies = anomalies.filter(
    a => (a.type === "SENS_MISMATCH" || a.type === "SENS_MISSING") && a.autoFixable
  );

  for (const anomaly of sensAnomalies) {
    const expectedSens = anomaly.details.expectedSens as "DEBIT" | "CREDIT";

    await db
      .update(transactionsCompte)
      .set({ sens: expectedSens })
      .where(eq(transactionsCompte.id, anomaly.entityId));

    fixedCount++;
  }

  return fixedCount;
}

// ============================================================================
// MAIN RECONCILIATION FUNCTION
// ============================================================================

const CHECK_FUNCTIONS: Record<string, (options: ReconciliationOptions) => Promise<ReconciliationAnomaly[]>> = {
  sens: checkSensConsistency,
  balance: checkBalanceConsistency,
  orphanMouvements: checkOrphanMouvements,
  missingMouvement: checkTransactionsWithoutMouvement,
  sessionBalance: checkSessionBalances,
  duplicates: checkDuplicates,
  mouvementsWithoutGl: checkMouvementsWithoutGl,
};

export async function runReconciliation(options: ReconciliationOptions = {}): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const allAnomalies: ReconciliationAnomaly[] = [];
  const checks: ReconciliationResult["checks"] = [];

  const checksToRun = options.checks || Object.keys(CHECK_FUNCTIONS);

  logger.info({ checks: checksToRun, options }, "Starting reconciliation");

  for (const checkName of checksToRun) {
    const checkFn = CHECK_FUNCTIONS[checkName];
    if (!checkFn) {
      logger.warn({ checkName }, "Unknown check, skipping");
      continue;
    }

    try {
      const anomalies = await checkFn(options);
      allAnomalies.push(...anomalies);

      checks.push({
        name: checkName,
        status: anomalies.length === 0 ? "passed" :
                anomalies.some(a => a.severity === "critical") ? "failed" : "warning",
        count: anomalies.length === 0 ? 1 : anomalies.length, // 1 = check ran successfully
        anomalies: anomalies.length,
      });
    } catch (error) {
      logger.error({ checkName, error }, "Check failed");
      checks.push({
        name: checkName,
        status: "failed",
        count: 0,
        anomalies: 0,
      });
    }
  }

  // Fix if requested
  let fixedCount = 0;
  if (options.fix && allAnomalies.length > 0) {
    fixedCount = await fixSensAnomalies(allAnomalies);
    logger.info({ fixedCount }, "Fixed anomalies");
  }

  const result: ReconciliationResult = {
    runAt: new Date(),
    duration: Date.now() - startTime,
    checks,
    totalAnomalies: allAnomalies.length,
    criticalCount: allAnomalies.filter(a => a.severity === "critical").length,
    warningCount: allAnomalies.filter(a => a.severity === "warning").length,
    infoCount: allAnomalies.filter(a => a.severity === "info").length,
    anomalies: allAnomalies.slice(0, 200), // Limit response size
    fixedCount: options.fix ? fixedCount : undefined,
  };

  // Note: Critical anomaly alerts are handled by financial-monitoring-service
  // which broadcasts via WebSocket in real-time

  logger.info({
    duration: result.duration,
    totalAnomalies: result.totalAnomalies,
    criticalCount: result.criticalCount,
  }, "Reconciliation completed");

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runReconciliation,
  checks: CHECK_FUNCTIONS,
};
