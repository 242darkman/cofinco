/**
 * Service de permissions - Calcule les permissions effectives d'un utilisateur
 * =============================================================================
 *
 * Réutilisable par /api/my-permissions ET /api/auth/login
 *
 * V2 Migration: Now uses CASL authorization system for building abilities.
 * Maintains backwards compatibility with legacy permissionsMap format.
 */

import { db } from "../db";
import { permissions, rolePermissions, userPermissions, modules, userRoles } from "@shared/schema";
import { isAdminRole, isSystemRole, SystemRole } from "@shared/types/roles";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { buildAbilityForUser, AbilityResponse } from "../authorization";

/**
 * Legacy response format (backwards compatible)
 */
export interface PermissionsResponse {
  role: string;
  permissions: Record<string, string[]>;
  isAdmin: boolean;
}

/**
 * Extended response format with CASL rules
 */
export interface PermissionsResponseV2 extends PermissionsResponse {
  roles: string[];
  caslRules: any[];
  agenceIdActive?: string;
  agenceNom?: string;
  lockedFeatures?: string[];
}

/**
 * Normalize permission code to lowercase
 * Ensures consistent comparison between DB values
 */
function normalizeCode(code: string): string {
  return code.toLowerCase().trim();
}

/**
 * Calcule les permissions effectives d'un utilisateur (V2 - Multi-rôle + CASL)
 *
 * @param userId - ID de l'utilisateur
 * @param userRole - Rôle principal (pour compatibilité, peut être ignoré si multi-rôle)
 * @param agenceIdActive - Agence active pour le scope (optionnel)
 * @returns PermissionsResponseV2 avec CASL rules et legacy permissionsMap
 */
export async function getPermissionsForUserV2(
  userId: string,
  userRole: string,
  agenceIdActive?: string
): Promise<PermissionsResponseV2> {
  // Use the CASL authorization module
  const abilityResponse = await buildAbilityForUser({
    userId,
    agenceIdActive,
  });

  return {
    role: abilityResponse.role,
    roles: abilityResponse.roles,
    permissions: abilityResponse.permissions,
    isAdmin: abilityResponse.isAdmin,
    caslRules: abilityResponse.caslRules,
    agenceIdActive: abilityResponse.agenceIdActive,
    agenceNom: abilityResponse.agenceNom,
    lockedFeatures: abilityResponse.lockedFeatures,
  };
}

/**
 * Calcule les permissions effectives d'un utilisateur (Legacy - Mono-rôle)
 *
 * Maintenu pour compatibilité avec le code existant.
 * Préférer getPermissionsForUserV2() pour les nouvelles implémentations.
 *
 * @deprecated Use getPermissionsForUserV2 for multi-role support
 */
export async function getPermissionsForUser(
  userId: string,
  userRole: string
): Promise<PermissionsResponse> {
  // Administrateur has all permissions
  if (isAdminRole(userRole)) {
    const allPerms = await db.select({
      id: permissions.id,
      code: permissions.code,
      name: permissions.name,
      moduleName: modules.name,
    })
      .from(permissions)
      .leftJoin(modules, eq(permissions.moduleId, modules.id));

    const permissionsMap: Record<string, string[]> = {};
    allPerms.forEach(p => {
      // Parse code like "caisse.view" -> module: "caisse", action: "view"
      const normalized = normalizeCode(p.code);
      const parts = normalized.split('.');
      const module = parts[0];
      const action = parts.slice(1).join('.');
      if (!permissionsMap[module]) {
        permissionsMap[module] = [];
      }
      if (action && !permissionsMap[module].includes(action)) {
        permissionsMap[module].push(action);
      }
    });

    // Add wildcard for admin
    permissionsMap['*'] = ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export'];

    return {
      role: userRole,
      permissions: permissionsMap,
      isAdmin: true
    };
  }

  // Get role-based permissions
  // Cast userRole to SystemRole if valid, otherwise use empty array
  const validRole = isSystemRole(userRole) ? userRole : null;

  const rolePerms = validRole
    ? await db.select({
        code: permissions.code,
        granted: rolePermissions.granted,
      })
        .from(rolePermissions)
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(and(
          eq(rolePermissions.role, validRole),
          eq(rolePermissions.granted, true)
        ))
    : [];

  // Get user-specific custom permissions (granular overrides)
  const customPerms = await db.select({
    code: permissions.code,
    granted: userPermissions.granted
  })
    .from(userPermissions)
    .leftJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));

  // Build permissions map from role permissions
  const permissionsMap: Record<string, string[]> = {};

  rolePerms.forEach(p => {
    if (p.code) {
      // Normalize code to lowercase for consistent comparison
      const normalized = normalizeCode(p.code);
      const parts = normalized.split('.');
      const module = parts[0];
      const action = parts.slice(1).join('.');
      if (!permissionsMap[module]) {
        permissionsMap[module] = [];
      }
      if (action && !permissionsMap[module].includes(action)) {
        permissionsMap[module].push(action);
      }
    }
  });

  // Apply custom permission overrides
  customPerms.forEach(cp => {
    if (!cp.code) return;

    // Normalize code (fixed: both module and action are normalized)
    const normalized = normalizeCode(cp.code);
    const parts = normalized.split('.');
    const moduleName = parts[0];
    const action = parts.slice(1).join('.');

    if (!permissionsMap[moduleName]) {
      permissionsMap[moduleName] = [];
    }

    const index = permissionsMap[moduleName].indexOf(action);

    if (cp.granted && index === -1) {
      // Add permission if granted and not present
      permissionsMap[moduleName].push(action);
    } else if (!cp.granted && index !== -1) {
      // Remove permission if denied and present
      permissionsMap[moduleName].splice(index, 1);
    }
  });

  return {
    role: userRole,
    permissions: permissionsMap,
    isAdmin: false
  };
}

/**
 * Get all effective roles for a user
 * Used by routes that need to know all user roles
 */
export async function getUserEffectiveRoles(userId: string, agenceIdActive?: string): Promise<SystemRole[]> {
  const conditions = [eq(userRoles.userId, userId)];

  let roles;
  if (agenceIdActive) {
    roles = await db.select({ role: userRoles.role })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        or(
          eq(userRoles.agenceId, agenceIdActive),
          isNull(userRoles.agenceId)
        )
      ));
  } else {
    roles = await db.select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  return Array.from(new Set(roles.map(r => r.role as SystemRole)));
}

/**
 * Check if a user has a specific permission code
 * Useful for quick permission checks without building full ability
 */
export async function hasPermission(
  userId: string,
  userRole: string,
  permissionCode: string
): Promise<boolean> {
  // Admin has all permissions
  if (isAdminRole(userRole)) {
    return true;
  }

  const normalized = normalizeCode(permissionCode);

  // Check user-specific override first
  const [userOverride] = await db.select({ granted: userPermissions.granted })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(and(
      eq(userPermissions.userId, userId),
      eq(permissions.code, normalized)
    ));

  if (userOverride !== undefined) {
    return userOverride.granted;
  }

  // Check role permission
  const validRole = isSystemRole(userRole) ? userRole : null;
  if (!validRole) return false;

  const [rolePerm] = await db.select({ granted: rolePermissions.granted })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(
      eq(rolePermissions.role, validRole),
      eq(permissions.code, normalized),
      eq(rolePermissions.granted, true)
    ));

  return !!rolePerm;
}
