/**
 * BalanceService - Source unique de vérité pour tous les soldes financiers
 *
 * Ce service centralise:
 * 1. La lecture des soldes (méthode unifiée)
 * 2. La réconciliation (validation solde persisté vs calculé)
 * 3. Les événements de mise à jour (WebSocket normalisé)
 */

import { db } from "../db";
import {
  comptes,
  caisses,
  sessionsCaisse,
  coffresForts,
  credits,
  tontines,
  caissesAgent,
  mouvementsFinanciers,
  transactionsCompte,
  contributionsTontine,
  tontineDistributionRequests,
  operationsCaisse,
  transfertsCoffreCaisse,
  transfertsInterCoffres,
} from "@shared/schema";
import { eq, sql, and, isNull, desc, sum } from "drizzle-orm";
import type {
  Balance,
  BalanceEntityType,
  CashPosition,
  ReconciliationResult,
  ReconciliationReport,
  BalanceFilter,
  BalanceStats,
  RECONCILIATION_THRESHOLDS as ThresholdsType
} from "@shared/types/balances";
import { RECONCILIATION_THRESHOLDS } from "@shared/types/balances";
import { getWsInstance } from "../ws-server";
import { randomUUID } from "crypto";
import { createLogger } from "../lib/logger";

const logger = createLogger('BalanceService');

class BalanceService {

  // ============================================
  // LECTURE DES SOLDES
  // ============================================

