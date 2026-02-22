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
 */
export interface AbilityResponse {
  role: string;
  roles: string[];
  permissions: Record<string, string[]>;
  isAdmin: boolean;
  caslRules: AppAbilityRule[];
  agenceIdActive?: string;
  agenceNom?: string;
  lockedFeatures?: string[];
}
