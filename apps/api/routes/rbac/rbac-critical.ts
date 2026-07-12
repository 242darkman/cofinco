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


export function registerRbacCriticalRoutes(app: Express) {
  app.get("/api/rbac/permissions/:code/critical",
    requireAuth,
    async (req, res) => {
      try {
        const { code } = req.params;
        const isCritical = await isCriticalPermissionFromDb(code);
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

  // ============================================================
  // ROLE HIERARCHY
  // ============================================================

  /**
   * GET /api/rbac/role-hierarchy
   * Get role hierarchy tree with permission counts
   */
  app.get("/api/rbac/critical-patterns",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (_req: Request, res: Response) => {
      try {
        const patterns = await db
          .select()
          .from(criticalPermissionPatterns)
          .orderBy(criticalPermissionPatterns.pattern);

        res.json(patterns);
      } catch (error) {
        logger.error({ err: error }, 'Get critical patterns error');
        res.status(500).json({ message: "Erreur lors de la récupération des patterns critiques" });
      }
    }
  );

  /**
   * POST /api/rbac/critical-patterns
   * Create a new critical permission pattern
   */
  app.post("/api/rbac/critical-patterns",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { pattern, description, requireReason, requireSupervisorApproval } = req.body;

        if (!pattern || pattern.trim().length === 0) {
          return res.status(400).json({ message: "Le pattern est requis" });
        }

        // Check uniqueness
        const [existing] = await db
          .select()
          .from(criticalPermissionPatterns)
          .where(eq(criticalPermissionPatterns.pattern, pattern.trim()));

        if (existing) {
          return res.status(409).json({ message: "Ce pattern existe déjà" });
        }

        const [created] = await db
          .insert(criticalPermissionPatterns)
          .values({
            pattern: pattern.trim(),
            description: description || null,
            requireReason: requireReason !== false,
            requireSupervisorApproval: requireSupervisorApproval === true,
          })
          .returning();

        invalidateCriticalPatternsCache();

        logAudit(req, 'create', 'critical_pattern', created.id, { pattern: pattern.trim() });

        res.status(201).json(created);
      } catch (error) {
        logger.error({ err: error }, 'Create critical pattern error');
        res.status(500).json({ message: "Erreur lors de la création du pattern" });
      }
    }
  );

  /**
   * PATCH /api/rbac/critical-patterns/:id
   * Update a critical permission pattern
   */
  app.patch("/api/rbac/critical-patterns/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { description, requireReason, requireSupervisorApproval } = req.body;

        const [existing] = await db
          .select()
          .from(criticalPermissionPatterns)
          .where(eq(criticalPermissionPatterns.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Pattern non trouvé" });
        }

        const updateData: Record<string, unknown> = {};
        if (description !== undefined) updateData.description = description;
        if (requireReason !== undefined) updateData.requireReason = requireReason;
        if (requireSupervisorApproval !== undefined) updateData.requireSupervisorApproval = requireSupervisorApproval;

        const [updated] = await db
          .update(criticalPermissionPatterns)
          .set(updateData)
          .where(eq(criticalPermissionPatterns.id, id))
          .returning();

        invalidateCriticalPatternsCache();

        logAudit(req, 'update', 'critical_pattern', id, { pattern: updated.pattern });

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, 'Update critical pattern error');
        res.status(500).json({ message: "Erreur lors de la mise à jour du pattern" });
      }
    }
  );

  /**
   * DELETE /api/rbac/critical-patterns/:id
   * Delete a critical permission pattern
   */
  app.delete("/api/rbac/critical-patterns/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const [existing] = await db
          .select()
          .from(criticalPermissionPatterns)
          .where(eq(criticalPermissionPatterns.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Pattern non trouvé" });
        }

        await db
          .delete(criticalPermissionPatterns)
          .where(eq(criticalPermissionPatterns.id, id));

        invalidateCriticalPatternsCache();

        logAudit(req, 'delete', 'critical_pattern', id, { pattern: existing.pattern });

        res.status(204).send();
      } catch (error) {
        logger.error({ err: error }, 'Delete critical pattern error');
        res.status(500).json({ message: "Erreur lors de la suppression du pattern" });
      }
    }
  );

  // ============================================================
  // PERMISSION CONFLICT DETECTION
  // ============================================================

  /**
   * GET /api/rbac/users/:userId/conflicts
   * Detect conflicts between user overrides and role permissions
   */
}
