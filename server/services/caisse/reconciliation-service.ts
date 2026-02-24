/**
 * Service de Réconciliation des Soldes de Caisse
 *
 * Ce service vérifie et réconcilie les soldes entre:
 * - mouvementsFinanciers (source de vérité)
 * - caisses.solde (cache)
 * - sessionsCaisse.soldeTheorique (cache)
 * - comptes.soldeCourant (cache)
 *
 * Il génère des alertes et peut auto-corriger les écarts.
 */

import { db } from "../../db";
import {
  mouvementsFinanciers,
  caisses,
  sessionsCaisse,
  comptes,
  operationsCaisse,
  transactionsCompte,
} from "@shared/schema";
import { StatutTransaction, StatutCompte } from "@shared/enum/status-constants";
import { eq, sql, and, isNull, isNotNull, gte, inArray, notInArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Reconciliation');

// ============================================================================
// TYPES
// ============================================================================

export interface ReconciliationResult {
  entity: string;
  entityId: string;
  entityName?: string;
  soldeCached: number;
  soldeCalculated: number;
  ecart: number;
  ecartPercent: number;
  status: "OK" | "ECART_MINEUR" | "ECART_MAJEUR" | "CRITIQUE";
  autoFixed?: boolean;
}

export interface ReconciliationReport {
  timestamp: Date;
  duration: number;
  totalChecked: number;
  totalOk: number;
  totalEcarts: number;
  totalCritiques: number;
  autoFixedCount: number;
  results: ReconciliationResult[];
}

// Seuils d'écart
const SEUIL_ECART_MINEUR = 100; // 100 FCFA
const SEUIL_ECART_MAJEUR = 10000; // 10k FCFA
const SEUIL_ECART_CRITIQUE = 100000; // 100k FCFA

// ============================================================================
// RÉCONCILIATION DES CAISSES
// ============================================================================

/**
 * Calcule le solde d'une caisse depuis les mouvements financiers
 */
async function calculateCaisseSoldeFromLedger(caisseId: string): Promise<number> {
  // Récupérer les sessions de cette caisse
  const sessions = await db
    .select({ id: sessionsCaisse.id })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.caisseId, caisseId));

  if (sessions.length === 0) {
    return 0;
  }

  const sessionIds = sessions.map(s => s.id);

  // Calculer le solde depuis les mouvements
  const [result] = await db
    .select({
      total: sql<string>`
        COALESCE(
          SUM(
            CASE
              WHEN ${mouvementsFinanciers.sens} IN ('CREDIT', 'Crédit') THEN CAST(${mouvementsFinanciers.montant} AS NUMERIC)
              WHEN ${mouvementsFinanciers.sens} IN ('DEBIT', 'Débit') THEN -CAST(${mouvementsFinanciers.montant} AS NUMERIC)
              ELSE 0
            END
          ),
          0
        )
      `,
    })
    .from(mouvementsFinanciers)
    .where(
      and(
        inArray(mouvementsFinanciers.sessionCaisseId, sessionIds),
        eq(mouvementsFinanciers.statut, StatutTransaction.POSTED)
      )
    );

  return parseFloat(result?.total || "0");
}

/**
 * Réconcilie toutes les caisses
 */
export async function reconcileCaisses(autoFix: boolean = false): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];

  // Récupérer toutes les caisses actives
  const allCaisses = await db
    .select()
    .from(caisses)
    .where(isNull(caisses.deletedAt));

  for (const caisse of allCaisses) {
    const soldeCached = parseFloat(caisse.solde || "0");
    const soldeCalculated = await calculateCaisseSoldeFromLedger(caisse.id);
    const ecart = Math.abs(soldeCached - soldeCalculated);
    const ecartPercent = soldeCached !== 0 ? (ecart / soldeCached) * 100 : (ecart > 0 ? 100 : 0);

    let status: ReconciliationResult["status"] = "OK";
    if (ecart > SEUIL_ECART_CRITIQUE) {
      status = "CRITIQUE";
    } else if (ecart > SEUIL_ECART_MAJEUR) {
      status = "ECART_MAJEUR";
    } else if (ecart > SEUIL_ECART_MINEUR) {
      status = "ECART_MINEUR";
    }

    let autoFixed = false;

    // Auto-correction si demandé et écart mineur
    if (autoFix && status === "ECART_MINEUR") {
      await db
        .update(caisses)
        .set({
          solde: soldeCalculated.toString(),
          updatedAt: new Date(),
        })
        .where(eq(caisses.id, caisse.id));
      autoFixed = true;
    }

    results.push({
      entity: "caisse",
      entityId: caisse.id,
      entityName: caisse.nom,
      soldeCached,
      soldeCalculated,
      ecart,
      ecartPercent,
      status,
      autoFixed,
    });
  }

  return results;
}

