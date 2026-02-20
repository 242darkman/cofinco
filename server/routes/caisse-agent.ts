/**
 * Routes API pour la gestion des caisses agent et opérations terrain
 *
 * Endpoints - Opérations terrain:
 * - POST   /api/caisse-agent/operations-terrain          - Créer une opération
 * - POST   /api/caisse-agent/operations-terrain/:id/approve - Approuver
 * - POST   /api/caisse-agent/operations-terrain/:id/reject  - Rejeter
 * - POST   /api/caisse-agent/operations-terrain/:id/cancel  - Annuler
 * - GET    /api/caisse-agent/operations-terrain          - Liste avec filtres
 * - GET    /api/caisse-agent/operations-terrain/:id      - Détails d'une opération
 *
 * Endpoints - Caisse agent:
 * - GET    /api/caisse-agent/agents/:id/caisse           - Résumé caisse agent
 * - POST   /api/caisse-agent/agents/:id/caisse           - Créer caisse agent
 * - GET    /api/caisse-agent/agents/:id/caisse/historique - Historique opérations
 *
 * Endpoints - Sessions agent (cycle de vie GL):
 * - POST   /api/caisse-agent/sessions                    - Créer session (→ REQUESTING_FUNDS)
 * - POST   /api/caisse-agent/sessions/:id/dispatch       - Dispatcher fonds (→ ACTIVE)
 * - POST   /api/caisse-agent/sessions/:id/initiate-close - Initier clôture (→ CLOSING)
 * - POST   /api/caisse-agent/sessions/:id/finalize-close - Finaliser clôture (→ CLOSED)
 * - GET    /api/caisse-agent/sessions                    - Lister sessions
 * - GET    /api/caisse-agent/sessions/active              - Session active
 * - GET    /api/caisse-agent/sessions/:id                - Détail session
 * - GET    /api/caisse-agent/sessions/:id/audit          - Logs audit session
 *
 * Endpoints - Agent agence & GL:
 * - POST   /api/caisse-agent/agents/:id/transfer-agency  - Transférer agent
 * - GET    /api/caisse-agent/agents/:id/agency-history    - Historique agence
 * - GET    /api/caisse-agent/agents/:id/gl-account       - Info GL agent
 */

import { Router } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:CaisseAgent');
import { z } from "zod";
import {
  caisseAgentService,
  operationService,
  approvalService,
  sessionAgentService,
  agentGlProvisioningService,
} from "../services/caisse-agent";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { requireAuth, comparePasswords } from "../auth";
import { SystemRole, normalizeRole } from "@shared/types/roles";
import { db } from "../db";
import { users } from "@shared/schema/auth";
import { eq } from "drizzle-orm";
import { handleInsufficientFundsError } from "../middleware/financial-validation";
import { getWsInstance } from "../ws-server";

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
  statut: z.enum(["SUBMITTED", "APPROVED", "PENDING_SETTLEMENT", "SETTLED", "REJECTED", "CANCELLED"]).optional(),
  type: z.enum(["COLLECT_CASH", "SETTLEMENT_CASH", "PROVISIONING", "SESSION_CLOSE"]).optional(),
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
 * Admin/Superviseur: toutes les agences
 * Autres: uniquement leur agence de rattachement
 */
