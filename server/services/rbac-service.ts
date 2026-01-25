/**
 * RBAC Service - Centralized service for role-based access control
 *
 * This service provides:
 * - Permission catalog management
 * - Role permission management
 * - User permission overrides
 * - Version tracking for cache invalidation
 * - WebSocket event dispatching
 */

import { db } from '../db';
import { eq, and, desc, asc, inArray, sql, isNull } from 'drizzle-orm';
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  userRoles,
  users,
} from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import {
  Actions,
  Subjects,
  getPermissionMapping,
  buildRulesFromPermissionCodes,
  type CaslRule,
  type PermissionCatalogEntry,
  type RolePermissionsSummary,
  type UserPermissionOverrides,
  type RbacUpdatePayload,
} from '@shared/ability';

// ============================================
// VERSION MANAGEMENT
// ============================================

/**
 * Get current RBAC version
 */
export async function getRbacVersion(): Promise<number> {
  const result = await db.execute<{ version: string }>(
    sql`SELECT get_rbac_version() as version`
  );
  return parseInt(result.rows[0]?.version || '1', 10);
}

/**
 * Increment RBAC version (with change tracking)
 */
export async function incrementRbacVersion(
  changeType: string,
  changeEntity: string,
  changeDetail?: Record<string, any>
): Promise<number> {
  const result = await db.execute<{ increment_rbac_version: string }>(
    sql`SELECT increment_rbac_version(
      ${changeType}::TEXT,
      ${changeEntity}::TEXT,
      ${changeDetail ? JSON.stringify(changeDetail) : null}::JSONB
    ) as increment_rbac_version`
  );
  return parseInt(result.rows[0]?.increment_rbac_version || '1', 10);
}

// ============================================
// PERMISSION CATALOG
// ============================================

/**
 * Get full permission catalog with modules
 */
export async function getPermissionCatalog(): Promise<{
  modules: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string;
    icon: string | null;
    orderIndex: number;
    permissionCount: number;
  }>;
  permissions: PermissionCatalogEntry[];
  totalPermissions: number;
}> {
  // Get all modules
  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.isActive, true))
    .orderBy(asc(modules.orderIndex), asc(modules.name));

  // Get all permissions with module info
  const permissionRows = await db
    .select({
      id: permissions.id,
      code: permissions.code,
      name: permissions.name,
      description: permissions.description,
      moduleId: permissions.moduleId,
      moduleName: modules.name,
      moduleCategory: modules.category,
    })
    .from(permissions)
    .innerJoin(modules, eq(permissions.moduleId, modules.id))
    .where(eq(modules.isActive, true))
    .orderBy(asc(modules.orderIndex), asc(permissions.code));

  // Build catalog entries with CASL mapping
  const catalogEntries: PermissionCatalogEntry[] = permissionRows.map((p) => {
    const mapping = getPermissionMapping(p.code);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description || undefined,
      moduleId: p.moduleId,
      moduleName: p.moduleName,
      moduleCategory: p.moduleCategory,
      action: mapping?.action || (Actions.VIEW as any),
      subject: mapping?.subject || (Subjects.ALL as any),
    };
  });

  // Count permissions per module
  const modulePermissionCounts = new Map<string, number>();
  for (const perm of permissionRows) {
    const count = modulePermissionCounts.get(perm.moduleId) || 0;
    modulePermissionCounts.set(perm.moduleId, count + 1);
  }

  const modulesWithCounts = moduleRows.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    category: m.category,
    icon: m.icon,
    orderIndex: m.orderIndex,
    permissionCount: modulePermissionCounts.get(m.id) || 0,
  }));

  return {
    modules: modulesWithCounts,
    permissions: catalogEntries,
    totalPermissions: catalogEntries.length,
  };
}

// ============================================
// ROLE PERMISSIONS
// ============================================

/**
 * Get permissions for a specific role
 */
export async function getRolePermissions(role: SystemRole): Promise<RolePermissionsSummary> {
  // Get all permissions with their role_permission status for this role
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

  const permissionsList = permissionRows.map((p) => ({
    permissionId: p.permissionId,
    code: p.code,
    granted: p.rolePermissionId ? (p.granted ?? true) : false,
    isDefault: p.rolePermissionId !== null,
  }));

  const totalGranted = permissionsList.filter((p) => p.granted).length;

  return {
    role,
    roleLabel: getRoleLabel(role),
    totalPermissions: totalGranted,
    permissions: permissionsList,
  };
}

