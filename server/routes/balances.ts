/**
 * Routes API pour les soldes financiers
 * Endpoints unifiés - Source unique de vérité
 *
 * Sécurisé avec CASL pour le RBAC:
 * - Lecture des soldes: permission VIEW sur l'entité correspondante
 * - Position de trésorerie: permission VIEW sur CAISSE ou COFFRE ou DASHBOARD
 * - Réconciliation: permission VIEW sur AUDIT_LOG ou MANAGE sur COMPTABILITE
 */

import { Router } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:Balances');
import { requireAuth } from "../auth";
import { balanceService } from "../services/balance-service";
import { z } from "zod";
import {
  attachAbility,
  requireAbility,
  requireAnyAbility,
} from "../authorization/middleware";
import { Actions, Subjects } from "../authorization/types";

const router = Router();

// Apply requireAuth + attachAbility globally for all balance routes
router.use(requireAuth, attachAbility);

// ============================================
// LECTURE DES SOLDES INDIVIDUELS
// ============================================

/**
 * GET /api/balances/compte/:id
 * Récupère le solde d'un compte client
 * Requiert: VIEW sur Compte
 */
router.get("/compte/:id", requireAbility(Actions.VIEW, Subjects.COMPTE), async (req, res) => {
  try {
    const balance = await balanceService.getCompteBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching compte balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Compte non trouvé" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/caisse/:id
 * Récupère le solde d'une caisse (via session active)
 * Requiert: VIEW sur Caisse
 */
router.get("/caisse/:id", requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
  try {
    const balance = await balanceService.getCaisseBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching caisse balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Caisse non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/session/:id
 * Récupère le solde d'une session de caisse
 * Requiert: VIEW sur CaisseSession
 */
router.get("/session/:id", requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), async (req, res) => {
  try {
    const balance = await balanceService.getSessionCaisseBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching session balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Session non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/coffre/:id
 * Récupère le solde d'un coffre
 * Requiert: VIEW sur Coffre
 */
router.get("/coffre/:id", requireAbility(Actions.VIEW, Subjects.COFFRE), async (req, res) => {
  try {
    const balance = await balanceService.getCoffreBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching coffre balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Coffre non trouvé" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/credit/:id
 * Récupère le solde restant d'un crédit
 * Requiert: VIEW sur Credit
 */
router.get("/credit/:id", requireAbility(Actions.VIEW, Subjects.CREDIT), async (req, res) => {
  try {
    const balance = await balanceService.getCreditBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching credit balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Crédit non trouvé" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/tontine/:id
 * Récupère le solde d'une tontine
 * Requiert: VIEW sur Tontine
 */
router.get("/tontine/:id", requireAbility(Actions.VIEW, Subjects.TONTINE), async (req, res) => {
  try {
    const balance = await balanceService.getTontineBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching tontine balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Tontine non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

/**
 * GET /api/balances/caisse-agent/:id
 * Récupère le solde validé d'une caisse agent
 * Requiert: VIEW sur CaisseAgent
 */
router.get("/caisse-agent/:id", requireAbility(Actions.VIEW, Subjects.CAISSE_AGENT), async (req, res) => {
  try {
    const balance = await balanceService.getCaisseAgentBalance(req.params.id);
    res.json(balance);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching caisse agent balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Caisse agent non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

// ============================================
// POSITION DE TRÉSORERIE GLOBALE
// SUPPRIMÉ: Utiliser /api/treasury/v2/encaisse (Single Source of Truth depuis GL)
// ============================================

// ============================================
// RÉCONCILIATION
// Les endpoints de réconciliation nécessitent des permissions élevées
// car ils exposent des données sensibles et peuvent révéler des écarts
// ============================================

/**
 * GET /api/balances/reconcile/compte/:id
 * Réconcilie le solde d'un compte
 * Requiert: VIEW sur AuditLog OU MANAGE sur Comptabilité
 */
router.get("/reconcile/compte/:id", requireAnyAbility([
  { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  { action: Actions.MANAGE, subject: Subjects.COMPTABILITE },
]), async (req, res) => {
  try {
    const result = await balanceService.reconcileCompte(req.params.id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error reconciling compte');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Compte non trouvé" });
    }
    res.status(500).json({ error: "Erreur lors de la réconciliation" });
  }
});

/**
 * GET /api/balances/reconcile/session/:id
 * Réconcilie le solde d'une session caisse
 * Requiert: VIEW sur AuditLog OU MANAGE sur Comptabilité
 */
router.get("/reconcile/session/:id", requireAnyAbility([
  { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  { action: Actions.MANAGE, subject: Subjects.COMPTABILITE },
]), async (req, res) => {
  try {
    const result = await balanceService.reconcileSessionCaisse(req.params.id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error reconciling session');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Session non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la réconciliation" });
  }
});

/**
 * GET /api/balances/reconcile/tontine/:id
 * Réconcilie le solde d'une tontine
 * Requiert: VIEW sur AuditLog OU MANAGE sur Comptabilité
 */
router.get("/reconcile/tontine/:id", requireAnyAbility([
  { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  { action: Actions.MANAGE, subject: Subjects.COMPTABILITE },
]), async (req, res) => {
  try {
    const result = await balanceService.reconcileTontine(req.params.id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error reconciling tontine');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Tontine non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la réconciliation" });
  }
});

/**
 * POST /api/balances/reconcile/session/:id/fix
 * Recalcule et corrige le solde d'une session caisse
 * Requiert: MANAGE sur Comptabilité (action corrective)
 */
router.post("/reconcile/session/:id/fix", requireAnyAbility([
  { action: Actions.MANAGE, subject: Subjects.COMPTABILITE },
]), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = (req as any).user?.id;

    // 1. Récupérer la session et vérifier qu'elle existe
    const result = await balanceService.reconcileSessionCaisse(sessionId);

    if (!result.hasDiscrepancy) {
      return res.json({
        success: true,
        message: "Le solde est déjà correct, aucune correction nécessaire.",
        result,
      });
    }

    // 2. Corriger le solde
    const { db } = await import("../db");
    const { sessionsCaisse, sessionsCaisseAuditLogs } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    await db.update(sessionsCaisse)
      .set({
        montantFermetureTheorique: result.calculatedBalance.toString(),
        updatedAt: new Date(),
      })
      .where(eq(sessionsCaisse.id, sessionId));

    // 3. Log d'audit
    await db.insert(sessionsCaisseAuditLogs).values({
      sessionId,
      action: "BALANCE_CORRECTED",
      details: {
        oldBalance: result.persistedBalance,
        newBalance: result.calculatedBalance,
        discrepancy: result.discrepancy,
        severity: result.severity,
        correctedBy: userId,
        reason: "Réconciliation automatique via API",
      },
      userId,
    });

    logger.info({
      sessionId,
      oldBalance: result.persistedBalance,
      newBalance: result.calculatedBalance,
      userId,
    }, 'Session balance corrected');

    res.json({
      success: true,
      message: "Solde corrigé avec succès.",
      oldBalance: result.persistedBalance,
      newBalance: result.calculatedBalance,
      discrepancy: result.discrepancy,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fixing session balance');
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Session non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la correction du solde" });
  }
});

// SUPPRIMÉ: POST /api/balances/reconcile/full
// Utiliser POST /api/treasury/v2/reconciliation/run pour la réconciliation GL vs Opérationnel

export default router;
