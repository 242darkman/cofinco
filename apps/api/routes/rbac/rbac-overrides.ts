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


export function registerRbacOverridesRoutes(app: Express) {
  app.get("/api/rbac/users/:userId/overrides",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const overrides = await getUserPermissionOverrides(userId);
        const version = await getRbacVersion();

        res.json({
          ...overrides,
          version,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Get user overrides error');
        if (error.message?.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Erreur lors de la récupération des exceptions" });
      }
    }
  );

  /**
   * PATCH /api/rbac/users/:userId/overrides
   * Toggle a permission override for a user - for "Exceptions" UI toggle
   * Protected: requires rbac.manage or admin
   * Body: { permissionId?: string, permissionCode?: string, granted: boolean | null, reason?: string }
   * granted=null means remove override (inherit from role)
   */
  app.patch("/api/rbac/users/:userId/overrides",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { permissionId, granted, permissionCode, reason, scope = 'GLOBAL', agenceId, conditions } = req.body;

        // Resolve permission ID
        let resolvedPermissionId = permissionId;
        let resolvedPermissionCode = permissionCode;

        if (!resolvedPermissionId && permissionCode) {
          const [perm] = await db.select().from(permissions).where(eq(permissions.code, permissionCode));
          if (!perm) {
            return res.status(404).json({ message: "Permission non trouvée" });
          }
          resolvedPermissionId = perm.id;
        }

        if (!resolvedPermissionId) {
          return res.status(400).json({ message: "permissionId ou permissionCode requis" });
        }

        // Get permission code for audit
        const [perm] = await db.select().from(permissions).where(eq(permissions.id, resolvedPermissionId));
        resolvedPermissionCode = perm?.code || resolvedPermissionCode;

        // Validate reason for critical permissions
        const reasonRequired = await isReasonRequiredForCritical();
        if (resolvedPermissionCode) {
          const validation = await validateReasonForCritical(resolvedPermissionCode, reason, reasonRequired);
          if (!validation.valid) {
            return res.status(400).json({ message: validation.error, requiresReason: true });
          }
        }

        // Get previous value for audit
        const [existing] = await db.select({ granted: userPermissions.granted })
          .from(userPermissions)
          .where(and(
            eq(userPermissions.userId, userId),
            eq(userPermissions.permissionId, resolvedPermissionId)
          ));
        const oldValue = existing?.granted ?? null;

        // Execute the toggle
        const result = await toggleUserPermissionOverride(userId, resolvedPermissionId, granted, conditions);

        // Log to RBAC audit trail
        await logRbacChange(getAuditContext(req), {
          targetUserId: userId,
          action: 'TOGGLE',
          permissionId: resolvedPermissionId,
          permissionCode: resolvedPermissionCode,
          oldValue,
          newValue: granted,
          scope: scope as 'GLOBAL' | 'AGENCE',
          agenceId,
          reason,
        });

        // Log to legacy audit systems
        await logAudit(
          req,
          "TOGGLE_USER_OVERRIDE",
          "user_permissions",
          userId,
          { permissionId: resolvedPermissionId, granted, code: perm?.code, reason },
          "success",
          "high"
        );

        await auditTrailService.logPermissionChange({
          entityType: 'user',
          entityId: userId,
          permissionId: resolvedPermissionId,
          permissionCode: perm?.code,
          action: granted === null ? 'REVOKE' : (granted ? 'GRANT' : 'REVOKE'),
          beforeState: oldValue !== null ? { granted: oldValue } : null,
          afterState: granted !== null ? { granted } : null,
          reason,
        }, req.session.userId!, req);

        // Broadcast to the specific user only
        await broadcastRbacUpdate(buildRbacUpdatePayload('user', result.newVersion, {
          userId,
          permissionCode: perm?.code,
          granted: granted ?? false,
          source: 'user_permission',
        }));

        res.json({
          success: true,
          version: result.newVersion,
          permissionId: resolvedPermissionId,
          permissionCode: resolvedPermissionCode,
          granted,
          previousValue: oldValue,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Toggle user override error');
        if (error.message?.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Erreur lors de la modification de l'exception" });
      }
    }
  );

  /**
   * POST /api/rbac/users/:userId/overrides/reset
   * Reset all permission overrides for a user - for "Exceptions" UI reset button
   * Protected: requires rbac.manage or admin
   * Body (optional): { reason?: string }
   */
  app.post("/api/rbac/users/:userId/overrides/reset",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { reason } = req.body || {};

        const result = await resetUserPermissionOverrides(userId);

        // Log to RBAC audit trail
        await logRbacChange(getAuditContext(req), {
          targetUserId: userId,
          action: 'RESET',
          reason: reason || 'Reset all user permission overrides',
          metadata: { deletedCount: result.deleted },
        });

        // Log to legacy audit systems
        await logAudit(
          req,
          "RESET_USER_OVERRIDES",
          "user_permissions",
          userId,
          { deleted: result.deleted, reason },
          "success",
          "high"
        );

        await auditTrailService.logPermissionChange({
          entityType: 'user',
          entityId: userId,
          action: 'BULK_REVOKE',
          beforeState: { overridesCount: result.deleted },
          afterState: null,
          reason: reason || 'Reset all user permission overrides',
        }, req.session.userId!, req);

        // Broadcast to the specific user only
        await broadcastRbacUpdate(buildRbacUpdatePayload('user', result.newVersion, {
          userId,
        }));

        res.json({
          success: true,
          version: result.newVersion,
          deleted: result.deleted,
        });
      } catch (error) {
        logger.error({ err: error }, 'Reset user overrides error');
        res.status(500).json({ message: "Erreur lors de la réinitialisation des exceptions" });
      }
    }
  );

  // ============================================
  // BULK OPERATIONS ENDPOINTS
  // ============================================

  /**
   * PUT /api/rbac/users/:userId/overrides/bulk
   * Bulk update permission overrides for a user (transactional & idempotent)
   * Protected: requires rbac.manage or admin
   * Body: { scope?: 'GLOBAL'|'AGENCE', agenceId?: string, changes: [{ permissionId?, permissionCode?, granted: boolean|null }], reason?: string }
   * granted=null removes the override (inherit from role)
   */
  app.put("/api/rbac/users/:userId/overrides/bulk",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;

        // Support both old format (updates) and new format (changes)
        const updates = req.body.changes || req.body.updates;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "updates array requis" });
      }

      // Verify user exists
      const userExists = await db.select({ id: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
        .limit(1);

      if (userExists.length === 0) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      const results: Array<{ permissionId: string; success: boolean; error?: string }> = [];
      const auditEntries: Array<{
        entityType: 'user';
        entityId: string;
        permissionId: string;
        permissionCode?: string;
        action: 'GRANT' | 'REVOKE' | 'BULK_GRANT' | 'BULK_REVOKE';
        beforeState: any;
        afterState: any;
      }> = [];

      // Get permission codes for audit
      const permIds = updates.map((u: any) => u.permissionId).filter(Boolean);
      const allPerms = permIds.length > 0
        ? await db.select({ id: permissions.id, code: permissions.code })
            .from(permissions)
        : [];
      const permCodeMap = new Map(allPerms.map(p => [p.id, p.code]));

      // Process updates in transaction
      await db.transaction(async (tx) => {
        for (const update of updates) {
          const { permissionId, granted } = update;

          if (!permissionId) {
            results.push({ permissionId: 'unknown', success: false, error: 'permissionId requis' });
            continue;
          }

          try {
            // Get existing override
            const [existing] = await tx.select()
              .from(userPermissions)
              .where(and(
                eq(userPermissions.userId, userId),
                eq(userPermissions.permissionId, permissionId)
              ));

            const beforeGranted = existing?.granted ?? null;

            if (granted === null) {
              // Remove override (inherit from role)
              if (existing) {
                await tx.delete(userPermissions)
                  .where(eq(userPermissions.id, existing.id));
              }
            } else if (existing) {
              // Update existing
              await tx.update(userPermissions)
                .set({ granted, updatedAt: new Date() })
                .where(eq(userPermissions.id, existing.id));
            } else {
              // Create new
              await tx.insert(userPermissions)
                .values({ userId, permissionId, granted });
            }

            results.push({ permissionId, success: true });

            // Track for audit
            auditEntries.push({
              entityType: 'user',
              entityId: userId,
              permissionId,
              permissionCode: permCodeMap.get(permissionId),
              action: granted === null ? 'BULK_REVOKE' : (granted ? 'BULK_GRANT' : 'BULK_REVOKE'),
              beforeState: beforeGranted !== null ? { granted: beforeGranted } : null,
              afterState: granted !== null ? { granted } : null,
            });
          } catch (err: any) {
            results.push({ permissionId, success: false, error: err.message });
          }
        }
      });

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      await logAudit(
        req,
        "BULK_UPDATE_USER_OVERRIDES",
        "user_permissions",
        userId,
        { count: updates.length, successCount, failureCount },
        "success",
        "high"
      );

      // Log bulk audit entries to legacy system
      if (auditEntries.length > 0) {
        await auditTrailService.logBulkPermissionChange(auditEntries, req.session.userId!, req);
      }

      // Log to new RBAC audit trail
      const { scope = 'GLOBAL', agenceId, reason } = req.body;
      const changes = auditEntries.map(e => ({
        permissionCode: e.permissionCode || '',
        oldValue: e.beforeState?.granted ?? null,
        newValue: e.afterState?.granted ?? null,
      }));

      if (changes.length > 0) {
        await logBulkRbacChange(getAuditContext(req), userId, changes, {
          scope: scope as 'GLOBAL' | 'AGENCE',
          agenceId,
          reason,
        });
      }

      // Broadcast to the specific user
      const version = await getRbacVersion();
      await broadcastRbacUpdate(buildRbacUpdatePayload('user', version, { userId }));

      res.json({
        success: true,
        version,
        results,
        successCount,
        failureCount,
        diff: changes,
      });
    } catch (error) {
      logger.error({ err: error }, 'Bulk update user overrides error');
      res.status(500).json({ message: "Erreur lors de la mise à jour des exceptions" });
    }
  });

  /**
   * POST /api/rbac/permissions/bulk-assign
   * Assign multiple permissions to multiple roles atomically
   * Protected: requires rbac.manage or admin
   * Body: { assignments: [{ role: string, permissionId: string, granted: boolean }] }
   */
}
