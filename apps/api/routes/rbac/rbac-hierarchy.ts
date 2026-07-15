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


export function registerRbacHierarchyRoutes(app: Express) {
  app.get("/api/rbac/role-hierarchy",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (_req: Request, res: Response) => {
      try {
        // Fetch hierarchy relations
        const relations = await db
          .select()
          .from(roleHierarchy)
          .orderBy(roleHierarchy.parentRole, roleHierarchy.childRole);

        // Fetch permission counts per role
        const allRoles = Object.values(SystemRole);
        const roleCounts = await Promise.all(
          allRoles.map(async (role) => {
            const [result] = await db
              .select({ count: count() })
              .from(rolePermissions)
              .where(
                and(
                  eq(rolePermissions.role, role),
                  eq(rolePermissions.granted, true)
                )
              );
            return { role, directPermissions: result?.count || 0 };
          })
        );

        // Build nodes
        const nodes = roleCounts.map((rc) => ({
          role: rc.role,
          label: getRoleLabel(rc.role),
          directPermissions: rc.directPermissions,
          children: relations
            .filter((r) => r.parentRole === rc.role)
            .map((r) => r.childRole),
          parents: relations
            .filter((r) => r.childRole === rc.role)
            .map((r) => r.parentRole),
        }));

        res.json({ nodes, relations });
      } catch (error) {
        logger.error({ err: error }, 'Get role hierarchy error');
        res.status(500).json({ message: "Erreur lors de la récupération de la hiérarchie" });
      }
    }
  );

  /**
   * POST /api/rbac/role-hierarchy
   * Create a parent→child role relation
   */
  app.post("/api/rbac/role-hierarchy",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { parentRole, childRole } = req.body;

        // Validate roles exist
        const validRoles = Object.values(SystemRole) as string[];
        if (!validRoles.includes(parentRole) || !validRoles.includes(childRole)) {
          return res.status(400).json({ message: "Rôle invalide" });
        }

        if (parentRole === childRole) {
          return res.status(400).json({ message: "Un rôle ne peut pas être son propre enfant" });
        }

        // Check duplicate
        const [existing] = await db
          .select()
          .from(roleHierarchy)
          .where(
            and(
              eq(roleHierarchy.parentRole, parentRole),
              eq(roleHierarchy.childRole, childRole)
            )
          );

        if (existing) {
          return res.status(409).json({ message: "Cette relation existe déjà" });
        }

        // Cycle detection: check if childRole is already an ancestor of parentRole
        const allRelations = await db.select().from(roleHierarchy);
        const ancestors = new Set<string>();
        const findAncestors = (role: string) => {
          for (const rel of allRelations) {
            if (rel.childRole === role && !ancestors.has(rel.parentRole)) {
              ancestors.add(rel.parentRole);
              findAncestors(rel.parentRole);
            }
          }
        };
        findAncestors(parentRole);

        if (ancestors.has(childRole)) {
          return res.status(400).json({ message: "Cette relation créerait un cycle dans la hiérarchie" });
        }

        const [created] = await db
          .insert(roleHierarchy)
          .values({ parentRole, childRole })
          .returning();

        invalidateRoleHierarchyCache();

        logAudit(req, 'create', 'role_hierarchy', created.id, { parentRole, childRole });

        res.status(201).json(created);
      } catch (error) {
        logger.error({ err: error }, 'Create role hierarchy relation error');
        res.status(500).json({ message: "Erreur lors de la création de la relation" });
      }
    }
  );

  /**
   * DELETE /api/rbac/role-hierarchy/:id
   * Remove a parent→child role relation
   */
  app.delete("/api/rbac/role-hierarchy/:id",
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
          .from(roleHierarchy)
          .where(eq(roleHierarchy.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Relation non trouvée" });
        }

        await db
          .delete(roleHierarchy)
          .where(eq(roleHierarchy.id, id));

        invalidateRoleHierarchyCache();

        logAudit(req, 'delete', 'role_hierarchy', id, { parentRole: existing.parentRole, childRole: existing.childRole });

        res.status(204).send();
      } catch (error) {
        logger.error({ err: error }, 'Delete role hierarchy relation error');
        res.status(500).json({ message: "Erreur lors de la suppression de la relation" });
      }
    }
  );

  // ============================================================
  // CRITICAL PERMISSION PATTERNS CRUD
  // ============================================================

  /**
   * GET /api/rbac/critical-patterns
   * List all critical permission patterns
   */
}