// ============================================================================
// RÉCONCILIATION DES SESSIONS ACTIVES
// ============================================================================

/**
 * Calcule le solde théorique d'une session depuis ses opérations
 */
async function calculateSessionSoldeFromOperations(sessionId: string): Promise<number> {
  const [session] = await db
    .select()
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId));

  if (!session) return 0;

  const soldeInitial = parseFloat(session.montantOuverture || "0");

  // Récupérer les opérations de la session
  const operations = await db
    .select()
    .from(operationsCaisse)
    .where(eq(operationsCaisse.sessionId, sessionId));

  // Importer la config centralisée
  const { getOperationDelta } = await import("@shared/config/caisse-operations");

  let solde = soldeInitial;
  for (const op of operations) {
    const delta = getOperationDelta(op.typeOperation, op.montant, {
      reference: op.reference,
      description: op.description,
    });
    solde += delta;
  }

  return solde;
}

/**
 * Réconcilie toutes les sessions ouvertes
 */
export async function reconcileOpenSessions(autoFix: boolean = false): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];

  // Sessions ouvertes uniquement
  const openSessions = await db
    .select({
      session: sessionsCaisse,
      caisseNom: caisses.nom,
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .where(
      and(
        notInArray(sessionsCaisse.statut, ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"]),
        isNull(sessionsCaisse.deletedAt)
      )
    );

  for (const { session, caisseNom } of openSessions) {
    const soldeCached = parseFloat(session.montantFermetureTheorique || "0");
    const soldeCalculated = await calculateSessionSoldeFromOperations(session.id);
    const ecart = Math.abs(soldeCached - soldeCalculated);
    const ecartPercent = soldeCached !== 0 ? (ecart / soldeCached) * 100 : (ecart > 0 ? 100 : 0);

    let status: ReconciliationResult["status"] = "OK";
    if (ecart > SEUIL_ECART_CRITIQUE) {
      status = "CRITIQUE";
    } else if (ecart > SEUIL_ECART_MAJEUR) {
      status = "ECART_MAJEUR";
    } else if (ecart > SEUIL_ECART_MINEUR) {
      status = "ECART_MINEUR";
    }

    let autoFixed = false;

    if (autoFix && (status === "ECART_MINEUR" || status === "ECART_MAJEUR")) {
      await db
        .update(sessionsCaisse)
        .set({
          montantFermetureTheorique: soldeCalculated.toString(),
          updatedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, session.id));
      autoFixed = true;
    }

    results.push({
      entity: "session",
      entityId: session.id,
      entityName: caisseNom || undefined,
      soldeCached,
      soldeCalculated,
      ecart,
      ecartPercent,
      status,
      autoFixed,
    });
  }

  return results;
}

// ============================================================================
// RÉCONCILIATION DES COMPTES CLIENTS
// ============================================================================

/**
 * Calcule le solde d'un compte depuis les transactions
 */
async function calculateCompteSoldeFromTransactions(compteId: string): Promise<number> {
  const [result] = await db
    .select({
      total: sql<string>`
        COALESCE(
          SUM(
            CASE
              WHEN ${transactionsCompte.typePaiement} IN (
                'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'INTEREST', 'INITIAL_DEPOSIT', 'TRANSFER_IN',
                'Dépôt Épargne', 'Dépôt Courant', 'Dépôt Bloqué', 'Intérêt', 'Dépôt Initial', 'Transfert Entrant'
              )
                THEN CAST(${transactionsCompte.montant} AS NUMERIC)
              WHEN ${transactionsCompte.typePaiement} IN (
                'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'FEE', 'TRANSFER_OUT',
                'Retrait Épargne', 'Retrait Courant', 'Retrait Bloqué', 'Frais', 'Transfert Sortant'
              )
                THEN -CAST(${transactionsCompte.montant} AS NUMERIC)
              ELSE 0
            END
          ),
          0
        )
      `,
    })
    .from(transactionsCompte)
    .where(
      and(
        eq(transactionsCompte.compteId, compteId),
        eq(transactionsCompte.statut, StatutTransaction.POSTED)
      )
    );

  return parseFloat(result?.total || "0");
}

/**
 * Réconcilie tous les comptes clients actifs
 */
export async function reconcileComptes(autoFix: boolean = false): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];

  const activeComptes = await db
    .select()
    .from(comptes)
    .where(
      and(
        eq(comptes.statut, StatutCompte.ACTIVE),
        isNull(comptes.deletedAt)
      )
    );

  for (const compte of activeComptes) {
    const soldeCached = parseFloat(compte.soldeCourant || "0");
    const soldeCalculated = await calculateCompteSoldeFromTransactions(compte.id);
    const ecart = Math.abs(soldeCached - soldeCalculated);
    const ecartPercent = soldeCached !== 0 ? (ecart / soldeCached) * 100 : (ecart > 0 ? 100 : 0);

    let status: ReconciliationResult["status"] = "OK";
    if (ecart > SEUIL_ECART_CRITIQUE) {
      status = "CRITIQUE";
    } else if (ecart > SEUIL_ECART_MAJEUR) {
      status = "ECART_MAJEUR";
    } else if (ecart > SEUIL_ECART_MINEUR) {
      status = "ECART_MINEUR";
    }

    let autoFixed = false;

    // Pour les comptes, on ne fait l'auto-fix qu'en cas d'écart mineur
    if (autoFix && status === "ECART_MINEUR") {
      await db
        .update(comptes)
        .set({
          soldeCourant: soldeCalculated.toString(),
          updatedAt: new Date(),
        })
        .where(eq(comptes.id, compte.id));
      autoFixed = true;
    }

    // N'ajouter aux résultats que les comptes avec écart
    if (status !== "OK") {
      results.push({
        entity: "compte",
        entityId: compte.id,
        entityName: compte.numeroCompte,
        soldeCached,
        soldeCalculated,
        ecart,
        ecartPercent,
        status,
        autoFixed,
      });
    }
  }

  return results;
}

