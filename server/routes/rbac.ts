import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  userRoles,
  isCriticalPermission,
  bulkUserPermissionUpdateSchema,
  toggleUserPermissionSchema,
  type BulkUserPermissionUpdate,
} from "@shared/schema";

const logger = createLogger('Routes:RBAC');
import { SystemRole, getRoleOptions, isAdminRole, normalizeRole } from "@shared/types/roles";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility, requireAnyAbility } from "../authorization";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { logAudit } from "../audit";
import { auditTrailService } from "../services/audit-trail-service";
import { getWsInstance } from "../ws-server";
import { getPermissionsForUserV2 } from "../services/permissions-service";
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
} from "../services/rbac-service";
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
} from "../services/rbac-audit-service";
import { Actions, Subjects, type RbacUpdatePayload } from "@shared/ability";

/**
 * Helper to extract audit context from request
 */
function getAuditContext(req: Request): AuditLogContext {
  return {
    actorUserId: req.session?.user?.id || req.session?.userId || '',
    actorIp: req.ip || req.socket?.remoteAddress,
    actorUserAgent: req.headers['user-agent'],
  };
}

/**
 * Broadcast RBAC update event with proper scoping
 * - Role changes: broadcast to all users with that role
 * - User changes: broadcast to specific user only
 * - Global changes: broadcast to all
 */
async function broadcastRbacUpdate(payload: RbacUpdatePayload): Promise<void> {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  // Also include legacy event type for backwards compatibility
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
    // Send only to the specific user
    wsInstance.sendToUser(payload.userId, legacyPayload);
  } else if (payload.scope === 'role' && payload.role) {
    // Get all users with this role and send to each
    const userIds = await getUserIdsWithRole(payload.role as SystemRole, payload.agenceId);
    for (const userId of userIds) {
      wsInstance.sendToUser(userId, legacyPayload);
    }
    // Also broadcast globally for admin dashboards
    wsInstance.broadcast(legacyPayload);
  } else {
    // Global broadcast
    wsInstance.broadcast(legacyPayload);
  }
}

