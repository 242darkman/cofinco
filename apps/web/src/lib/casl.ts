/**
 * CASL Ability Management for Frontend
 * =====================================
 *
 * This module provides CASL ability management for the React frontend.
 * It builds abilities from rules received from the API and provides
 * hooks for checking permissions in components.
 *
 * Usage:
 * ------
 *
 * 1. Build ability from API response:
 *    const ability = buildAbility(response.caslRules);
 *
 * 2. Check permissions:
 *    if (ability.can('create', 'Credit')) { ... }
 *
 * 3. Use in components:
 *    <Can I="create" a="Credit">
 *      <Button>Create Credit</Button>
 *    </Can>
 */

import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { Actions, Subjects, Action, Subject, CaslRule } from '@shared/types/casl';

// Re-export types for convenience
export { Actions, Subjects };
export type { Action, Subject, CaslRule };

/**
 * Application Ability type
 */
export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Rule type for serialization
 */
export type AppAbilityRule = RawRuleOf<AppAbility>;

/**
 * Build CASL Ability from rules received from API
 */
export function buildAbility(rules: CaslRule[]): AppAbility {
  return createMongoAbility<[Action, Subject]>(rules as AppAbilityRule[]);
}

/**
 * Create an empty ability (no permissions)
 */
export function createEmptyAbility(): AppAbility {
  return createMongoAbility<[Action, Subject]>([]);
}

/**
 * Create an admin ability (all permissions)
 */
export function createAdminAbility(): AppAbility {
  return createMongoAbility<[Action, Subject]>([
    { action: 'manage', subject: 'all' },
  ]);
}

/**
 * Check if ability allows an action on a subject
 */
export function can(ability: AppAbility, action: Action, subject: Subject): boolean {
  return ability.can(action, subject);
}

/**
 * Check if ability denies an action on a subject
 */
export function cannot(ability: AppAbility, action: Action, subject: Subject): boolean {
  return ability.cannot(action, subject);
}

/**
 * Module mapping from route modules to CASL subjects
 * Used for backwards compatibility with routes-config
 */
export const MODULE_TO_SUBJECT: Record<string, Subject> = {
  // Core modules
  'Dashboard': Subjects.DASHBOARD,
  'Clients': Subjects.CLIENTS,
  'Crédits': Subjects.CREDITS,
  'Credits': Subjects.CREDITS,
  'Remboursements': Subjects.REMBOURSEMENT,
  'Comptes': Subjects.COMPTES,
  'Epargnes': Subjects.EPARGNES,
  'Épargnes': Subjects.EPARGNES,
  'Tontines': Subjects.TONTINES,
  'Cartes de Pointage': Subjects.CARTES_POINTAGE,
  'CartesPointage': Subjects.CARTES_POINTAGE,
  'Comptabilité': Subjects.COMPTABILITE,
  'Comptabilite': Subjects.COMPTABILITE,
  'Caisse': Subjects.CAISSE,
  'Coffre-Fort': Subjects.COFFRE,
  'CoffreFort': Subjects.COFFRE,
  'Coffre': Subjects.COFFRE,

  // Agent/Terrain
  'Agent Terrain': Subjects.TERRAIN,
  'AgentTerrain': Subjects.TERRAIN,
  'Terrain': Subjects.TERRAIN,
  'CaisseAgent': Subjects.CAISSE_AGENT,

  // Administration
  'Administration': Subjects.ADMIN,
  'Admin': Subjects.ADMIN,
  'RBAC': Subjects.RBAC,
  'Paramètres': Subjects.SETTINGS,
  'Settings': Subjects.SETTINGS,
  'Maintenance': Subjects.MAINTENANCE,

  // Reports & RH
  'Rapports': Subjects.RAPPORTS,
  'RH': Subjects.RH,
  'Employés': Subjects.EMPLOYE,

  // Communications
  'Communications': Subjects.COMMUNICATION,
  'Messages': Subjects.MESSAGE,
  'Audit': Subjects.AUDIT_LOG,

  // Field operations
  'Incidents': Subjects.INCIDENT,
  'Visites': Subjects.VISITE,
  'Prospection': Subjects.PROSPECTION,
  'Paiements Agent': Subjects.PAIEMENT_TERRAIN,

  // Transfers
  'Transferts': Subjects.TRANSFERT,
  'Virements Programmes': Subjects.VIREMENT,

  // New modules
  'Fidélité': Subjects.LOYALTY,
  'Loyalty': Subjects.LOYALTY,
  'Régularisation': Subjects.REGULARISATION,
  'Départements': Subjects.DEPARTMENT,
  'Agences': Subjects.AGENCE,
  'KPI': Subjects.KPI,
};

/**
 * Check if ability allows viewing a module (for menu/routes)
 */
export function canAccessModule(ability: AppAbility, moduleName: string): boolean {
  // Admin can access everything
  if (ability.can(Actions.MANAGE, Subjects.ALL)) {
    return true;
  }

  const subject = MODULE_TO_SUBJECT[moduleName];
  if (!subject) {
    // Unknown module - allow by default (might be public)
    return true;
  }

  // Check if user can view the subject
  return ability.can(Actions.VIEW, subject);
}

/**
 * Extract all allowed actions for a subject from ability
 */
export function getAllowedActions(ability: AppAbility, subject: Subject): Action[] {
  const allActions: Action[] = Object.values(Actions);
  return allActions.filter(action => ability.can(action, subject));
}

/**
 * Check multiple permissions at once (any)
 */
export function canAny(
  ability: AppAbility,
  checks: Array<{ action: Action; subject: Subject }>
): boolean {
  return checks.some(({ action, subject }) => ability.can(action, subject));
}

/**
 * Check multiple permissions at once (all)
 */
export function canAll(
  ability: AppAbility,
  checks: Array<{ action: Action; subject: Subject }>
): boolean {
  return checks.every(({ action, subject }) => ability.can(action, subject));
}
