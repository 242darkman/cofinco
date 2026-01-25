/**
 * CASL Ability Factory - Shared between frontend and backend
 *
 * This factory creates CASL Ability instances from permission rules.
 * It can be used both client-side (React) and server-side (Express).
 *
 * Usage:
 * - Frontend: Import and use with rules from API response
 * - Backend: Import and use with rules from database
 */

import { Actions, type Action } from './actions';
import { Subjects, type Subject } from './subjects';
import { PERMISSION_MAPPINGS, getPermissionMapping, normalizePermissionCode } from './mappings';
import type { CaslRule, AbilityUserContext } from './types';

// Note: We use a lightweight implementation that doesn't require @casl/ability on the shared side
// The actual CASL ability is created in platform-specific code (server/client)

/**
 * Build CASL rules from a list of permission codes
 *
 * @param permissionCodes - Array of permission codes (e.g., ["credits.view", "credits.create"])
 * @param options - Options for building rules
 * @returns Array of CASL rules
 */
export function buildRulesFromPermissionCodes(
  permissionCodes: string[],
  options: {
    agenceId?: string | null;
    includeConditions?: boolean;
  } = {}
): CaslRule[] {
  const rules: CaslRule[] = [];
  const seenRules = new Set<string>();

  for (const code of permissionCodes) {
    const normalizedCode = normalizePermissionCode(code);
    const mapping = getPermissionMapping(normalizedCode);

    if (!mapping) {
      // Skip unknown permission codes
      console.warn(`Unknown permission code: ${code}`);
      continue;
    }

    // Create unique key to avoid duplicates
    const ruleKey = `${mapping.action}:${mapping.subject}`;
    if (seenRules.has(ruleKey)) continue;
    seenRules.add(ruleKey);

    const rule: CaslRule = {
      action: mapping.action,
      subject: mapping.subject,
    };

    // Add agency condition if specified and if the subject supports it
    // (entities that are agency-scoped)
    if (options.includeConditions && options.agenceId && isAgencyScopedSubject(mapping.subject)) {
      rule.conditions = { agenceId: options.agenceId };
    }

    rules.push(rule);
  }

  return rules;
}

/**
 * Build admin rules (can manage all)
 */
export function buildAdminRules(): CaslRule[] {
  return [
    {
      action: Actions.MANAGE,
      subject: Subjects.ALL,
    },
  ];
}

/**
 * Build rules from a permissions map (legacy format)
 *
 * @param permissionsMap - Legacy format: { "credits": ["view", "create"], ... }
 * @param options - Options for building rules
 * @returns Array of CASL rules
 */
export function buildRulesFromPermissionsMap(
  permissionsMap: Record<string, string[]>,
  options: {
    agenceId?: string | null;
    includeConditions?: boolean;
  } = {}
): CaslRule[] {
  const permissionCodes: string[] = [];

  for (const [module, actions] of Object.entries(permissionsMap)) {
    for (const action of actions) {
      permissionCodes.push(`${module}.${action}`);
    }
  }

  return buildRulesFromPermissionCodes(permissionCodes, options);
}

/**
 * Merge multiple sets of rules
 *
 * @param rulesSets - Multiple arrays of rules to merge
 * @returns Merged and deduplicated rules
 */
export function mergeRules(...rulesSets: CaslRule[][]): CaslRule[] {
  const merged: CaslRule[] = [];
  const seenRules = new Set<string>();

  for (const rules of rulesSets) {
    for (const rule of rules) {
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];

      for (const action of actions) {
        for (const subject of subjects) {
          const key = `${action}:${subject}:${JSON.stringify(rule.conditions || {})}`;
          if (!seenRules.has(key)) {
            seenRules.add(key);
            merged.push({
              action,
              subject,
              conditions: rule.conditions,
              inverted: rule.inverted,
            });
          }
        }
      }
    }
  }

  return merged;
}

/**
 * Check if a subject is agency-scoped (should have agenceId condition)
 */
