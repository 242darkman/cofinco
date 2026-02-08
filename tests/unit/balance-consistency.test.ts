/**
 * Tests de cohérence des soldes financiers
 *
 * Ces tests vérifient que les soldes persistés correspondent
 * aux soldes calculés depuis les mouvements.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from 'server/db';
import { createLogger } from 'server/lib/logger';
import {
  comptes,
  transactionsCompte,
  mouvementsFinanciers,
  sessionsCaisse,
  operationsCaisse,
  tontines,
  contributionsTontine,
  tontineDistributionRequests,
  credits
} from '@shared/schema';
import { eq, sql, and, sum, isNull } from 'drizzle-orm';
import { balanceService } from 'server/services/balance-service';
import { RECONCILIATION_THRESHOLDS } from '@shared/types/balances';

const logger = createLogger('BalanceTest');

describe('Balance Consistency Tests', () => {

  // ============================================
  // COMPTES - Soldes épargne
  // ============================================

  describe('Comptes - Soldes Épargne', () => {

    it('should have soldeCourant matching SUM(transactions) for all active comptes', async () => {
      // Récupérer tous les comptes actifs
      const allComptes = await db.select({
        id: comptes.id,
        numeroCompte: comptes.numeroCompte,
        soldeCourant: comptes.soldeCourant,
        typeCompte: comptes.typeCompte
      })
      .from(comptes)
      .where(isNull(comptes.deletedAt))
      .limit(100); // Limiter pour les tests

      const discrepancies: Array<{
        compteId: string;
        numeroCompte: string;
        persisted: number;
        calculated: number;
        diff: number;
      }> = [];

      for (const compte of allComptes) {
        // Calculer le solde depuis les transactions
        const [result] = await db.select({
          total: sql<number>`COALESCE(SUM(
            CASE
              WHEN ${transactionsCompte.typePaiement} IN (
                'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED',
                'TRANSFER_IN', 'INTEREST_PAYMENT', 'INITIAL_DEPOSIT',
                'CREDIT_DISBURSEMENT', 'TONTINE_WITHDRAWAL', 'COFFRE_TO_CAISSE',
                'COFFRE_TRANSIT_IN', 'SESSION_SURPLUS', 'ADJUSTMENT'
              )
              THEN CAST(${transactionsCompte.montant} AS DECIMAL)
              ELSE -CAST(${transactionsCompte.montant} AS DECIMAL)
            END
          ), 0)`
        })
        .from(transactionsCompte)
        .where(eq(transactionsCompte.compteId, compte.id));

        const persisted = Number(compte.soldeCourant || 0);
        const calculated = Number(result?.total || 0);
        const diff = Math.abs(persisted - calculated);

        if (diff > RECONCILIATION_THRESHOLDS.MINOR) {
          discrepancies.push({
            compteId: compte.id,
            numeroCompte: compte.numeroCompte,
            persisted,
            calculated,
            diff
          });
        }
      }

      // Log les divergences pour debugging
      if (discrepancies.length > 0) {
        logger.warn({ discrepancies }, 'Compte discrepancies found');
      }

      expect(discrepancies.length).toBe(0);
    });

    it('should return correct balance from BalanceService', async () => {
      // Prendre un compte aléatoire
      const [randomCompte] = await db.select({ id: comptes.id })
        .from(comptes)
        .where(isNull(comptes.deletedAt))
        .limit(1);

      if (!randomCompte) {
        logger.info('No comptes found, skipping test');
        return;
      }

      const balance = await balanceService.getCompteBalance(randomCompte.id);

      expect(balance).toBeDefined();
      expect(balance.entityType).toBe('compte');
      expect(balance.entityId).toBe(randomCompte.id);
      expect(typeof balance.current).toBe('number');
      expect(balance.currency).toBe('FCFA');
    });
  });

  // ============================================
  // SESSIONS CAISSE - Soldes théoriques
  // ============================================

  describe('Sessions Caisse - Soldes Théoriques', () => {

    it('should have montantFermetureTheorique matching montantOuverture + SUM(operations) for active sessions', async () => {
      // Récupérer les sessions actives (non fermées)
      const activeSessions = await db.select({
        id: sessionsCaisse.id,
        montantOuverture: sessionsCaisse.montantOuverture,
        montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique
      })
      .from(sessionsCaisse)
      .where(isNull(sessionsCaisse.closedAt))
      .limit(50);

      const discrepancies: Array<{
        sessionId: string;
        persisted: number;
        calculated: number;
        diff: number;
      }> = [];

      for (const session of activeSessions) {
        // Calculer depuis les opérations
        const [result] = await db.select({
          total: sql<number>`COALESCE(SUM(
            CASE
              WHEN ${operationsCaisse.typeOperation} IN (
                'SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED',
                'SAFE_SUPPLY', 'CREDIT_REPAYMENT', 'LOAN_REPAYMENT', 'TONTINE_CONTRIBUTION',
                'MISC_COLLECTION', 'INITIAL_DEPOSIT'
              )
              THEN CAST(${operationsCaisse.montant} AS DECIMAL)
              ELSE -CAST(${operationsCaisse.montant} AS DECIMAL)
            END
          ), 0)`
        })
        .from(operationsCaisse)
        .where(eq(operationsCaisse.sessionId, session.id));

        const ouverture = Number(session.montantOuverture || 0);
        const operations = Number(result?.total || 0);
        const calculated = ouverture + operations;
        const persisted = Number(session.montantFermetureTheorique || session.montantOuverture || 0);
        const diff = Math.abs(persisted - calculated);

        if (diff > RECONCILIATION_THRESHOLDS.MINOR) {
          discrepancies.push({
            sessionId: session.id,
            persisted,
            calculated,
            diff
          });
        }
      }

      if (discrepancies.length > 0) {
        logger.warn({ discrepancies }, 'Session discrepancies found');
      }

      expect(discrepancies.length).toBe(0);
    });

    it('should reconcile session correctly via BalanceService', async () => {
      const [randomSession] = await db.select({ id: sessionsCaisse.id })
        .from(sessionsCaisse)
        .where(isNull(sessionsCaisse.closedAt))
        .limit(1);

      if (!randomSession) {
        logger.info('No active sessions found, skipping test');
        return;
      }

      const result = await balanceService.reconcileSessionCaisse(randomSession.id);

      expect(result).toBeDefined();
      expect(result.entityType).toBe('session_caisse');
      expect(typeof result.persistedBalance).toBe('number');
      expect(typeof result.calculatedBalance).toBe('number');
      expect(['OK', 'MINOR', 'MAJOR', 'CRITICAL']).toContain(result.severity);
    });
  });

  // ============================================
  // TONTINES - Soldes collectés vs distribués
  // ============================================

  describe('Tontines - Soldes Collectés', () => {

    it('should have tontine.solde matching SUM(contributions) - SUM(distributions)', async () => {
      // Récupérer les tontines actives
      const activeTontines = await db.select({
        id: tontines.id,
        nom: tontines.nom,
        solde: tontines.solde
      })
      .from(tontines)
      .where(eq(tontines.statut, 'EN_COURS' as any))
      .limit(20);

      const discrepancies: Array<{
        tontineId: string;
        nom: string;
        persisted: number;
        contributions: number;
        distributions: number;
        calculated: number;
        diff: number;
      }> = [];

      for (const tontine of activeTontines) {
        // Total contributions POSTED
        const [contribResult] = await db.select({
          total: sql<number>`COALESCE(SUM(CAST(${contributionsTontine.montant} AS DECIMAL)), 0)`
        })
        .from(contributionsTontine)
        .where(and(
          eq(contributionsTontine.tontineId, tontine.id),
          eq(contributionsTontine.statutTransaction, 'POSTED' as any)
        ));

        // Total distributions SUCCESS
        const [distResult] = await db.select({
          total: sql<number>`COALESCE(SUM(CAST(${tontineDistributionRequests.amountPaid} AS DECIMAL)), 0)`
        })
        .from(tontineDistributionRequests)
        .where(and(
          eq(tontineDistributionRequests.tontineId, tontine.id),
          eq(tontineDistributionRequests.status, 'SUCCESS' as any)
        ));

        const contributions = Number(contribResult?.total || 0);
        const distributions = Number(distResult?.total || 0);
        const calculated = contributions - distributions;
        const persisted = Number(tontine.solde || 0);
        const diff = Math.abs(persisted - calculated);

        if (diff > RECONCILIATION_THRESHOLDS.MINOR) {
          discrepancies.push({
            tontineId: tontine.id,
            nom: tontine.nom,
            persisted,
            contributions,
            distributions,
            calculated,
            diff
          });
        }
      }

      if (discrepancies.length > 0) {
        logger.warn({ discrepancies }, 'Tontine discrepancies found');
      }

      expect(discrepancies.length).toBe(0);
    });

    it('should reconcile tontine correctly via BalanceService', async () => {
      const [randomTontine] = await db.select({ id: tontines.id })
        .from(tontines)
        .where(eq(tontines.statut, 'EN_COURS' as any))
        .limit(1);

      if (!randomTontine) {
        logger.info('No active tontines found, skipping test');
        return;
      }

      const result = await balanceService.reconcileTontine(randomTontine.id);

      expect(result).toBeDefined();
      expect(result.entityType).toBe('tontine');
      expect(typeof result.persistedBalance).toBe('number');
      expect(typeof result.calculatedBalance).toBe('number');
    });
  });

  // ============================================
  // CREDITS - Soldes restants
  // ============================================

  describe('Credits - Soldes Restants', () => {

    it('should have consistent soldeRestant for active credits', async () => {
      const activeCredits = await db.select({
        id: credits.id,
        montant: credits.montant,
        soldeRestant: credits.soldeRestant,
        statut: credits.statut
      })
      .from(credits)
      .where(eq(credits.statut, 'ACTIVE' as any))
      .limit(20);

      for (const credit of activeCredits) {
        const montant = Number(credit.montant || 0);
        const soldeRestant = Number(credit.soldeRestant || 0);

        // Le solde restant ne peut pas être négatif
        expect(soldeRestant).toBeGreaterThanOrEqual(0);

        // Le solde restant ne peut pas dépasser le montant initial
        expect(soldeRestant).toBeLessThanOrEqual(montant);
      }
    });

    it('should return correct credit balance from BalanceService', async () => {
      const [randomCredit] = await db.select({ id: credits.id })
        .from(credits)
        .where(eq(credits.statut, 'ACTIVE' as any))
        .limit(1);

      if (!randomCredit) {
        logger.info('No active credits found, skipping test');
        return;
      }

      const balance = await balanceService.getCreditBalance(randomCredit.id);

      expect(balance).toBeDefined();
      expect(balance.entityType).toBe('credit');
      expect(balance.available).toBe(0); // Credit balance isn't "available"
      expect(balance.current).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // CASH POSITION GLOBALE
  // ============================================

  describe('Global Cash Position', () => {

    it('should calculate consistent cash position', async () => {
      const cashPosition = await balanceService.getGlobalCashPosition();

      expect(cashPosition).toBeDefined();
      expect(typeof cashPosition.totalCoffres).toBe('number');
      expect(typeof cashPosition.totalCaisses).toBe('number');
      expect(typeof cashPosition.grandTotal).toBe('number');

      // grandTotal = coffres + caisses + caissesAgent
      const expectedTotal = cashPosition.totalCoffres + cashPosition.totalCaisses + cashPosition.totalCaissesAgent;
      expect(cashPosition.grandTotal).toBe(expectedTotal);

      // Aucun total ne devrait être négatif
      expect(cashPosition.totalCoffres).toBeGreaterThanOrEqual(0);
      expect(cashPosition.totalCaisses).toBeGreaterThanOrEqual(0);
      expect(cashPosition.totalCaissesAgent).toBeGreaterThanOrEqual(0);
    });

    it('should have breakdown totals matching grand totals', async () => {
      const cashPosition = await balanceService.getGlobalCashPosition();

      // Vérifier que breakdown.byAgence totalise correctement
      let agencesTotal = 0;
      for (const agenceId in cashPosition.breakdown.byAgence) {
        agencesTotal += cashPosition.breakdown.byAgence[agenceId].total;
      }

      // Note: Peut y avoir des différences d'arrondi
      const diff = Math.abs(agencesTotal - cashPosition.grandTotal);
      expect(diff).toBeLessThan(1); // Tolérance d'1 FCFA
    });
  });

  // ============================================
  // RÉCONCILIATION COMPLÈTE
  // ============================================

  describe('Full Reconciliation', () => {

    it('should run full reconciliation without critical discrepancies', async () => {
      const report = await balanceService.runFullReconciliation();

      expect(report).toBeDefined();
      expect(report.runId).toBeTruthy();
      expect(report.totalEntities).toBeGreaterThanOrEqual(0);

      // Log le rapport pour debugging
      logger.info({
        runId: report.runId,
        totalEntities: report.totalEntities,
        summary: report.summary
      }, 'Reconciliation report');

      // Pas de divergences critiques
      expect(report.summary.critical).toBe(0);
    }, 60000); // Timeout de 60s pour cette opération lourde
  });
});
