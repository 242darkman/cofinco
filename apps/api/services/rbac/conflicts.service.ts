import { db } from '../../db';
import { eq, inArray } from 'drizzle-orm';
import { rolePermissions, userPermissions, userRoles, permissions } from '@shared/schema';

export type ConflictType = 'DENY_OVERRIDE' | 'GRANT_OVERRIDE' | 'REDUNDANT_GRANT' | 'REDUNDANT_DENY';

export interface PermissionConflict {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  roleGranted: boolean;
  overrideGranted: boolean;
  conflictType: ConflictType;
  sourceRoles: string[];
}

/**
 * Détecte les conflits entre les permissions de rôle d'un utilisateur et ses surcharges.
 * Un conflit se produit lorsqu'une surcharge d'utilisateur contredit ou duplique une permission de rôle.
 */
export async function detectUserPermissionConflicts(
  userId: string
): Promise<{
  conflicts: PermissionConflict[];
  summary: { total: number; denyOverrides: number; grantOverrides: number; redundant: number };
}> {
  // 1. Get user's roles (expanded with hierarchy)
  const userRoleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  const roleCodes = userRoleRows.map(r => r.role);
  if (roleCodes.length === 0) {
    return { conflicts: [], summary: { total: 0, denyOverrides: 0, grantOverrides: 0, redundant: 0 } };
  }

  const { expandRolesWithHierarchy } = await import('../../authorization/ability');
  const expandedRoles = await expandRolesWithHierarchy(roleCodes);

  // 2. Get all role permissions (granted) for these roles
  const rolePerms = await db
    .select({
      permissionId: rolePermissions.permissionId,
      role: rolePermissions.role,
      granted: rolePermissions.granted,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.role, expandedRoles as any));

  // Build a map: permissionId -> { granted, sourceRoles[] }
  const rolePermMap = new Map<string, { granted: boolean; sourceRoles: string[] }>();
  for (const rp of rolePerms) {
    const existing = rolePermMap.get(rp.permissionId);
    if (existing) {
      // Any role granting => granted
      if (rp.granted) existing.granted = true;
      existing.sourceRoles.push(rp.role);
    } else {
      rolePermMap.set(rp.permissionId, {
        granted: rp.granted,
        sourceRoles: [rp.role],
      });
    }
  }

  // 3. Get user overrides
  const overrides = await db
    .select({
      permissionId: userPermissions.permissionId,
      granted: userPermissions.granted,
    })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  if (overrides.length === 0) {
    return { conflicts: [], summary: { total: 0, denyOverrides: 0, grantOverrides: 0, redundant: 0 } };
  }

  // 4. Get permission details for all overridden permissions
  const overridePermIds = overrides.map(o => o.permissionId);
  const permDetails = await db
    .select({ id: permissions.id, code: permissions.code, name: permissions.name })
    .from(permissions)
    .where(inArray(permissions.id, overridePermIds));

  const permMap = new Map(permDetails.map(p => [p.id, p]));

  // 5. Compare overrides against role permissions
  const conflicts: PermissionConflict[] = [];
  for (const override of overrides) {
    const perm = permMap.get(override.permissionId);
    if (!perm) continue;

    const rolePerm = rolePermMap.get(override.permissionId);
    const roleGranted = rolePerm?.granted ?? false;

    let conflictType: ConflictType;
    if (roleGranted && !override.granted) {
      conflictType = 'DENY_OVERRIDE';
    } else if (!roleGranted && override.granted) {
      conflictType = 'GRANT_OVERRIDE';
    } else if (roleGranted && override.granted) {
      conflictType = 'REDUNDANT_GRANT';
    } else {
      conflictType = 'REDUNDANT_DENY';
    }

    conflicts.push({
      permissionId: override.permissionId,
      permissionCode: perm.code,
      permissionName: perm.name,
      roleGranted,
      overrideGranted: override.granted,
      conflictType,
      sourceRoles: rolePerm?.sourceRoles || [],
    });
  }

  const summary = {
    total: conflicts.length,
    denyOverrides: conflicts.filter(c => c.conflictType === 'DENY_OVERRIDE').length,
    grantOverrides: conflicts.filter(c => c.conflictType === 'GRANT_OVERRIDE').length,
    redundant: conflicts.filter(c => c.conflictType === 'REDUNDANT_GRANT' || c.conflictType === 'REDUNDANT_DENY').length,
  };

  return { conflicts, summary };
}
