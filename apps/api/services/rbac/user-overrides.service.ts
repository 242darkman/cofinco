import { db } from '../../db';
import { eq, and, asc } from 'drizzle-orm';
import { permissions, rolePermissions, userPermissions, userRoles, users } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { type UserPermissionOverrides } from '@shared/ability';
import { getRbacVersion } from './versioning.service';

/**
 * Récupère les surcharges de permissions pour un utilisateur
 */
export async function getUserPermissionOverrides(
  userId: string
): Promise<UserPermissionOverrides> {
  // Get user info
  const [user] = await db
    .select({
      id: users.id,
      nom: users.nom,
      prenom: users.prenom,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error(`Utilisateur non trouvé: ${userId}`);
  }

  // Get user's primary role
  const [primaryRole] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)));

  const role = (primaryRole?.role || SystemRole.CLIENT) as SystemRole;

  // Get all permissions with role and user override status
  const permissionRows = await db
    .select({
      permissionId: permissions.id,
      code: permissions.code,
      roleGranted: rolePermissions.granted,
      userOverrideId: userPermissions.id,
      userGranted: userPermissions.granted,
      userOverrideCreatedAt: userPermissions.createdAt,
    })
    .from(permissions)
    .leftJoin(
      rolePermissions,
      and(
        eq(rolePermissions.permissionId, permissions.id),
        eq(rolePermissions.role, role)
      )
    )
    .leftJoin(
      userPermissions,
      and(
        eq(userPermissions.permissionId, permissions.id),
        eq(userPermissions.userId, userId)
      )
    )
    .orderBy(asc(permissions.code));

  const overrides = permissionRows
    .filter((p) => p.userOverrideId !== null)
    .map((p) => ({
      permissionId: p.permissionId,
      code: p.code,
      granted: p.userGranted ?? false,
      inheritedFromRole: p.roleGranted ?? false,
      overriddenAt: p.userOverrideCreatedAt?.toISOString(),
    }));

  const inheritedPermissions = permissionRows
    .filter((p) => p.roleGranted && !p.userOverrideId)
    .map((p) => p.code);

  return {
    userId,
    userName: `${user.prenom || ''} ${user.nom}`.trim(),
    userRole: role,
    overrides,
    inheritedPermissions,
  };
}

/**
 * Bascule une surcharge de permission pour un utilisateur
 */
export async function toggleUserPermissionOverride(
  userId: string,
  permissionId: string,
  granted: boolean | null, // null = remove override (inherit from role)
  conditions?: Record<string, any> | null
): Promise<{ success: boolean; newVersion: number }> {
  // Check if permission exists
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.id, permissionId));

  if (!permission) {
    throw new Error(`Permission non trouvée: ${permissionId}`);
  }

  // Check if user exists
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new Error(`Utilisateur non trouvé: ${userId}`);
  }

  // Check if override exists
  const [existing] = await db
    .select()
    .from(userPermissions)
    .where(
      and(eq(userPermissions.userId, userId), eq(userPermissions.permissionId, permissionId))
    );

  if (granted === null) {
    // Remove override (inherit from role)
    if (existing) {
      await db.delete(userPermissions).where(eq(userPermissions.id, existing.id));
    }
  } else if (existing) {
    // Update existing override
    await db
      .update(userPermissions)
      .set({ granted, updatedAt: new Date(), ...(conditions !== undefined && { conditions }) })
      .where(eq(userPermissions.id, existing.id));
  } else {
    // Insert new override
    await db.insert(userPermissions).values({
      userId,
      permissionId,
      granted,
      ...(conditions && { conditions }),
    });
  }

  const newVersion = await getRbacVersion();

  return { success: true, newVersion };
}

/**
 * Réinitialise toutes les surcharges de permissions pour un utilisateur (hérite tout du rôle)
 */
export async function resetUserPermissionOverrides(
  userId: string
): Promise<{ success: boolean; newVersion: number; deleted: number }> {
  const result = await db
    .delete(userPermissions)
    .where(eq(userPermissions.userId, userId))
    .returning();

  const newVersion = await getRbacVersion();

  return { success: true, newVersion, deleted: result.length };
}
