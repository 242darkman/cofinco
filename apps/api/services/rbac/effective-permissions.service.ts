import { db } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';
import { permissions, rolePermissions, userPermissions, userRoles } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { buildRulesFromPermissionCodes, type CaslRule } from '@shared/ability';

/**
 * Obtient les codes de permissions effectives pour un utilisateur (rôle + surcharges)
 */
export async function getEffectivePermissionCodes(userId: string): Promise<string[]> {
  // Get user's roles
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  if (roles.length === 0) {
    return [];
  }

  const userRolesList = roles.map((r) => r.role as SystemRole);

  // Get all permissions granted by roles
  const rolePermissionRows = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        inArray(rolePermissions.role, userRolesList),
        eq(rolePermissions.granted, true)
      )
    );

  const rolePermissionCodes = new Set(rolePermissionRows.map((r) => r.code));

  // Get user overrides
  const userOverrides = await db
    .select({
      code: permissions.code,
      granted: userPermissions.granted,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));

  // Apply overrides
  for (const override of userOverrides) {
    if (override.granted) {
      rolePermissionCodes.add(override.code);
    } else {
      rolePermissionCodes.delete(override.code);
    }
  }

  return Array.from(rolePermissionCodes);
}

/**
 * Obtient les permissions effectives sous forme de règles CASL
 */
export async function getEffectiveRules(
  userId: string,
  agenceId?: string | null
): Promise<CaslRule[]> {
  const permissionCodes = await getEffectivePermissionCodes(userId);

  return buildRulesFromPermissionCodes(permissionCodes, {
    agenceId,
    includeConditions: true,
  });
}
