/**
 * Routes API pour la gestion des caisses agent et opérations terrain
 *
 * Endpoints:
 * - POST   /api/caisse-agent/operations-terrain          - Créer une opération
 * - POST   /api/caisse-agent/operations-terrain/:id/approve - Approuver
 * - POST   /api/caisse-agent/operations-terrain/:id/reject  - Rejeter
 * - POST   /api/caisse-agent/operations-terrain/:id/cancel  - Annuler
 * - GET    /api/caisse-agent/operations-terrain          - Liste avec filtres
 * - GET    /api/caisse-agent/operations-terrain/:id      - Détails d'une opération
 * - GET    /api/caisse-agent/agents/:id/caisse           - Résumé caisse agent
 * - POST   /api/caisse-agent/agents/:id/caisse           - Créer caisse agent
 * - GET    /api/caisse-agent/agents/:id/caisse/historique - Historique opérations
 */

import { Router } from "express";
import { z } from "zod";
import {
  caisseAgentService,
  operationService,
  approvalService,
} from "../services/caisse-agent";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { requireAuth } from "../auth";
import { SystemRole, normalizeRole } from "@shared/types/roles";

export const caisseAgentRouter = Router();

// Middleware d'authentification pour toutes les routes
caisseAgentRouter.use(requireAuth);

// ============================================================================
// SCHÉMAS DE VALIDATION
// ============================================================================

