import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  modules,
  permissions,
  rolePermissions,
} from "@shared/schema";
import { SystemRole,  } from "@shared/types/roles";
import { getWsInstance } from "../../ws-server";
import { logAudit } from "../../audit";
import { auditTrailService } from "../audit-trail-service";
import { type AuditLogContext } from "../rbac-audit-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Service:RBAC:Roles');

/**
 * Récupère les permissions d'un rôle (directes et héritées)
 */
export async function getRolePermissionsList(role: string) {
  const normalizedRole = (role);
  if (!normalizedRole) {
    throw new Error("Rôle invalide");
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

  const { getInheritedRoles } = await import("../../authorization/ability");
  const inheritedRoleNames = await getInheritedRoles(normalizedRole);

  if (inheritedRoleNames.length > 0) {
    const directPermIds = new Set(rolePerms.map((p: any) => p.permissionId));

    const inheritedPerms = await db.select({
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
      .where(and(
        inArray(rolePermissions.role, inheritedRoleNames as SystemRole[]),
        eq(rolePermissions.granted, true)
      ));

    const seen = new Set<string>();
    for (const perm of inheritedPerms) {
      if (!directPermIds.has(perm.permissionId) && !seen.has(perm.permissionId)) {
        seen.add(perm.permissionId);
        rolePerms.push({
          ...perm,
          inherited: true,
          inheritedFrom: perm.role,
        } as any);
      }
    }
  }

  return rolePerms;
}

/**
 * Crée ou met à jour une permission pour un rôle
 */
export async function createRolePermission(data: { role: string; permission_id?: string; permission_code?: string; granted?: boolean }, req: any, ctx: AuditLogContext) {
  const normalizedRole = (data.role);
  if (!normalizedRole) {
    throw new Error("Rôle invalide");
  }

  let permId = data.permission_id;
  const granted = data.granted ?? true;

  if (!permId && data.permission_code) {
    const [perm] = await db.select().from(permissions).where(eq(permissions.code, data.permission_code));
    if (!perm) throw new Error("Permission non trouvée");
    permId = perm.id;
  }

  if (!permId) throw new Error("permission_id ou permission_code requis");

  const [existing] = await db.select()
    .from(rolePermissions)
    .where(and(
      eq(rolePermissions.role, normalizedRole),
      eq(rolePermissions.permissionId, permId)
    ));

  if (existing) {
    const [updated] = await db.update(rolePermissions)
      .set({ granted, updatedAt: new Date() })
      .where(eq(rolePermissions.id, existing.id))
      .returning();
    return updated;
  }

  const [perm] = await db.select().from(permissions).where(eq(permissions.id, permId));

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

  await auditTrailService.logPermissionChange({
    entityType: 'role',
    entityId: normalizedRole,
    permissionId: permId,
    permissionCode: perm?.code,
    action: granted ? 'GRANT' : 'REVOKE',
    beforeState: null,
    afterState: { granted },
  }, ctx.actorUserId, req);

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "RBAC_UPDATE",
      payload: { entity: 'role_permission', role: normalizedRole, permissions: [created] }
    });
  }

  return created;
}

/**
 * Met à jour l'état d'une permission de rôle (accordée / refusée)
 */
export async function updateRolePermission(id: string, granted: boolean, req: any, ctx: AuditLogContext) {
  const [existing] = await db.select({
    role: rolePermissions.role,
    permissionId: rolePermissions.permissionId,
    granted: rolePermissions.granted,
    permissionCode: permissions.code,
  })
    .from(rolePermissions)
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.id, id));

  const [updated] = await db.update(rolePermissions)
    .set({ granted, updatedAt: new Date() })
    .where(eq(rolePermissions.id, id))
    .returning();

  if (!updated) {
    throw new Error("Permission non trouvée");
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

  if (existing) {
    await auditTrailService.logPermissionChange({
      entityType: 'role',
      entityId: existing.role,
      permissionId: existing.permissionId,
      permissionCode: existing.permissionCode || undefined,
      action: granted ? 'GRANT' : 'REVOKE',
      beforeState: { granted: existing.granted },
      afterState: { granted },
    }, ctx.actorUserId, req);
  }

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "RBAC_UPDATE",
      payload: { entity: 'role_permission', id, permissions: [updated] }
    });
  }

  return updated;
}

/**
 * Supprime une permission de rôle
 */
export async function deleteRolePermission(id: string, req: any, ctx: AuditLogContext) {
  const [existing] = await db.select({
    role: rolePermissions.role,
    permissionId: rolePermissions.permissionId,
    granted: rolePermissions.granted,
    permissionCode: permissions.code,
  })
    .from(rolePermissions)
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.id, id));

  const [deleted] = await db.delete(rolePermissions)
    .where(eq(rolePermissions.id, id))
    .returning();

  if (!deleted) {
    throw new Error("Permission non trouvée");
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

  if (existing) {
    await auditTrailService.logPermissionChange({
      entityType: 'role',
      entityId: existing.role,
      permissionId: existing.permissionId,
      permissionCode: existing.permissionCode || undefined,
      action: 'REVOKE',
      beforeState: { granted: existing.granted },
      afterState: null,
    }, ctx.actorUserId, req);
  }

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({
      type: "RBAC_UPDATE",
      payload: { entity: 'role_permission', id, deleted: true }
    });
  }

  return deleted;
}
