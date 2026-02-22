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
import { eq, and, desc, asc, inArray, sql, isNull, ne } from 'drizzle-orm';
import {
  modules,
  permissions,
  rolePermissions,
  userPermissions,
  userRoles,
  users,
  temporaryPermissions,
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
import { getInheritedRoles } from '../authorization/ability';

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
 * Get permissions for a specific role, including inherited permissions from child roles.
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
        inArray(rolePermissions.role, inheritedRoleNames),
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
 * Toggle a permission for a role
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
  granted: boolean | null, // null = remove override (inherit from role)
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

// ============================================
// PERMISSION CONFLICT DETECTION
// ============================================

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
 * Detect conflicts between a user's role permissions and their overrides.
 * A conflict occurs when a user override contradicts or duplicates a role permission.
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

  const { expandRolesWithHierarchy } = await import('../authorization/ability');
  const expandedRoles = await expandRolesWithHierarchy(roleCodes);

  // 2. Get all role permissions (granted) for these roles
  const rolePerms = await db
    .select({
      permissionId: rolePermissions.permissionId,
      role: rolePermissions.role,
      granted: rolePermissions.granted,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.role, expandedRoles));

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

// ============================================
// PERMISSION SIMULATION
// ============================================

export interface SimulatedPermission {
  id: string;
  code: string;
  name: string;
  granted: boolean;
  source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'ADMIN' | 'NONE';
  sourceRole?: string;
  expiresAt?: string | null;
}

export interface SimulatedModule {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  permissions: SimulatedPermission[];
}

export interface SimulationResult {
  user: { id: string; nom: string; prenom: string | null };
  roles: string[];
  isAdmin: boolean;
  summary: {
    total: number;
    granted: number;
    denied: number;
    bySource: { role: number; override: number; temporary: number };
  };
  modules: SimulatedModule[];
}

/**
 * Simulate permissions for a user — read-only preview of effective permissions grouped by module
 */
export async function simulateUserPermissions(
  userId: string,
  agenceId?: string
): Promise<SimulationResult> {
  const { buildAbilityForUser } = await import('../authorization/ability');
  const { getEffectivePermissionsWithSource } = await import('./rbac-audit-service');

  // Get user info
  const [user] = await db
    .select({ id: users.id, nom: users.nom, prenom: users.prenom })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) throw new Error('Utilisateur non trouvé');

  // Get ability info (roles, isAdmin)
  const ability = await buildAbilityForUser({ userId, agenceIdActive: agenceId });

  // Get effective permissions with source
  const effective = await getEffectivePermissionsWithSource(userId, agenceId);
  const effectiveMap = new Map(effective.map(e => [e.permissionCode, e]));

  // Get temporary permissions for expiry info
  const tempPerms = await db
    .select({
      permissionId: temporaryPermissions.permissionId,
      expiresAt: temporaryPermissions.expiresAt,
    })
    .from(temporaryPermissions)
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true),
    ));
  const tempMap = new Map(tempPerms.map(t => [t.permissionId, t.expiresAt]));

  // Get full catalog
  const catalog = await getPermissionCatalog();

  // Build simulation grouped by module
  const simulatedModules: SimulatedModule[] = catalog.modules.map(mod => {
    const modulePerms = catalog.permissions.filter(p => p.moduleId === mod.id);
    const simPerms: SimulatedPermission[] = modulePerms.map(p => {
      const eff = effectiveMap.get(p.code);
      const tempExpiry = tempMap.get(p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        granted: eff?.granted ?? false,
        source: eff?.source ?? 'NONE',
        sourceRole: eff?.sourceRole || undefined,
        expiresAt: tempExpiry ? tempExpiry.toISOString() : null,
      };
    });
    return {
      id: mod.id,
      name: mod.name,
      category: mod.category,
      icon: mod.icon,
      permissions: simPerms,
    };
  });

  // Summary
  const allPerms = simulatedModules.flatMap(m => m.permissions);
  const granted = allPerms.filter(p => p.granted).length;
  const summary = {
    total: allPerms.length,
    granted,
    denied: allPerms.length - granted,
    bySource: {
      role: allPerms.filter(p => p.source === 'ROLE').length,
      override: allPerms.filter(p => p.source === 'OVERRIDE_GLOBAL' || p.source === 'OVERRIDE_AGENCE').length,
      temporary: allPerms.filter(p => p.source === 'TEMPORARY').length,
    },
  };

  return {
    user: { id: user.id, nom: user.nom, prenom: user.prenom },
    roles: ability.roles || [ability.role],
    isAdmin: ability.isAdmin,
    summary,
    modules: simulatedModules,
  };
}

