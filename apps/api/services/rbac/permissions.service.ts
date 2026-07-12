import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  permissionRequests,
  userRoles
} from "@shared/schema";
import { SystemRole, asSystemRole } from "@shared/types/roles";
import { getRbacVersion, buildRbacUpdatePayload, getUserIdsWithRole, incrementRbacVersion } from "../rbac-service";
import { logAudit } from "../../../audit";
import { auditTrailService } from "../audit-trail-service";
import { getWsInstance } from "../../../ws-server";
import { logRbacChange, type AuditLogContext } from "../rbac-audit-service";
import { getPermissionsForUserV2 } from "../permissions-service";
import { createLogger } from "../../../lib/logger";

const logger = createLogger('Service:RBAC:Permissions');

/**
 * Diffuser l'événement de mise à jour RBAC avec la bonne portée
 */
export async function broadcastRbacUpdate(payload: any): Promise<void> {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

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
    wsInstance.sendToUser(payload.userId, legacyPayload);
  } else if (payload.scope === 'role' && payload.role) {
    const userIds = await getUserIdsWithRole(payload.role as SystemRole, payload.agenceId);
    for (const userId of userIds) {
      wsInstance.sendToUser(userId, legacyPayload);
    }
    wsInstance.broadcast(legacyPayload);
  } else {
    wsInstance.broadcast(legacyPayload);
  }
}

/**
 * Récupère le catalogue des permissions
 */
export async function getAllPermissions(moduleId?: string) {
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

  if (moduleId) {
    return db.select({
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
      .where(eq(permissions.moduleId, moduleId))
      .orderBy(permissions.code);
  }

  return query;
}

/**
 * Assigne en masse des permissions à plusieurs rôles
 */
export async function bulkAssignPermissions(assignments: any[], req: any, ctx: AuditLogContext) {
  const results: Array<{ role: string; permissionId: string; success: boolean; error?: string }> = [];
  const auditEntries: any[] = [];

  const permIds = [...new Set(assignments.map((a: any) => a.permissionId).filter(Boolean))];
  const allPerms = permIds.length > 0
    ? await db.select({ id: permissions.id, code: permissions.code }).from(permissions)
    : [];
  const permCodeMap = new Map(allPerms.map(p => [p.id, p.code]));

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

  await db.transaction(async (tx) => {
    for (const [role, roleAssignments] of byRole) {
      for (const { permissionId, granted } of roleAssignments) {
        try {
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

  if (auditEntries.length > 0) {
    await auditTrailService.logBulkPermissionChange(auditEntries, ctx.actorUserId, req);
  }

  const version = await getRbacVersion();
  await broadcastRbacUpdate(buildRbacUpdatePayload('global', version));

  return { version, results, successCount, failureCount, affectedRoles };
}


/**
 * Récupère les permissions demandables pour un utilisateur
 */
export async function getRequestablePermissions(userId: string, agenceIdActive?: string) {
  const { buildAbilityForUser } = await import("../../authorization/ability");
  const abilityResponse = await buildAbilityForUser({ userId, agenceIdActive });

  if (abilityResponse.isAdmin) {
    return { permissions: [], count: 0, grouped: [] };
  }

  const effectiveCodes = new Set<string>();
  for (const [module, actions] of Object.entries(abilityResponse.permissions)) {
    for (const action of actions) {
      effectiveCodes.add(`${module}.${action}`);
    }
  }

  const pendingRequests = await db.select({ permissionId: permissionRequests.permissionId })
    .from(permissionRequests)
    .where(and(eq(permissionRequests.requesterId, userId), eq(permissionRequests.status, 'PENDING')));
  const pendingPermIds = new Set(pendingRequests.map(r => r.permissionId));

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

  const missing = allPermissions.filter(p => {
    if (pendingPermIds.has(p.id)) return false;
    const normalizedCode = p.code.replace(/[.:]/g, '.').toLowerCase();
    return !effectiveCodes.has(p.code) && !effectiveCodes.has(normalizedCode);
  });

  const grouped: Record<string, any> = {};
  for (const perm of missing) {
    const key = perm.moduleName || 'Autres';
    if (!grouped[key]) {
      grouped[key] = { moduleName: key, moduleCategory: perm.moduleCategory, permissions: [] };
    }
    grouped[key].permissions.push({
      id: perm.id, code: perm.code, name: perm.name, description: perm.description,
    });
  }

  return {
    permissions: missing.map(p => ({
      id: p.id, code: p.code, name: p.name, description: p.description,
      moduleName: p.moduleName, moduleCategory: p.moduleCategory,
    })),
    grouped: Object.values(grouped),
    count: missing.length,
  };
}
