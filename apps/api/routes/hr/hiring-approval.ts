import { Router } from "express";
/**
 * Routes RH — Approbations d'embauche (workflow hiérarchique).
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/hiring-approval/config
 *   POST   /api/hr/hiring-approval/config
 *   POST   /api/hr/hiring-approval/initialize/:candidatureId
 *   POST   /api/hr/hiring-approval/submit
 *   GET    /api/hr/hiring-approval/pending
 *   GET    /api/hr/hiring-approval/status/:candidatureId
 */
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { hiringApprovalService } from "../../services/hiring-approval-service";
import { getWsInstance } from "../../ws-server";

import { logger } from "./shared";

export const hiringApprovalRouter = Router();

/**
 * ========================================
 * HIRING APPROVAL WORKFLOW
 * ========================================
 */

// GET /api/hr/hiring-approval/config - Récupérer la config d'approbation
/**
 * GET /api/hr/hiring-approval/config
 */
hiringApprovalRouter.get("/hiring-approval/config", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { agenceId } = req.query;
    if (!agenceId) {
      return res.status(400).json({ error: "agenceId requis" });
    }

    const config = await hiringApprovalService.getConfig(agenceId as string);
    res.json(config || { approvalLevels: [] });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération config approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/config - Créer/Mettre à jour la config
/**
 * POST /api/hr/hiring-approval/config
 */
hiringApprovalRouter.post("/hiring-approval/config", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { agenceId, approvalLevels, minSalaryThreshold } = req.body;
    const userId = req.user?.id;

    if (!agenceId || !approvalLevels) {
      return res.status(400).json({ error: "agenceId et approvalLevels requis" });
    }

    const config = await hiringApprovalService.upsertConfig({
      agenceId,
      approvalLevels,
      minSalaryThreshold: minSalaryThreshold ? parseInt(minSalaryThreshold) : undefined,
      createdBy: userId || '',
    });

    res.json(config);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création config approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/initialize/:candidatureId - Initialiser le workflow
/**
 * POST /api/hr/hiring-approval/initialize/:candidatureId
 */
hiringApprovalRouter.post("/hiring-approval/initialize/:candidatureId", getAuthUser, attachAbility, requireAbility(Actions.APPROVE, Subjects.RH), async (req, res) => {
  try {
    const candidatureId = parseInt(req.params.candidatureId);
    const { agenceId } = req.body;

    if (!agenceId) {
      return res.status(400).json({ error: "agenceId requis" });
    }

    const result = await hiringApprovalService.initializeWorkflow(candidatureId, agenceId);

    // Broadcast update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'hiring_approval_initialized', candidatureId } });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur initialisation workflow approbation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/hiring-approval/submit - Soumettre une décision
/**
 * POST /api/hr/hiring-approval/submit
 */
hiringApprovalRouter.post("/hiring-approval/submit", getAuthUser, attachAbility, requireAbility(Actions.APPROVE, Subjects.RH), async (req, res) => {
  try {
    const { candidatureId, decision, commentaire } = req.body;
    const approverId = req.user?.id;

    if (!candidatureId || !decision || !approverId) {
      return res.status(400).json({ error: "candidatureId, decision et utilisateur requis" });
    }

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: "decision doit être APPROVED ou REJECTED" });
    }

    const result = await hiringApprovalService.submitApproval({
      candidatureId,
      approverId,
      decision,
      commentaire,
    });

    // Broadcast update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: {
          type: 'hiring_approval_submitted',
          candidatureId,
          decision,
          finalDecision: result.finalDecision
        }
      });
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur soumission approbation');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// GET /api/hr/hiring-approval/pending - Approbations en attente pour un rôle
/**
 * GET /api/hr/hiring-approval/pending
 */
hiringApprovalRouter.get("/hiring-approval/pending", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { role, agenceId } = req.query;

    if (!role) {
      return res.status(400).json({ error: "role requis" });
    }

    const pending = await hiringApprovalService.getPendingApprovals(
      role as string,
      agenceId as string | undefined
    );

    res.json(pending);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération approbations en attente');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/hiring-approval/status/:candidatureId - Statut du workflow
/**
 * GET /api/hr/hiring-approval/status/:candidatureId
 */
hiringApprovalRouter.get("/hiring-approval/status/:candidatureId", getAuthUser, attachAbility, async (req, res) => {
  try {
    const candidatureId = parseInt(req.params.candidatureId);
    const status = await hiringApprovalService.getWorkflowStatus(candidatureId);

    if (!status) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    res.json(status);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération statut workflow');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