  /**
   * Récupère le solde d'un compte client
   */
  async getCompteBalance(compteId: string): Promise<Balance> {
    const [compte] = await db.select({
      id: comptes.id,
      soldeCourant: comptes.soldeCourant,
      typeCompte: comptes.typeCompte,
      statut: comptes.statut,
      blocageActif: comptes.blocageActif,
      blocageFin: comptes.blocageFin
    })
    .from(comptes)
    .where(eq(comptes.id, compteId));

    if (!compte) {
      throw new Error(`Compte not found: ${compteId}`);
    }

    const current = Number(compte.soldeCourant || 0);
    // Compte bloqué si blocageActif ET (pas de date de fin OU date de fin dans le futur)
    const isBlocked = compte.blocageActif && (!compte.blocageFin || new Date(compte.blocageFin) > new Date());

    return {
      entityId: compteId,
      entityType: 'compte',
      current,
      available: isBlocked ? 0 : current,
      pending: 0, // TODO: calculer transactions en attente si applicable
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde d'une caisse (via session active)
   */
  async getCaisseBalance(caisseId: string): Promise<Balance> {
    // Chercher la session active
    const [activeSession] = await db.select({
      id: sessionsCaisse.id,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      montantOuverture: sessionsCaisse.montantOuverture
    })
    .from(sessionsCaisse)
    .where(and(
      eq(sessionsCaisse.caisseId, caisseId),
      isNull(sessionsCaisse.closedAt)
    ))
    .orderBy(desc(sessionsCaisse.openedAt))
    .limit(1);

    // Si session active, utiliser montantFermetureTheorique
    if (activeSession) {
      const current = Number(activeSession.montantFermetureTheorique || activeSession.montantOuverture || 0);
      return {
        entityId: caisseId,
        entityType: 'caisse',
        current,
        available: current,
        pending: 0,
        currency: 'FCFA',
        asOf: new Date()
      };
    }

    // Sinon, prendre le solde de la dernière session fermée
    const [lastClosedSession] = await db.select({
      montantFermetureDeclare: sessionsCaisse.montantFermetureDeclare,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique
    })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.caisseId, caisseId))
    .orderBy(desc(sessionsCaisse.closedAt))
    .limit(1);

    // IMPORTANT: Toujours utiliser montantFermetureTheorique comme source de vérité
    // Le montantFermetureDeclare peut être différent (écart non résolu)
    const current = Number(lastClosedSession?.montantFermetureTheorique || lastClosedSession?.montantFermetureDeclare || 0);

    return {
      entityId: caisseId,
      entityType: 'caisse',
      current,
      available: current,
      pending: 0,
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde d'une session de caisse
   */
  async getSessionCaisseBalance(sessionId: string): Promise<Balance> {
    const [session] = await db.select({
      id: sessionsCaisse.id,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      montantOuverture: sessionsCaisse.montantOuverture,
      closedAt: sessionsCaisse.closedAt
    })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId));

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const current = Number(session.montantFermetureTheorique || session.montantOuverture || 0);

    return {
      entityId: sessionId,
      entityType: 'session_caisse',
      current,
      available: session.closedAt ? 0 : current, // Session fermée = 0 disponible
      pending: 0,
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde d'un coffre
   */
  async getCoffreBalance(coffreId: string): Promise<Balance> {
    const [coffre] = await db.select({
      id: coffresForts.id,
      solde: coffresForts.solde
    })
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId));

    if (!coffre) {
      throw new Error(`Coffre not found: ${coffreId}`);
    }

    const current = Number(coffre.solde || 0);

    return {
      entityId: coffreId,
      entityType: 'coffre',
      current,
      available: current,
      pending: 0,
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde restant d'un crédit
   */
  async getCreditBalance(creditId: string): Promise<Balance> {
    const [credit] = await db.select({
      id: credits.id,
      soldeRestant: credits.soldeRestant,
      montant: credits.montant
    })
    .from(credits)
    .where(eq(credits.id, creditId));

    if (!credit) {
      throw new Error(`Credit not found: ${creditId}`);
    }

    const current = Number(credit.soldeRestant || 0);

    return {
      entityId: creditId,
      entityType: 'credit',
      current,
      available: 0, // Un solde de crédit n'est pas "disponible"
      pending: 0,
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde d'une tontine
   */
  async getTontineBalance(tontineId: string): Promise<Balance> {
    const [tontine] = await db.select({
      id: tontines.id,
      solde: tontines.solde
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

    if (!tontine) {
      throw new Error(`Tontine not found: ${tontineId}`);
    }

    const current = Number(tontine.solde || 0);

    return {
      entityId: tontineId,
      entityType: 'tontine',
      current,
      available: current, // TODO: Peut-être exclure les distributions en cours
      pending: 0,
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  /**
   * Récupère le solde validé d'une caisse agent
   */
  async getCaisseAgentBalance(caisseAgentId: string): Promise<Balance> {
    const [caisseAgent] = await db.select({
      id: caissesAgent.id,
      soldeValide: caissesAgent.soldeValide
    })
    .from(caissesAgent)
    .where(eq(caissesAgent.id, caisseAgentId));

    if (!caisseAgent) {
      throw new Error(`Caisse agent not found: ${caisseAgentId}`);
    }

    const current = Number(caisseAgent.soldeValide || 0);

    return {
      entityId: caisseAgentId,
      entityType: 'caisse_agent',
      current,
      available: current,
      pending: 0, // TODO: Calculer les opérations SUBMITTED non approuvées
      currency: 'FCFA',
      asOf: new Date()
    };
  }

  // ============================================
  // POSITION DE TRÉSORERIE GLOBALE
  // ============================================

  /**
   * Calcule la position de trésorerie globale
   * Méthode unifiée remplaçant la logique hybride de dashboard-stats
   */
  async getGlobalCashPosition(agenceId?: string): Promise<CashPosition> {
    const isAllAgences = !agenceId || agenceId === 'all';

    // 1. Total Coffres
    const coffresResult = await db.select({
      agenceId: coffresForts.ownerId,
      total: sum(coffresForts.solde)
    })
    .from(coffresForts)
    .where(isAllAgences ? undefined : eq(coffresForts.ownerId, agenceId))
    .groupBy(coffresForts.ownerId);

    // 2. Total Caisses via sessions
    // IMPORTANT: Utiliser UNIQUEMENT montantFermetureTheorique comme source de vérité
    const caissesResult = await db.execute(sql`
      SELECT
        c.agence_id,
        c.id as caisse_id,
        COALESCE(
          (SELECT COALESCE(CAST(s.montant_fermeture_theorique AS DECIMAL), CAST(s.montant_ouverture AS DECIMAL), 0)
           FROM sessions_caisse s
           WHERE s.caisse_id = c.id
           ORDER BY s.closed_at DESC NULLS FIRST
           LIMIT 1
          ), 0
        ) as solde
      FROM caisses c
      WHERE c.deleted_at IS NULL
        ${isAllAgences ? sql`` : sql`AND c.agence_id = ${agenceId}`}
    `);

    // 3. Total Caisses Agent (optionnel)
    const caissesAgentResult = await db.select({
      total: sum(caissesAgent.soldeValide)
    })
    .from(caissesAgent)
    .where(isAllAgences ? undefined : sql`${caissesAgent.id} IN (
      SELECT ca.id FROM caisses_agent ca
      INNER JOIN agents_terrain at ON at.id = ca.agent_id
      WHERE at.agence_id = ${agenceId}
    )`);

    // Agrégation
    const totalCoffres = coffresResult.reduce((sum, r) => sum + Number(r.total || 0), 0);

    const caisseRows = (caissesResult as any).rows || [];
    const totalCaisses = caisseRows.reduce((sum: number, r: any) => sum + Number(r.solde || 0), 0);

    const totalCaissesAgent = Number(caissesAgentResult[0]?.total || 0);

    // Breakdown par agence
    const byAgence: Record<string, { coffre: number; caisses: number; total: number }> = {};

    for (const r of coffresResult) {
      const aid = r.agenceId || 'unknown';
      if (!byAgence[aid]) byAgence[aid] = { coffre: 0, caisses: 0, total: 0 };
      byAgence[aid].coffre = Number(r.total || 0);
    }

    for (const r of caisseRows) {
      const aid = r.agence_id || 'unknown';
      if (!byAgence[aid]) byAgence[aid] = { coffre: 0, caisses: 0, total: 0 };
      byAgence[aid].caisses += Number(r.solde || 0);
    }

    for (const aid in byAgence) {
      byAgence[aid].total = byAgence[aid].coffre + byAgence[aid].caisses;
    }

    // Breakdown par caisse/coffre
    const byCaisse: Record<string, number> = {};
    const byCoffre: Record<string, number> = {};

    for (const r of caisseRows) {
      byCaisse[r.caisse_id] = Number(r.solde || 0);
    }

    for (const r of coffresResult) {
      // Note: On devrait avoir l'ID du coffre, simplifié ici
      byCoffre[r.agenceId || 'unknown'] = Number(r.total || 0);
    }

    return {
      totalCoffres,
      totalCaisses,
      totalCaissesAgent,
      grandTotal: totalCoffres + totalCaisses + totalCaissesAgent,
      breakdown: {
        byAgence,
        byCaisse,
        byCoffre
      },
      asOf: new Date()
    };
  }

  // ============================================
  // RÉCONCILIATION
  // ============================================

  /**
   * Réconcilie le solde d'un compte avec ses mouvements
   */
  async reconcileCompte(compteId: string): Promise<ReconciliationResult> {
    // 1. Solde persisté
    const [compte] = await db.select({
      id: comptes.id,
      numeroCompte: comptes.numeroCompte,
      soldeCourant: comptes.soldeCourant
    })
    .from(comptes)
    .where(eq(comptes.id, compteId));

    if (!compte) {
      throw new Error(`Compte not found: ${compteId}`);
    }

    const persistedBalance = Number(compte.soldeCourant || 0);

    // 2. Solde calculé depuis les transactions
    const [calculated] = await db.select({
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
    .where(eq(transactionsCompte.compteId, compteId));

    const calculatedBalance = Number(calculated?.total || 0);
    const discrepancy = Math.abs(persistedBalance - calculatedBalance);

    // 3. Dernier mouvement
    const [lastMouvement] = await db.select({
      id: mouvementsFinanciers.id,
      reference: mouvementsFinanciers.reference,
      dateOperation: mouvementsFinanciers.dateOperation,
      montant: mouvementsFinanciers.montant
    })
    .from(mouvementsFinanciers)
    .where(eq(mouvementsFinanciers.compteId, compteId))
    .orderBy(desc(mouvementsFinanciers.dateOperation))
    .limit(1);

    return {
      entityType: 'compte',
      entityId: compteId,
      entityRef: compte.numeroCompte,
      persistedBalance,
      calculatedBalance,
      discrepancy,
      hasDiscrepancy: discrepancy > RECONCILIATION_THRESHOLDS.MINOR,
      severity: this.getSeverity(discrepancy),
      lastMovement: lastMouvement ? {
        id: lastMouvement.id,
        reference: lastMouvement.reference,
        date: lastMouvement.dateOperation,
        montant: Number(lastMouvement.montant)
      } : undefined,
      checkedAt: new Date()
    };
  }

  /**
   * Réconcilie le solde d'une session caisse
   */
  async reconcileSessionCaisse(sessionId: string): Promise<ReconciliationResult> {
    const [session] = await db.select({
      id: sessionsCaisse.id,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      montantOuverture: sessionsCaisse.montantOuverture
    })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId));

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const persistedBalance = Number(session.montantFermetureTheorique || session.montantOuverture || 0);

    // Calculer depuis les opérations de caisse
    const [calculated] = await db.select({
      total: sql<number>`
        ${session.montantOuverture || 0}::numeric + COALESCE(SUM(
          CASE
            WHEN ${operationsCaisse.typeOperation} IN (
              'SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED',
              'SAFE_SUPPLY', 'CREDIT_REPAYMENT', 'LOAN_REPAYMENT', 'TONTINE_CONTRIBUTION',
              'MISC_COLLECTION', 'INITIAL_DEPOSIT'
            )
            THEN CAST(${operationsCaisse.montant} AS DECIMAL)
            ELSE -CAST(${operationsCaisse.montant} AS DECIMAL)
          END
        ), 0)
      `
    })
    .from(operationsCaisse)
    .where(eq(operationsCaisse.sessionId, sessionId));

    const calculatedBalance = Number(calculated?.total || 0);
    const discrepancy = Math.abs(persistedBalance - calculatedBalance);

    return {
      entityType: 'session_caisse',
      entityId: sessionId,
      persistedBalance,
      calculatedBalance,
      discrepancy,
      hasDiscrepancy: discrepancy > RECONCILIATION_THRESHOLDS.MINOR,
      severity: this.getSeverity(discrepancy),
      checkedAt: new Date()
    };
  }

  /**
   * Réconcilie le solde d'une tontine
   */
  async reconcileTontine(tontineId: string): Promise<ReconciliationResult> {
    const [tontine] = await db.select({
      id: tontines.id,
      nom: tontines.nom,
      solde: tontines.solde
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

    if (!tontine) {
      throw new Error(`Tontine not found: ${tontineId}`);
    }

    const persistedBalance = Number(tontine.solde || 0);

    // Calculer: SUM(contributions) - SUM(distributions)
    const [contributions] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(${contributionsTontine.montant} AS DECIMAL)), 0)`
    })
    .from(contributionsTontine)
    .where(and(
      eq(contributionsTontine.tontineId, tontineId),
      eq(contributionsTontine.statutTransaction, 'POSTED' as any)
    ));

    const [distributions] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(${tontineDistributionRequests.amountPaid} AS DECIMAL)), 0)`
    })
    .from(tontineDistributionRequests)
    .where(and(
      eq(tontineDistributionRequests.tontineId, tontineId),
      eq(tontineDistributionRequests.status, 'SUCCESS' as any)
    ));

    const totalContributions = Number(contributions?.total || 0);
    const totalDistributions = Number(distributions?.total || 0);
    const calculatedBalance = totalContributions - totalDistributions;
    const discrepancy = Math.abs(persistedBalance - calculatedBalance);

    return {
      entityType: 'tontine',
      entityId: tontineId,
      entityRef: tontine.nom,
      persistedBalance,
      calculatedBalance,
      discrepancy,
      hasDiscrepancy: discrepancy > RECONCILIATION_THRESHOLDS.MINOR,
      severity: this.getSeverity(discrepancy),
      checkedAt: new Date()
    };
  }

  /**
   * Réconcilie le solde d'un coffre-fort avec les transferts exécutés
   */
  async reconcileCoffre(coffreId: string): Promise<ReconciliationResult> {
    const [coffre] = await db.select({
      id: coffresForts.id,
      code: coffresForts.code,
      solde: coffresForts.solde,
    })
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreId));

    if (!coffre) {
      throw new Error(`Coffre not found: ${coffreId}`);
    }

    const persistedBalance = Number(coffre.solde || 0);

    // Calculate balance from coffre-caisse transfers (EXECUTED only)
    // CAISSE_VERS_COFFRE = inflow, COFFRE_VERS_CAISSE = outflow
    const [coffreCaisseResult] = await db.select({
      inflow: sql<number>`COALESCE(SUM(CASE WHEN ${transfertsCoffreCaisse.typeTransfert} = 'CAISSE_VERS_COFFRE' THEN CAST(${transfertsCoffreCaisse.montant} AS DECIMAL) ELSE 0 END), 0)`,
      outflow: sql<number>`COALESCE(SUM(CASE WHEN ${transfertsCoffreCaisse.typeTransfert} = 'COFFRE_VERS_CAISSE' THEN CAST(${transfertsCoffreCaisse.montant} AS DECIMAL) ELSE 0 END), 0)`,
    })
    .from(transfertsCoffreCaisse)
    .where(and(
      eq(transfertsCoffreCaisse.coffreId, coffreId),
      eq(transfertsCoffreCaisse.statut, 'EXECUTED' as any)
    ));

    // Calculate from inter-coffre transfers (RECEIVED only)
    const [interCoffreInflow] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(${transfertsInterCoffres.montant} AS DECIMAL)), 0)`,
    })
    .from(transfertsInterCoffres)
    .where(and(
      eq(transfertsInterCoffres.coffreDestinationId, coffreId),
      sql`${transfertsInterCoffres.statut} IN ('RECEIVED', 'RECEIVED_WITH_DISCREPANCY')`
    ));

    const [interCoffreOutflow] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(${transfertsInterCoffres.montant} AS DECIMAL)), 0)`,
    })
    .from(transfertsInterCoffres)
    .where(and(
      eq(transfertsInterCoffres.coffreSourceId, coffreId),
      sql`${transfertsInterCoffres.statut} IN ('RECEIVED', 'RECEIVED_WITH_DISCREPANCY')`
    ));

    const calculatedBalance =
      Number(coffreCaisseResult?.inflow || 0) - Number(coffreCaisseResult?.outflow || 0) +
      Number(interCoffreInflow?.total || 0) - Number(interCoffreOutflow?.total || 0);

    const discrepancy = Math.abs(persistedBalance - calculatedBalance);

    return {
      entityType: 'coffre',
      entityId: coffreId,
      entityRef: coffre.code,
      persistedBalance,
      calculatedBalance,
      discrepancy,
      hasDiscrepancy: discrepancy > RECONCILIATION_THRESHOLDS.MINOR,
      severity: this.getSeverity(discrepancy),
      checkedAt: new Date(),
    };
  }