export function isAgencyScopedSubject(subject: Subject): boolean {
  const agencyScopedSubjects: Subject[] = [
    Subjects.CLIENT,
    Subjects.CREDIT,
    Subjects.DEMANDE_CREDIT,
    Subjects.ECHEANCE,
    Subjects.COMPTE,
    Subjects.COMPTE_EPARGNE,
    Subjects.COMPTE_COURANT,
    Subjects.COMPTE_BLOQUE,
    Subjects.TONTINE,
    Subjects.TONTINE_MEMBRE,
    Subjects.TONTINE_CONTRIBUTION,
    Subjects.CAISSE_SESSION,
    Subjects.CAISSE_OPERATION,
    Subjects.CAISSE_AGENT,
    Subjects.COFFRE_TRANSFERT,
    Subjects.ECRITURE_COMPTABLE,
    Subjects.EMPLOYE,
    Subjects.AGENT_TERRAIN,
    Subjects.OPERATION_TERRAIN,
    Subjects.REEVALUATION,
  ];

  return agencyScopedSubjects.includes(subject);
}

/**
 * Check if a rule matches an action/subject pair
 * (Simplified check - actual CASL library does more sophisticated matching)
 */
export function ruleMatches(
  rule: CaslRule,
  action: Action,
  subject: Subject
): boolean {
  // Check action
  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  const actionMatches =
    ruleActions.includes(action) ||
    ruleActions.includes(Actions.MANAGE as Action);

  if (!actionMatches) return false;

  // Check subject
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  const subjectMatches =
    ruleSubjects.includes(subject) ||
    ruleSubjects.includes(Subjects.ALL as Subject);

  return subjectMatches;
}

/**
 * Simple permission check without CASL library
 * Use this for lightweight checks where full CASL isn't needed
 */
export function canWithRules(
  rules: CaslRule[],
  action: Action,
  subject: Subject
): boolean {
  // Check for explicit deny first (inverted rules)
  for (const rule of rules) {
    if (rule.inverted && ruleMatches(rule, action, subject)) {
      return false;
    }
  }

  // Check for allow
  for (const rule of rules) {
    if (!rule.inverted && ruleMatches(rule, action, subject)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all actions allowed on a subject
 */
export function getAllowedActionsForSubject(
  rules: CaslRule[],
  subject: Subject
): Action[] {
  const allowed = new Set<Action>();

  for (const rule of rules) {
    if (rule.inverted) continue;

    const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    if (!ruleSubjects.includes(subject) && !ruleSubjects.includes(Subjects.ALL as Subject)) {
      continue;
    }

    const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];

    // If manage, add all standard actions
    if (ruleActions.includes(Actions.MANAGE as Action)) {
      allowed.add(Actions.VIEW as Action);
      allowed.add(Actions.CREATE as Action);
      allowed.add(Actions.EDIT as Action);
      allowed.add(Actions.DELETE as Action);
      allowed.add(Actions.EXPORT as Action);
      allowed.add(Actions.MANAGE as Action);
    } else {
      for (const action of ruleActions) {
        allowed.add(action);
      }
    }
  }

  return Array.from(allowed);
}

/**
 * Convert rules to a permissions map (legacy format)
 * Useful for backwards compatibility
 */
export function rulesToPermissionsMap(rules: CaslRule[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const [code, mapping] of Object.entries(PERMISSION_MAPPINGS)) {
    if (canWithRules(rules, mapping.action, mapping.subject)) {
      const parts = code.split('.');
      const module = parts[0];
      const action = parts.slice(1).join('.');

      if (!map[module]) {
        map[module] = [];
      }
      if (!map[module].includes(action)) {
        map[module].push(action);
      }
    }
  }

  return map;
}

/**
 * Validate that a rules array is well-formed
 */
export function validateRules(rules: CaslRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    if (!rule.action) {
      errors.push(`Rule ${i}: missing action`);
    }

    if (!rule.subject) {
      errors.push(`Rule ${i}: missing subject`);
    }

    // Validate action values
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const action of actions) {
      if (!Object.values(Actions).includes(action)) {
        errors.push(`Rule ${i}: invalid action "${action}"`);
      }
    }

    // Validate subject values
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    for (const subject of subjects) {
      if (!Object.values(Subjects).includes(subject)) {
        errors.push(`Rule ${i}: invalid subject "${subject}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
