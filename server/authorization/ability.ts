/**
 * CASL Ability Builder
 * ====================
 * Builds CASL abilities for users based on their roles and permissions.
 * Supports multi-role architecture (V3) and agency scoping.
 */

import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { db } from '../db';
import { permissions, rolePermissions, userPermissions, modules, userRoles, agences } from '@shared/schema';
import { isAdminRole, SystemRole } from '@shared/types/roles';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import {
  AppAbility,
  AppAbilityRule,
  AbilityResponse,
  Actions,
  Subjects,
  Subject,
  Action,
  normalizePermissionCode,
  parsePermissionCode,
} from './types';

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
}

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
  })
  .from(userPermissions)
  .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
  .leftJoin(modules, eq(permissions.moduleId, modules.id))
  .where(eq(userPermissions.userId, userId));

  return perms.map(p => ({
    code: normalizePermissionCode(p.code),
    granted: p.granted,
    moduleName: p.moduleName,
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
 * Build CASL rules from permission entries
 */
function buildRulesFromPermissions(
  permissions: PermissionEntry[],
  isAdmin: boolean
): AppAbilityRule[] {
  const rules: AppAbilityRule[] = [];

  // Admin gets full access
  if (isAdmin) {
    rules.push({ action: 'manage', subject: 'all' });
    return rules;
  }

  // Process each permission
  for (const perm of permissions) {
    const mapping = parsePermissionCode(perm.code);
    if (!mapping) continue;

    if (perm.granted) {
      rules.push({
        action: mapping.action,
        subject: mapping.subject,
        ...(mapping.conditions && { conditions: mapping.conditions }),
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
 * Build legacy permissionsMap for backwards compatibility
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
  const roleNames = Array.from(new Set(effectiveRoles.map(r => r.role)));
  const isAdmin = roleNames.some(r => isAdminRole(r));

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
    // Get role-based permissions (union of all roles)
    const rolePerms = await getRolePermissions(roleNames);

    // Get user-specific overrides
    const userOverrides = await getUserPermissionOverrides(userId);

    // Merge: start with role permissions, then apply overrides
    const permissionMap = new Map<string, PermissionEntry>();

    for (const perm of rolePerms) {
      permissionMap.set(perm.code, perm);
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

  // 6. Build CASL rules
  const rules = buildRulesFromPermissions(effectivePermissions, isAdmin);

  // 7. Add deny rules for locked features
  if (lockedFeatures.length > 0) {
    addLockedFeatureRules(rules, lockedFeatures);
  }

  // 8. Build legacy permissionsMap
  const permissionsMap = buildPermissionsMap(effectivePermissions);

  // Admin wildcard for legacy support
  if (isAdmin) {
    permissionsMap['*'] = ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export'];
  }

  return {
    role: primaryRole,
    roles: roleNames,
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
  const mapping = parsePermissionCode(code);
  if (!mapping) return false;
  return ability.can(mapping.action, mapping.subject);
}

/**
 * Fallback permission mapping for credit disbursement
 * Maps legacy permission codes to new CASL actions
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
 * Check disbursement permission with fallbacks
 * Supports legacy permission codes while transitioning to CASL
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
