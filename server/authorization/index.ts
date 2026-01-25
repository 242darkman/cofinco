/**
 * CASL Authorization Module
 * =========================
 *
 * Provides CASL-based authorization for the COFINCO application.
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

// Types
export {
  Actions,
  Subjects,
  Action,
  Subject,
  AppAbility,
  AppAbilityRule,
  AbilityResponse,
  PermissionMapping,
  PERMISSION_CODE_MAPPINGS,
  normalizePermissionCode,
  parsePermissionCode,
} from './types';

// Ability builder
export {
  AbilityContext,
  buildAbilityForUser,
  createAbilityFromRules,
  getAbilityForUser,
  hasPermissionCode,
  canDisburse,
  DISBURSEMENT_PERMISSION_FALLBACKS,
} from './ability';

// Middleware
export {
  attachAbility,
  requireAbility,
  requireAnyAbility,
  requireAllAbilities,
  requireDisbursement,
  requireResetPassword,
  hasAbility,
  assertAbility,
  withAbility,
  withDisbursementCheck,
  withResetPasswordCheck,
} from './middleware';
