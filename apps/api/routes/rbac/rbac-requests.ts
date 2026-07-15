import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../../lib/logger";
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  userRoles,
  roleHierarchy,
  criticalPermissionPatterns,
  permissionConditionTemplates,
  permissionRequests,
  bulkUserPermissionUpdateSchema,
  toggleUserPermissionSchema,
  type BulkUserPermissionUpdate,
} from "@shared/schema";
import { isCriticalPermissionFromDb, invalidateCriticalPatternsCache } from "../../authorization/critical-patterns";

const logger = createLogger('Routes:RBAC');
import { SystemRole, getRoleOptions, isSystemRole, getRoleLabel, ROLE_LABELS } from "@shared/types/roles";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireAnyAbility, invalidateRoleHierarchyCache } from "../../authorization";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db } from "../../db";
import { logAudit } from "../../audit";
import { auditTrailService } from "../../services/audit-trail-service";
import { getWsInstance } from "../../ws-server";
import { getPermissionsForUserV2 } from "../../services/permissions-service";
import {
  getRbacVersion,
  getPermissionCatalog,
  getRolePermissions,
  toggleRolePermission,
  bulkUpdateRolePermissions,
  getUserPermissionOverrides,
  toggleUserPermissionOverride,
  resetUserPermissionOverrides,
  buildRbacUpdatePayload,
  getUserIdsWithRole,
  detectUserPermissionConflicts,
  simulateUserPermissions,
  createModule as createModuleService,
  updateModule as updateModuleService,
  deleteModule as deleteModuleService,
  createPermission as createPermissionService,
  updatePermission as updatePermissionService,
  deletePermission as deletePermissionService,
  incrementRbacVersion,
} from "../../services/rbac-service";
import {
  logRbacChange,
  logBulkRbacChange,
  requiresReason,
  validateReasonForCritical,
  isReasonRequiredForCritical,
  isScopedOverridesEnabled,
  getAuditHistory,
  explainPermission,
  getEffectivePermissionsWithSource,
  type AuditLogContext,
} from "../../services/rbac-audit-service";
import { Actions, Subjects, type RbacUpdatePayload } from "@shared/ability";
import { getPermissionMapping } from "@shared/ability/mappings";

/** Valider et convertir une chaîne en SystemRole (sans mapping d'alias) */
const asSystemRole = (v?: string | null): SystemRole | undefined =>
  v && isSystemRole(v) ? v : undefined;

/**
 * Utilitaire pour extraire le contexte d'audit depuis la requête
 */
function getAuditContext(req: Request): AuditLogContext {
  return {
    actorUserId: req.session?.user?.id || req.session?.userId || '',
    actorIp: req.ip || req.socket?.remoteAddress,
    actorUserAgent: req.headers['user-agent'],
  };
}

/**
 * Diffuser l'événement de mise à jour RBAC avec la bonne portée
 * - Changements de rôle : diffuser à tous les utilisateurs ayant ce rôle
 * - Changements d'utilisateur : diffuser uniquement à l'utilisateur spécifique
 * - Changements globaux : diffuser à tous
 */
async function broadcastRbacUpdate(payload: RbacUpdatePayload): Promise<void> {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  // Inclure également le type d'événement historique pour la rétrocompatibilité
  const legacyPayload = {
    type: "RBAC_UPDATE" as const,
    payload: {
      entity: payload.scope === 'role' ? 'role_permission' :
              payload.scope === 'user' ? 'user_permission' : 'global',
      role: payload.role,
      userId: payload.userId,
      version: payload.version,
      ...(payload.changed && { permissions: [payload.changed] })
    }
  };

  if (payload.scope === 'user' && payload.userId) {
    // Envoyer uniquement à l'utilisateur spécifique
    wsInstance.sendToUser(payload.userId, legacyPayload);
  } else if (payload.scope === 'role' && payload.role) {
    // Récupérer tous les utilisateurs ayant ce rôle et envoyer à chacun
    const userIds = await getUserIdsWithRole(payload.role as SystemRole, payload.agenceId);
    for (const userId of userIds) {
      wsInstance.sendToUser(userId, legacyPayload);
    }
    // Diffuser également globalement pour les tableaux de bord d'administration
    wsInstance.broadcast(legacyPayload);
  } else {
    // Diffusion globale
    wsInstance.broadcast(legacyPayload);
  }
}


export function registerRbacRequestsRoutes(app: Express) {
  app.post("/api/rbac/permission-requests",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const requesterId = req.session?.user?.id || req.session?.userId;
        if (!requesterId) return res.status(401).json({ message: "Non authentifié" });

        const { createPermissionRequest } = await import("../../services/permission-request-service");
        const result = await createPermissionRequest(requesterId, req.body);
        res.status(201).json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Create permission request error');
        res.status(400).json({ message: error.message || "Erreur lors de la création de la demande" });
      }
    }
  );

  /**
   * GET /api/rbac/permission-requests/my — Get current user's requests
   */
  app.get("/api/rbac/permission-requests/my",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id || req.session?.userId;
        if (!userId) return res.status(401).json({ message: "Non authentifié" });

        const { getMyRequests } = await import("../../services/permission-request-service");
        const status = req.query.status as string | undefined;
        const result = await getMyRequests(userId, { status });
        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Get my permission requests error');
        res.status(500).json({ message: "Erreur lors de la récupération des demandes" });
      }
    }
  );

  /**
   * GET /api/rbac/permission-requests — Get all requests (admin)
   */
  app.get("/api/rbac/permission-requests",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { getPendingRequests } = await import("../../services/permission-request-service");
        const status = req.query.status as string | undefined;
        const result = await getPendingRequests({ status });
        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Get permission requests error');
        res.status(500).json({ message: "Erreur lors de la récupération des demandes" });
      }
    }
  );

  /**
   * PATCH /api/rbac/permission-requests/:id — Approve/reject a request (admin)
   */
  app.patch("/api/rbac/permission-requests/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const reviewerId = req.session?.user?.id || req.session?.userId;
        if (!reviewerId) return res.status(401).json({ message: "Non authentifié" });

        const { decision, reviewReason } = req.body;
        if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
          return res.status(400).json({ message: "decision (APPROVED ou REJECTED) requis" });
        }

        const { reviewRequest } = await import("../../services/permission-request-service");
        const ctx = getAuditContext(req);
        const result = await reviewRequest(id, reviewerId, decision, reviewReason, ctx);

        if (decision === 'APPROVED') {
          const newVersion = await incrementRbacVersion('request_approved', 'permission_request', { requestId: id });
          await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));
        }

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Review permission request error');
        res.status(400).json({ message: error.message || "Erreur lors du traitement de la demande" });
      }
    }
  );

  /**
   * DELETE /api/rbac/permission-requests/:id — Cancel own request
   */
  app.delete("/api/rbac/permission-requests/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const requesterId = req.session?.user?.id || req.session?.userId;
        if (!requesterId) return res.status(401).json({ message: "Non authentifié" });

        const { cancelRequest } = await import("../../services/permission-request-service");
        await cancelRequest(id, requesterId);
        res.status(204).send();
      } catch (error: any) {
        logger.error({ err: error }, 'Cancel permission request error');
        res.status(400).json({ message: error.message || "Erreur lors de l'annulation de la demande" });
      }
    }
  );
}