export function registerRbacRoutes(app: Express) {
  // ============================================
  // MODULES ENDPOINTS
  // ============================================

  // Get all modules
  app.get("/api/modules", requireAuth, async (req, res) => {
    try {
      const allModules = await db.select()
        .from(modules)
        .orderBy(modules.orderIndex);

      res.json(allModules);
    } catch (error) {
      logger.error({ err: error }, 'Get modules error');
      res.status(500).json({ message: "Erreur lors de la récupération des modules" });
    }
  });

  // Get a single module
  app.get("/api/modules/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [module] = await db.select().from(modules).where(eq(modules.id, id));

      if (!module) {
        return res.status(404).json({ message: "Module non trouvé" });
      }

      res.json(module);
    } catch (error) {
      logger.error({ err: error }, 'Get module error');
      res.status(500).json({ message: "Erreur lors de la récupération du module" });
    }
  });

  // ============================================
  // PERMISSIONS ENDPOINTS
  // ============================================

  // Get all permissions (with optional module filter)
  app.get("/api/permissions", requireAuth, async (req, res) => {
    try {
      const { module_id } = req.query;

      let query = db.select({
        id: permissions.id,
        moduleId: permissions.moduleId,
        name: permissions.name,
        code: permissions.code,
        description: permissions.description,
        moduleName: modules.name,
        moduleCategory: modules.category,
      })
        .from(permissions)
        .leftJoin(modules, eq(permissions.moduleId, modules.id))
        .orderBy(modules.orderIndex, permissions.code);

      if (module_id) {
        const allPermissions = await db.select({
          id: permissions.id,
          moduleId: permissions.moduleId,
          name: permissions.name,
          code: permissions.code,
          description: permissions.description,
          moduleName: modules.name,
          moduleCategory: modules.category,
        })
          .from(permissions)
          .leftJoin(modules, eq(permissions.moduleId, modules.id))
          .where(eq(permissions.moduleId, module_id as string))
          .orderBy(permissions.code);

        return res.json(allPermissions);
      }

      const allPermissions = await query;
      res.json(allPermissions);
    } catch (error) {
      logger.error({ err: error }, 'Get permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // ============================================
  // ROLE PERMISSIONS ENDPOINTS
  // ============================================

  // Get permissions for a specific role
  app.get("/api/role-permissions", requireAuth, async (req, res) => {
    try {
      const { role } = req.query;
      const normalizedRole = normalizeRole(role as string);

      if (!normalizedRole) {
        return res.status(400).json({ message: "Le paramètre 'role' est requis" });
      }

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
      const normalizedRole = normalizeRole(role);

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

      const normalizedRole = normalizeRole(role);
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
  app.get("/api/my-permissions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const agenceIdActive = req.session.user?.agenceId;

      if (!userId || !userRole) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // Use the V2 permissions service with CASL support
      const permissionsData = await getPermissionsForUserV2(userId, userRole, agenceIdActive);

      // Return extended response with CASL rules
      res.json(permissionsData);
    } catch (error) {
      logger.error({ err: error }, 'Get my permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // Get permissions for a specific user (admin only) - format expected by useUserPermissions hook
  app.get("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user's primary role from userRoles table (V3 multi-role architecture)
      const userRoleRes = await db.select({
        role: userRoles.role
      })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.isPrimary, true)
        ))
        .limit(1);

      const userRole = userRoleRes[0]?.role;

      if (!userRole) {
        return res.status(404).json({ message: "Utilisateur non trouvé ou sans rôle principal" });
      }

      // Get all system permissions
      const allPerms = await db.select({
        id: permissions.id,
        code: permissions.code,
        name: permissions.name,
        moduleName: modules.name,
      })
        .from(permissions)
        .leftJoin(modules, eq(permissions.moduleId, modules.id));

      // Get role permissions used for inheritance
      const rolePerms = await db.select({
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
      })
        .from(rolePermissions)
        .where(eq(rolePermissions.role, userRole));

      const rolePermIds = new Set(rolePerms.filter(rp => rp.granted).map(rp => rp.permissionId));

      // Get custom user permissions (granular)
      // Get custom user permissions (granular)
      const customPerms = await db.select({
        permissionId: userPermissions.permissionId,
        granted: userPermissions.granted
      })
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId));

      const customPermMap = new Map(customPerms.map(cp => [cp.permissionId, cp]));

      // Build response
      const result = allPerms.map(p => {
        const hasRolePerm = rolePermIds.has(p.id);
        const customPerm = customPermMap.get(p.id);

        let granted = hasRolePerm;
        let source = 'role';

        // Check for custom override
        if (customPerm) {
           granted = customPerm.granted;
           source = 'custom';
        }

        // Admin has all permissions
        if (isAdminRole(userRole)) {
          granted = true;
          source = 'role';
        }

        return {
          permission_id: p.id,
          permission_code: p.code,
          permission_name: p.name,
          module_name: p.moduleName,
          granted,
          source
        };
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Get user permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions utilisateur" });
    }
  });

  // Toggle a permission for a specific user (admin only)
  app.post("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { userId } = req.params;
      const { permission_id, granted } = req.body;

      if (!permission_id) {
        return res.status(400).json({ message: "permission_id requis" });
      }

      // Verify permission exists
      const [perm] = await db.select().from(permissions).where(eq(permissions.id, permission_id));
      if (!perm) {
        return res.status(404).json({ message: "Permission non trouvée" });
      }

      // Check if custom permission record exists
      const [existing] = await db.select({
        id: userPermissions.id
      })
        .from(userPermissions)
        .where(and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.permissionId, permission_id) // Now using permissionId
        ));

      if (existing) {
        // Update existing (granular override)
        await db.update(userPermissions)
          .set({ granted, updatedAt: new Date() })
          .where(eq(userPermissions.id, existing.id));
      } else {
        // Create new granular override
        await db.insert(userPermissions).values({
          userId,
          permissionId: permission_id,
          granted
        });
      }

      await logAudit(
        req,
        "TOGGLE_USER_PERMISSION",
        "user_permissions",
        userId,
        { permissionId: permission_id, granted, code: perm.code },
        "success",
        "high"
      );

      // Log to permission audit trail
      await auditTrailService.logPermissionChange({
        entityType: 'user',
        entityId: userId,
        permissionId: permission_id,
        permissionCode: perm.code,
        action: granted ? 'GRANT' : 'REVOKE',
        beforeState: existing ? { granted: !granted } : null,
        afterState: { granted },
      }, req.session.userId!, req);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'user_permission',
              userId,
              permissions: [{ permissionId: permission_id, granted }]
            }
          });
      }

      res.json({ message: "Permission mise à jour", permissionId: permission_id, granted });
    } catch (error) {
      logger.error({ err: error }, 'Toggle user permission error');
      res.status(500).json({ message: "Erreur lors de la modification de la permission" });
    }
  });

  // Reset all custom permissions for a user (admin only)
  app.delete("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { userId } = req.params;

      // Get existing overrides for audit
      const existingOverrides = await db.select({
        permissionId: userPermissions.permissionId,
        granted: userPermissions.granted,
        permissionCode: permissions.code,
      })
        .from(userPermissions)
        .leftJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(eq(userPermissions.userId, userId));

      await db.delete(userPermissions)
        .where(eq(userPermissions.userId, userId));

      await logAudit(
        req,
        "RESET_USER_PERMISSIONS",
        "user_permissions",
        userId,
        { count: existingOverrides.length },
        "success",
        "high"
      );

      // Log bulk audit entries for all removed overrides
      if (existingOverrides.length > 0) {
        const auditEntries = existingOverrides.map(override => ({
          entityType: 'user' as const,
          entityId: userId,
          permissionId: override.permissionId,
          permissionCode: override.permissionCode || undefined,
          action: 'BULK_REVOKE' as const,
          beforeState: { granted: override.granted },
          afterState: null,
          reason: 'Reset all user permission overrides',
        }));
        await auditTrailService.logBulkPermissionChange(auditEntries, req.session.userId!, req);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'user_permission',
              userId,
              type: 'reset'
            }
          });
      }

      res.json({ message: "Permissions réinitialisées" });
    } catch (error) {
      logger.error({ err: error }, 'Reset user permissions error');
      res.status(500).json({ message: "Erreur lors de la réinitialisation" });
    }
  });

  // Check if current user has a specific permission
  app.get("/api/rbac/check", requireAuth, async (req, res) => {
    try {
      const { module: moduleName, action } = req.query;
      const userRole = req.session.user?.role;

      if (!userRole || !moduleName || !action) {
        return res.json({ hasPermission: false });
      }

      // Administrateur has all permissions
      if (isAdminRole(userRole)) {
        return res.json({ hasPermission: true });
      }

      // Find the permission
      const [perm] = await db.select({
        permissionId: permissions.id,
      })
        .from(permissions)
        .leftJoin(modules, eq(permissions.moduleId, modules.id))
        .where(and(
          eq(modules.name, moduleName as string),
          eq(permissions.code, action as string)
        ));

      if (!perm) {
        return res.json({ hasPermission: false });
      }

      // Check role permission
      const [rolePerm] = await db.select()
        .from(rolePermissions)
        .where(and(
          eq(rolePermissions.role, userRole),
          eq(rolePermissions.permissionId, perm.permissionId),
          eq(rolePermissions.granted, true)
        ));

      res.json({ hasPermission: !!rolePerm });
    } catch (error) {
      logger.error({ err: error }, 'Check RBAC permission error');
      res.status(500).json({ hasPermission: false });
    }
  });

  // Reseed RBAC tables (admin only) - useful when role_permissions is empty
  app.post("/api/rbac/reseed", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      // Import dynamically to avoid circular dependencies
      const { seedRBAC } = await import('../seed-rbac-logic');

      logger.info('Admin triggered RBAC reseed');
      await seedRBAC();

      await logAudit(
        req,
        "RESEED_RBAC",
        "rbac",
        "system",
        { triggeredBy: req.session.user?.username },
        "success",
        "high"
      );

      // Notify all clients to refresh permissions
      const version = await getRbacVersion();
      await broadcastRbacUpdate({
        scope: 'global',
        version,
      });

      res.json({
        success: true,
        message: "RBAC reseeded successfully. All clients should refresh their permissions."
      });
    } catch (error) {
      logger.error({ err: error }, 'Reseed RBAC error');
      res.status(500).json({ message: "Erreur lors du reseed RBAC" });
    }
  });

  // ============================================
  // NEW STANDARDIZED RBAC API (V2)
  // ============================================

  /**
   * GET /api/rbac/catalog
   * Full permission catalog with modules - for "Vue Globale" UI
   * Protected: requires rbac.view or admin
   */
  app.get("/api/rbac/catalog", requireAuth, attachAbility, async (req, res) => {
    try {
      // Check permission (admin or rbac.view)
      const ability = (req as any).ability;
      if (!ability?.can(Actions.VIEW, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const catalog = await getPermissionCatalog();
      const version = await getRbacVersion();

      res.json({
        ...catalog,
        version,
      });
    } catch (error) {
      logger.error({ err: error }, 'Get RBAC catalog error');
      res.status(500).json({ message: "Erreur lors de la récupération du catalogue" });
    }
  });

  /**
   * GET /api/rbac/version
   * Current RBAC version for cache invalidation
   */
  app.get("/api/rbac/version", requireAuth, async (req, res) => {
    try {
      const version = await getRbacVersion();
      res.json({ version });
    } catch (error) {
      logger.error({ err: error }, 'Get RBAC version error');
      res.status(500).json({ message: "Erreur" });
    }
  });

  /**
   * GET /api/rbac/roles/:role/permissions
   * Get all permissions for a specific role - for "Par Rôle" UI
   * Protected: requires rbac.view or admin
   */
  app.get("/api/rbac/roles/:role/permissions", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.VIEW, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { role } = req.params;
      const normalizedRole = normalizeRole(role);

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
  app.patch("/api/rbac/roles/:role/permissions", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { role } = req.params;
      const { permissionId, granted, permissionCode } = req.body;
      const normalizedRole = normalizeRole(role);

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

      const result = await toggleRolePermission(normalizedRole, resolvedPermissionId, granted);

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
  app.put("/api/rbac/roles/:role/permissions/bulk", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { role } = req.params;
      const { updates } = req.body;
      const normalizedRole = normalizeRole(role);

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
        const { permissionId, granted, permissionCode, reason, scope = 'GLOBAL', agenceId } = req.body;

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
          const validation = validateReasonForCritical(resolvedPermissionCode, reason, reasonRequired);
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
        const result = await toggleUserPermissionOverride(userId, resolvedPermissionId, granted);

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
  app.post("/api/rbac/permissions/bulk-assign", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { assignments } = req.body;

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ message: "assignments array requis" });
      }

      const results: Array<{ role: string; permissionId: string; success: boolean; error?: string }> = [];
      const auditEntries: Array<{
        entityType: 'role';
        entityId: string;
        permissionId: string;
        permissionCode?: string;
        action: 'BULK_GRANT' | 'BULK_REVOKE';
        beforeState: any;
        afterState: any;
      }> = [];

      // Get permission codes for audit
      const permIds = [...new Set(assignments.map((a: any) => a.permissionId).filter(Boolean))];
      const allPerms = permIds.length > 0
        ? await db.select({ id: permissions.id, code: permissions.code })
            .from(permissions)
        : [];
      const permCodeMap = new Map(allPerms.map(p => [p.id, p.code]));

      // Group assignments by role for efficient processing
      const byRole = new Map<string, Array<{ permissionId: string; granted: boolean }>>();
      for (const assignment of assignments) {
        const normalizedRole = normalizeRole(assignment.role);
        if (!normalizedRole) {
          results.push({ role: assignment.role, permissionId: assignment.permissionId, success: false, error: 'Rôle invalide' });
          continue;
        }
        if (!byRole.has(normalizedRole)) {
          byRole.set(normalizedRole, []);
        }
        byRole.get(normalizedRole)!.push({ permissionId: assignment.permissionId, granted: assignment.granted });
      }

      // Process each role's assignments in transaction
      await db.transaction(async (tx) => {
        for (const [role, roleAssignments] of byRole) {
          for (const { permissionId, granted } of roleAssignments) {
            try {
              // Check if exists
              const [existing] = await tx.select()
                .from(rolePermissions)
                .where(and(
                  eq(rolePermissions.role, role as SystemRole),
                  eq(rolePermissions.permissionId, permissionId)
                ));

              const beforeGranted = existing?.granted ?? null;

              if (existing) {
                if (granted) {
                  await tx.update(rolePermissions)
                    .set({ granted: true, updatedAt: new Date() })
                    .where(eq(rolePermissions.id, existing.id));
                } else {
                  await tx.delete(rolePermissions)
                    .where(eq(rolePermissions.id, existing.id));
                }
              } else if (granted) {
                await tx.insert(rolePermissions)
                  .values({ role: role as SystemRole, permissionId, granted: true });
              }

              results.push({ role, permissionId, success: true });

              // Track for audit
              auditEntries.push({
                entityType: 'role',
                entityId: role,
                permissionId,
                permissionCode: permCodeMap.get(permissionId),
                action: granted ? 'BULK_GRANT' : 'BULK_REVOKE',
                beforeState: beforeGranted !== null ? { granted: beforeGranted } : null,
                afterState: granted ? { granted: true } : null,
              });
            } catch (err: any) {
              results.push({ role, permissionId, success: false, error: err.message });
            }
          }
        }
      });

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      const affectedRoles = [...byRole.keys()];

      await logAudit(
        req,
        "BULK_ASSIGN_PERMISSIONS",
        "rbac",
        undefined,
        { count: assignments.length, successCount, failureCount, affectedRoles },
        "success",
        "high"
      );

      // Log bulk audit entries
      if (auditEntries.length > 0) {
        await auditTrailService.logBulkPermissionChange(auditEntries, req.session.userId!, req);
      }

      // Broadcast global update (multiple roles affected)
      const version = await getRbacVersion();
      await broadcastRbacUpdate(buildRbacUpdatePayload('global', version));

      res.json({
        success: true,
        version,
        results,
        successCount,
        failureCount,
        affectedRoles,
      });
    } catch (error) {
      logger.error({ err: error }, 'Bulk assign permissions error');
      res.status(500).json({ message: "Erreur lors de l'assignation des permissions" });
    }
  });

  // ============================================
  // TEMPORARY PERMISSIONS ENDPOINTS
  // ============================================

  /**
   * GET /api/rbac/temp-permissions
   * Get all temporary permissions (admin view)
   * Protected: requires rbac.manage or admin
   */
  app.get("/api/rbac/temp-permissions", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { activeOnly = 'true', limit = '100' } = req.query;

      const { getAllTemporaryPermissions } = await import('../services/temporary-permissions-service');
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
      const ability = (req as any).ability;
      const currentUserId = req.session.userId;

      // Allow if checking own permissions or has RBAC view access
      if (userId !== currentUserId &&
          !ability?.can(Actions.VIEW, Subjects.RBAC) &&
          !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { getUserTemporaryPermissions } = await import('../services/temporary-permissions-service');
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
  app.post("/api/rbac/temp-permissions", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

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

      const { grantTemporaryPermission } = await import('../services/temporary-permissions-service');
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

      const { revokeTemporaryPermission } = await import('../services/temporary-permissions-service');
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

      const { getTemporaryPermissionsHistory } = await import('../services/temporary-permissions-service');

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

      const { getExpiringPermissions } = await import('../services/temporary-permissions-service');
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
  app.get("/api/rbac/permissions/:code/critical",
    requireAuth,
    async (req, res) => {
      try {
        const { code } = req.params;
        const isCritical = isCriticalPermission(code);
        const reasonRequired = await isReasonRequiredForCritical();

        res.json({
          permissionCode: code,
          isCritical,
          requiresReason: isCritical && reasonRequired,
        });
      } catch (error) {
        logger.error({ err: error }, 'Check critical permission error');
        res.status(500).json({ message: "Erreur lors de la vérification" });
      }
    }
  );
}
