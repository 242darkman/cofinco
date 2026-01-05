import type { Express } from "express";
import { modules, permissions, rolePermissions, userPermissions } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { logAudit } from "../audit";

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

      if (!role) {
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
        .where(eq(rolePermissions.role, role as string));

      res.json(rolePerms);
    } catch (error) {
      console.error("Get role permissions error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des permissions du rôle" });
    }
  });

  // Create a new role permission
  app.post("/api/role-permissions", requireRole("admin"), async (req, res) => {
    try {
      const { role, permission_id, permission_code, granted = true } = req.body;

      if (!role) {
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
          eq(rolePermissions.role, role),
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
          role,
          permissionId: permId,
          granted,
        })
        .returning();

      await logAudit(
        req,
        "CREATE_ROLE_PERMISSION",
        "rbac",
        created.id,
        { role, permissionId: permId, granted },
        "success",
        "medium"
      );

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'permission_created', role } });
      }

      res.status(201).json(created);
    } catch (error) {
      console.error("Create role permission error:", error);
      res.status(500).json({ message: "Erreur lors de la création de la permission" });
    }
  });

  // Update a role permission
  app.patch("/api/role-permissions/:id", requireRole("admin"), async (req, res) => {
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
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'permission_updated', id } });
      }

      res.json(updated);
    } catch (error) {
      console.error("Update role permission error:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
    }
  });

  // Delete a role permission
  app.delete("/api/role-permissions/:id", requireRole("admin"), async (req, res) => {
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
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'permission_deleted', id } });
      }

      res.json({ message: "Permission supprimée", deleted });
    } catch (error) {
      console.error("Delete role permission error:", error);
      res.status(500).json({ message: "Erreur lors de la suppression de la permission" });
    }
  });

  // Bulk update role permissions (toggle multiple at once)
  app.put("/api/role-permissions/bulk", requireRole("admin"), async (req, res) => {
    try {
      const { role, permissions: permUpdates } = req.body;
      // permUpdates is an array of { permissionId, granted }

      if (!role || !Array.isArray(permUpdates)) {
        return res.status(400).json({ message: "role et permissions sont requis" });
      }

      const results = [];

      for (const update of permUpdates) {
        const { permissionId, granted } = update;

        // Check if exists
        const [existing] = await db.select()
          .from(rolePermissions)
          .where(and(
            eq(rolePermissions.role, role),
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
            .values({ role, permissionId, granted: true })
            .returning();
          results.push(created);
        }
      }

      await logAudit(
        req,
        "BULK_UPDATE_ROLE_PERMISSIONS",
        "rbac",
        undefined,
        { role, count: permUpdates.length },
        "success",
        "high"
      );

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'bulk_update', role } });
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
      const roles = [
        'Administrateur',
        "Chef d'Agence",
        'Comptable',
        'Gestionnaire Crédit',
        'Superviseur',
        'Agent Caisse',
        'Agent Terrain'
      ];

      res.json(roles);
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
  app.get("/api/my-permissions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;

      if (!userId || !userRole) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // Administrateur has all permissions
      if (userRole === 'Administrateur' || userRole === 'admin') {
        // Return all permissions as granted
        const allPerms = await db.select({
          id: permissions.id,
          code: permissions.code,
          name: permissions.name,
          moduleName: modules.name,
        })
          .from(permissions)
          .leftJoin(modules, eq(permissions.moduleId, modules.id));

        const permissionsMap: Record<string, string[]> = {};
        allPerms.forEach(p => {
          // Parse code like "caisse.view" -> module: "caisse", action: "view"
          const [module, action] = p.code.split('.');
          if (!permissionsMap[module]) {
            permissionsMap[module] = [];
          }
          if (action) {
            permissionsMap[module].push(action);
          }
        });

        // Add wildcard for admin
        permissionsMap['*'] = ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export'];

        return res.json({
          role: userRole,
          permissions: permissionsMap,
          isAdmin: true
        });
      }

      // Get role-based permissions
      const rolePerms = await db.select({
        code: permissions.code,
        granted: rolePermissions.granted,
      })
        .from(rolePermissions)
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(and(
          eq(rolePermissions.role, userRole),
          eq(rolePermissions.granted, true)
        ));

      // Get user-specific custom permissions (overrides)
      const customPerms = await db.select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId));

      // Build permissions map from role permissions
      const permissionsMap: Record<string, string[]> = {};

      rolePerms.forEach(p => {
        if (p.code) {
          const [module, action] = p.code.split('.');
          if (!permissionsMap[module]) {
            permissionsMap[module] = [];
          }
          if (action && !permissionsMap[module].includes(action)) {
            permissionsMap[module].push(action);
          }
        }
      });

      // Apply custom permission overrides (userPermissions table)
      // This uses the legacy module-based permissions (peutVoir, peutCreer, etc.)
      const actionMapping: Record<string, string> = {
        'peutVoir': 'view',
        'peutCreer': 'create',
        'peutModifier': 'edit',
        'peutSupprimer': 'delete',
        'peutValider': 'approve',
        'peutExporter': 'export'
      };

      customPerms.forEach(cp => {
        const moduleName = cp.moduleName.toLowerCase();
        if (!permissionsMap[moduleName]) {
          permissionsMap[moduleName] = [];
        }

        // Add or remove permissions based on custom settings
        Object.entries(actionMapping).forEach(([key, action]) => {
          const hasPermission = (cp as any)[key];
          const index = permissionsMap[moduleName].indexOf(action);

          if (hasPermission && index === -1) {
            permissionsMap[moduleName].push(action);
          } else if (!hasPermission && index !== -1) {
            permissionsMap[moduleName].splice(index, 1);
          }
        });
      });

      res.json({
        role: userRole,
        permissions: permissionsMap,
        isAdmin: false
      });
    } catch (error) {
      console.error("Get my permissions error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // Get permissions for a specific user (admin only) - format expected by useUserPermissions hook
  app.get("/api/user-permissions/:userId", requireRole("admin"), async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user info first
      const userRes = await db.execute(`SELECT role FROM users WHERE id = '${userId}'`);
      const userRole = (userRes.rows[0] as any)?.role;

      if (!userRole) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Get all permissions
      const allPerms = await db.select({
        id: permissions.id,
        code: permissions.code,
        name: permissions.name,
        moduleName: modules.name,
      })
        .from(permissions)
        .leftJoin(modules, eq(permissions.moduleId, modules.id));

      // Get role permissions
      const rolePerms = await db.select({
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
      })
        .from(rolePermissions)
        .where(eq(rolePermissions.role, userRole));

      const rolePermIds = new Set(rolePerms.filter(rp => rp.granted).map(rp => rp.permissionId));

      // Get custom user permissions
      const customPerms = await db.select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId));

      // Build response in format expected by useUserPermissions hook
      const result = allPerms.map(p => {
        const hasRolePerm = rolePermIds.has(p.id);
        const customPerm = customPerms.find(cp => {
          const [module] = p.code.split('.');
          return cp.moduleName.toLowerCase() === module;
        });

        let granted = hasRolePerm;
        let source = 'role';

        // Check for custom override
        if (customPerm) {
          const [, action] = p.code.split('.');
          const actionKey = {
            'view': 'peutVoir',
            'create': 'peutCreer',
            'edit': 'peutModifier',
            'delete': 'peutSupprimer',
            'approve': 'peutValider',
            'export': 'peutExporter'
          }[action];

          if (actionKey && (customPerm as any)[actionKey] !== undefined) {
            granted = (customPerm as any)[actionKey];
            source = 'custom';
          }
        }

        // Admin has all permissions
        if (userRole === 'Administrateur' || userRole === 'admin') {
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
  app.post("/api/user-permissions/:userId", requireRole("admin"), async (req, res) => {
    try {
      const { userId } = req.params;
      const { permission_id, granted } = req.body;

      if (!permission_id) {
        return res.status(400).json({ message: "permission_id requis" });
      }

      // Get permission details
      const [perm] = await db.select({
        code: permissions.code,
        moduleName: modules.name,
      })
        .from(permissions)
        .leftJoin(modules, eq(permissions.moduleId, modules.id))
        .where(eq(permissions.id, permission_id));

      if (!perm) {
        return res.status(404).json({ message: "Permission non trouvée" });
      }

      const [, action] = perm.code.split('.');
      const moduleName = perm.moduleName || perm.code.split('.')[0];

      // Map action to column name
      const actionColumn = {
        'view': 'peutVoir',
        'create': 'peutCreer',
        'edit': 'peutModifier',
        'delete': 'peutSupprimer',
        'approve': 'peutValider',
        'export': 'peutExporter'
      }[action];

      if (!actionColumn) {
        return res.status(400).json({ message: "Action non supportée" });
      }

      // Check if custom permission record exists
      const [existing] = await db.select()
        .from(userPermissions)
        .where(and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.moduleName, moduleName)
        ));

      if (existing) {
        // Update existing
        await db.update(userPermissions)
          .set({ [actionColumn]: granted, updatedAt: new Date() })
          .where(eq(userPermissions.id, existing.id));
      } else {
        // Create new with default false and set the specific permission
        const newPerm: any = {
          userId,
          moduleName,
          peutVoir: false,
          peutCreer: false,
          peutModifier: false,
          peutSupprimer: false,
          peutValider: false,
          peutExporter: false,
        };
        newPerm[actionColumn] = granted;

        await db.insert(userPermissions).values(newPerm);
      }

      await logAudit(
        req,
        "TOGGLE_USER_PERMISSION",
        "user_permissions",
        userId,
        { permissionId: permission_id, action, granted },
        "success",
        "high"
      );

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'user_permission_toggled', userId } });
      }

      res.json({ message: "Permission mise à jour", permissionId: permission_id, granted });
    } catch (error) {
      console.error("Toggle user permission error:", error);
      res.status(500).json({ message: "Erreur lors de la modification de la permission" });
    }
  });

  // Reset all custom permissions for a user (admin only)
  app.delete("/api/user-permissions/:userId", requireRole("admin"), async (req, res) => {
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
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "RBAC_UPDATE", payload: { type: 'user_permissions_reset', userId } });
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
      if (userRole === 'Administrateur' || userRole === 'admin') {
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
}
