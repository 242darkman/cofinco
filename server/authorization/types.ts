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

/**
 * Mapping from permission code to CASL action/subject
 * Format: "module.action" -> { action: Action, subject: Subject }
 */
export interface PermissionMapping {
  action: Action;
  subject: Subject;
  conditions?: Record<string, any>;
}

/**
 * Permission code format: "subject.action" or "subject.sub.action"
 * Examples: "credits.view", "credits.reevaluations.create", "coffre.transfert.init"
 */
export const PERMISSION_CODE_MAPPINGS: Record<string, PermissionMapping> = {
  // Dashboard
  'dashboard.view': { action: Actions.VIEW, subject: Subjects.DASHBOARD },

  // Credits
  'credits.view': { action: Actions.VIEW, subject: Subjects.CREDIT },
  'credits.create': { action: Actions.CREATE, subject: Subjects.CREDIT },
  'credits.edit': { action: Actions.EDIT, subject: Subjects.CREDIT },
  'credits.delete': { action: Actions.DELETE, subject: Subjects.CREDIT },
  'credits.approve': { action: Actions.APPROVE, subject: Subjects.CREDIT },
  'credits.reject': { action: Actions.REJECT, subject: Subjects.CREDIT },
  'credits.disburse': { action: Actions.DISBURSE, subject: Subjects.CREDIT },
  'credits.collect': { action: Actions.COLLECT, subject: Subjects.CREDIT },
  'credits.reevaluations.view': { action: Actions.VIEW, subject: Subjects.REEVALUATION },
  'credits.reevaluations.create': { action: Actions.CREATE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.validate': { action: Actions.VALIDATE_REEVALUATION, subject: Subjects.REEVALUATION },
  'credits.reevaluations.decide': { action: Actions.DECIDE_REEVALUATION, subject: Subjects.REEVALUATION },

  // Clients
  'clients.view': { action: Actions.VIEW, subject: Subjects.CLIENT },
  'clients.create': { action: Actions.CREATE, subject: Subjects.CLIENT },
  'clients.edit': { action: Actions.EDIT, subject: Subjects.CLIENT },
  'clients.delete': { action: Actions.DELETE, subject: Subjects.CLIENT },

  // Comptes/Epargnes
  'epargnes.view': { action: Actions.VIEW, subject: Subjects.COMPTE },
  'epargnes.create': { action: Actions.CREATE, subject: Subjects.COMPTE },
  'epargnes.edit': { action: Actions.EDIT, subject: Subjects.COMPTE },
  'epargnes.deposit': { action: Actions.DEPOSIT, subject: Subjects.COMPTE },
  'epargnes.withdraw': { action: Actions.WITHDRAW, subject: Subjects.COMPTE },

  // Tontines
  'tontines.view': { action: Actions.VIEW, subject: Subjects.TONTINE },
  'tontines.create': { action: Actions.CREATE, subject: Subjects.TONTINE },
  'tontines.edit': { action: Actions.EDIT, subject: Subjects.TONTINE },
  'tontines.manage': { action: Actions.MANAGE, subject: Subjects.TONTINE },

  // Remboursements
  'remboursements.view': { action: Actions.VIEW, subject: Subjects.REMBOURSEMENT },
  'remboursements.create': { action: Actions.CREATE, subject: Subjects.REMBOURSEMENT },

  // Caisse
  'caisse.view': { action: Actions.VIEW, subject: Subjects.CAISSE },
  'caisse.create': { action: Actions.CREATE, subject: Subjects.CAISSE },
  'caisse.edit': { action: Actions.EDIT, subject: Subjects.CAISSE },
  'caisse.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE },
  'caisse.open': { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.close': { action: Actions.CLOSE_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.deposit': { action: Actions.DEPOSIT, subject: Subjects.CAISSE },
  'caisse.withdraw': { action: Actions.WITHDRAW, subject: Subjects.CAISSE },
  'caisse.transfer': { action: Actions.TRANSFER, subject: Subjects.CAISSE },

  // Paiements
  'paiements.view': { action: Actions.VIEW, subject: Subjects.PAIEMENT_TERRAIN },
  'paiements.create': { action: Actions.CREATE, subject: Subjects.PAIEMENT_TERRAIN },

  // Caisse Agent
  'caisseagent.view': { action: Actions.VIEW, subject: Subjects.CAISSE_AGENT },
  'caisseagent.create': { action: Actions.CREATE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.reject': { action: Actions.REJECT_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.suspend': { action: Actions.SUSPEND_AGENT, subject: Subjects.CAISSE_AGENT },

  // Coffre-Fort
  'coffre.view': { action: Actions.VIEW, subject: Subjects.COFFRE },
  'coffre.transfert.init': { action: Actions.INIT_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.validate': { action: Actions.VALIDATE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.execute': { action: Actions.EXECUTE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.config.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'coffre.config.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },
  'coffre.supervision.view': { action: Actions.VIEW, subject: Subjects.COFFRE },

  // Agent Terrain
  'agent.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'agent.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'agent.collect': { action: Actions.COLLECT, subject: Subjects.AGENT_TERRAIN },
  'agent.visit': { action: Actions.CREATE, subject: Subjects.VISITE },
  'agent.manage': { action: Actions.MANAGE, subject: Subjects.AGENT_TERRAIN },
  'agents_terrain.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'agents_terrain.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'agents_terrain.edit': { action: Actions.EDIT, subject: Subjects.AGENT_TERRAIN },
  'agent_terrain.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },

  // Incidents
  'incidents.view': { action: Actions.VIEW, subject: Subjects.INCIDENT },
  'incidents.create': { action: Actions.CREATE, subject: Subjects.INCIDENT },
  'incidents.edit': { action: Actions.EDIT, subject: Subjects.INCIDENT },
  'incidents.manage': { action: Actions.MANAGE, subject: Subjects.INCIDENT },

  // Visites
  'visites.view': { action: Actions.VIEW, subject: Subjects.VISITE },
  'visites.create': { action: Actions.CREATE, subject: Subjects.VISITE },

  // Prospection
  'prospection.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION },
  'prospection.create': { action: Actions.CREATE, subject: Subjects.PROSPECTION },

  // Comptabilité
  'comptabilite.view': { action: Actions.VIEW, subject: Subjects.COMPTABILITE },
  'comptabilite.create': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.write': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.edit': { action: Actions.EDIT, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.export': { action: Actions.EXPORT, subject: Subjects.COMPTABILITE },
  'comptabilite.reports': { action: Actions.VIEW, subject: Subjects.RAPPORTS },

  // Rapports
  'rapports.view': { action: Actions.VIEW, subject: Subjects.RAPPORTS },
  'rapports.export': { action: Actions.EXPORT, subject: Subjects.RAPPORTS },
  'rapports.schedule': { action: Actions.CREATE, subject: Subjects.RAPPORTS },

  // Administration
  'admin.users': { action: Actions.MANAGE, subject: Subjects.USER },
  'admin.roles': { action: Actions.MANAGE_ROLES, subject: Subjects.ROLE },
  'admin.settings': { action: Actions.MANAGE, subject: Subjects.SETTINGS },
  'admin.logs': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },

  // Users (for direct permission checks)
  'users.view': { action: Actions.VIEW, subject: Subjects.USER },
  'users.create': { action: Actions.CREATE, subject: Subjects.USER },
  'users.edit': { action: Actions.EDIT, subject: Subjects.USER },
  'users.delete': { action: Actions.DELETE, subject: Subjects.USER },
  'users.reset_password': { action: Actions.RESET_PASSWORD, subject: Subjects.USER },

  // RH
  'rh.view': { action: Actions.VIEW, subject: Subjects.RH },
  'rh.create': { action: Actions.CREATE, subject: Subjects.RH },
  'rh.edit': { action: Actions.EDIT, subject: Subjects.RH },
  'rh.approve': { action: Actions.APPROVE, subject: Subjects.RH },
  'rh.manage': { action: Actions.MANAGE, subject: Subjects.RH },

  // Paie
  'paie.view': { action: Actions.VIEW, subject: Subjects.PAIE },
  'paie.create': { action: Actions.CREATE, subject: Subjects.PAIE },
  'paie.edit': { action: Actions.EDIT, subject: Subjects.PAIE },
  'paie.approve': { action: Actions.APPROVE_PAIE, subject: Subjects.PAIE },

  // Communications
  'communications.view': { action: Actions.VIEW, subject: Subjects.COMMUNICATION },
  'communications.send': { action: Actions.CREATE, subject: Subjects.MESSAGE },
  'messages.view': { action: Actions.VIEW, subject: Subjects.MESSAGE },
  'messages.send': { action: Actions.CREATE, subject: Subjects.MESSAGE },

  // Transferts
  'transferts.view': { action: Actions.VIEW, subject: Subjects.TRANSFERT },
  'transferts.send': { action: Actions.CREATE, subject: Subjects.TRANSFERT },
  'transferts.receive': { action: Actions.APPROVE, subject: Subjects.TRANSFERT },

  // Virements Programmés
  'virements_programmes.view': { action: Actions.VIEW, subject: Subjects.VIREMENT },
  'virements_programmes.edit': { action: Actions.EDIT, subject: Subjects.VIREMENT },

  // Audit
  'audit.view': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  'audit.export': { action: Actions.EXPORT, subject: Subjects.AUDIT_LOG },

  // RBAC
  'rbac.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'rbac.create': { action: Actions.CREATE, subject: Subjects.RBAC },
  'rbac.edit': { action: Actions.EDIT, subject: Subjects.RBAC },
  'rbac.delete': { action: Actions.DELETE, subject: Subjects.RBAC },
  'rbac.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },
  'permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'permissions.assign': { action: Actions.ASSIGN, subject: Subjects.PERMISSION },

  // Maintenance
  'maintenance.view': { action: Actions.VIEW, subject: Subjects.MAINTENANCE },
  'maintenance.purge': { action: Actions.PURGE, subject: Subjects.MAINTENANCE },
  'maintenance.migrate': { action: Actions.MIGRATE, subject: Subjects.MAINTENANCE },
  'maintenance.seed': { action: Actions.SEED, subject: Subjects.MAINTENANCE },
  'maintenance.manage': { action: Actions.MANAGE, subject: Subjects.MAINTENANCE },

  // Fidélité (Loyalty)
  'loyalty.view': { action: Actions.VIEW, subject: Subjects.LOYALTY },
  'loyalty.create': { action: Actions.CREATE, subject: Subjects.LOYALTY },
  'loyalty.edit': { action: Actions.EDIT, subject: Subjects.LOYALTY },
  'loyalty.delete': { action: Actions.DELETE, subject: Subjects.LOYALTY },
  'loyalty.manage': { action: Actions.MANAGE, subject: Subjects.LOYALTY },

  // Régularisation
  'regularisation.view': { action: Actions.VIEW, subject: Subjects.REGULARISATION },
  'regularisation.create': { action: Actions.CREATE, subject: Subjects.REGULARISATION },
  'regularisation.approve': { action: Actions.APPROVE, subject: Subjects.REGULARISATION },
  'regularisation.reject': { action: Actions.REJECT, subject: Subjects.REGULARISATION },
  'regularisation.manage': { action: Actions.MANAGE, subject: Subjects.REGULARISATION },

  // Départements
  'departments.view': { action: Actions.VIEW, subject: Subjects.DEPARTMENT },
  'departments.create': { action: Actions.CREATE, subject: Subjects.DEPARTMENT },
  'departments.edit': { action: Actions.EDIT, subject: Subjects.DEPARTMENT },
  'departments.delete': { action: Actions.DELETE, subject: Subjects.DEPARTMENT },
  'departments.manage': { action: Actions.MANAGE, subject: Subjects.DEPARTMENT },

  // Employés
  'employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'employes.manage': { action: Actions.MANAGE, subject: Subjects.EMPLOYE },

  // Agences
  'agences.view': { action: Actions.VIEW, subject: Subjects.AGENCE },
  'agences.create': { action: Actions.CREATE, subject: Subjects.AGENCE },
  'agences.edit': { action: Actions.EDIT, subject: Subjects.AGENCE },
  'agences.delete': { action: Actions.DELETE, subject: Subjects.AGENCE },
  'agences.manage': { action: Actions.MANAGE, subject: Subjects.AGENCE },

  // Paramètres
  'parametres.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'parametres.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },

  // Notifications
  'notifications.view': { action: Actions.VIEW, subject: Subjects.NOTIFICATION },
  'notifications.manage': { action: Actions.MANAGE, subject: Subjects.NOTIFICATION },

  // Sessions
  'sessions.view': { action: Actions.VIEW, subject: Subjects.SESSION },
  'sessions.terminate': { action: Actions.TERMINATE, subject: Subjects.SESSION },
};

/**
 * PERMISSION CODE ALIASES
 * =======================
 *
 * Maps variant permission codes to canonical codes for backward compatibility.
 * This handles inconsistencies like "caisseagent" vs "caisse_agent".
 *
 * Usage: When receiving a permission code, first check aliases, then mappings.
 */
export const PERMISSION_CODE_ALIASES: Record<string, string> = {
  // CaisseAgent variants (canonical: caisseagent)
  'caisse_agent.view': 'caisseagent.view',
  'caisse_agent.create': 'caisseagent.create',
  'caisse_agent.manage': 'caisseagent.manage',
  'caisse_agent.approve': 'caisseagent.approve',
  'caisse_agent.reject': 'caisseagent.reject',
  'caisse_agent.suspend': 'caisseagent.suspend',
  'caisse-agent.view': 'caisseagent.view',
  'caisse-agent.create': 'caisseagent.create',
  'caisse-agent.manage': 'caisseagent.manage',

  // Agent terrain variants (canonical: agent)
  'agent-terrain.view': 'agent.view',
  'agent-terrain.create': 'agent.create',
  'agent-terrain.edit': 'agents_terrain.edit',
  'agent-terrain.manage': 'agent.manage',
  'agentterrain.view': 'agent.view',
  'agentterrain.create': 'agent.create',

  // Singular vs plural variants
  'credit.view': 'credits.view',
  'credit.create': 'credits.create',
  'credit.edit': 'credits.edit',
  'credit.delete': 'credits.delete',
  'credit.approve': 'credits.approve',
  'credit.disburse': 'credits.disburse',

  'client.view': 'clients.view',
  'client.create': 'clients.create',
  'client.edit': 'clients.edit',
  'client.delete': 'clients.delete',

  'epargne.view': 'epargnes.view',
  'epargne.create': 'epargnes.create',
  'epargne.edit': 'epargnes.edit',
  'epargne.deposit': 'epargnes.deposit',
  'epargne.withdraw': 'epargnes.withdraw',

  'tontine.view': 'tontines.view',
  'tontine.create': 'tontines.create',
  'tontine.edit': 'tontines.edit',
  'tontine.manage': 'tontines.manage',

  'remboursement.view': 'remboursements.view',
  'remboursement.create': 'remboursements.create',

  'rapport.view': 'rapports.view',
  'rapport.export': 'rapports.export',

  // Communications variants
  'communication.view': 'communications.view',
  'communication.send': 'communications.send',
  'message.view': 'messages.view',
  'message.send': 'messages.send',

  // Department variants
  'department.view': 'departments.view',
  'department.create': 'departments.create',
  'department.edit': 'departments.edit',
  'department.delete': 'departments.delete',

  // Employe variants
  'employe.view': 'employes.view',
  'employe.create': 'employes.create',
  'employe.edit': 'employes.edit',
  'employe.delete': 'employes.delete',

  // Agence variants
  'agence.view': 'agences.view',
  'agence.create': 'agences.create',
  'agence.edit': 'agences.edit',
  'agence.delete': 'agences.delete',

  // Virement variants
  'virement.view': 'virements_programmes.view',
  'virement.edit': 'virements_programmes.edit',
  'virements.view': 'virements_programmes.view',
  'virements.edit': 'virements_programmes.edit',
};

/**
 * Normalize permission code to lowercase and resolve aliases
 */
export function normalizePermissionCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  // Check if this is an alias and return the canonical code
  return PERMISSION_CODE_ALIASES[normalized] || normalized;
}

/**
 * Parse permission code into CASL action and subject
 * Returns the mapped values or creates a dynamic mapping
 */
export function parsePermissionCode(code: string): PermissionMapping | null {
  const normalized = normalizePermissionCode(code);

  // Check explicit mapping
  if (PERMISSION_CODE_MAPPINGS[normalized]) {
    return PERMISSION_CODE_MAPPINGS[normalized];
  }

  // Fallback: Parse as "subject.action" pattern
  const parts = normalized.split('.');
  if (parts.length < 2) {
    return null;
  }

  // Map common module names to subjects
  const moduleToSubject: Record<string, Subject> = {
    'credits': Subjects.CREDITS,
    'credit': Subjects.CREDIT,
    'clients': Subjects.CLIENTS,
    'client': Subjects.CLIENT,
    'epargnes': Subjects.EPARGNES,
    'epargne': Subjects.EPARGNE,
    'comptes': Subjects.COMPTES,
    'compte': Subjects.COMPTE,
    'tontines': Subjects.TONTINES,
    'tontine': Subjects.TONTINE,
    'caisse': Subjects.CAISSE,
    'coffre': Subjects.COFFRE,
    'agent': Subjects.AGENT_TERRAIN,
    'terrain': Subjects.TERRAIN,
    'comptabilite': Subjects.COMPTABILITE,
    'rapports': Subjects.RAPPORTS,
    'rh': Subjects.RH,
    'admin': Subjects.ADMIN,
    'users': Subjects.USER,
    'user': Subjects.USER,
    'rbac': Subjects.RBAC,
    'maintenance': Subjects.MAINTENANCE,
    'loyalty': Subjects.LOYALTY,
    'regularisation': Subjects.REGULARISATION,
    'settings': Subjects.SETTINGS,
  };

  const subjectKey = parts[0];
  const actionKey = parts[parts.length - 1];

  const subject = moduleToSubject[subjectKey] || Subjects.DASHBOARD;

  // Map common action names
  const actionMap: Record<string, Action> = {
    'view': Actions.VIEW,
    'create': Actions.CREATE,
    'edit': Actions.EDIT,
    'delete': Actions.DELETE,
    'manage': Actions.MANAGE,
    'approve': Actions.APPROVE,
    'reject': Actions.REJECT,
    'export': Actions.EXPORT,
    'generate': Actions.GENERATE,
    'terminate': Actions.TERMINATE,
    'purge': Actions.PURGE,
    'migrate': Actions.MIGRATE,
    'seed': Actions.SEED,
    'assign': Actions.ASSIGN,
  };

  const action = actionMap[actionKey] || Actions.VIEW;

  return { action, subject };
}
