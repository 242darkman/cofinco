/**
 * Shared CASL Ability Module
 *
 * This module provides a unified CASL-based authorization system
 * that can be used both on frontend (React) and backend (Express).
 *
 * Usage:
 *
 * // Frontend (React)
 * import { Actions, Subjects, CaslRule, buildRulesFromPermissionCodes } from '@shared/ability';
 *
 * // Backend (Express)
 * import { Actions, Subjects, PERMISSION_MAPPINGS, buildRulesFromPermissionCodes } from '@shared/ability';
 *
 * // Check permission
 * import { canWithRules } from '@shared/ability';
 * const allowed = canWithRules(rules, Actions.CREATE, Subjects.CREDIT);
 */

// Actions (verbs)
import { Actions as ActionsConst } from './actions';
export { Actions, type Action, ALL_ACTIONS, ACTION_CATEGORIES, ACTION_LABELS } from './actions';

// Subjects (nouns)
import { Subjects as SubjectsConst } from './subjects';
export {
  Subjects,
  type Subject,
  ALL_SUBJECTS,
  MODULE_SUBJECTS,
  ENTITY_SUBJECTS,
  SUBJECT_LABELS,
  MODULE_ENTITY_MAP,
} from './subjects';

// Permission code mappings
export {
  PERMISSION_MAPPINGS,
  type PermissionMapping,
  getPermissionMapping,
  getPermissionCode,
  normalizePermissionCode,
  parsePermissionCode,
  getPermissionCodesForSubject,
  getPermissionCodesForAction,
} from './mappings';

// Types
export type {
  CaslRule,
  AbilityUserContext,
  PermissionsResponse,
  RbacUpdatePayload,
  RbacWebSocketMessage,
  PermissionCheckRequest,
  PermissionCheckResult,
  PermissionCatalogEntry,
  RolePermissionsSummary,
  UserPermissionOverrides,
} from './types';

// Factory functions
export {
  buildRulesFromPermissionCodes,
  buildRulesFromPermissionsMap,
  buildAdminRules,
  mergeRules,
  isAgencyScopedSubject,
  ruleMatches,
  canWithRules,
  getAllowedActionsForSubject,
  rulesToPermissionsMap,
  validateRules,
} from './factory';

// Re-export for convenience (aliased)
export const AbilityActions = ActionsConst;
export const AbilitySubjects = SubjectsConst;