/**
 * Toggle a permission for a role
 */
export async function toggleRolePermission(
  role: SystemRole,
  permissionId: string,
  granted: boolean
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
      // Update to granted
      await db
        .update(rolePermissions)
        .set({ granted: true, updatedAt: new Date() })
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
    });
  }
  // If not granted and doesn't exist, nothing to do

  // Version is incremented by trigger, but we increment manually for consistency
  const newVersion = await getRbacVersion();

  return { success: true, newVersion };
}

/**
 * Bulk update role permissions
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

// ============================================
// USER PERMISSION OVERRIDES
// ============================================

/**
 * Get permission overrides for a user
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
    throw new Error(`User not found: ${userId}`);
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
 * Toggle a permission override for a user
 */
export async function toggleUserPermissionOverride(
  userId: string,
  permissionId: string,
  granted: boolean | null // null = remove override (inherit from role)
): Promise<{ success: boolean; newVersion: number }> {
  // Check if permission exists
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.id, permissionId));

  if (!permission) {
    throw new Error(`Permission not found: ${permissionId}`);
  }

  // Check if user exists
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new Error(`User not found: ${userId}`);
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
      .set({ granted, updatedAt: new Date() })
      .where(eq(userPermissions.id, existing.id));
  } else {
    // Insert new override
    await db.insert(userPermissions).values({
      userId,
      permissionId,
      granted,
    });
  }

  const newVersion = await getRbacVersion();

  return { success: true, newVersion };
}

/**
 * Reset all permission overrides for a user (inherit all from role)
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

// ============================================
// EFFECTIVE PERMISSIONS
// ============================================

/**
 * Get effective permissions for a user (role + overrides)
 * Returns permission codes as array
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
 * Get effective permissions as CASL rules
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

// ============================================
// WEBSOCKET EVENT HELPERS
// ============================================

/**
 * Build RBAC update payload for broadcasting
 */
export function buildRbacUpdatePayload(
  scope: 'role' | 'user' | 'global',
  version: number,
  options: {
    role?: SystemRole;
    userId?: string;
    permissionCode?: string;
    granted?: boolean;
    source?: 'role_permission' | 'user_permission';
    agenceId?: string;
  } = {}
): RbacUpdatePayload {
  return {
    scope,
    version,
    role: options.role,
    userId: options.userId,
    agenceId: options.agenceId,
    changed: options.permissionCode
      ? {
          permissionCode: options.permissionCode,
          granted: options.granted ?? true,
          source: options.source || 'role_permission',
        }
      : undefined,
  };
}

/**
 * Get all user IDs that have a specific role (for broadcasting)
 */
export async function getUserIdsWithRole(
  role: SystemRole,
  agenceId?: string
): Promise<string[]> {
  const query = agenceId
    ? and(eq(userRoles.role, role), eq(userRoles.agenceId, agenceId))
    : eq(userRoles.role, role);

  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(query);

  return rows.map((r) => r.userId);
}

// ============================================
// HELPERS
// ============================================

/**
 * Get human-readable label for a role
 */
function getRoleLabel(role: SystemRole): string {
  const labels: Record<SystemRole, string> = {
    [SystemRole.ADMIN]: 'Administrateur',
    [SystemRole.CHEF_AGENCE]: "Chef d'Agence",
    [SystemRole.CAISSIER]: 'Caissier',
    [SystemRole.AGENT_TERRAIN]: 'Agent Terrain',
    [SystemRole.COMPTABLE]: 'Comptable',
    [SystemRole.SUPERVISEUR]: 'Superviseur',
    [SystemRole.GESTIONNAIRE_CREDIT]: 'Gestionnaire Crédit',
    [SystemRole.CLIENT]: 'Client',
  };
  return labels[role] || role;
}

/**
 * Check if a user is admin (has ADMIN role)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, SystemRole.ADMIN)));

  return !!adminRole;
}
