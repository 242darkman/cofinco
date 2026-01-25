/**
 * CASL Types - Shared between frontend and backend
 *
 * These types define the shape of abilities and rules used throughout the app.
 */

import type { Action } from './actions';
import type { Subject } from './subjects';

/**
 * A CASL rule as stored/transmitted
 */
export interface CaslRule {
  action: Action | Action[];
  subject: Subject | Subject[];
  conditions?: Record<string, any>;
  fields?: string[];
  inverted?: boolean;
  reason?: string;
}

/**
 * User context for building abilities
 */
export interface AbilityUserContext {
  id: string;
  roles: string[];
  primaryRole: string;
  agenceId?: string | null;
  isAdmin: boolean;
}

/**
 * Response from /api/my-permissions endpoint
 */
export interface PermissionsResponse {
  // User info
  userId: string;
  role: string;
  roles: string[];
  isAdmin: boolean;
  agenceIdActive: string | null;
  agenceNom: string | null;

  // Permissions data
  caslRules: CaslRule[];
  permissionsVersion: number;

  // Legacy format (for backwards compatibility during migration)
  permissions?: Record<string, string[]>;

  // Feature locks
  lockedFeatures: string[];
}

/**
 * Payload for RBAC update WebSocket events
 */
export interface RbacUpdatePayload {
  // Scope of the update
  scope: 'role' | 'user' | 'global';

  // Affected role (if scope is 'role')
  role?: string;

  // Affected user ID (if scope is 'user')
  userId?: string;

  // New permissions version
  version: number;

  // What changed (optional, for debugging/UI feedback)
  changed?: {
    permissionCode: string;
    granted: boolean;
    source: 'role_permission' | 'user_permission';
  };

  // Agency scope (if applicable)
  agenceId?: string;
}

/**
 * WebSocket message types for RBAC
 */
export type RbacWebSocketMessage =
  | {
      type: 'rbac:update';
      payload: RbacUpdatePayload;
    }
  | {
      type: 'session:kill';
      payload: {
        userId: string;
        reason: string;
        allDevices?: boolean;
      };
    }
  | {
      type: 'session:refresh';
      payload: {
        userId: string;
        reason: string;
      };
    };

/**
 * Permission check request
 */
export interface PermissionCheckRequest {
  action: Action;
  subject: Subject;
  conditions?: Record<string, any>;
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: CaslRule;
}

/**
 * Catalog entry for RBAC UI
 */
export interface PermissionCatalogEntry {
  id: string;
  code: string;
  name: string;
  description?: string;
  moduleId: string;
  moduleName: string;
  moduleCategory: string;
  action: Action;
  subject: Subject;
}

/**
 * Role permissions summary for RBAC UI
 */
export interface RolePermissionsSummary {
  role: string;
  roleLabel: string;
  totalPermissions: number;
  permissions: Array<{
    permissionId: string;
    code: string;
    granted: boolean;
    isDefault: boolean;
  }>;
}

/**
 * User permission overrides for RBAC UI
 */
export interface UserPermissionOverrides {
  userId: string;
  userName: string;
  userRole: string;
  overrides: Array<{
    permissionId: string;
    code: string;
    granted: boolean;
    inheritedFromRole: boolean;
    overriddenAt?: string;
  }>;
  inheritedPermissions: string[];
}
