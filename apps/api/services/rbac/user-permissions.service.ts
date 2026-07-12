import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  userRoles
} from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { logAudit } from "../../audit";
import { auditTrailService } from "../audit-trail-service";
import { getWsInstance } from "../../ws-server";
import { type AuditLogContext } from "../rbac-audit-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Service:RBAC:UserPermissions');

/**
 * Récupère les permissions pour un utilisateur spécifique
 */
export async function getUserPermissions(userId: string) {
  const userRoleRes = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)))
    .limit(1);

  const userRole = userRoleRes[0]?.role;
  if (!userRole) {
    throw new Error("Utilisateur non trouvé ou sans rôle principal");
  }

  const allPerms = await db.select({
    id: permissions.id,
    code: permissions.code,
    name: permissions.name,
    moduleName: modules.name,
  })
    .from(permissions)
    .leftJoin(modules, eq(permissions.moduleId, modules.id));

  const rolePerms = await db.select({
    permissionId: rolePermissions.permissionId,
    granted: rolePermissions.granted,
  })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, userRole));

  const rolePermIds = new Set(rolePerms.filter((rp: any) => rp.granted).map((rp: any) => rp.permissionId));

  const customPerms = await db.select({
    permissionId: userPermissions.permissionId,
    granted: userPermissions.granted
  })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  const customPermMap = new Map(customPerms.map((cp: any) => [cp.permissionId, cp]));

  return allPerms.map((p: any) => {
    const hasRolePerm = rolePermIds.has(p.id);
    const customPerm = customPermMap.get(p.id);

    let granted = hasRolePerm;
    let source = 'role';

    if (customPerm) {
      granted = customPerm.granted;
      source = 'custom';
    }

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
}

/**
 * Active ou désactive une permission spécifique pour un utilisateur
 */
export async function toggleUserPermission(userId: string, permissionId: string, granted: boolean, req: any, ctx: AuditLogContext) {
  const [perm] = await db.select().from(permissions).where(eq(permissions.id, permissionId));
  if (!perm) {
    throw new Error("Permission non trouvée");
  }

  const [existing] = await db.select({ id: userPermissions.id })
    .from(userPermissions)
    .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permissionId, permissionId)));

  if (existing) {
    await db.update(userPermissions)
      .set({ granted, updatedAt: new Date() })
      .where(eq(userPermissions.id, existing.id));
  } else {
    await db.insert(userPermissions).values({
      userId,
      permissionId,
      granted
    });
  }

  await logAudit(
    req,
    "TOGGLE_USER_PERMISSION",
    "user_permissions",
    userId,
    { permissionId, granted, code: perm.code },
    "success",
    "high"
  );

  await auditTrailService.logPermissionChange({
    entityType: 'user',
    entityId: userId,
    permissionId,
    permissionCode: perm.code,
    action: granted ? 'GRANT' : 'REVOKE',
    beforeState: existing ? { granted: !granted } : null,
    afterState: { granted },
  }, ctx.actorUserId, req);

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "RBAC_UPDATE",
      payload: { entity: 'user_permission', userId, permissions: [{ permissionId, granted }] }
    });
  }

  return { message: "Permission mise à jour", permissionId, granted };
}

/**
 * Réinitialise toutes les permissions personnalisées d'un utilisateur
 */
export async function resetUserPermissions(userId: string, req: any, ctx: AuditLogContext) {
  const existingOverrides = await db.select({
    permissionId: userPermissions.permissionId,
    granted: userPermissions.granted,
    permissionCode: permissions.code,
  })
    .from(userPermissions)
    .leftJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));

  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

  await logAudit(
    req,
    "RESET_USER_PERMISSIONS",
    "user_permissions",
    userId,
    { count: existingOverrides.length },
    "success",
    "high"
  );

  if (existingOverrides.length > 0) {
    const auditEntries = existingOverrides.map((override: any) => ({
      entityType: 'user' as const,
      entityId: userId,
      permissionId: override.permissionId,
      permissionCode: override.permissionCode || undefined,
      action: 'BULK_REVOKE' as const,
      beforeState: { granted: override.granted },
      afterState: null,
      reason: 'Reset all user permission overrides',
    }));
    await auditTrailService.logBulkPermissionChange(auditEntries, ctx.actorUserId, req);
  }

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "RBAC_UPDATE",
      payload: { entity: 'user_permission', userId, type: 'reset' }
    });
  }
}
