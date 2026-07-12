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


export function registerRbacRolesRoutes(app: Express) {
  app.get("/api/role-permissions", requireAuth, async (req, res) => {
    try {
      const { role } = req.query;
      const normalizedRole = asSystemRole(role as string);

      if (!normalizedRole) {
        return res.status(400).json({ message: "Le paramètre 'role' est requis" });
      }

      // Direct permissions for this role
      const rolePerms = await db.select({
        id: rolePermissions.id,
        role: rolePermissions.role,
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
        permissionName: permissions.name,
        permissionCode: permissions.code,
        moduleName: modules.name,
        moduleId: modules.id,
      })
        .from(rolePermissions)
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .leftJoin(modules, eq(permissions.moduleId, modules.id))
        .where(eq(rolePermissions.role, normalizedRole));

      // Inherited permissions from child roles via hierarchy
      const { getInheritedRoles } = await import("../../authorization/ability");
      const inheritedRoleNames = await getInheritedRoles(normalizedRole);

      if (inheritedRoleNames.length > 0) {
        const directPermIds = new Set(rolePerms.map(p => p.permissionId));

        const inheritedPerms = await db.select({
          id: rolePermissions.id,
          role: rolePermissions.role,
          permissionId: rolePermissions.permissionId,
          granted: rolePermissions.granted,
          permissionName: permissions.name,
          permissionCode: permissions.code,
          moduleName: modules.name,
          moduleId: modules.id,
        })
          .from(rolePermissions)
          .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .leftJoin(modules, eq(permissions.moduleId, modules.id))
          .where(and(
            inArray(rolePermissions.role, inheritedRoleNames as SystemRole[]),
            eq(rolePermissions.granted, true)
          ));

        // Add inherited perms that are not already directly granted
        const seen = new Set<string>();
        for (const perm of inheritedPerms) {
          if (!directPermIds.has(perm.permissionId) && !seen.has(perm.permissionId)) {
            seen.add(perm.permissionId);
            rolePerms.push({
              ...perm,
              inherited: true,
              inheritedFrom: perm.role,
            } as any);
          }
        }
      }

      res.json(rolePerms);
    } catch (error) {
      logger.error({ err: error }, 'Get role permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions du rôle" });
    }
  });

  // Create a new role permission
  app.post("/api/role-permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { role, permission_id, permission_code, granted = true } = req.body;
      const normalizedRole = asSystemRole(role);

      if (!normalizedRole) {
        return res.status(400).json({ message: "Le rôle est requis" });
      }

      let permId = permission_id;

      // If permission_code is provided instead of permission_id, find the permission
      if (!permId && permission_code) {
        const [perm] = await db.select().from(permissions).where(eq(permissions.code, permission_code));
        if (!perm) {
          return res.status(404).json({ message: "Permission non trouvée" });
        }
        permId = perm.id;
      }

      if (!permId) {
        return res.status(400).json({ message: "permission_id ou permission_code est requis" });
      }

      // Check if already exists
      const [existing] = await db.select()
        .from(rolePermissions)
        .where(and(
          eq(rolePermissions.role, normalizedRole),
          eq(rolePermissions.permissionId, permId)
        ));

      if (existing) {
        // Update instead
        const [updated] = await db.update(rolePermissions)
          .set({ granted, updatedAt: new Date() })
          .where(eq(rolePermissions.id, existing.id))
          .returning();

        return res.json(updated);
      }

      // Get permission code for audit
      const [perm] = await db.select().from(permissions).where(eq(permissions.id, permId));

      const [created] = await db.insert(rolePermissions)
        .values({
          role: normalizedRole,
          permissionId: permId,
          granted,
        })
        .returning();

      await logAudit(
        req,
        "CREATE_ROLE_PERMISSION",
        "rbac",
        created.id,
        { role: normalizedRole, permissionId: permId, granted },
        "success",
        "medium"
      );

      // Log to permission audit trail
      await auditTrailService.logPermissionChange({
        entityType: 'role',
        entityId: normalizedRole,
        permissionId: permId,
        permissionCode: perm?.code,
        action: granted ? 'GRANT' : 'REVOKE',
        beforeState: null,
        afterState: { granted },
      }, req.session.userId!, req);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'role_permission',
              role: normalizedRole,
              permissions: [created]
            }
          });
      }

      res.status(201).json(created);
    } catch (error) {
      logger.error({ err: error }, 'Create role permission error');
      res.status(500).json({ message: "Erreur lors de la création de la permission" });
    }
  });

  // Update a role permission
  app.patch("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;
      const { granted } = req.body;

      // Get before state for audit
      const [existing] = await db.select({
        role: rolePermissions.role,
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
        permissionCode: permissions.code,
      })
        .from(rolePermissions)
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.id, id));

      const [updated] = await db.update(rolePermissions)
        .set({ granted, updatedAt: new Date() })
        .where(eq(rolePermissions.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Permission non trouvée" });
      }

      await logAudit(
        req,
        "UPDATE_ROLE_PERMISSION",
        "rbac",
        id,
        { granted },
        "success",
        "medium"
      );

      // Log to permission audit trail
      if (existing) {
        await auditTrailService.logPermissionChange({
          entityType: 'role',
          entityId: existing.role,
          permissionId: existing.permissionId,
          permissionCode: existing.permissionCode || undefined,
          action: granted ? 'GRANT' : 'REVOKE',
          beforeState: { granted: existing.granted },
          afterState: { granted },
        }, req.session.userId!, req);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          // Need to fetch role for optimizations
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'role_permission',
              id,
              permissions: [updated]
            }
          });
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Update role permission error');
      res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
    }
  });

  // Delete a role permission
  app.delete("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;

      // Get before state for audit
      const [existing] = await db.select({
        role: rolePermissions.role,
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
        permissionCode: permissions.code,
      })
        .from(rolePermissions)
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.id, id));

      const [deleted] = await db.delete(rolePermissions)
        .where(eq(rolePermissions.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Permission non trouvée" });
      }

      await logAudit(
        req,
        "DELETE_ROLE_PERMISSION",
        "rbac",
        id,
        { role: deleted.role, permissionId: deleted.permissionId },
        "success",
        "medium"
      );

      // Log to permission audit trail
      if (existing) {
        await auditTrailService.logPermissionChange({
          entityType: 'role',
          entityId: existing.role,
          permissionId: existing.permissionId,
          permissionCode: existing.permissionCode || undefined,
          action: 'REVOKE',
          beforeState: { granted: existing.granted },
          afterState: null,
        }, req.session.userId!, req);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'role_permission',
              role: deleted.role,
              permissions: [deleted]
            }
          });
      }

      res.json({ message: "Permission supprimée", deleted });
    } catch (error) {
      logger.error({ err: error }, 'Delete role permission error');
      res.status(500).json({ message: "Erreur lors de la suppression de la permission" });
    }
  });

  // Bulk update role permissions (toggle multiple at once)
  app.put("/api/role-permissions/bulk", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { role, permissions: permUpdates } = req.body;
      // permUpdates is an array of { permissionId, granted }

      const normalizedRole = asSystemRole(role);
      if (!normalizedRole || !Array.isArray(permUpdates)) {
        return res.status(400).json({ message: "role et permissions sont requis" });
      }

      const results = [];
      const auditEntries: Array<{
        entityType: 'role';
        entityId: string;
        permissionId: string;
        permissionCode?: string;
        action: 'GRANT' | 'REVOKE' | 'BULK_GRANT' | 'BULK_REVOKE';
        beforeState: any;
        afterState: any;
      }> = [];

      // Get permission codes for audit
      const permIds = permUpdates.map(u => u.permissionId);
      const allPerms = permIds.length > 0
        ? await db.select({ id: permissions.id, code: permissions.code })
            .from(permissions)
            .where(eq(permissions.id, permIds[0])) // Will be improved with inArray
        : [];
      const permCodeMap = new Map(allPerms.map(p => [p.id, p.code]));

      for (const update of permUpdates) {
        const { permissionId, granted } = update;

        // Check if exists
        const [existing] = await db.select()
          .from(rolePermissions)
          .where(and(
            eq(rolePermissions.role, normalizedRole),
            eq(rolePermissions.permissionId, permissionId)
          ));

        const beforeGranted = existing?.granted ?? null;

        if (existing) {
          if (granted) {
            // Update to granted
            const [updated] = await db.update(rolePermissions)
              .set({ granted: true, updatedAt: new Date() })
              .where(eq(rolePermissions.id, existing.id))
              .returning();
            results.push(updated);
          } else {
            // Delete if not granted
            await db.delete(rolePermissions)
              .where(eq(rolePermissions.id, existing.id));
            results.push({ deleted: existing.id });
          }
        } else if (granted) {
          // Create new
          const [created] = await db.insert(rolePermissions)
            .values({ role: normalizedRole, permissionId, granted: true })
            .returning();
          results.push(created);
        }

        // Track for audit
        auditEntries.push({
          entityType: 'role',
          entityId: normalizedRole,
          permissionId,
          permissionCode: permCodeMap.get(permissionId),
          action: granted ? 'BULK_GRANT' : 'BULK_REVOKE',
          beforeState: beforeGranted !== null ? { granted: beforeGranted } : null,
          afterState: granted ? { granted: true } : null,
        });
      }

      await logAudit(
        req,
        "BULK_UPDATE_ROLE_PERMISSIONS",
        "rbac",
        undefined,
        { role: normalizedRole, count: permUpdates.length },
        "success",
        "high"
      );

      // Log bulk audit entries
      if (auditEntries.length > 0) {
        await auditTrailService.logBulkPermissionChange(auditEntries, req.session.userId!, req);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'role_permission',
              role: normalizedRole,
              permissions: results
            }
          });
      }

      res.json({ message: "Permissions mises à jour", count: results.length, results });
    } catch (error) {
      logger.error({ err: error }, 'Bulk update role permissions error');
      res.status(500).json({ message: "Erreur lors de la mise à jour des permissions" });
    }
  });

  // Get available roles
  app.get("/api/roles", requireAuth, async (req, res) => {
    try {
      res.json(getRoleOptions());
    } catch (error) {
      logger.error({ err: error }, 'Get roles error');
      res.status(500).json({ message: "Erreur lors de la récupération des rôles" });
    }
  });

  // ============================================
  // USER-SPECIFIC PERMISSIONS ENDPOINTS
  // ============================================

  // Get all permissions for the current logged-in user (role + custom overrides)
  // This is the main endpoint for loading permissions dynamically
  // V2: Now includes CASL rules for frontend ability building
  app.get("/api/rbac/roles/:role/permissions", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.VIEW, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { role } = req.params;
      const normalizedRole = asSystemRole(role);

      if (!normalizedRole) {
        return res.status(400).json({ message: "Rôle invalide" });
      }

      const summary = await getRolePermissions(normalizedRole);
      const version = await getRbacVersion();

      res.json({
        ...summary,
        version,
      });
    } catch (error) {
      logger.error({ err: error }, 'Get role permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions du rôle" });
    }
  });

  /**
   * PATCH /api/rbac/roles/:role/permissions
   * Toggle a permission for a role - for "Par Rôle" UI toggle
   * Protected: requires rbac.manage or admin
   * Body: { permissionId: string, granted: boolean }
   */
  app.patch("/api/rbac/roles/:role/permissions", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { role } = req.params;
      const { permissionId, granted, permissionCode, conditions } = req.body;
      const normalizedRole = asSystemRole(role);

      if (!normalizedRole) {
        return res.status(400).json({ message: "Rôle invalide" });
      }

      // If permissionCode is provided instead of permissionId, resolve it
      let resolvedPermissionId = permissionId;
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

      // Get permission code for the event
      const [perm] = await db.select().from(permissions).where(eq(permissions.id, resolvedPermissionId));

      const result = await toggleRolePermission(normalizedRole, resolvedPermissionId, granted, conditions);

      await logAudit(
        req,
        "TOGGLE_ROLE_PERMISSION",
        "rbac",
        resolvedPermissionId,
        { role: normalizedRole, permissionId: resolvedPermissionId, granted, code: perm?.code },
        "success",
        "high"
      );

      // Log to permission audit trail
      await auditTrailService.logPermissionChange({
        entityType: 'role',
        entityId: normalizedRole,
        permissionId: resolvedPermissionId,
        permissionCode: perm?.code,
        action: granted ? 'GRANT' : 'REVOKE',
        beforeState: { granted: !granted },
        afterState: { granted },
      }, req.session.userId!, req);

      // Broadcast with proper scoping
      await broadcastRbacUpdate(buildRbacUpdatePayload('role', result.newVersion, {
        role: normalizedRole,
        permissionCode: perm?.code,
        granted,
        source: 'role_permission',
      }));

      res.json({
        success: true,
        version: result.newVersion,
        permissionId: resolvedPermissionId,
        granted,
      });
    } catch (error) {
      logger.error({ err: error }, 'Toggle role permission error');
      res.status(500).json({ message: "Erreur lors de la modification de la permission" });
    }
  });

  /**
   * PUT /api/rbac/roles/:role/permissions/bulk
   * Bulk update permissions for a role
   * Protected: requires rbac.manage or admin
   * Body: { updates: [{ permissionId: string, granted: boolean }] }
   */
  app.put("/api/rbac/roles/:role/permissions/bulk", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { role } = req.params;
      const { updates } = req.body;
      const normalizedRole = asSystemRole(role);

      if (!normalizedRole || !Array.isArray(updates)) {
        return res.status(400).json({ message: "Paramètres invalides" });
      }

      const result = await bulkUpdateRolePermissions(normalizedRole, updates);

      await logAudit(
        req,
        "BULK_UPDATE_ROLE_PERMISSIONS",
        "rbac",
        undefined,
        { role: normalizedRole, count: updates.length },
        "success",
        "high"
      );

      // Log bulk audit entries
      const auditEntries = updates.map((update: { permissionId: string; granted: boolean }) => ({
        entityType: 'role' as const,
        entityId: normalizedRole,
        permissionId: update.permissionId,
        action: update.granted ? 'BULK_GRANT' as const : 'BULK_REVOKE' as const,
        beforeState: null,
        afterState: { granted: update.granted },
      }));
      await auditTrailService.logBulkPermissionChange(auditEntries, req.session.userId!, req);

      // Broadcast
      await broadcastRbacUpdate(buildRbacUpdatePayload('role', result.newVersion, {
        role: normalizedRole,
      }));

      res.json({
        success: true,
        version: result.newVersion,
        updated: result.updated,
      });
    } catch (error) {
      logger.error({ err: error }, 'Bulk update role permissions error');
      res.status(500).json({ message: "Erreur lors de la mise à jour des permissions" });
    }
  });

  /**
   * GET /api/rbac/users/:userId/overrides
   * Get permission overrides for a user - for "Exceptions" UI
   * Protected: requires rbac.view or admin
   */
}