caisseAgentRouter.get("/operations-terrain/pending/count", async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const result = await operationService.getPendingOperationsCount(user.id, user.role, user.agenceId);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur stats pending count');
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
      const userId = req.user?.id;

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
      logger.error({ err: error }, 'Erreur création opération terrain');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/operations-terrain/bulk-approve
 * Approuve plusieurs opérations avec vérification du mot de passe
 */
caisseAgentRouter.post("/operations-terrain/bulk-approve", async (req, res) => {
  try {
    const { operationIds, password } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      return res.status(400).json({ error: "Liste d'IDs invalide" });
    }

    // Vérifier le mot de passe de l'utilisateur
    if (!password) {
      return res.status(400).json({ error: "Mot de passe requis pour la validation" });
    }

    const [user] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId));
    if (!user?.password) {
      return res.status(401).json({ error: "Utilisateur non trouvé" });
    }

    const passwordValid = await comparePasswords(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Mot de passe incorrect" });
    }

    const result = await approvalService.approveOperationsBulk({
      operationIds,
      approvedBy: userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Broadcast CAISSE_UPDATE pour rafraîchir l'historique de caisse
    try {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({
          type: "CAISSE_UPDATE",
          payload: { source: "agent_terrain_bulk_approval" },
        });
      }
    } catch {
      // WebSocket broadcast is non-critical
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Bulk approve error');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/caisse-agent/operations-terrain/:id/approve
 * Approuve une opération avec vérification du mot de passe
 */
caisseAgentRouter.post(
  "/operations-terrain/:id/approve",
  idempotencyMiddleware("approve-operation-terrain"),
  async (req, res) => {
    try {
      const operationId = req.params.id;
      const { password } = req.body;
      const userId = req.user?.id;
      const userRole = req.user?.role;

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

      // Vérifier le mot de passe de l'utilisateur
      if (!password) {
        return res.status(400).json({ error: "Mot de passe requis pour la validation" });
      }

      const [user] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId));
      if (!user?.password) {
        return res.status(401).json({ error: "Utilisateur non trouvé" });
      }

      const passwordValid = await comparePasswords(password, user.password);
      if (!passwordValid) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
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

      // Broadcast CAISSE_UPDATE pour rafraîchir l'historique de caisse en temps réel
      try {
        const ws = getWsInstance();
        if (ws && result.operation) {
          ws.broadcast({
            type: "CAISSE_UPDATE",
            payload: {
              source: "agent_terrain_approval",
              operationId: result.operation.id,
              type: result.operation.type,
            },
          });
        }
      } catch {
        // WebSocket broadcast is non-critical
      }

      res.json({
        success: true,
        operation: result.operation,
        mouvements: result.mouvements,
      });
    } catch (error: any) {
      if (handleInsufficientFundsError(error, res)) return;
      logger.error({ err: error }, 'Erreur approbation opération');
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
      const userId = req.user?.id;
      const userRole = req.user?.role;

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
      logger.error({ err: error }, 'Erreur rejet opération');
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
      const userId = req.user?.id;

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
      logger.error({ err: error }, 'Erreur annulation opération');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/operations-terrain
 * Liste les opérations avec filtres et pagination
 * Admin/Superviseur: toutes les agences
 * Autres: uniquement leur agence de rattachement
 */
caisseAgentRouter.get(
  "/operations-terrain",
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
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

      const result = await operationService.getOperations(filters as any, user.id, user.role, user.agenceId);

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
      logger.error({ err: error }, 'Erreur liste opérations');
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
      const userId = req.user?.id;

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
      logger.error({ err: error }, 'Erreur détails opération');
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
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      // Essayer de récupérer le résumé existant
      let summary = await caisseAgentService.getCaisseAgentSummary(agentId);

      // Si la caisse n'existe pas, la créer automatiquement
      if (!summary) {
        logger.info({ agentId }, 'Caisse non trouvée pour agent, tentative de création');
        const createResult = await caisseAgentService.createCaisseAgent({
          agentId,
          createdBy: userId
        });

        if (createResult.success && createResult.caisseAgent) {
          logger.info({ caisseAgentId: createResult.caisseAgent.id }, 'Caisse créée avec succès');
          summary = await caisseAgentService.getCaisseAgentSummary(agentId);
        } else {
          logger.warn({ error: createResult.error, errorCode: createResult.errorCode }, 'Échec création caisse');
        }
      }

      if (!summary) {
        return res.status(404).json({
          error: "Impossible de créer ou récupérer la caisse de l'agent. Vérifiez que l'agent existe dans la base de données.",
        });
      }

      res.json(summary);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération caisse');
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
      const userId = req.user?.id;
      const userRole = req.user?.role;

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
      logger.error({ err: error }, 'Erreur création caisse');
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
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        offset: z.coerce.number().min(0).default(0),
        statut: z.enum(["SUBMITTED", "APPROVED", "PENDING_SETTLEMENT", "SETTLED", "REJECTED", "CANCELLED"]).optional(),
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
      } as any);

      res.json({
        operations: result.operations,
        total: result.total,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur historique');
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
      const userId = req.user?.id;
      const userRole = req.user?.role;

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
      logger.error({ err: error }, 'Erreur suspension caisse');
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
      const userId = req.user?.id;
      const userRole = req.user?.role;

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
      logger.error({ err: error }, 'Erreur réactivation caisse');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - SESSIONS AGENT (Cycle de vie GL)
// ============================================================================

const createSessionSchema = z.object({
  agentId: z.string().uuid(),
  agenceId: z.string().uuid(),
  montantDemande: z.number().positive("Le montant demandé doit être positif"),
  sourceCaisseId: z.string().uuid().optional(),
  observations: z.string().optional(),
});

const dispatchFundsSchema = z.object({
  montantProvisionne: z.number().positive("Le montant doit être positif"),
  sourceCaisseId: z.string().uuid(),
});

const initiateCloseSchema = z.object({
  montantPhysique: z.number().min(0, "Le montant physique doit être >= 0"),
  billetage: z.record(z.string(), z.number()).optional(),
  destinationCaisseId: z.string().uuid(),
  observations: z.string().optional(),
});

const finalizeCloseSchema = z.object({
  montantRetourne: z.number().min(0, "Le montant retourné doit être >= 0"),
  ecartJustification: z.string().optional(),
});

const closeWithRemiseSchema = z.object({
  montantPhysique: z.number().min(0, "Le montant physique doit être >= 0"),
  billetage: z.record(z.string(), z.number()).optional(),
  destinationCaisseId: z.string().uuid(),
  observations: z.string().optional(),
  ecartJustification: z.string().optional(),
});

const transferAgencySchema = z.object({
  newAgenceId: z.string().uuid(),
  reason: z.string().min(5, "La raison doit contenir au moins 5 caractères"),
});

const listSessionsQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  agenceId: z.string().uuid().optional(),
  sourceCaisseId: z.string().uuid().optional(),
  statut: z.enum(["REQUESTING_FUNDS", "ACTIVE", "CLOSING", "CLOSED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * POST /api/caisse-agent/sessions
 * Créer une nouvelle session agent (→ REQUESTING_FUNDS)
 */
caisseAgentRouter.post("/sessions", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.flatten(),
      });
    }

    const result = await sessionAgentService.requestSession({
      ...parsed.data,
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
      session: result.session,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur création session agent');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * POST /api/caisse-agent/sessions/:id/dispatch
 * Dispatcher les fonds vers l'agent (→ ACTIVE)
 * Rôles: ADMIN, SUPERVISEUR, CHEF_AGENCE, CAISSIER
 */
caisseAgentRouter.post(
  "/sessions/:id/dispatch",
  idempotencyMiddleware("session-dispatch"),
  async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({ error: "Permission refusée", code: "FORBIDDEN" });
      }

      const parsed = dispatchFundsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await sessionAgentService.dispatchFunds({
        sessionId: req.params.id,
        montantProvisionne: parsed.data.montantProvisionne,
        sourceCaisseId: parsed.data.sourceCaisseId,
        dispatchedBy: userId,
      });

      if (!result.success) {
        const status = result.errorCode === "INSUFFICIENT_FUNDS" ? 422 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({ success: true, session: result.session });
    } catch (error: any) {
      if (handleInsufficientFundsError(error, res)) return;
      logger.error({ err: error }, 'Erreur dispatch fonds session');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisse-agent/sessions/:id/initiate-close
 * L'agent initie la clôture avec comptage physique (→ CLOSING)
 */
caisseAgentRouter.post("/sessions/:id/initiate-close", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = initiateCloseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.flatten(),
      });
    }

    const result = await sessionAgentService.initiateClose({
      sessionId: req.params.id,
      montantPhysique: parsed.data.montantPhysique,
      billetage: parsed.data.billetage,
      destinationCaisseId: parsed.data.destinationCaisseId,
      closedBy: userId,
      observations: parsed.data.observations,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        code: result.errorCode,
      });
    }

    res.json({ success: true, session: result.session });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur initiation clôture session');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * POST /api/caisse-agent/sessions/:id/finalize-close
 * Finaliser la clôture (retour fonds + gestion écart) (→ CLOSED)
 * Rôles: ADMIN, SUPERVISEUR, CHEF_AGENCE, CAISSIER
 */
caisseAgentRouter.post(
  "/sessions/:id/finalize-close",
  idempotencyMiddleware("session-finalize-close"),
  async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const normalizedRole = normalizeRole(userRole);
      const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER]);
      if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
        return res.status(403).json({ error: "Permission refusée", code: "FORBIDDEN" });
      }

      const parsed = finalizeCloseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await sessionAgentService.finalizeClose({
        sessionId: req.params.id,
        montantRetourne: parsed.data.montantRetourne,
        finalizedBy: userId,
        ecartJustification: parsed.data.ecartJustification,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({ success: true, session: result.session });
    } catch (error: any) {
      if (handleInsufficientFundsError(error, res)) return;
      logger.error({ err: error }, 'Erreur finalisation clôture session');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisse-agent/sessions/:id/close-with-remise
 * Clôture directe avec remise (ACTIVE → CLOSED en une seule étape)
 * L'agent fait son billetage, sélectionne la caisse de retour, et la session se ferme.
 */
caisseAgentRouter.post(
  "/sessions/:id/close-with-remise",
  idempotencyMiddleware("session-close-with-remise"),
  async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = closeWithRemiseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await sessionAgentService.closeWithRemise({
        sessionId: req.params.id,
        montantPhysique: parsed.data.montantPhysique,
        billetage: parsed.data.billetage,
        destinationCaisseId: parsed.data.destinationCaisseId,
        closedBy: userId,
        observations: parsed.data.observations,
        ecartJustification: parsed.data.ecartJustification,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({ success: true, session: result.session });
    } catch (error: any) {
      if (handleInsufficientFundsError(error, res)) return;
      logger.error({ err: error }, 'Erreur clôture directe session');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisse-agent/sessions
 * Lister les sessions avec filtres et pagination
 */
caisseAgentRouter.get("/sessions", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = listSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Paramètres invalides",
        details: parsed.error.flatten(),
      });
    }

    // Non-admin users can only see their agency's sessions
    const normalizedRole = normalizeRole(user.role);
    const isAdmin = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.SUPERVISEUR;
    const agenceId = isAdmin ? parsed.data.agenceId : (user.agenceId ?? undefined);

    const sessions = await sessionAgentService.listSessions({
      ...parsed.data,
      agenceId,
    });

    res.json({ sessions });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur liste sessions');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * GET /api/caisse-agent/sessions/active
 * Récupère la session active de l'agent connecté ou d'un agent donné
 */
caisseAgentRouter.get("/sessions/active", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const agentId = (req.query.agentId as string) || userId;

    const session = await sessionAgentService.getActiveSession(agentId);
    res.json({ session });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur récupération session active');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * GET /api/caisse-agent/sessions/:id
 * Détails d'une session
 */
caisseAgentRouter.get("/sessions/:id", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const session = await sessionAgentService.getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session non trouvée" });
    }

    res.json({ session });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur détails session');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * GET /api/caisse-agent/sessions/:id/audit
 * Logs d'audit d'une session
 */
caisseAgentRouter.get("/sessions/:id/audit", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const logs = await sessionAgentService.getSessionAuditLogs(req.params.id);
    res.json({ logs });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur audit session');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * POST /api/caisse-agent/agents/:id/transfer-agency
 * Transférer un agent vers une autre agence
 * Rôles: ADMIN, SUPERVISEUR
 */
caisseAgentRouter.post("/agents/:id/transfer-agency", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const normalizedRole = normalizeRole(userRole);
    const allowedRoles = new Set([SystemRole.ADMIN, SystemRole.SUPERVISEUR]);
    if (!normalizedRole || !allowedRoles.has(normalizedRole)) {
      return res.status(403).json({ error: "Permission refusée", code: "FORBIDDEN" });
    }

    const parsed = transferAgencySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.flatten(),
      });
    }

    const result = await sessionAgentService.transferAgency({
      agentId: req.params.id,
      newAgenceId: parsed.data.newAgenceId,
      reason: parsed.data.reason,
      transferredBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        code: result.errorCode,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur transfert agence');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * GET /api/caisse-agent/agents/:id/agency-history
 * Historique des assignations agence de l'agent
 */
caisseAgentRouter.get("/agents/:id/agency-history", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const history = await sessionAgentService.getAgencyHistory(req.params.id);
    res.json({ history });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur historique agence');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

/**
 * GET /api/caisse-agent/agents/:id/gl-account
 * Info sous-compte GL de l'agent pour son agence courante
 */
caisseAgentRouter.get("/agents/:id/gl-account", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const agenceId = req.query.agenceId as string;
    if (!agenceId) {
      return res.status(400).json({ error: "agenceId requis en query parameter" });
    }

    const glAccount = await agentGlProvisioningService.getGlAccountForAgency(
      req.params.id,
      agenceId,
    );

    res.json({ glAccount });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur info GL agent');
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

// ============================================================================
// ROUTES - PAIEMENTS MOBILE MONEY AGENT
// ============================================================================

import { agentMmPaymentService } from "../services/caisse-agent/agent-mm-payment-service";

const initiateMmPaymentSchema = z.object({
  agentId: z.string().uuid(),
  clientId: z.string().uuid(),
  agenceId: z.string().uuid(),
  provider: z.enum(["MTN", "AIRTEL"]),
  // Congo phone formats: 06XXXXXXXX, 05XXXXXXXX, +24206XXXXXXXX, +2426XXXXXXXX
  phone: z.string().regex(/^(?:\+242)?0?[456]\d{7,8}$/, "Format téléphone invalide (ex: 068188251 ou +242068188251)"),
  amount: z.number().positive("Le montant doit être positif"),
  typePaiement: z.enum(["CREDIT_REPAYMENT", "DEPOSIT_SAVINGS", "TONTINE_CONTRIBUTION"]),
  creditId: z.string().uuid().optional(),
  compteId: z.string().uuid().optional(),
  tontineId: z.string().uuid().optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  observations: z.string().optional(),
});

const listMmPaymentsSchema = z.object({
  agentId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  agenceId: z.string().uuid().optional(),
  statut: z.string().optional(),
  provider: z.enum(["MTN", "AIRTEL"]).optional(),
  typePaiement: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * POST /api/caisse-agent/mm-payments
 * Initie un paiement Mobile Money par un agent terrain
 *
 * Flow:
 * 1. Agent initie le paiement MM
 * 2. Le client reçoit une demande de confirmation sur son téléphone
 * 3. Sur SUCCESS (webhook), le compte client est impacté directement
 * 4. Pas de remise nécessaire pour les paiements MM
 */
caisseAgentRouter.post(
  "/mm-payments",
  idempotencyMiddleware("agent-mm-payment"),
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = initiateMmPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await agentMmPaymentService.initiatePayment({
        ...parsed.data,
        createdBy: userId,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
          payment: result.payment,
        });
      }

      res.status(201).json({
        success: true,
        payment: result.payment,
        paymentIntentId: result.paymentIntentId,
        message: "Paiement initié. Le client va recevoir une demande de confirmation.",
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur initiation paiement MM');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/mm-payments
 * Liste les paiements MM avec filtres
 */
caisseAgentRouter.get(
  "/mm-payments",
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = listMmPaymentsSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.flatten(),
        });
      }

      // Appliquer le filtre d'agence pour les non-admins
      const normalizedRole = normalizeRole(user.role);
      const isAdmin = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.SUPERVISEUR;

      const filter = {
        ...parsed.data,
        agenceId: isAdmin ? parsed.data.agenceId : (user.agenceId ?? undefined),
        from: parsed.data.from ? new Date(parsed.data.from) : undefined,
        to: parsed.data.to ? new Date(parsed.data.to) : undefined,
      };

      const result = await agentMmPaymentService.list(filter);

      res.json({
        data: result.data,
        total: result.total,
        pagination: {
          page: filter.page,
          limit: filter.limit,
          hasMore: (filter.page * filter.limit) < result.total,
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur liste paiements MM');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/mm-payments/:id
 * Détails d'un paiement MM
 */
caisseAgentRouter.get(
  "/mm-payments/:id",
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const payment = await agentMmPaymentService.getById(req.params.id);

      if (!payment) {
        return res.status(404).json({
          error: "Paiement non trouvé",
        });
      }

      res.json({ payment });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur détails paiement MM');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisse-agent/mm-payments/:id/cancel
 * Annule un paiement MM en attente
 */
caisseAgentRouter.post(
  "/mm-payments/:id/cancel",
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const result = await agentMmPaymentService.cancelPayment(req.params.id, userId);

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        payment: result.payment,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation paiement MM');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisse-agent/agents/:id/mm-payments/stats
 * Statistiques des paiements MM d'un agent
 */
caisseAgentRouter.get(
  "/agents/:id/mm-payments/stats",
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const agentId = req.params.id;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;

      const stats = await agentMmPaymentService.getAgentStats(agentId, from, to);

      res.json({ stats });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur statistiques MM');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

export default caisseAgentRouter;