  /**
   * Réconciliation complète de toutes les entités
   */
  async runFullReconciliation(agenceId?: string): Promise<ReconciliationReport> {
    const runId = `RECON-${Date.now()}`;
    const startedAt = new Date();
    const discrepancies: ReconciliationResult[] = [];

    // 1. Tous les comptes
    const allComptes = await db.select({ id: comptes.id })
      .from(comptes)
      .where(agenceId ? eq(comptes.agenceId, agenceId) : undefined);

    for (const compte of allComptes) {
      try {
        const result = await this.reconcileCompte(compte.id);
        if (result.hasDiscrepancy) {
          discrepancies.push(result);
        }
      } catch (err) {
        logger.error({ compteId: compte.id, err }, 'Reconciliation error for compte');
      }
    }

    // 2. Toutes les sessions actives
    const activeSessions = await db.select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(isNull(sessionsCaisse.closedAt));

    for (const session of activeSessions) {
      try {
        const result = await this.reconcileSessionCaisse(session.id);
        if (result.hasDiscrepancy) {
          discrepancies.push(result);
        }
      } catch (err) {
        logger.error({ sessionId: session.id, err }, 'Reconciliation error for session');
      }
    }

    // 3. Toutes les tontines actives
    const activeTontines = await db.select({ id: tontines.id })
      .from(tontines)
      .where(eq(tontines.statut, 'EN_COURS' as any));

    for (const tontine of activeTontines) {
      try {
        const result = await this.reconcileTontine(tontine.id);
        if (result.hasDiscrepancy) {
          discrepancies.push(result);
        }
      } catch (err) {
        logger.error({ tontineId: tontine.id, err }, 'Reconciliation error for tontine');
      }
    }

    // 4. Tous les coffres-forts actifs
    const activeCoffres = await db.select({ id: coffresForts.id })
      .from(coffresForts)
      .where(eq(coffresForts.statut, 'ACTIVE' as any));

    for (const coffre of activeCoffres) {
      try {
        const result = await this.reconcileCoffre(coffre.id);
        if (result.hasDiscrepancy) {
          discrepancies.push(result);
        }
      } catch (err) {
        logger.error({ coffreId: coffre.id, err }, 'Reconciliation error for coffre');
      }
    }

    const completedAt = new Date();

    // Summary
    const summary = {
      ok: 0,
      minor: 0,
      major: 0,
      critical: 0,
      totalDiscrepancyAmount: 0
    };

    for (const d of discrepancies) {
      switch (d.severity) {
        case 'MINOR': summary.minor++; break;
        case 'MAJOR': summary.major++; break;
        case 'CRITICAL': summary.critical++; break;
        default: summary.ok++;
      }
      summary.totalDiscrepancyAmount += d.discrepancy;
    }

    const totalChecked = allComptes.length + activeSessions.length + activeTontines.length + activeCoffres.length;
    summary.ok = totalChecked - discrepancies.length;

    return {
      runId,
      startedAt,
      completedAt,
      totalEntities: totalChecked,
      checkedEntities: totalChecked,
      discrepancies,
      summary
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private getSeverity(discrepancy: number): 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL' {
    if (discrepancy <= RECONCILIATION_THRESHOLDS.MINOR) return 'OK';
    if (discrepancy <= RECONCILIATION_THRESHOLDS.MAJOR) return 'MINOR';
    if (discrepancy < RECONCILIATION_THRESHOLDS.CRITICAL) return 'MAJOR';
    return 'CRITICAL';
  }

  // ============================================
  // BROADCAST BALANCE UPDATE
  // ============================================

  /**
   * Émet un événement BALANCE_UPDATED normalisé via WebSocket
   * Génère un eventId unique pour permettre l'idempotence côté client
   */
  broadcastBalanceUpdate(params: {
    entityType: BalanceEntityType;
    entityId: string;
    agenceId: string;
    newBalance: number;
    previousBalance: number;
    mouvementRef: string;
    sourceModule: string;
    typePaiement?: string;
  }): void {
    const wsInstance = getWsInstance();
    if (!wsInstance) return;

    const eventId = randomUUID();
    const payload = {
      eventId,
      ...params,
      delta: params.newBalance - params.previousBalance,
      timestamp: new Date().toISOString()
    };

    logger.info({
      entityType: params.entityType,
      entityId: params.entityId,
      newBalance: params.newBalance,
      delta: payload.delta,
      mouvementRef: params.mouvementRef,
    }, 'Balance updated');

    // Broadcast global
    wsInstance.broadcast({
      type: 'BALANCE_UPDATED' as any,
      payload
    });

    // Broadcast ciblé à l'agence
    if (params.agenceId) {
      wsInstance.broadcastToAgency(params.agenceId, {
        type: 'BALANCE_UPDATED' as any,
        payload
      });
    }

    // Broadcast au channel spécifique (pour les clients abonnés)
    wsInstance.broadcastToAggregate(params.entityType, params.entityId, {
      type: 'BALANCE_UPDATED' as any,
      payload
    });
  }
}

// Export singleton
export const balanceService = new BalanceService();
export default balanceService;
