import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { permissions, userPermissions, userRoles } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { logAudit } from "../../audit";
import { auditTrailService } from "../audit-trail-service";
import { logRbacChange, logBulkRbacChange, type AuditLogContext, validateReasonForCritical, isReasonRequiredForCritical } from "../rbac-audit-service";
import { getRbacVersion, buildRbacUpdatePayload, toggleUserPermissionOverride as rbacToggleUserPermissionOverride, resetUserPermissionOverrides as rbacResetUserPermissionOverrides } from "../rbac-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Service:RBAC:Overrides');

/**
 * Active ou désactive une dérogation de permission pour un utilisateur
 */
export async function toggleOverride(
  userId: string,
  data: { permissionId?: string; permissionCode?: string; granted: boolean | null; reason?: string; scope?: string; agenceId?: string; conditions?: any },
  req: any,
  ctx: AuditLogContext
) {
  const { granted, reason, scope = 'GLOBAL', agenceId, conditions } = data;

  let resolvedPermissionId = data.permissionId;
  let resolvedPermissionCode = data.permissionCode;

  if (!resolvedPermissionId && data.permissionCode) {
    const [perm] = await db.select().from(permissions).where(eq(permissions.code, data.permissionCode));
    if (!perm) throw new Error("Permission non trouvée");
    resolvedPermissionId = perm.id;
  }

  if (!resolvedPermissionId) throw new Error("permissionId ou permissionCode requis");

  const [perm] = await db.select().from(permissions).where(eq(permissions.id, resolvedPermissionId));
  resolvedPermissionCode = perm?.code || resolvedPermissionCode;

  const reasonRequired = await isReasonRequiredForCritical();
  if (resolvedPermissionCode) {
    const validation = await validateReasonForCritical(resolvedPermissionCode, reason, reasonRequired);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  const [existing] = await db.select({ granted: userPermissions.granted })
    .from(userPermissions)
    .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permissionId, resolvedPermissionId)));
  const oldValue = existing?.granted ?? null;

  const result = await rbacToggleUserPermissionOverride(userId, resolvedPermissionId, granted, conditions);

  await logRbacChange(ctx, {
    targetUserId: userId,
    action: 'TOGGLE',
    permissionId: resolvedPermissionId,
    permissionCode: resolvedPermissionCode,
    oldValue,
    newValue: granted,
    scope: scope as 'GLOBAL' | 'AGENCE',
    agenceId,
    reason,
  });

  await logAudit(req, "TOGGLE_USER_OVERRIDE", "user_permissions", userId, { permissionId: resolvedPermissionId, granted, code: perm?.code, reason }, "success", "high");

  await auditTrailService.logPermissionChange({
    entityType: 'user',
    entityId: userId,
    permissionId: resolvedPermissionId,
    permissionCode: perm?.code,
    action: granted === null ? 'REVOKE' : (granted ? 'GRANT' : 'REVOKE'),
    beforeState: oldValue !== null ? { granted: oldValue } : null,
    afterState: granted !== null ? { granted } : null,
    reason,
  }, ctx.actorUserId, req);

  const wsInstance = getWsInstance();
  if (wsInstance) {
    const legacyPayload = {
      type: "RBAC_UPDATE" as const,
      payload: { entity: 'user_permission', userId, version: result.newVersion, permissions: [{ permissionId: resolvedPermissionId, granted: granted ?? false }] }
    };
    wsInstance.sendToUser(userId, legacyPayload);
  }

  return { newVersion: result.newVersion, resolvedPermissionId, resolvedPermissionCode, oldValue };
}

/**
 * Réinitialise toutes les dérogations d'un utilisateur
 */
