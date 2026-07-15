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


export function registerRbacModulesRoutes(app: Express) {
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
  app.post("/api/rbac/modules",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { name, description, icon, category, isActive, orderIndex } = req.body;
        if (!name || !category) {
          return res.status(400).json({ message: "name et category requis" });
        }

        const created = await createModuleService({ name, description, icon, category, isActive, orderIndex });

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'MODULE_CREATE' as any,
          permissionCode: created.name,
          metadata: { moduleId: created.id, name: created.name, category: created.category },
        });

        const newVersion = await incrementRbacVersion('module_create', 'module', { id: created.id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.status(201).json(created);
      } catch (error: any) {
        if (error?.code === '23505') {
          return res.status(400).json({ message: "Un module avec ce nom existe déjà" });
        }
        logger.error({ err: error }, 'Create module error');
        res.status(500).json({ message: "Erreur lors de la création du module" });
      }
    }
  );

  /**
   * PATCH /api/rbac/modules/:id — Update a module
   */
  app.patch("/api/rbac/modules/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, description, icon, category, isActive, orderIndex } = req.body;

        const updated = await updateModuleService(id, {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(icon !== undefined && { icon }),
          ...(category !== undefined && { category }),
          ...(isActive !== undefined && { isActive }),
          ...(orderIndex !== undefined && { orderIndex }),
        });

        if (!updated) {
          return res.status(404).json({ message: "Module non trouvé" });
        }

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'MODULE_UPDATE' as any,
          permissionCode: updated.name,
          metadata: { moduleId: id, changes: req.body },
        });

        const newVersion = await incrementRbacVersion('module_update', 'module', { id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.json(updated);
      } catch (error: any) {
        if (error?.code === '23505') {
          return res.status(400).json({ message: "Un module avec ce nom existe déjà" });
        }
        logger.error({ err: error }, 'Update module error');
        res.status(500).json({ message: "Erreur lors de la mise à jour du module" });
      }
    }
  );

  /**
   * DELETE /api/rbac/modules/:id — Delete a module (if no active assignments)
   */
  app.delete("/api/rbac/modules/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        // Get module info before deletion
        const [existing] = await db.select().from(modules).where(eq(modules.id, id));
        if (!existing) {
          return res.status(404).json({ message: "Module non trouvé" });
        }

        const result = await deleteModuleService(id);
        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        const ctx = getAuditContext(req);
        await logRbacChange(ctx, {
          action: 'MODULE_DELETE' as any,
          permissionCode: existing.name,
          metadata: { moduleId: id, name: existing.name },
        });

        const newVersion = await incrementRbacVersion('module_delete', 'module', { id });
        await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

        res.status(204).send();
      } catch (error) {
        logger.error({ err: error }, 'Delete module error');
        res.status(500).json({ message: "Erreur lors de la suppression du module" });
      }
    }
  );

  /**
   * POST /api/rbac/permissions — Create a new permission
   */
}
