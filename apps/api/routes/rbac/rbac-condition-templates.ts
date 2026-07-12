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


export function registerRbacConditionTemplatesRoutes(app: Express) {
  app.get("/api/rbac/condition-templates",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (_req: Request, res: Response) => {
      try {
        const templates = await db
          .select()
          .from(permissionConditionTemplates)
          .orderBy(
            desc(permissionConditionTemplates.isSystem),
            permissionConditionTemplates.name
          );

        res.json(templates);
      } catch (error) {
        logger.error({ err: error }, 'Get condition templates error');
        res.status(500).json({ message: "Erreur lors de la récupération des templates" });
      }
    }
  );

  /**
   * POST /api/rbac/condition-templates
   * Create a new condition template (cannot create system templates via API)
   */
  app.post("/api/rbac/condition-templates",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { name, description, conditionSchema, variables, examples } = req.body;

        if (!name?.trim()) {
          return res.status(400).json({ message: "Le nom est requis" });
        }

        if (!conditionSchema || typeof conditionSchema !== 'object' || Object.keys(conditionSchema).length === 0) {
          return res.status(400).json({ message: "Le schéma de condition est requis et doit être un objet JSON non-vide" });
        }

        // Check name uniqueness
        const [existing] = await db
          .select()
          .from(permissionConditionTemplates)
          .where(eq(permissionConditionTemplates.name, name.trim()));

        if (existing) {
          return res.status(409).json({ message: `Un template avec le nom "${name}" existe déjà` });
        }

        const [created] = await db
          .insert(permissionConditionTemplates)
          .values({
            name: name.trim(),
            description: description?.trim() || null,
            conditionSchema,
            variables: variables || [],
            examples: examples || [],
            isSystem: false, // Never allow creating system templates via API
          })
          .returning();

        logAudit(req, 'create', 'condition_template', created.id, { name: created.name });

        res.status(201).json(created);
      } catch (error) {
        logger.error({ err: error }, 'Create condition template error');
        res.status(500).json({ message: "Erreur lors de la création du template" });
      }
    }
  );

  /**
   * PATCH /api/rbac/condition-templates/:id
   * Update a condition template (system templates are read-only)
   */
  app.patch("/api/rbac/condition-templates/:id",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, description, conditionSchema, variables, examples } = req.body;

        const [existing] = await db
          .select()
          .from(permissionConditionTemplates)
          .where(eq(permissionConditionTemplates.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Template non trouvé" });
        }

        if (existing.isSystem) {
          return res.status(403).json({ message: "Les templates système ne sont pas modifiables" });
        }

        if (conditionSchema && (typeof conditionSchema !== 'object' || Object.keys(conditionSchema).length === 0)) {
          return res.status(400).json({ message: "Le schéma de condition doit être un objet JSON non-vide" });
        }

        // Check name uniqueness if changing name
        if (name && name.trim() !== existing.name) {
          const [dup] = await db
            .select()
            .from(permissionConditionTemplates)
            .where(eq(permissionConditionTemplates.name, name.trim()));
          if (dup) {
            return res.status(409).json({ message: `Un template avec le nom "${name}" existe déjà` });
          }
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (conditionSchema !== undefined) updateData.conditionSchema = conditionSchema;
        if (variables !== undefined) updateData.variables = variables;
        if (examples !== undefined) updateData.examples = examples;

        const [updated] = await db
          .update(permissionConditionTemplates)
          .set(updateData)
          .where(eq(permissionConditionTemplates.id, id))
          .returning();

        logAudit(req, 'update', 'condition_template', id, { name: updated.name });

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, 'Update condition template error');
        res.status(500).json({ message: "Erreur lors de la mise à jour du template" });
      }
    }
  );

  /**
   * DELETE /api/rbac/condition-templates/:id
   * Delete a condition template (system templates cannot be deleted)
   */
  app.delete("/api/rbac/condition-templates/:id",
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
          .from(permissionConditionTemplates)
          .where(eq(permissionConditionTemplates.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Template non trouvé" });
        }

        if (existing.isSystem) {
          return res.status(403).json({ message: "Les templates système ne sont pas supprimables" });
        }

        await db
          .delete(permissionConditionTemplates)
          .where(eq(permissionConditionTemplates.id, id));

        logAudit(req, 'delete', 'condition_template', id, { name: existing.name });

        res.status(204).send();
      } catch (error) {
        logger.error({ err: error }, 'Delete condition template error');
        res.status(500).json({ message: "Erreur lors de la suppression du template" });
      }
    }
  );

  // ============================================================
  // PERMISSION SIMULATOR (Feature 9)
  // ============================================================

  /**
   * GET /api/rbac/users/:userId/simulate
   * Simulate effective permissions for a user (read-only preview)
   */
}
