import type { Express } from "express";
import { modules, permissions, rolePermissions, userPermissions, userRoles } from "@shared/schema";
import { SystemRole, getRoleOptions, isAdminRole, normalizeRole } from "@shared/types/roles";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { logAudit } from "../audit";
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
import { Actions, Subjects, type RbacUpdatePayload } from "@shared/ability";

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
      console.error("Get modules error:", error);
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
      console.error("Get module error:", error);
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
      console.error("Get permissions error:", error);
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
      console.error("Get role permissions error:", error);
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
      console.error("Create role permission error:", error);
      res.status(500).json({ message: "Erreur lors de la création de la permission" });
    }
  });

  // Update a role permission
  app.patch("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;
      const { granted } = req.body;

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
      console.error("Update role permission error:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
    }
  });

  // Delete a role permission
  app.delete("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;

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
      console.error("Delete role permission error:", error);
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

      for (const update of permUpdates) {
        const { permissionId, granted } = update;

        // Check if exists
        const [existing] = await db.select()
          .from(rolePermissions)
          .where(and(
            eq(rolePermissions.role, normalizedRole),
            eq(rolePermissions.permissionId, permissionId)
          ));

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
      console.error("Bulk update role permissions error:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour des permissions" });
    }
  });

  // Get available roles
  app.get("/api/roles", requireAuth, async (req, res) => {
    try {
      res.json(getRoleOptions());
    } catch (error) {
      console.error("Get roles error:", error);
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
      console.error("Get my permissions error:", error);
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
      console.error("Get user permissions error:", error);
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
      console.error("Toggle user permission error:", error);
      res.status(500).json({ message: "Erreur lors de la modification de la permission" });
    }
  });

  // Reset all custom permissions for a user (admin only)
  app.delete("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { userId } = req.params;

      await db.delete(userPermissions)
        .where(eq(userPermissions.userId, userId));

      await logAudit(
        req,
        "RESET_USER_PERMISSIONS",
        "user_permissions",
        userId,
        {},
        "success",
        "high"
      );

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
      console.error("Reset user permissions error:", error);
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
      console.error("Check RBAC permission error:", error);
      res.status(500).json({ hasPermission: false });
    }
  });

  // Reseed RBAC tables (admin only) - useful when role_permissions is empty
  app.post("/api/rbac/reseed", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      // Import dynamically to avoid circular dependencies
      const { seedRBAC } = await import('../seed-rbac-logic');

      console.log('🔄 Admin triggered RBAC reseed...');
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
      console.error("Reseed RBAC error:", error);
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
      console.error("Get RBAC catalog error:", error);
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
      console.error("Get RBAC version error:", error);
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
      console.error("Get role permissions error:", error);
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
      console.error("Toggle role permission error:", error);
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
      console.error("Bulk update role permissions error:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour des permissions" });
    }
  });

  /**
   * GET /api/rbac/users/:userId/overrides
   * Get permission overrides for a user - for "Exceptions" UI
   * Protected: requires rbac.view or admin
   */
  app.get("/api/rbac/users/:userId/overrides", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.VIEW, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { userId } = req.params;
      const overrides = await getUserPermissionOverrides(userId);
      const version = await getRbacVersion();

      res.json({
        ...overrides,
        version,
      });
    } catch (error: any) {
      console.error("Get user overrides error:", error);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Erreur lors de la récupération des exceptions" });
    }
  });

  /**
   * PATCH /api/rbac/users/:userId/overrides
   * Toggle a permission override for a user - for "Exceptions" UI toggle
   * Protected: requires rbac.manage or admin
   * Body: { permissionId: string, granted: boolean | null }
   * granted=null means remove override (inherit from role)
   */
  app.patch("/api/rbac/users/:userId/overrides", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { userId } = req.params;
      const { permissionId, granted, permissionCode } = req.body;

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

      const result = await toggleUserPermissionOverride(userId, resolvedPermissionId, granted);

      await logAudit(
        req,
        "TOGGLE_USER_OVERRIDE",
        "user_permissions",
        userId,
        { permissionId: resolvedPermissionId, granted, code: perm?.code },
        "success",
        "high"
      );

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
        granted,
      });
    } catch (error: any) {
      console.error("Toggle user override error:", error);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Erreur lors de la modification de l'exception" });
    }
  });

  /**
   * POST /api/rbac/users/:userId/overrides/reset
   * Reset all permission overrides for a user - for "Exceptions" UI reset button
   * Protected: requires rbac.manage or admin
   */
  app.post("/api/rbac/users/:userId/overrides/reset", requireAuth, attachAbility, async (req, res) => {
    try {
      const ability = (req as any).ability;
      if (!ability?.can(Actions.MANAGE, Subjects.RBAC) && !ability?.can(Actions.MANAGE, Subjects.ALL)) {
        return res.status(403).json({ message: "Accès non autorisé" });
      }

      const { userId } = req.params;

      const result = await resetUserPermissionOverrides(userId);

      await logAudit(
        req,
        "RESET_USER_OVERRIDES",
        "user_permissions",
        userId,
        { deleted: result.deleted },
        "success",
        "high"
      );

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
      console.error("Reset user overrides error:", error);
      res.status(500).json({ message: "Erreur lors de la réinitialisation des exceptions" });
    }
  });
}
