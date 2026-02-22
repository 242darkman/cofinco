/**
 * CASL Ability Builder
 * ====================
 * Builds CASL abilities for users based on their roles and permissions.
 * Supports multi-role architecture (V3) and agency scoping.
 *
 * ## Multi-Role Architecture
 *
 * Users can have multiple roles, either globally or scoped to specific agencies.
 * When a user has multiple roles, their permissions are computed using a **UNION strategy**:
 *
 * - All permissions from all roles are combined
 * - If ANY role grants a permission, the user has it
 * - User-specific overrides take priority over role-based permissions
 * - Deny overrides remove permissions regardless of role grants
 *
 * ### Example:
 * ```
 * User has: CAISSIER + GESTIONNAIRE_CREDIT
 * CAISSIER grants: caisse.view, caisse.create, epargnes.view
 * GESTIONNAIRE_CREDIT grants: credits.view, credits.create, credits.approve
 *
 * Effective permissions: UNION of both = all of the above
 * ```
 *
 * ## Disbursement Permission Fallback Chain
 *
 * For credit disbursement, permissions are checked in this order:
 *
 * 1. **Specific channel permission** (e.g., `disburse_cash`, `disburse_account`, `disburse_momo`)
 * 2. **Generic disburse permission** (`disburse` on Credit subject)
 * 3. **Full manage access** (`manage` on Credit subject)
 * 4. **Admin wildcard** (`manage` on `all` subject)
 *
 * This allows fine-grained control while maintaining backwards compatibility:
 * - Users with `credits.disburse` can use ALL channels
 * - Users with `credits.disburse_cash` can ONLY disburse cash
 * - Users with `credits.manage` have full control including disbursement
 *
 * ## Agency Scoping
 *
 * Roles can be scoped to specific agencies:
 * - `agenceId = null`: Global role (applies everywhere)
 * - `agenceId = 'uuid'`: Scoped role (only applies when user is in that agency)
 *
 * When building abilities:
 * - If `agenceIdActive` is provided, only global + matching agency roles apply
 * - Locked features for the agency result in deny rules
 *
 * ## Permission Source Tracking
 *
 * Use `getPermissionSources()` to determine which roles grant a specific permission.
 * This is useful for debugging and UI display.
 */

import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { db } from '../db';
import { permissions, rolePermissions, userPermissions, modules, userRoles, agences, roleHierarchy } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import {
  AppAbility,
  AppAbilityRule,
  AbilityResponse,
  Actions,
  Subjects,
  Subject,
  Action,
} from './types';
import { getPermissionMapping, normalizePermissionCode } from '@shared/ability';
import { getActiveTemporaryPermissionCodes } from '../services/temporary-permissions-service';
import { resolveConditions, type ConditionContext } from './condition-resolver';

/**
 * Context for building ability
 */
export interface AbilityContext {
  userId: string;
  agenceIdActive?: string; // Current active agency from session
}

/**
 * User role with optional agency scope
 */
interface UserRoleEntry {
  role: SystemRole;
  agenceId: string | null;
  isPrimary: boolean;
}

/**
 * Permission entry from database
 */
interface PermissionEntry {
  code: string;
  granted: boolean;
  moduleName?: string | null;
  conditions?: Record<string, any> | null;
  isTemporary?: boolean;
}

// ============================================
// Role Hierarchy — Permission Inheritance
// ============================================

let hierarchyCache: Map<string, string[]> | null = null;
let hierarchyCacheTimestamp = 0;
const HIERARCHY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load the full role hierarchy graph from DB and cache it.
 * Returns a Map where key = parentRole, value = direct childRoles.
 */
async function loadHierarchyGraph(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (hierarchyCache && (now - hierarchyCacheTimestamp) < HIERARCHY_CACHE_TTL) {
    return hierarchyCache;
  }

  const rows = await db.select({
    parentRole: roleHierarchy.parentRole,
    childRole: roleHierarchy.childRole,
  }).from(roleHierarchy);

  const graph = new Map<string, string[]>();
  for (const row of rows) {
    const children = graph.get(row.parentRole) || [];
    children.push(row.childRole);
    graph.set(row.parentRole, children);
  }

  hierarchyCache = graph;
  hierarchyCacheTimestamp = now;
  return graph;
}

