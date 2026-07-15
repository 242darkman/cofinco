import { db } from '../../db';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { permissions, rolePermissions } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { type RolePermissionsSummary } from '@shared/ability';
import { getInheritedRoles } from '../../authorization/ability';
import { getRbacVersion } from './versioning.service';
import { getRoleLabel } from './helpers.service';

/**
 * Récupère les permissions pour un rôle spécifique, incluant les permissions héritées des rôles enfants.
 */
export async function getRolePermissions(role: SystemRole): Promise<RolePermissionsSummary> {
  // Get direct permissions for this role
  const permissionRows = await db
    .select({
      permissionId: permissions.id,
      code: permissions.code,
      rolePermissionId: rolePermissions.id,
      granted: rolePermissions.granted,
    })
    .from(permissions)
    .leftJoin(
      rolePermissions,
      and(
        eq(rolePermissions.permissionId, permissions.id),
        eq(rolePermissions.role, role)
      )
    )
    .orderBy(asc(permissions.code));

  // Build direct permissions map
  const directPerms = new Map<string, boolean>();
  for (const p of permissionRows) {
    if (p.rolePermissionId && (p.granted ?? true)) {
      directPerms.set(p.permissionId, true);
    }
  }

  // Get inherited roles via hierarchy
  const inheritedRoleNames = await getInheritedRoles(role);

  // Get inherited permissions from child roles
  const inheritedPerms = new Map<string, string>(); // permissionId → inheritedFrom role
  if (inheritedRoleNames.length > 0) {
    const inheritedRows = await db
      .select({
        permissionId: rolePermissions.permissionId,
        role: rolePermissions.role,
        granted: rolePermissions.granted,
      })
      .from(rolePermissions)
      .where(and(
        inArray(rolePermissions.role, inheritedRoleNames as any),
        eq(rolePermissions.granted, true)
      ));

    for (const row of inheritedRows) {
      // Only mark as inherited if not directly granted by this role
      if (!directPerms.has(row.permissionId) && !inheritedPerms.has(row.permissionId)) {
        inheritedPerms.set(row.permissionId, row.role);
      }
    }
  }

  const permissionsList = permissionRows.map((p) => {
    const isDirectlyGranted = p.rolePermissionId ? (p.granted ?? true) : false;
    const inheritedFrom = inheritedPerms.get(p.permissionId);
    const isInherited = !!inheritedFrom;

    return {
      permissionId: p.permissionId,
      code: p.code,
      granted: isDirectlyGranted || isInherited,
      isDefault: p.rolePermissionId !== null,
      ...(isInherited && !isDirectlyGranted && { inherited: true, inheritedFrom }),
    };
  });

  const totalGranted = permissionsList.filter((p) => p.granted).length;

  return {
    role,
    roleLabel: getRoleLabel(role),
    totalPermissions: totalGranted,
    inheritedRoles: inheritedRoleNames.length > 0 ? inheritedRoleNames : undefined,
    permissions: permissionsList,
  };
}

/**
 * Bascule une permission pour un rôle
 */
export async function toggleRolePermission(
  role: SystemRole,
  permissionId: string,
  granted: boolean,
  conditions?: Record<string, any> | null
): Promise<{ success: boolean; newVersion: number }> {
  // Check if permission exists
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.id, permissionId));

  if (!permission) {
    throw new Error(`Permission not found: ${permissionId}`);
  }

  // Check if role_permission entry exists
  const [existing] = await db
    .select()
    .from(rolePermissions)
    .where(
      and(eq(rolePermissions.role, role), eq(rolePermissions.permissionId, permissionId))
    );

  if (existing) {
    if (granted) {
      // Update to granted (with optional conditions)
      await db
        .update(rolePermissions)
        .set({ granted: true, updatedAt: new Date(), ...(conditions !== undefined && { conditions }) })
        .where(eq(rolePermissions.id, existing.id));
    } else {
      // Remove the role permission entirely (no permission = not granted)
      await db.delete(rolePermissions).where(eq(rolePermissions.id, existing.id));
    }
  } else if (granted) {
    // Insert new role permission
    await db.insert(rolePermissions).values({
      role,
      permissionId,
      granted: true,
      ...(conditions && { conditions }),
    });
  }
  // If not granted and doesn't exist, nothing to do

  // Version is incremented by trigger, but we increment manually for consistency
  const newVersion = await getRbacVersion();

  return { success: true, newVersion };
}

/**
 * Met à jour en masse les permissions d'un rôle
 */
export async function bulkUpdateRolePermissions(
  role: SystemRole,
  updates: Array<{ permissionId: string; granted: boolean }>
): Promise<{ success: boolean; newVersion: number; updated: number }> {
  let updated = 0;

  for (const update of updates) {
    await toggleRolePermission(role, update.permissionId, update.granted);
    updated++;
  }

  const newVersion = await getRbacVersion();

  return { success: true, newVersion, updated };
}
