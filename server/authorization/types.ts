/**
 * CASL Authorization Types
 * =========================
 * Re-exports from @shared/ability for backend use.
 * Adds additional backend-specific types.
 */

import type { MongoAbility, RawRuleOf } from '@casl/ability';

// Re-export Actions and Subjects from shared module (single source of truth)
export { Actions, Subjects, type Action, type Subject } from '@shared/ability';
import { Actions, Subjects, type Action, type Subject } from '@shared/ability';

/**
 * CASL Ability type for the application
 */
export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * CASL Rule type (JSON-serializable)
 */
export type AppAbilityRule = RawRuleOf<AppAbility>;

/**
 * Response type for /api/my-permissions endpoint
 * Includes both legacy permissionsMap and new CASL rules
 */
export interface AbilityResponse {
  // Legacy support
  role: string;
  roles: string[]; // All effective roles (multi-role)
  permissions: Record<string, string[]>; // Legacy permissionsMap
  isAdmin: boolean;

  // CASL rules (new)
  caslRules: AppAbilityRule[];

  // Context
  agenceIdActive?: string;
  agenceNom?: string;

  // Module locks
  lockedFeatures?: string[];
}

// Note: PERMISSION_CODE_MAPPINGS, normalizePermissionCode, and parsePermissionCode
// have been moved to @shared/ability/mappings.ts as the single source of truth.
// Import from '@shared/ability' instead.
