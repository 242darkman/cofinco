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
    console.error("Error fetching compte balance:", error);
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
    console.error("Error fetching caisse balance:", error);
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
    console.error("Error fetching session balance:", error);
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
    console.error("Error fetching coffre balance:", error);
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
    console.error("Error fetching credit balance:", error);
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
    console.error("Error fetching tontine balance:", error);
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
    console.error("Error fetching caisse agent balance:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Caisse agent non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la récupération du solde" });
  }
});

// ============================================
// POSITION DE TRÉSORERIE GLOBALE
// ============================================

/**
 * GET /api/balances/cash-position
 * Récupère la position de trésorerie globale
 * Requiert: VIEW sur Caisse OU Coffre OU Dashboard (pour le tableau de bord)
 */
router.get("/cash-position", requireAnyAbility([
  { action: Actions.VIEW, subject: Subjects.CAISSE },
  { action: Actions.VIEW, subject: Subjects.COFFRE },
  { action: Actions.VIEW, subject: Subjects.DASHBOARD },
]), async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string | undefined;
    const cashPosition = await balanceService.getGlobalCashPosition(agenceId);
    res.json(cashPosition);
  } catch (error: any) {
    console.error("Error fetching cash position:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la position de trésorerie" });
  }
});

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
    console.error("Error reconciling compte:", error);
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
    console.error("Error reconciling session:", error);
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
    console.error("Error reconciling tontine:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Tontine non trouvée" });
    }
    res.status(500).json({ error: "Erreur lors de la réconciliation" });
  }
});

/**
 * POST /api/balances/reconcile/full
 * Lance une réconciliation complète
 * Requiert: MANAGE sur Comptabilité (opération sensible)
 */
router.post("/reconcile/full", requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req, res) => {
  try {
    const agenceId = req.body.agenceId as string | undefined;
    const report = await balanceService.runFullReconciliation(agenceId);

    // Log l'événement
    console.log(`[RECONCILIATION] Full run completed: ${report.runId}`, {
      totalEntities: report.totalEntities,
      discrepancies: report.discrepancies.length,
      summary: report.summary
    });

    res.json(report);
  } catch (error: any) {
    console.error("Error running full reconciliation:", error);
    res.status(500).json({ error: "Erreur lors de la réconciliation complète" });
  }
});

export default router;