export async function resetOverrides(userId: string, reason: string | undefined, req: any, ctx: AuditLogContext) {
  const result = await rbacResetUserPermissionOverrides(userId);

  await logRbacChange(ctx, {
    targetUserId: userId,
    action: 'RESET',
    reason: reason || 'Reset all user permission overrides',
    metadata: { deletedCount: result.deleted },
  });

  await logAudit(req, "RESET_USER_OVERRIDES", "user_permissions", userId, { deleted: result.deleted, reason }, "success", "high");

  await auditTrailService.logPermissionChange({
    entityType: 'user',
    entityId: userId,
    action: 'BULK_REVOKE',
    beforeState: { overridesCount: result.deleted },
    afterState: null,
    reason: reason || 'Reset all user permission overrides',
  }, ctx.actorUserId, req);

  const wsInstance = getWsInstance();
  if (wsInstance) {
    const legacyPayload = { type: "RBAC_UPDATE" as const, payload: { entity: 'user_permission', userId, version: result.newVersion, type: 'reset' } };
    wsInstance.sendToUser(userId, legacyPayload);
  }

  return result;
}

/**
 * Mise à jour en masse des dérogations pour un utilisateur
 */
export async function bulkUpdateOverrides(
  userId: string,
  updates: any[],
  req: any,
  ctx: AuditLogContext,
  options: { scope?: string; agenceId?: string; reason?: string }
) {
  const userExists = await db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.userId, userId)).limit(1);
  if (userExists.length === 0) throw new Error("Utilisateur non trouvé");

  const results: Array<{ permissionId: string; success: boolean; error?: string }> = [];
  const auditEntries: any[] = [];

  const permIds = updates.map((u: any) => u.permissionId).filter(Boolean);
  const allPerms = permIds.length > 0 ? await db.select({ id: permissions.id, code: permissions.code }).from(permissions) : [];
  const permCodeMap = new Map(allPerms.map(p => [p.id, p.code]));

  await db.transaction(async (tx: any) => {
    for (const update of updates) {
      const { permissionId, granted } = update;
      if (!permissionId) {
        results.push({ permissionId: 'unknown', success: false, error: 'permissionId requis' });
        continue;
      }

      try {
        const [existing] = await tx.select().from(userPermissions).where(and(eq(userPermissions.userId, userId), eq(userPermissions.permissionId, permissionId)));
        const beforeGranted = existing?.granted ?? null;

        if (granted === null) {
          if (existing) await tx.delete(userPermissions).where(eq(userPermissions.id, existing.id));
        } else if (existing) {
          await tx.update(userPermissions).set({ granted, updatedAt: new Date() }).where(eq(userPermissions.id, existing.id));
        } else {
          await tx.insert(userPermissions).values({ userId, permissionId, granted });
        }

        results.push({ permissionId, success: true });

        auditEntries.push({
          entityType: 'user',
          entityId: userId,
          permissionId,
          permissionCode: permCodeMap.get(permissionId),
          action: granted === null ? 'BULK_REVOKE' : (granted ? 'BULK_GRANT' : 'BULK_REVOKE'),
          beforeState: beforeGranted !== null ? { granted: beforeGranted } : null,
          afterState: granted !== null ? { granted } : null,
        });
      } catch (err: any) {
        results.push({ permissionId, success: false, error: err.message });
      }
    }
  });

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  await logAudit(req, "BULK_UPDATE_USER_OVERRIDES", "user_permissions", userId, { count: updates.length, successCount, failureCount }, "success", "high");

  if (auditEntries.length > 0) {
    await auditTrailService.logBulkPermissionChange(auditEntries, ctx.actorUserId, req);
  }

  const { scope = 'GLOBAL', agenceId, reason } = options;
  const changes = auditEntries.map(e => ({
    permissionCode: e.permissionCode || '',
    oldValue: e.beforeState?.granted ?? null,
    newValue: e.afterState?.granted ?? null,
  }));

  if (changes.length > 0) {
    await logBulkRbacChange(ctx, userId, changes, { scope: scope as 'GLOBAL' | 'AGENCE', agenceId, reason });
  }

  const version = await getRbacVersion();
  const wsInstance = getWsInstance();
  if (wsInstance) {
    const legacyPayload = { type: "RBAC_UPDATE" as const, payload: { entity: 'user_permission', userId, version } };
    wsInstance.sendToUser(userId, legacyPayload);
  }

  return { version, results, successCount, failureCount, changes };
}