// ============================================================================
// RAPPORT COMPLET DE RÉCONCILIATION
// ============================================================================

/**
 * Exécute une réconciliation complète de tous les soldes
 */
export async function runFullReconciliation(autoFix: boolean = false): Promise<ReconciliationReport> {
  const startTime = Date.now();

  const [caisseResults, sessionResults, compteResults] = await Promise.all([
    reconcileCaisses(autoFix),
    reconcileOpenSessions(autoFix),
    reconcileComptes(autoFix),
  ]);

  const allResults = [...caisseResults, ...sessionResults, ...compteResults];

  const report: ReconciliationReport = {
    timestamp: new Date(),
    duration: Date.now() - startTime,
    totalChecked: allResults.length,
    totalOk: allResults.filter(r => r.status === "OK").length,
    totalEcarts: allResults.filter(r => r.status !== "OK").length,
    totalCritiques: allResults.filter(r => r.status === "CRITIQUE").length,
    autoFixedCount: allResults.filter(r => r.autoFixed).length,
    results: allResults.filter(r => r.status !== "OK"), // Ne retourner que les écarts
  };

  // Log le rapport
  logger.info({
    timestamp: report.timestamp.toISOString(),
    duration: report.duration,
    totalChecked: report.totalChecked,
    totalOk: report.totalOk,
    totalEcarts: report.totalEcarts,
    totalCritiques: report.totalCritiques,
    autoFixedCount: report.autoFixedCount,
  }, 'Reconciliation report');

  return report;
}

// ============================================================================
// VÉRIFICATION D'INTÉGRITÉ DOUBLE-ENTRY
// ============================================================================

/**
 * Vérifie que la somme des débits = somme des crédits pour une période donnée
 */
export async function verifyDoubleEntryIntegrity(
  startDate?: Date,
  endDate?: Date
): Promise<{
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
}> {
  const conditions = [eq(mouvementsFinanciers.statut, StatutTransaction.POSTED)];

  if (startDate) {
    conditions.push(gte(mouvementsFinanciers.dateOperation, startDate));
  }

  const [result] = await db
    .select({
      totalDebits: sql<string>`
        COALESCE(SUM(CASE WHEN ${mouvementsFinanciers.sens} IN ('DEBIT', 'Débit') THEN CAST(${mouvementsFinanciers.montant} AS NUMERIC) ELSE 0 END), 0)
      `,
      totalCredits: sql<string>`
        COALESCE(SUM(CASE WHEN ${mouvementsFinanciers.sens} IN ('CREDIT', 'Crédit') THEN CAST(${mouvementsFinanciers.montant} AS NUMERIC) ELSE 0 END), 0)
      `,
    })
    .from(mouvementsFinanciers)
    .where(and(...conditions));

  const totalDebits = parseFloat(result?.totalDebits || "0");
  const totalCredits = parseFloat(result?.totalCredits || "0");
  const difference = Math.abs(totalDebits - totalCredits);

  return {
    isBalanced: difference < 1, // Tolérance de 1 FCFA pour erreurs d'arrondi
    totalDebits,
    totalCredits,
    difference,
  };
}

export default {
  reconcileCaisses,
  reconcileOpenSessions,
  reconcileComptes,
  runFullReconciliation,
  verifyDoubleEntryIntegrity,
};
