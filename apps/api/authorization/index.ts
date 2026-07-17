/**
 * CASL Authorization Module
 * =========================
 *
 * Provides CASL-based authorization for the MICROFLEX application.
 *
 * Usage:
 * ------
 *
 * 1. Import middleware in your routes:
 *
 *    import { attachAbility, requireAbility, requireDisbursement } from '../authorization';
 *
 * 2. Apply to routes:
 *
 *    // Basic permission check
 *    app.post('/api/credits',
 *      requireAuth,
 *      attachAbility,
 *      requireAbility('create', 'Credit'),
 *      handler
 *    );
 *
 *    // Disbursement with channel-specific checks
 *    app.post('/api/credits/decaissement',
 *      requireAuth,
 *      attachAbility,
 *      requireDisbursement(),
 *      handler
 *    );
 *
 *    // Or use combined helpers
 *    app.post('/api/credits', requireAuth, ...withAbility('create', 'Credit'), handler);
 *
 * 3. Check abilities in handlers:
 *
 *    if (hasAbility(req, 'manage', 'Credit')) {
 *      // Include admin-only data
 *    }
 *
 * 4. Build ability for API response:
 *
 *    const response = await buildAbilityForUser({ userId: user.id, agenceIdActive: user.agenceId });
 *    res.json(response); // Includes caslRules and permissionsMap
 */

// Types (values) - Actions and Subjects from shared
export { Actions, Subjects } from './types';

// Permission mappings from shared (single source of truth)
export {
  PERMISSION_MAPPINGS,
  getPermissionMapping,
  normalizePermissionCode,
  parsePermissionCode,
  type PermissionMapping,
} from '@shared/ability';

// Types (type-only)
export type {
  Action,
  Subject,
  AppAbility,
  AppAbilityRule,
  AbilityResponse,
} from './types';

// Ability builder (values)
export {
  buildAbilityForUser,
  createAbilityFromRules,
  getAbilityForUser,
  hasPermissionCode,
  canDisburse,
  expandRolesWithHierarchy,
  getInheritedRoles,
  invalidateRoleHierarchyCache,
  DISBURSEMENT_PERMISSION_FALLBACKS,
} from './ability';

// Ability builder (type-only)
export type { AbilityContext } from './ability';

// Critical permission patterns (DB-backed)
export {
  loadCriticalPatterns,
  isCriticalPermissionFromDb,
  invalidateCriticalPatternsCache,
} from './critical-patterns';

// Middleware
export {
  attachAbility,
  requireAbility,
  requireAnyAbility,
  requireAllAbilities,
  requireDisbursement,
  requireResetPassword,
  requirePlatformOperator,
  hasAbility,
  assertAbility,
  withAbility,
  withDisbursementCheck,
  withResetPasswordCheck,
} from './middleware';