// ============================================
// MODULE / PERMISSION CRUD
// ============================================

/**
 * Create a new module
 */
export async function createModule(data: {
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive?: boolean;
  orderIndex?: number;
}) {
  const [created] = await db
    .insert(modules)
    .values({
      name: data.name,
      description: data.description || null,
      icon: data.icon || 'Shield',
      category: data.category,
      isActive: data.isActive ?? true,
      orderIndex: data.orderIndex ?? 0,
    })
    .returning();
  return created;
}

/**
 * Update a module
 */
export async function updateModule(id: string, data: Partial<{
  name: string;
  description: string | null;
  icon: string;
  category: string;
  isActive: boolean;
  orderIndex: number;
}>) {
  const [updated] = await db
    .update(modules)
    .set(data)
    .where(eq(modules.id, id))
    .returning();
  return updated;
}

/**
 * Delete a module — refuses if it has permissions with active assignments
 */
export async function deleteModule(id: string): Promise<{ success: boolean; error?: string }> {
  // Check for active assignments on the module's permissions
  const assignmentCount = await db.execute<{ cnt: string }>(sql`
    SELECT (
      (SELECT COUNT(*) FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module_id = ${id}))
      +
      (SELECT COUNT(*) FROM user_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module_id = ${id}))
    ) as cnt
  `);
  const cnt = parseInt(assignmentCount.rows[0]?.cnt || '0', 10);
  if (cnt > 0) {
    return { success: false, error: `Ce module a ${cnt} assignation(s) active(s). Supprimez-les d'abord.` };
  }

  await db.delete(modules).where(eq(modules.id, id));
  return { success: true };
}

/**
 * Create a new permission
 */
export async function createPermission(data: {
  moduleId: string;
  name: string;
  code: string;
  description?: string;
}) {
  const [created] = await db
    .insert(permissions)
    .values({
      moduleId: data.moduleId,
      name: data.name,
      code: data.code,
      description: data.description || null,
    })
    .returning();
  return created;
}

/**
 * Update a permission
 */
export async function updatePermission(id: string, data: Partial<{
  name: string;
  code: string;
  description: string | null;
}>) {
  const [updated] = await db
    .update(permissions)
    .set(data)
    .where(eq(permissions.id, id))
    .returning();
  return updated;
}

/**
 * Delete a permission — refuses if it has active role/user assignments
 */
export async function deletePermission(id: string): Promise<{ success: boolean; error?: string }> {
  const assignmentCount = await db.execute<{ cnt: string }>(sql`
    SELECT (
      (SELECT COUNT(*) FROM role_permissions WHERE permission_id = ${id})
      +
      (SELECT COUNT(*) FROM user_permissions WHERE permission_id = ${id})
      +
      (SELECT COUNT(*) FROM temporary_permissions WHERE permission_id = ${id} AND is_active = true)
    ) as cnt
  `);
  const cnt = parseInt(assignmentCount.rows[0]?.cnt || '0', 10);
  if (cnt > 0) {
    return { success: false, error: `Cette permission a ${cnt} assignation(s) active(s). Supprimez-les d'abord.` };
  }

  await db.delete(permissions).where(eq(permissions.id, id));
  return { success: true };
}
