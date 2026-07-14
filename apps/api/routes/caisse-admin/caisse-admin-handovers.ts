import { Actions, Subjects } from "@shared/ability";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { createLogger } from "../../lib/logger";
import { approveHandoverSchema, cancelHandoverSchema, confirmHandoverSchema, initiateHandoverSchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminHandoversRoutes(router: Router) {

  /**
   * POST /api/caisses/handovers
   * Initie un transfert de garde
   */
  router.post(
    "/handovers",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const validation = initiateHandoverSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const fromCaissierId = req.session.user!.id;
        const { handoverWorkflow } = await import("../../services/caisse/handover-workflow");
  
        const result = await handoverWorkflow.initiateHandover({
          ...validation.data,
          fromCaissierId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
  
        if (!result.success) {
          return res.status(400).json({
            error: result.error,
            errorCode: result.errorCode,
          });
        }
  
        res.status(201).json({
          handover: result.handover,
          message: 'Transfert de garde initié. En attente de confirmation par le caissier entrant.',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur initiation handover');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/handovers/pending
   * Liste les transferts en attente pour l'utilisateur courant
   */
  router.get(
    "/handovers/pending",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user!.id;
        const { handoverQueries } = await import("../../services/caisse/handover-queries");
  
        const handovers = await handoverQueries.getPendingHandovers(userId);
  
        res.json(handovers);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération handovers pending');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/handovers/:id
   * Récupère les détails d'un transfert
   */
  router.get(
    "/handovers/:id",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { handoverQueries } = await import("../../services/caisse/handover-queries");
  
        const handover = await handoverQueries.getHandoverById(req.params.handoverId);
  
        if (!handover) {
          return res.status(404).json({ error: 'Transfert non trouvé' });
        }
  
        res.json(handover);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération handover');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/handovers/:id/start-counting
   * Démarre le comptage (caissier entrant)
   */
  router.post(
    "/handovers/:id/start-counting",
    requireAuth,
    async (req, res) => {
      try {
        const { id } = req.params;
        const toCaissierId = req.session.user!.id;
        const { handoverWorkflow } = await import("../../services/caisse/handover-workflow");
  
        const result = await handoverWorkflow.startCounting(id, toCaissierId, req.ip);
  
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
  
        res.json({ message: 'Comptage démarré' });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur démarrage comptage');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/handovers/:id/confirm
   * Confirme le transfert (caissier entrant)
   */
  router.post(
    "/handovers/:id/confirm",
    requireAuth,
    async (req, res) => {
      try {
        const { id } = req.params;
        const validation = confirmHandoverSchema.safeParse(req.body);
  
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const toCaissierId = req.session.user!.id;
        const { handoverWorkflow } = await import("../../services/caisse/handover-workflow");
  
        const result = await handoverWorkflow.confirmHandover({
          handoverId: id,
          toCaissierId,
          ...validation.data,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
  
        if (!result.success) {
          return res.status(400).json({
            error: result.error,
            errorCode: result.errorCode,
          });
        }
  
        res.json({
          handover: result.handover,
          requiresApproval: result.requiresApproval,
          message: result.requiresApproval
            ? 'Écart détecté. En attente d\'approbation par un superviseur.'
            : 'Transfert confirmé. Vous êtes maintenant responsable de cette caisse.',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur confirmation handover');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/handovers/:id/approve
   * Approuve un transfert contesté (superviseur)
   */
  router.post(
    "/handovers/:id/approve",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const validation = approveHandoverSchema.safeParse(req.body);
  
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const approvedBy = req.session.user!.id;
        const { handoverWorkflow } = await import("../../services/caisse/handover-workflow");
  
        const result = await handoverWorkflow.approveDisputed(
          id,
          approvedBy,
          validation.data.comment,
          req.ip
        );
  
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
  
        res.json({
          handover: result.handover,
          message: 'Transfert approuvé et finalisé.',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur approbation handover');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/handovers/:id/cancel
   * Annule un transfert en cours
   */
  router.post(
    "/handovers/:id/cancel",
    requireAuth,
    async (req, res) => {
      try {
        const { id } = req.params;
        const validation = cancelHandoverSchema.safeParse(req.body);
  
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const cancelledBy = req.session.user!.id;
        const { handoverWorkflow } = await import("../../services/caisse/handover-workflow");
  
        const result = await handoverWorkflow.cancelHandover({
          handoverId: id,
          cancelledBy,
          reason: validation.data.reason,
          ipAddress: req.ip,
        });
  
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
  
        res.json({
          handover: result.handover,
          message: 'Transfert annulé.',
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur annulation handover');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/sessions/:sessionId/handovers
   * Historique des transferts pour une session
   */
  router.get(
    "/sessions/:sessionId/handovers",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { handoverQueries } = await import("../../services/caisse/handover-queries");
  
        const handovers = await handoverQueries.getHandoverHistory(sessionId);
  
        res.json(handovers);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération historique handovers');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - CODES DE SÉCURITÉ
  // ============================================================================
  
  const generateCodeSchema = z.object({
    agenceId: z.string().uuid().optional(),
    caisseId: z.string().uuid().optional(),
    codeType: z.enum(['EMERGENCY', 'DAILY', 'PERMANENT']),
    description: z.string().optional(),
    maxUsages: z.number().int().min(1).optional(),
    expiresInHours: z.number().int().min(1).optional(),
    authorizationDurationHours: z.number().int().min(1).max(24).optional(),
    assignedToUserId: z.string().uuid().optional(),
    sendNotification: z.boolean().optional(),
  });
  
  const validateCodeSchema = z.object({
    code: z.string().min(4).max(12),
    agenceId: z.string().uuid().optional(),
    caisseId: z.string().uuid().optional(),
    action: z.string().optional(),
  });
  
  const rotationPolicySchema = z.object({
    agenceId: z.string().uuid().optional(),
    rotationFrequencyDays: z.number().int().min(1).max(365).optional(),
    maxUsageBeforeRotation: z.number().int().min(1).optional(),
    notifyDaysBeforeExpiry: z.number().int().min(1).max(30).optional(),
    autoGenerateOnExpiry: z.boolean().optional(),
  });
  
}
