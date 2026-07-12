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


export function registerRbacPermissionsRoutes(app: Express) {
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
        if (userRole === SystemRole.ADMIN) {
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

  // Check if current user has a specific permission (via CASL ability)
  app.get("/api/rbac/catalog", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.VIEW, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
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
  app.post("/api/rbac/permissions/bulk-assign", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
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
        const normalizedRole = asSystemRole(assignment.role);
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
  app.post("/api/rbac/permissions",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { moduleId, name, code, description } = req.body;
        if (!moduleId || !name || !code) {
          return res.status(400).json({ message: "moduleId, name et code requis" });
        }

        const created = await createPermissionService({ moduleId, name, code, description });

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'PERMISSION_CREATE' as any,
          permissionCode: created.code,
          metadata: { permissionId: created.id, moduleId, name: created.name },
        });

        const newVersion = await incrementRbacVersion('permission_create', 'permission', { id: created.id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.status(201).json(created);
      } catch (error: any) {
        if (error?.code === '23505') {
          return res.status(400).json({ message: "Une permission avec ce code existe déjà" });
        }
        logger.error({ err: error }, 'Create permission error');
        res.status(500).json({ message: "Erreur lors de la création de la permission" });
      }
    }
  );

  /**
   * PATCH /api/rbac/permissions/:id — Update a permission
   */
  app.patch("/api/rbac/permissions/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, code, description } = req.body;

        const updated = await updatePermissionService(id, {
          ...(name !== undefined && { name }),
          ...(code !== undefined && { code }),
          ...(description !== undefined && { description }),
        });

        if (!updated) {
          return res.status(404).json({ message: "Permission non trouvée" });
        }

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'PERMISSION_UPDATE' as any,
          permissionId: id,
          permissionCode: updated.code,
          metadata: { changes: req.body },
        });

        const newVersion = await incrementRbacVersion('permission_update', 'permission', { id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.json(updated);
      } catch (error: any) {
        if (error?.code === '23505') {
          return res.status(400).json({ message: "Une permission avec ce code existe déjà" });
        }
        logger.error({ err: error }, 'Update permission error');
        res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
      }
    }
  );

  /**
   * DELETE /api/rbac/permissions/:id — Delete a permission (if no active assignments)
   */
  app.delete("/api/rbac/permissions/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        // Get permission info before deletion
        const [existing] = await db.select().from(permissions).where(eq(permissions.id, id));
        if (!existing) {
          return res.status(404).json({ message: "Permission non trouvée" });
        }

        const result = await deletePermissionService(id);
        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'PERMISSION_DELETE' as any,
          permissionId: id,
          permissionCode: existing.code,
          metadata: { name: existing.name, moduleId: existing.moduleId },
        });

        const newVersion = await incrementRbacVersion('permission_delete', 'permission', { id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.status(204).send();
      } catch (error) {
        logger.error({ err: error }, 'Delete permission error');
        res.status(500).json({ message: "Erreur lors de la suppression de la permission" });
      }
    }
  );

  // ============================================================
  // AUDIT REVERT (Feature 11)
  // ============================================================

  /**
   * POST /api/rbac/audit/:id/revert — Revert a RBAC audit entry
   */
  app.get("/api/rbac/permissions/requestable",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id || req.session?.userId;
        const agenceIdActive = req.session?.user?.agenceId;
        if (!userId) return res.status(401).json({ message: "Non authentifié" });

        const { buildAbilityForUser } = await import("../../authorization/ability");

        // Build user's effective permissions
        const abilityResponse = await buildAbilityForUser({ userId, agenceIdActive });

        // Admin has all permissions — nothing to request
        if (abilityResponse.isAdmin) {
          return res.json({ permissions: [], count: 0 });
        }

        // Get user's effective permission codes
        const effectiveCodes = new Set<string>();
        for (const [module, actions] of Object.entries(abilityResponse.permissions)) {
          for (const action of actions) {
            effectiveCodes.add(`${module}.${action}`);
          }
        }

        // Get permission IDs with a PENDING request from this user (avoid duplicates)
        const pendingRequests = await db.select({ permissionId: permissionRequests.permissionId })
          .from(permissionRequests)
          .where(and(
            eq(permissionRequests.requesterId, userId),
            eq(permissionRequests.status, 'PENDING')
          ));
        const pendingPermIds = new Set(pendingRequests.map(r => r.permissionId));

        // Get all available permissions from DB
        const allPermissions = await db.select({
          id: permissions.id,
          code: permissions.code,
          name: permissions.name,
          description: permissions.description,
          moduleId: permissions.moduleId,
          moduleName: modules.name,
          moduleCategory: modules.category,
        })
          .from(permissions)
          .leftJoin(modules, eq(permissions.moduleId, modules.id))
          .orderBy(modules.orderIndex, permissions.code);

        // Filter: only permissions the user doesn't have and hasn't already requested
        const missing = allPermissions.filter(p => {
          if (pendingPermIds.has(p.id)) return false; // Already requested
          const normalizedCode = p.code.replace(/[.:]/g, '.').toLowerCase();
          return !effectiveCodes.has(p.code) && !effectiveCodes.has(normalizedCode);
        });

        // Group by module
        const grouped: Record<string, {
          moduleName: string;
          moduleCategory: string | null;
          permissions: { id: string; code: string; name: string; description: string | null }[];
        }> = {};

        for (const perm of missing) {
          const key = perm.moduleName || 'Autres';
          if (!grouped[key]) {
            grouped[key] = {
              moduleName: key,
              moduleCategory: perm.moduleCategory,
              permissions: [],
            };
          }
          grouped[key].permissions.push({
            id: perm.id,
            code: perm.code,
            name: perm.name,
            description: perm.description,
          });
        }

        res.json({
          permissions: missing.map(p => ({
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description,
            moduleName: p.moduleName,
            moduleCategory: p.moduleCategory,
          })),
          grouped: Object.values(grouped),
          count: missing.length,
        });
      } catch (error) {
        logger.error({ err: error }, 'Get requestable permissions error');
        res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
      }
    }
  );

  // ============================================================
  // PERMISSION REQUEST WORKFLOW (Feature 12)
  // ============================================================

  /**
   * POST /api/rbac/permission-requests — Create a permission request (any authenticated user)
   */
}