const createCollectCashSchema = z.object({
  type: z.literal("COLLECT_CASH"),
  agentId: z.string().uuid(),
  clientId: z.string().uuid(),
  montant: z.number().positive("Le montant doit être positif"),
  typePaiementClient: z.string().min(1, "Type de paiement requis"),
  creditId: z.string().uuid().optional(),
  compteId: z.string().uuid().optional(),
  tontineId: z.string().uuid().optional(),
  numeroRecu: z.string().optional(),
  observations: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

const createSettlementCashSchema = z.object({
  type: z.literal("SETTLEMENT_CASH"),
  agentId: z.string().uuid(),
  destinationCaisseId: z.string().uuid(),
  montant: z.number().positive("Le montant doit être positif"),
  observations: z.string().optional(),
  sessionCaisseId: z.string().uuid().optional(),
  billetage: z.record(z.string(), z.number()).optional(),
  idempotencyKey: z.string().optional(),
});

const createOperationSchema = z.discriminatedUnion("type", [
  createCollectCashSchema,
  createSettlementCashSchema,
]);

const rejectOperationSchema = z.object({
  reason: z.string().min(10, "La raison doit contenir au moins 10 caractères"),
});

const cancelOperationSchema = z.object({
  reason: z.string().min(5, "La raison doit contenir au moins 5 caractères"),
});

const listOperationsQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  statut: z.enum(["SUBMITTED", "APPROVED", "SETTLED", "REJECTED", "CANCELLED"]).optional(),
  type: z.enum(["COLLECT_CASH", "SETTLEMENT_CASH"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================================================
// ROUTES - OPÉRATIONS TERRAIN
// ============================================================================

/**
 * GET /api/caisse-agent/operations-terrain/pending/count
 * Récupère le nombre d'opérations en attente (SUBMITTED)
 */
caisseAgentRouter.get("/operations-terrain/pending/count", async (req, res) => {
  try {
    const result = await operationService.getPendingOperationsCount();
    res.json(result);
  } catch (error: any) {
    console.error("Erreur stats pending count:", error);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/**
 * POST /api/caisse-agent/operations-terrain
 * Crée une nouvelle opération (collecte ou remise)
 */
caisseAgentRouter.post(
  "/operations-terrain",
  idempotencyMiddleware("create-operation-terrain"),
  async (req, res) => {
    try {
      const parsed = createOperationSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      let result;
      if (data.type === "COLLECT_CASH") {
        result = await operationService.createCollectCash({
          ...data,
          submittedBy: userId,
        });
      } else {
        result = await operationService.createSettlementCash({
          ...data,
          submittedBy: userId,
        });
      }

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.status(201).json({
        success: true,
        operation: result.operation,
      });
    } catch (error: any) {
      console.error("Erreur création opération terrain:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/operations-terrain/bulk-approve
 */
caisseAgentRouter.post("/operations-terrain/bulk-approve", async (req, res) => {
  try {
    const { operationIds } = req.body;
    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      return res.status(400).json({ error: "Liste d'IDs invalide" });
    }
    const result = await approvalService.approveOperationsBulk({
      operationIds,
      approvedBy: (req as any).user!.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (error: any) {
    console.error("Bulk approve error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/caisse-agent/operations-terrain/:id/approve
 * Approuve une opération et poste les écritures
 */
caisseAgentRouter.post(
  "/operations-terrain/:id/approve",
  idempotencyMiddleware("approve-operation-terrain"),
  async (req, res) => {
    try {
      const operationId = req.params.id;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérification basique des rôles (à remplacer par RBAC complet)
      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({
          error: "Permission refusée",
          code: "FORBIDDEN",
        });
      }

      const result = await approvalService.approveOperation({
        operationId,
        approvedBy: userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        const status = result.errorCode === "INSUFFICIENT_BALANCE" ? 422 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        operation: result.operation,
        mouvements: result.mouvements,
      });
    } catch (error: any) {
      console.error("Erreur approbation opération:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/operations-terrain/:id/reject
 * Rejette une opération
 */
caisseAgentRouter.post(
  "/operations-terrain/:id/reject",
  async (req, res) => {
    try {
      const operationId = req.params.id;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérification basique des rôles
      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({
          error: "Permission refusée",
          code: "FORBIDDEN",
        });
      }

      const parsed = rejectOperationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await approvalService.rejectOperation({
        operationId,
        rejectedBy: userId,
        rejectionReason: parsed.data.reason,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        operation: result.operation,
      });
    } catch (error: any) {
      console.error("Erreur rejet opération:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/operations-terrain/:id/cancel
 * Annule une opération (seulement si SUBMITTED)
 */
caisseAgentRouter.post(
  "/operations-terrain/:id/cancel",
  async (req, res) => {
    try {
      const operationId = req.params.id;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = cancelOperationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await operationService.cancelOperation({
        operationId,
        cancelledBy: userId,
        cancellationReason: parsed.data.reason,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        operation: result.operation,
      });
    } catch (error: any) {
      console.error("Erreur annulation opération:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/operations-terrain
 * Liste les opérations avec filtres et pagination
 */
caisseAgentRouter.get(
  "/operations-terrain",
  async (req, res) => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = listOperationsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.flatten(),
        });
      }

      const filters = {
        ...parsed.data,
        dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
        dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
      };

      const result = await operationService.getOperations(filters);

      res.json({
        operations: result.operations,
        total: result.total,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + result.operations.length < result.total,
        },
      });
    } catch (error: any) {
      console.error("Erreur liste opérations:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/operations-terrain/:id
 * Détails d'une opération avec relations
 */
caisseAgentRouter.get(
  "/operations-terrain/:id",
  async (req, res) => {
    try {
      const operationId = req.params.id;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const operation = await operationService.getOperationWithRelations(operationId);

      if (!operation) {
        return res.status(404).json({
          error: "Opération non trouvée",
        });
      }

      // Récupérer les logs d'audit
      const auditLogs = await operationService.getOperationAuditLogs(operationId);

      res.json({
        operation,
        auditLogs,
      });
    } catch (error: any) {
      console.error("Erreur détails opération:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - CAISSE AGENT
// ============================================================================

/**
 * GET /api/caisse-agent/agents/:id/caisse
 * Récupère le résumé de la caisse d'un agent
 * Auto-crée la caisse si elle n'existe pas
 */
caisseAgentRouter.get(
  "/agents/:id/caisse",
  async (req, res) => {
    try {
      const agentId = req.params.id;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Essayer de récupérer le résumé existant
      let summary = await caisseAgentService.getCaisseAgentSummary(agentId);

      // Si la caisse n'existe pas, la créer automatiquement
      if (!summary) {
        console.log(`[caisse-agent] Caisse non trouvée pour agent ${agentId}, tentative de création...`);
        const createResult = await caisseAgentService.createCaisseAgent({
          agentId,
          createdBy: userId
        });

        if (createResult.success && createResult.caisseAgent) {
          console.log(`[caisse-agent] Caisse créée avec succès: ${createResult.caisseAgent.id}`);
          summary = await caisseAgentService.getCaisseAgentSummary(agentId);
        } else {
          console.log(`[caisse-agent] Échec création caisse: ${createResult.error} (${createResult.errorCode})`);
        }
      }

      if (!summary) {
        return res.status(404).json({
          error: "Impossible de créer ou récupérer la caisse de l'agent. Vérifiez que l'agent existe dans la base de données.",
        });
      }

      res.json(summary);
    } catch (error: any) {
      console.error("Erreur récupération caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/agents/:id/caisse
 * Crée une caisse pour un agent
 */
caisseAgentRouter.post(
  "/agents/:id/caisse",
  async (req, res) => {
    try {
      const agentId = req.params.id;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérification basique des rôles
      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.CHEF_AGENCE]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({
          error: "Permission refusée",
          code: "FORBIDDEN",
        });
      }

      const result = await caisseAgentService.createCaisseAgent({
        agentId,
        createdBy: userId,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.status(201).json({
        success: true,
        caisseAgent: result.caisseAgent,
      });
    } catch (error: any) {
      console.error("Erreur création caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/agents/:id/caisse/historique
 * Historique des opérations d'une caisse agent
 */
caisseAgentRouter.get(
  "/agents/:id/caisse/historique",
  async (req, res) => {
    try {
      const agentId = req.params.id;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        offset: z.coerce.number().min(0).default(0),
        statut: z.enum(["SUBMITTED", "APPROVED", "SETTLED", "REJECTED", "CANCELLED"]).optional(),
      }).safeParse(req.query);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await operationService.getOperations({
        agentId,
        ...parsed.data,
      });

      res.json({
        operations: result.operations,
        total: result.total,
      });
    } catch (error: any) {
      console.error("Erreur historique:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/agents/:id/caisse/suspend
 * Suspend une caisse agent
 */
caisseAgentRouter.post(
  "/agents/:id/caisse/suspend",
  async (req, res) => {
    try {
      const agentId = req.params.id;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérification basique des rôles
      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({
          error: "Permission refusée",
          code: "FORBIDDEN",
        });
      }

      const result = await caisseAgentService.suspendCaisseAgent({
        agentId,
        suspendedBy: userId,
        reason: req.body.reason,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
        });
      }

      res.json({
        success: true,
        caisseAgent: result.caisseAgent,
      });
    } catch (error: any) {
      console.error("Erreur suspension caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/agents/:id/caisse/reactivate
 * Réactive une caisse agent
 */
caisseAgentRouter.post(
  "/agents/:id/caisse/reactivate",
  async (req, res) => {
    try {
      const agentId = req.params.id;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Vérification basique des rôles
      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({
          error: "Permission refusée",
          code: "FORBIDDEN",
        });
      }

      const result = await caisseAgentService.reactivateCaisseAgent({
        agentId,
        reactivatedBy: userId,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
        });
      }

      res.json({
        success: true,
        caisseAgent: result.caisseAgent,
      });
    } catch (error: any) {
      console.error("Erreur réactivation caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

export default caisseAgentRouter;