/**
 * Expand a set of roles to include all inherited (child) roles via the hierarchy.
 * e.g. [CHEF_AGENCE] → [CHEF_AGENCE, SUPERVISEUR, COMPTABLE, GESTIONNAIRE_CREDIT, CAISSIER, AGENT_TERRAIN]
 */
export async function expandRolesWithHierarchy(roleCodes: string[]): Promise<string[]> {
  const graph = await loadHierarchyGraph();
  const expanded = new Set<string>(roleCodes);
  const queue = [...roleCodes];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = graph.get(current);
    if (children) {
      for (const child of children) {
        if (!expanded.has(child)) {
          expanded.add(child);
          queue.push(child);
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Get inherited roles for a single role (excludes the role itself).
 * Useful for API responses showing which roles are inherited.
 */
export async function getInheritedRoles(roleCode: string): Promise<string[]> {
  const all = await expandRolesWithHierarchy([roleCode]);
  return all.filter(r => r !== roleCode);
}

/**
 * Invalidate the role hierarchy cache (e.g. after admin modifies hierarchy).
 */
export function invalidateRoleHierarchyCache(): void {
  hierarchyCache = null;
  hierarchyCacheTimestamp = 0;
}

// ============================================
// User Role Resolution
// ============================================

/**
 * Get all effective roles for a user
 * Includes roles scoped to the active agency and global roles (agenceId = null)
 */
async function getUserEffectiveRoles(userId: string, agenceIdActive?: string): Promise<UserRoleEntry[]> {
  const conditions = [eq(userRoles.userId, userId)];

  // If agenceIdActive is provided, get roles for that agency + global roles
  // Otherwise, get all roles
  if (agenceIdActive) {
    const roles = await db.select({
      role: userRoles.role,
      agenceId: userRoles.agenceId,
      isPrimary: userRoles.isPrimary,
    })
    .from(userRoles)
    .where(and(
      eq(userRoles.userId, userId),
      or(
        eq(userRoles.agenceId, agenceIdActive),
        isNull(userRoles.agenceId)
      )
    ));

    return roles.map(r => ({
      role: r.role as SystemRole,
      agenceId: r.agenceId,
      isPrimary: r.isPrimary,
    }));
  }

  // No agency filter - get all roles
  const roles = await db.select({
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  return roles.map(r => ({
    role: r.role as SystemRole,
    agenceId: r.agenceId,
    isPrimary: r.isPrimary,
  }));
}

/**
 * Get role-based permissions for multiple roles
 * Returns union of all permissions from all roles
 */
async function getRolePermissions(roles: SystemRole[]): Promise<PermissionEntry[]> {
  if (roles.length === 0) return [];

  const perms = await db.select({
    code: permissions.code,
    granted: rolePermissions.granted,
    moduleName: modules.name,
    conditions: rolePermissions.conditions,
  })
  .from(rolePermissions)
  .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
  .leftJoin(modules, eq(permissions.moduleId, modules.id))
  .where(and(
    inArray(rolePermissions.role, roles),
    eq(rolePermissions.granted, true)
  ));

  return perms.map(p => ({
    code: normalizePermissionCode(p.code),
    granted: true,
    moduleName: p.moduleName,
    conditions: p.conditions as Record<string, any> | null,
  }));
}

/**
 * Get user-specific permission overrides
 * These override role-based permissions (can grant or deny)
 */
async function getUserPermissionOverrides(userId: string): Promise<PermissionEntry[]> {
  const perms = await db.select({
    code: permissions.code,
    granted: userPermissions.granted,
    moduleName: modules.name,
    conditions: userPermissions.conditions,
  })
  .from(userPermissions)
  .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
  .leftJoin(modules, eq(permissions.moduleId, modules.id))
  .where(eq(userPermissions.userId, userId));

  return perms.map(p => ({
    code: normalizePermissionCode(p.code),
    granted: p.granted,
    moduleName: p.moduleName,
    conditions: p.conditions as Record<string, any> | null,
  }));
}

/**
 * Get locked features for an agency
 */
async function getLockedFeatures(agenceId: string): Promise<string[]> {
  // Check if the table exists (for backwards compatibility)
  try {
    const result = await db.execute<{ feature_key: string }>(
      `SELECT feature_key FROM agency_feature_locks WHERE agence_id = '${agenceId}' AND locked = true`
    );
    return (result.rows as any[]).map(r => r.feature_key);
  } catch {
    // Table doesn't exist yet - no locked features
    return [];
  }
}

/**
 * Get all available permissions from database (for admin)
 */
async function getAllPermissions(): Promise<PermissionEntry[]> {
  const perms = await db.select({
    code: permissions.code,
    moduleName: modules.name,
  })
  .from(permissions)
  .leftJoin(modules, eq(permissions.moduleId, modules.id));

  return perms.map(p => ({
    code: normalizePermissionCode(p.code),
    granted: true,
    moduleName: p.moduleName,
  }));
}

/**
 * Get agency name from ID
 */
async function getAgenceName(agenceId: string): Promise<string | null> {
  const [agence] = await db.select({ nom: agences.nom })
    .from(agences)
    .where(eq(agences.id, agenceId));
  return agence?.nom || null;
}

/**
 * Build CASL rules from permission entries.
 * Merges DB-stored conditions with static mapping conditions, then resolves template variables.
 *
 * Priority: DB conditions override mapping conditions (shallow merge).
 */
function buildRulesFromPermissions(
  permissions: PermissionEntry[],
  isAdmin: boolean,
  conditionCtx?: ConditionContext
): AppAbilityRule[] {
  const rules: AppAbilityRule[] = [];

  // Admin gets full access
  if (isAdmin) {
    rules.push({ action: 'manage', subject: 'all' });
    return rules;
  }

  // Process each permission
  for (const perm of permissions) {
    const mapping = getPermissionMapping(perm.code);
    if (!mapping) continue;

    if (perm.granted) {
      // Merge conditions: mapping (static) + DB (dynamic, overrides)
      let mergedConditions: Record<string, any> | undefined;

      if (mapping.conditions || perm.conditions) {
        mergedConditions = {
          ...(mapping.conditions || {}),
          ...(perm.conditions || {}),
        };
      }

      // Resolve template variables (${userId}, ${agenceId}, etc.)
      if (mergedConditions && conditionCtx) {
        mergedConditions = resolveConditions(mergedConditions, conditionCtx);
      }

      rules.push({
        action: mapping.action,
        subject: mapping.subject,
        ...(mergedConditions && { conditions: mergedConditions }),
      });
    } else {
      // Inverted rule (deny)
      rules.push({
        inverted: true,
        action: mapping.action,
        subject: mapping.subject,
      });
    }
  }

  return rules;
}

/**
 * Build permissions map: { moduleName: [action1, action2, ...] }
 * Used by frontend for quick module-level permission checks.
 */
function buildPermissionsMap(permissions: PermissionEntry[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const perm of permissions) {
    if (!perm.granted) continue;

    const parts = perm.code.split('.');
    if (parts.length < 2) continue;

    const module = parts[0];
    const action = parts.slice(1).join('.');

    if (!map[module]) {
      map[module] = [];
    }

    if (action && !map[module].includes(action)) {
      map[module].push(action);
    }
  }

  return map;
}

/**
 * Add deny rules for locked features
 */
function addLockedFeatureRules(rules: AppAbilityRule[], lockedFeatures: string[]): void {
  const featureToSubject: Record<string, Subject[]> = {
    'credits': [Subjects.CREDIT, Subjects.DEMANDE_CREDIT, Subjects.REEVALUATION],
    'tontines': [Subjects.TONTINE],
    'caisse': [Subjects.CAISSE, Subjects.CAISSE_SESSION],
    'comptabilite': [Subjects.COMPTABILITE, Subjects.ECRITURE, Subjects.JOURNAL],
    'epargnes': [Subjects.COMPTE, Subjects.EPARGNE],
    'coffre': [Subjects.COFFRE],
    'terrain': [Subjects.AGENT_TERRAIN, Subjects.VISITE, Subjects.INCIDENT, Subjects.PROSPECTION],
    'rh': [Subjects.RH, Subjects.PAIE, Subjects.CONGE, Subjects.FORMATION],
    'admin': [Subjects.ADMIN, Subjects.USER, Subjects.ROLE, Subjects.PERMISSION],
  };

  for (const feature of lockedFeatures) {
    const subjects = featureToSubject[feature.toLowerCase()];
    if (subjects) {
      for (const subject of subjects) {
        // Deny all actions on locked subjects
        rules.push({
          inverted: true,
          action: 'manage',
          subject,
        });
      }
    }
  }
}

/**
 * Main function: Build CASL Ability for a user
 *
 * @param context - User ID and optional active agency
 * @returns AbilityResponse with CASL rules and legacy permissionsMap
 */
export async function buildAbilityForUser(context: AbilityContext): Promise<AbilityResponse> {
  const { userId, agenceIdActive } = context;

  // 1. Get all effective roles for the user
  const effectiveRoles = await getUserEffectiveRoles(userId, agenceIdActive);

  if (effectiveRoles.length === 0) {
    // No roles - minimal access
    return {
      role: SystemRole.CLIENT,
      roles: [SystemRole.CLIENT],
      permissions: {},
      isAdmin: false,
      caslRules: [],
      agenceIdActive,
      lockedFeatures: [],
    };
  }

  // 2. Determine primary role and check if admin
  const primaryRole = effectiveRoles.find(r => r.isPrimary)?.role || effectiveRoles[0].role;
  const directRoleNames = Array.from(new Set(effectiveRoles.map(r => r.role)));
  const isAdmin = directRoleNames.some(r => r === SystemRole.ADMIN);

  // 2b. Expand roles with hierarchy (e.g. CHEF_AGENCE inherits SUPERVISEUR, COMPTABLE, etc.)
  const roleNames = isAdmin
    ? directRoleNames
    : (await expandRolesWithHierarchy(directRoleNames)) as SystemRole[];

  // 3. Get agency info
  let agenceNom: string | undefined;
  if (agenceIdActive) {
    agenceNom = (await getAgenceName(agenceIdActive)) || undefined;
  }

  // 4. Get locked features for agency
  const lockedFeatures = agenceIdActive && !isAdmin
    ? await getLockedFeatures(agenceIdActive)
    : [];

  // 5. Get permissions
  let effectivePermissions: PermissionEntry[];

  if (isAdmin) {
    // Admin gets all permissions
    effectivePermissions = await getAllPermissions();
  } else {
    // Get role-based permissions (union of all roles including inherited)
    const rolePerms = await getRolePermissions(roleNames as SystemRole[]);

    // Get temporary permissions (active and not expired)
    const tempPermCodes = await getActiveTemporaryPermissionCodes(userId);
    const tempPerms: PermissionEntry[] = tempPermCodes.map(code => ({
      code: normalizePermissionCode(code),
      granted: true,
      isTemporary: true,
    }));

    // Get user-specific overrides
    const userOverrides = await getUserPermissionOverrides(userId);

    // Merge: start with role permissions, then apply overrides
    // Priority order: role -> temporary -> user overrides (highest)
    const permissionMap = new Map<string, PermissionEntry>();

    for (const perm of rolePerms) {
      permissionMap.set(perm.code, perm);
    }

    // Add temporary permissions (if not already granted by role)
    for (const perm of tempPerms) {
      if (!permissionMap.has(perm.code)) {
        permissionMap.set(perm.code, perm);
      }
    }

    for (const override of userOverrides) {
      if (override.granted) {
        // Add or override with granted permission
        permissionMap.set(override.code, override);
      } else {
        // Deny: remove from map
        permissionMap.delete(override.code);
      }
    }

    effectivePermissions = Array.from(permissionMap.values());
  }

  // 6. Build CASL rules with condition context for template variable resolution
  const conditionCtx: ConditionContext = {
    userId,
    agenceId: agenceIdActive,
    role: primaryRole,
    roles: directRoleNames,
  };
  const rules = buildRulesFromPermissions(effectivePermissions, isAdmin, conditionCtx);

  // 7. Add deny rules for locked features
  if (lockedFeatures.length > 0) {
    addLockedFeatureRules(rules, lockedFeatures);
  }

  // 8. Build permissionsMap for frontend module-level checks
  const permissionsMap = buildPermissionsMap(effectivePermissions);

  // Admin wildcard
  if (isAdmin) {
    permissionsMap['*'] = ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export'];
  }

  return {
    role: primaryRole,
    roles: directRoleNames,
    permissions: permissionsMap,
    isAdmin,
    caslRules: rules,
    agenceIdActive,
    agenceNom,
    lockedFeatures,
  };
}

/**
 * Create a CASL Ability instance from rules
 */
export function createAbilityFromRules(rules: AppAbilityRule[]): AppAbility {
  return createMongoAbility<[Action, Subject]>(rules);
}

/**
 * Shorthand: Build and return CASL Ability instance
 */
export async function getAbilityForUser(context: AbilityContext): Promise<AppAbility> {
  const response = await buildAbilityForUser(context);
  return createAbilityFromRules(response.caslRules);
}

/**
 * Check if a specific permission code is granted
 * Used for backwards compatibility with legacy permission checks
 */
export function hasPermissionCode(ability: AppAbility, code: string): boolean {
  const mapping = getPermissionMapping(code);
  if (!mapping) return false;
  return ability.can(mapping.action, mapping.subject);
}

/**
 * Disbursement Permission Fallback Chain
 * ========================================
 *
 * Maps legacy permission codes to CASL actions for backwards compatibility.
 * This enables a cascading permission check:
 *
 * Priority order (first match wins):
 * 1. Specific channel: `credits.disburse_cash` → can ONLY disburse cash
 * 2. Generic disburse: `credits.disburse` → can disburse via ANY channel
 * 3. Credit approve: `credits.approve` → legacy fallback for disburse
 * 4. Full manage: `credits.manage` → can do everything on credits
 * 5. Admin wildcard: `manage all` → superuser access
 *
 * @example
 * ```typescript
 * // User with credits.disburse can use all channels
 * canDisburse(ability, 'CASH'); // true
 * canDisburse(ability, 'ACCOUNT'); // true
 * canDisburse(ability, 'MOBILE_MONEY'); // true
 *
 * // User with credits.disburse_cash can only use cash
 * canDisburse(ability, 'CASH'); // true
 * canDisburse(ability, 'ACCOUNT'); // false (unless they also have disburse_account)
 * ```
 */
export const DISBURSEMENT_PERMISSION_FALLBACKS: Record<string, Array<{ action: Action; subject: Subject }>> = {
  // If user has credits.disburse, they can use any channel
  'credits.disburse': [
    { action: Actions.DISBURSE, subject: Subjects.CREDIT },
    { action: Actions.DISBURSE_CASH, subject: Subjects.CREDIT },
    { action: Actions.DISBURSE_ACCOUNT, subject: Subjects.CREDIT },
    { action: Actions.DISBURSE_MOMO, subject: Subjects.CREDIT },
  ],
  // If user has credits.approve, they might be able to disburse (legacy behavior)
  'credits.approve': [
    { action: Actions.DISBURSE, subject: Subjects.CREDIT },
  ],
  // If user has credits.create, basic access (for backwards compat)
  'credits.create': [
    { action: Actions.DISBURSE_ACCOUNT, subject: Subjects.CREDIT },
  ],
};

/**
 * Check if a user can disburse a credit via a specific channel
 *
 * Implements the disbursement fallback chain:
 * 1. Check specific channel permission (e.g., DISBURSE_CASH)
 * 2. Check generic DISBURSE permission
 * 3. Check full MANAGE access on Credit
 * 4. Check admin wildcard (MANAGE on ALL)
 *
 * @param ability - The user's CASL ability instance
 * @param channel - The disbursement channel: 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY'
 * @returns true if the user can disburse via the specified channel
 *
 * @example
 * ```typescript
 * const ability = await getAbilityForUser({ userId: 'xxx' });
 *
 * if (canDisburse(ability, 'CASH')) {
 *   // Proceed with cash disbursement
 * } else if (canDisburse(ability, 'ACCOUNT')) {
 *   // Offer account transfer as alternative
 * } else {
 *   // User cannot disburse
 * }
 * ```
 */
export function canDisburse(
  ability: AppAbility,
  channel: 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY'
): boolean {
  // Direct CASL check
  const channelActions: Record<string, Action> = {
    'CASH': Actions.DISBURSE_CASH,
    'ACCOUNT': Actions.DISBURSE_ACCOUNT,
    'MOBILE_MONEY': Actions.DISBURSE_MOMO,
  };

  const action = channelActions[channel];
  if (ability.can(action, Subjects.CREDIT)) {
    return true;
  }

  // Generic disburse permission
  if (ability.can(Actions.DISBURSE, Subjects.CREDIT)) {
    return true;
  }

  // Full manage access on Credit
  if (ability.can(Actions.MANAGE, Subjects.CREDIT)) {
    return true;
  }

  // Admin wildcard
  if (ability.can(Actions.MANAGE, Subjects.ALL)) {
    return true;
  }

  return false;
}

/**
 * Permission source tracking information
 */
export interface PermissionSource {
  code: string;
  grantedBy: 'role' | 'user_override' | 'admin';
  roles?: SystemRole[];
  isUserOverride?: boolean;
}

/**
 * Get the source(s) of a permission for a user
 *
 * This function helps identify which role(s) grant a specific permission,
 * useful for debugging and displaying in the UI.
 *
 * @param userId - The user ID to check
 * @param permissionCode - The permission code to check (e.g., 'credits.view')
 * @returns PermissionSource with details about where the permission comes from
 *
 * @example
 * ```typescript
 * const source = await getPermissionSources('user-uuid', 'credits.approve');
 * // Returns: { code: 'credits.approve', grantedBy: 'role', roles: ['CHEF_AGENCE', 'GESTIONNAIRE_CREDIT'] }
 * ```
 */
export async function getPermissionSources(
  userId: string,
  permissionCode: string
): Promise<PermissionSource | null> {
  const normalizedCode = normalizePermissionCode(permissionCode);

  // 1. Get all roles for the user
  const userRolesResult = await db.select({
    role: userRoles.role,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  const roleNames = userRolesResult.map(r => r.role as SystemRole);
  const isAdmin = roleNames.some(r => r === SystemRole.ADMIN);

  // 2. If admin, they have all permissions
  if (isAdmin) {
    return {
      code: normalizedCode,
      grantedBy: 'admin',
      roles: roleNames.filter(r => r === SystemRole.ADMIN),
    };
  }

  // 3. Check user-specific override first
  const [userOverride] = await db.select({
    granted: userPermissions.granted,
  })
  .from(userPermissions)
  .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
  .where(and(
    eq(userPermissions.userId, userId),
    eq(permissions.code, normalizedCode)
  ));

  if (userOverride) {
    return {
      code: normalizedCode,
      grantedBy: 'user_override',
      isUserOverride: true,
    };
  }

  // 4. Check which roles grant this permission
  const grantingRoles = await db.select({
    role: rolePermissions.role,
  })
  .from(rolePermissions)
  .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
  .where(and(
    inArray(rolePermissions.role, roleNames),
    eq(permissions.code, normalizedCode),
    eq(rolePermissions.granted, true)
  ));

  if (grantingRoles.length > 0) {
    return {
      code: normalizedCode,
      grantedBy: 'role',
      roles: grantingRoles.map(r => r.role as SystemRole),
    };
  }

  // Permission not granted
  return null;
}

/**
 * Get all permission sources for a user
 * Returns a map of permission codes to their sources
 */
export async function getAllPermissionSources(userId: string): Promise<Map<string, PermissionSource>> {
  const sources = new Map<string, PermissionSource>();

  // Get user roles
  const userRolesResult = await db.select({
    role: userRoles.role,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  const roleNames = userRolesResult.map(r => r.role as SystemRole);
  const isAdmin = roleNames.some(r => r === SystemRole.ADMIN);

  // Get all permissions
  const allPerms = await db.select({
    code: permissions.code,
  })
  .from(permissions);

  // If admin, all permissions come from admin role
  if (isAdmin) {
    const adminRoles = roleNames.filter(r => r === SystemRole.ADMIN);
    for (const perm of allPerms) {
      sources.set(perm.code, {
        code: perm.code,
        grantedBy: 'admin',
        roles: adminRoles,
      });
    }
    return sources;
  }

  // Get user overrides
  const userOverrides = await db.select({
    code: permissions.code,
    granted: userPermissions.granted,
  })
  .from(userPermissions)
  .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
  .where(eq(userPermissions.userId, userId));

  for (const override of userOverrides) {
    if (override.granted) {
      sources.set(override.code, {
        code: override.code,
        grantedBy: 'user_override',
        isUserOverride: true,
      });
    }
  }

  // Get role permissions
  const rolePerms = await db.select({
    code: permissions.code,
    role: rolePermissions.role,
  })
  .from(rolePermissions)
  .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
  .where(and(
    inArray(rolePermissions.role, roleNames),
    eq(rolePermissions.granted, true)
  ));

  // Group by permission code
  for (const perm of rolePerms) {
    // Skip if already set by user override
    if (sources.has(perm.code)) continue;

    const existing = sources.get(perm.code);
    if (existing && existing.roles) {
      if (!existing.roles.includes(perm.role as SystemRole)) {
        existing.roles.push(perm.role as SystemRole);
      }
    } else {
      sources.set(perm.code, {
        code: perm.code,
        grantedBy: 'role',
        roles: [perm.role as SystemRole],
      });
    }
  }

  return sources;
}
