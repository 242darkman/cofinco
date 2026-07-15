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


export function registerRbacCoreRoutes(app: Express) {
  app.get("/api/rbac/check", requireAuth, attachAbility, async (req, res) => {
    try {
      const { module: moduleName, action } = req.query;

      if (!moduleName || !action) {
        return res.json({ hasPermission: false });
      }

      const mapping = getPermissionMapping(`${moduleName}.${action}`);
      const hasPermission = mapping
        ? !!req.ability?.can(mapping.action, mapping.subject)
        : false;

      res.json({ hasPermission });
    } catch (error) {
      logger.error({ err: error }, 'Check RBAC permission error');
      res.status(500).json({ hasPermission: false });
    }
  });

  // Reseed RBAC tables (admin only) - useful when role_permissions is empty
  app.post("/api/rbac/reseed", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      // Import dynamically to avoid circular dependencies
      const { seedRBAC } = await import('../../../../seeds/seed-rbac-logic');

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
  app.get("/api/rbac/users/:userId/conflicts",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const result = await detectUserPermissionConflicts(userId);
        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Detect permission conflicts error');
        res.status(500).json({ message: "Erreur lors de la détection des conflits" });
      }
    }
  );

  // ============================================================
  // CONDITION TEMPLATES CRUD
  // ============================================================

  /**
   * GET /api/rbac/condition-templates
   * List all condition templates (system first, then custom)
   */
  app.get("/api/rbac/users/:userId/simulate",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const agenceId = req.query.agenceId as string | undefined;
        const result = await simulateUserPermissions(userId, agenceId || undefined);
        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Simulate user permissions error');
        res.status(500).json({ message: "Erreur lors de la simulation" });
      }
    }
  );

  // ============================================================
  // MODULE / PERMISSION CRUD (Feature 10)
  // ============================================================

  /**
   * POST /api/rbac/modules — Create a new module
   */
}
