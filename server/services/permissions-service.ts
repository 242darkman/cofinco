/**
 * Service de permissions - Calcule les permissions effectives d'un utilisateur
 * Réutilisable par /api/my-permissions ET /api/auth/login
 */

import { db } from "../db";
import { permissions, rolePermissions, userPermissions, modules } from "@shared/schema";
import { isAdminRole, isSystemRole, SystemRole } from "@shared/types/roles";
import { eq, and } from "drizzle-orm";

export interface PermissionsResponse {
  role: string;
  permissions: Record<string, string[]>;
  isAdmin: boolean;
}

/**
 * Calcule les permissions effectives d'un utilisateur
 * Combine: permissions du rôle + overrides personnalisés
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
      const parts = p.code.split('.');
      const module = parts[0];
      const action = parts.slice(1).join('.');
      if (!permissionsMap[module]) {
        permissionsMap[module] = [];
      }
      if (action) {
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
      const parts = p.code.split('.');
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

    const parts = cp.code.split('.');
    const moduleName = parts[0].toLowerCase();
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
