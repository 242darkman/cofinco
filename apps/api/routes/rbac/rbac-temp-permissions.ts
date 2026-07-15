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


export function registerRbacTempPermissionsRoutes(app: Express) {
  app.get("/api/rbac/temp-permissions", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { activeOnly = 'true', limit = '100' } = req.query;

      const { getAllTemporaryPermissions } = await import('../../services/temporary-permissions-service');
      const tempPerms = await getAllTemporaryPermissions({
        activeOnly: activeOnly === 'true',
        limit: parseInt(limit as string, 10),
      });

      res.json({ temporaryPermissions: tempPerms });
    } catch (error) {
      logger.error({ err: error }, 'Get temp permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions temporaires" });
    }
  });

  /**
   * GET /api/rbac/users/:userId/temp-permissions
   * Get temporary permissions for a specific user
   * Protected: own user or rbac.view/admin
   */
  app.get("/api/rbac/users/:userId/temp-permissions", requireAuth, attachAbility, async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.session.userId;

      // Allow if checking own permissions or has RBAC view access
      if (userId !== currentUserId &&
          !req.ability?.can(Actions.VIEW, Subjects.RBAC) &&
          !req.ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { getUserTemporaryPermissions } = await import('../../services/temporary-permissions-service');
      const tempPerms = await getUserTemporaryPermissions(userId);

      res.json({ temporaryPermissions: tempPerms });
    } catch (error) {
      logger.error({ err: error }, 'Get user temp permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions temporaires" });
    }
  });

  /**
   * POST /api/rbac/temp-permissions
   * Grant a temporary permission
   * Protected: requires rbac.manage or admin
   * Body: { userId, permissionId?, permissionCode?, expiresAt, reason }
   */
  app.post("/api/rbac/temp-permissions", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { userId, permissionId, permissionCode, expiresAt, reason } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId requis" });
      }
      if (!permissionId && !permissionCode) {
        return res.status(400).json({ message: "permissionId ou permissionCode requis" });
      }
      if (!expiresAt) {
        return res.status(400).json({ message: "expiresAt requis" });
      }
      if (!reason) {
        return res.status(400).json({ message: "reason requis" });
      }

      // Resolve permissionId from code if needed
      let resolvedPermissionId = permissionId;
      if (!resolvedPermissionId && permissionCode) {
        const [perm] = await db.select().from(permissions).where(eq(permissions.code, permissionCode));
        if (!perm) {
          return res.status(404).json({ message: "Permission non trouvée" });
        }
        resolvedPermissionId = perm.id;
      }

      const { grantTemporaryPermission } = await import('../../services/temporary-permissions-service');
      const result = await grantTemporaryPermission({
        userId,
        permissionId: resolvedPermissionId,
        grantedBy: req.session.userId!,
        expiresAt: new Date(expiresAt),
        reason,
      });

      await logAudit(
        req,
        "GRANT_TEMP_PERMISSION",
        "temporary_permissions",
        result.id,
        { userId, permissionCode: result.permissionCode, expiresAt, reason },
        "success",
        "high"
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Grant temp permission error');
      if (error.message?.includes('existe déjà')) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || "Erreur lors de l'attribution de la permission temporaire" });
    }
  });

  /**
   * DELETE /api/rbac/temp-permissions/:id
   * Revoke a temporary permission
   * Protected: requires rbac.manage or admin
   * Body: { revokeReason? }
   */
  app.delete("/api/rbac/temp-permissions/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { id } = req.params;
      const { revokeReason } = req.body || {};

      const { revokeTemporaryPermission } = await import('../../services/temporary-permissions-service');
      await revokeTemporaryPermission(id, req.session.userId!, revokeReason);

      await logAudit(
        req,
        "REVOKE_TEMP_PERMISSION",
        "temporary_permissions",
        id,
        { revokeReason },
        "success",
        "high"
      );

      res.json({ success: true, message: "Permission temporaire révoquée" });
    } catch (error: any) {
      logger.error({ err: error }, 'Revoke temp permission error');
      if (error.message?.includes('non trouvée')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || "Erreur lors de la révocation de la permission temporaire" });
    }
  });

  /**
   * GET /api/rbac/temp-permissions/history
   * Get complete history of temporary permissions with stats
   * Protected: requires rbac.manage or admin
   * Query params: userId, permissionCode, status, startDate, endDate, limit, offset
   */
  app.get("/api/rbac/temp-permissions/history",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const {
        userId,
        permissionCode,
        status = 'all',
        startDate,
        endDate,
        limit = '50',
        offset = '0',
      } = req.query;

      const { getTemporaryPermissionsHistory } = await import('../../services/temporary-permissions-service');

      const result = await getTemporaryPermissionsHistory({
        userId: userId as string | undefined,
        permissionCode: permissionCode as string | undefined,
        status: status as 'active' | 'expired' | 'revoked' | 'all',
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Get temp permissions history error');
      res.status(500).json({ message: "Erreur lors de la récupération de l'historique" });
    }
  });

  /**
   * GET /api/rbac/temp-permissions/expiring
   * Get permissions expiring within a threshold
   * Protected: requires rbac.manage or admin
   * Query params: thresholdHours (default: 24)
   */
  app.get("/api/rbac/temp-permissions/expiring",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { thresholdHours = '24' } = req.query;
      const thresholdMs = parseInt(thresholdHours as string, 10) * 60 * 60 * 1000;

      const { getExpiringPermissions } = await import('../../services/temporary-permissions-service');
      const expiring = await getExpiringPermissions(thresholdMs);

      res.json({ expiringPermissions: expiring, thresholdHours: parseInt(thresholdHours as string, 10) });
    } catch (error) {
      logger.error({ err: error }, 'Get expiring permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions expirantes" });
    }
  });

  // ============================================
  // RBAC AUDIT LOG ENDPOINTS
  // ============================================

  /**
   * GET /api/rbac/audit
   * Get RBAC audit history with filters
   * Protected: requires rbac.manage or admin
   * Query params: actorUserId, targetUserId, targetRole, action, permissionCode, scope, agenceId, startDate, endDate, limit, offset
   */
}
