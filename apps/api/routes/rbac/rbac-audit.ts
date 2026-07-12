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


export function registerRbacAuditRoutes(app: Express) {
  app.get("/api/rbac/audit",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const {
          actorUserId,
          targetUserId,
          targetRole,
          action,
          permissionCode,
          scope,
          agenceId,
          startDate,
          endDate,
          limit = '50',
          offset = '0',
        } = req.query;

        const result = await getAuditHistory({
          actorUserId: actorUserId as string | undefined,
          targetUserId: targetUserId as string | undefined,
          targetRole: targetRole as string | undefined,
          action: action as any,
          permissionCode: permissionCode as string | undefined,
          scope: scope as 'GLOBAL' | 'AGENCE' | undefined,
          agenceId: agenceId as string | undefined,
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        });

        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Get RBAC audit history error');
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique d'audit" });
      }
    }
  );

  /**
   * GET /api/rbac/users/:userId/audit
   * Get RBAC audit history for a specific user (as target)
   * Protected: requires rbac.view or admin
   */
  app.get("/api/rbac/users/:userId/audit",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { limit = '50', offset = '0' } = req.query;

        const result = await getAuditHistory({
          targetUserId: userId,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        });

        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Get user RBAC audit history error');
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique d'audit" });
      }
    }
  );

  // ============================================
  // PERMISSION EXPLANATION ENDPOINTS
  // ============================================

  /**
   * GET /api/rbac/users/:userId/permissions/effective
   * Get effective permissions with their source for a user
   * Protected: requires rbac.view or admin
   */
  app.get("/api/rbac/users/:userId/permissions/effective",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { agenceId } = req.query;

        const permissions = await getEffectivePermissionsWithSource(
          userId,
          agenceId as string | undefined
        );

        const version = await getRbacVersion();

        res.json({
          userId,
          agenceId: agenceId || null,
          version,
          permissions,
          totalCount: permissions.length,
          grantedCount: permissions.filter(p => p.granted).length,
          deniedCount: permissions.filter(p => !p.granted).length,
        });
      } catch (error) {
        logger.error({ err: error }, 'Get effective permissions with source error');
        res.status(500).json({ message: "Erreur lors de la récupération des permissions effectives" });
      }
    }
  );

  /**
   * GET /api/rbac/users/:userId/permissions/explain
   * Explain why a user has or doesn't have a specific permission
   * Protected: requires rbac.view or admin
   * Query params: permissionCode (required), agenceId (optional)
   */
  app.get("/api/rbac/users/:userId/permissions/explain",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { permissionCode, agenceId } = req.query;

        if (!permissionCode) {
          return res.status(400).json({ message: "permissionCode est requis" });
        }

        const explanation = await explainPermission(
          userId,
          permissionCode as string,
          agenceId as string | undefined
        );

        res.json(explanation);
      } catch (error) {
        logger.error({ err: error }, 'Explain permission error');
        res.status(500).json({ message: "Erreur lors de l'explication de la permission" });
      }
    }
  );

  /**
   * GET /api/rbac/permissions/:code/critical
   * Check if a permission is critical (requires reason for changes)
   * Protected: requires authentication
   */
  app.post("/api/rbac/audit/:id/revert",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        const { revertAuditEntry } = await import("../../services/rbac-audit-service");
        const ctx = getAuditContext(req);
        const result = await revertAuditEntry(id, ctx, reason);

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        const newVersion = await incrementRbacVersion('revert', 'audit', { revertedAuditId: id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.json({ ...result, newVersion });
      } catch (error) {
        logger.error({ err: error }, 'Revert audit entry error');
        res.status(500).json({ message: "Erreur lors de l'annulation" });
      }
    }
  );

  // ============================================================
  // REQUESTABLE PERMISSIONS (for permission request form)
  // ============================================================

  /**
   * GET /api/rbac/permissions/requestable
   * Returns permissions the user does NOT already have, grouped by module.
   * Admin gets empty list (they have all permissions).
   */
}
