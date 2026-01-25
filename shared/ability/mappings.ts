/**
 * Permission Code Mappings - Shared between frontend and backend
 *
 * Maps database permission codes (format: "module.action") to CASL action/subject pairs.
 * This is the bridge between the legacy permission system and CASL.
 */

import { Actions, type Action } from './actions';
import { Subjects, type Subject } from './subjects';

export interface PermissionMapping {
  action: Action;
  subject: Subject;
}

/**
 * Master mapping of permission codes to CASL abilities.
 *
 * Convention:
 * - Permission code: "module.action" (lowercase)
 * - CASL action: from Actions enum
 * - CASL subject: module name (lowercase) or Entity name (PascalCase)
 *
 * For entity-level permissions, we prefer entity subjects (e.g., "Credit" not "credits")
 * For module-level permissions, we use module subjects (e.g., "dashboard")
 */
export const PERMISSION_MAPPINGS: Record<string, PermissionMapping> = {
  // =====================
  // DASHBOARD
  // =====================
  'dashboard.view': { action: Actions.VIEW, subject: Subjects.DASHBOARD },
  'dashboard.export': { action: Actions.EXPORT, subject: Subjects.DASHBOARD },

  // =====================
  // CLIENTS
  // =====================
  'clients.view': { action: Actions.VIEW, subject: Subjects.CLIENT },
  'clients.create': { action: Actions.CREATE, subject: Subjects.CLIENT },
  'clients.edit': { action: Actions.EDIT, subject: Subjects.CLIENT },
  'clients.delete': { action: Actions.DELETE, subject: Subjects.CLIENT },
  'clients.export': { action: Actions.EXPORT, subject: Subjects.CLIENT },
  'clients.import': { action: Actions.IMPORT, subject: Subjects.CLIENT },

  // =====================
  // CREDITS
  // =====================
  'credits.view': { action: Actions.VIEW, subject: Subjects.CREDIT },
  'credits.create': { action: Actions.CREATE, subject: Subjects.CREDIT },
  'credits.edit': { action: Actions.EDIT, subject: Subjects.CREDIT },
  'credits.delete': { action: Actions.DELETE, subject: Subjects.CREDIT },
  'credits.approve': { action: Actions.APPROVE, subject: Subjects.CREDIT },
  'credits.reject': { action: Actions.REJECT, subject: Subjects.CREDIT },
  'credits.disburse': { action: Actions.DISBURSE, subject: Subjects.CREDIT },
  'credits.disburse_cash': { action: Actions.DISBURSE_CASH, subject: Subjects.CREDIT },
  'credits.disburse_account': { action: Actions.DISBURSE_ACCOUNT, subject: Subjects.CREDIT },
  'credits.disburse_momo': { action: Actions.DISBURSE_MOMO, subject: Subjects.CREDIT },
  'credits.export': { action: Actions.EXPORT, subject: Subjects.CREDIT },
  'credits.close': { action: Actions.CLOSE, subject: Subjects.CREDIT },

  // Demandes de crédit
  'demandes.view': { action: Actions.VIEW, subject: Subjects.DEMANDE_CREDIT },
  'demandes.create': { action: Actions.CREATE, subject: Subjects.DEMANDE_CREDIT },
  'demandes.edit': { action: Actions.EDIT, subject: Subjects.DEMANDE_CREDIT },
  'demandes.approve': { action: Actions.APPROVE, subject: Subjects.DEMANDE_CREDIT },
  'demandes.reject': { action: Actions.REJECT, subject: Subjects.DEMANDE_CREDIT },

  // Échéances
  'echeances.view': { action: Actions.VIEW, subject: Subjects.ECHEANCE },
  'echeances.edit': { action: Actions.EDIT, subject: Subjects.ECHEANCE },
  'echeances.export': { action: Actions.EXPORT, subject: Subjects.ECHEANCE },

  // Réévaluations
  'reevaluations.view': { action: Actions.VIEW, subject: Subjects.REEVALUATION },
  'reevaluations.create': { action: Actions.CREATE, subject: Subjects.REEVALUATION },
  'reevaluations.approve': { action: Actions.APPROVE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.view': { action: Actions.VIEW, subject: Subjects.REEVALUATION },
  'credits.reevaluations.create': { action: Actions.CREATE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.approve': { action: Actions.APPROVE, subject: Subjects.REEVALUATION },

  // =====================
  // COMPTES / ÉPARGNES
  // =====================
  'comptes.view': { action: Actions.VIEW, subject: Subjects.COMPTE },
  'comptes.create': { action: Actions.CREATE, subject: Subjects.COMPTE },
  'comptes.edit': { action: Actions.EDIT, subject: Subjects.COMPTE },
  'comptes.delete': { action: Actions.DELETE, subject: Subjects.COMPTE },
  'comptes.export': { action: Actions.EXPORT, subject: Subjects.COMPTE },
  'comptes.transfer': { action: Actions.TRANSFER, subject: Subjects.COMPTE },

  'epargnes.view': { action: Actions.VIEW, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.create': { action: Actions.CREATE, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.edit': { action: Actions.EDIT, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.delete': { action: Actions.DELETE, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.export': { action: Actions.EXPORT, subject: Subjects.COMPTE_EPARGNE },

  'comptes-bloques.view': { action: Actions.VIEW, subject: Subjects.COMPTE_BLOQUE },
  'comptes-bloques.create': { action: Actions.CREATE, subject: Subjects.COMPTE_BLOQUE },
  'comptes-bloques.edit': { action: Actions.EDIT, subject: Subjects.COMPTE_BLOQUE },

  // =====================
  // TONTINES
  // =====================
  'tontines.view': { action: Actions.VIEW, subject: Subjects.TONTINE },
  'tontines.create': { action: Actions.CREATE, subject: Subjects.TONTINE },
  'tontines.edit': { action: Actions.EDIT, subject: Subjects.TONTINE },
  'tontines.delete': { action: Actions.DELETE, subject: Subjects.TONTINE },
  'tontines.approve': { action: Actions.APPROVE, subject: Subjects.TONTINE },
  'tontines.distribute': { action: Actions.DISTRIBUTE, subject: Subjects.TONTINE },
  'tontines.export': { action: Actions.EXPORT, subject: Subjects.TONTINE },
  'tontines.close': { action: Actions.CLOSE, subject: Subjects.TONTINE },

  // Membres tontine
  'tontines.membres.view': { action: Actions.VIEW, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.create': { action: Actions.CREATE, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.edit': { action: Actions.EDIT, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.delete': { action: Actions.DELETE, subject: Subjects.TONTINE_MEMBRE },

  // Contributions tontine
  'tontines.contributions.view': { action: Actions.VIEW, subject: Subjects.TONTINE_CONTRIBUTION },
  'tontines.contributions.create': { action: Actions.CREATE, subject: Subjects.TONTINE_CONTRIBUTION },

  // =====================
  // CAISSE
  // =====================
  'caisse.view': { action: Actions.VIEW, subject: Subjects.CAISSE },
  'caisse.create': { action: Actions.CREATE, subject: Subjects.CAISSE_OPERATION },
  'caisse.edit': { action: Actions.EDIT, subject: Subjects.CAISSE },
  'caisse.export': { action: Actions.EXPORT, subject: Subjects.CAISSE },

  // Sessions caisse
  'caisse.sessions.view': { action: Actions.VIEW, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.create': { action: Actions.CREATE, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.open': { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.close': { action: Actions.CLOSE_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.open': { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.close': { action: Actions.CLOSE_SESSION, subject: Subjects.CAISSE_SESSION },

  // Opérations caisse
  'caisse.operations.view': { action: Actions.VIEW, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.create': { action: Actions.CREATE, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.approve': { action: Actions.APPROVE, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.cancel': { action: Actions.CANCEL, subject: Subjects.CAISSE_OPERATION },

  // =====================
  // CAISSE AGENT (Terrain)
  // =====================
  'caisseagent.view': { action: Actions.VIEW, subject: Subjects.CAISSE_AGENT },
  'caisseagent.create': { action: Actions.CREATE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.edit': { action: Actions.EDIT, subject: Subjects.CAISSE_AGENT },
  'caisseagent.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.operations.view': { action: Actions.VIEW, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.create': { action: Actions.CREATE, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.OPERATION_TERRAIN },

  // =====================
  // COFFRE-FORT
  // =====================
  'coffre.view': { action: Actions.VIEW, subject: Subjects.COFFRE },
  'coffre.create': { action: Actions.CREATE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.edit': { action: Actions.EDIT, subject: Subjects.COFFRE },
  'coffre.approve': { action: Actions.APPROVE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transfer': { action: Actions.TRANSFER, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.view': { action: Actions.VIEW, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.create': { action: Actions.CREATE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.approve': { action: Actions.APPROVE, subject: Subjects.COFFRE_TRANSFERT },

  // =====================
  // COMPTABILITÉ
  // =====================
  'comptabilite.view': { action: Actions.VIEW, subject: Subjects.COMPTABILITE },
  'comptabilite.create': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.edit': { action: Actions.EDIT, subject: Subjects.COMPTABILITE },
  'comptabilite.export': { action: Actions.EXPORT, subject: Subjects.COMPTABILITE },
  'comptabilite.close': { action: Actions.CLOSE, subject: Subjects.COMPTABILITE },
  'comptabilite.reconcile': { action: Actions.RECONCILE, subject: Subjects.COMPTABILITE },

  // Écritures
  'comptabilite.ecritures.view': { action: Actions.VIEW, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.create': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.edit': { action: Actions.EDIT, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.delete': { action: Actions.DELETE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.approve': { action: Actions.APPROVE, subject: Subjects.ECRITURE_COMPTABLE },

  // Journaux
  'comptabilite.journaux.view': { action: Actions.VIEW, subject: Subjects.JOURNAL },
  'comptabilite.journaux.create': { action: Actions.CREATE, subject: Subjects.JOURNAL },
  'comptabilite.journaux.edit': { action: Actions.EDIT, subject: Subjects.JOURNAL },

  // =====================
  // RAPPORTS
  // =====================
  'rapports.view': { action: Actions.VIEW, subject: Subjects.RAPPORTS },
  'rapports.create': { action: Actions.CREATE, subject: Subjects.RAPPORTS },
  'rapports.export': { action: Actions.EXPORT, subject: Subjects.RAPPORTS },

  // =====================
  // RH
  // =====================
  'rh.view': { action: Actions.VIEW, subject: Subjects.RH },
  'rh.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'rh.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'rh.export': { action: Actions.EXPORT, subject: Subjects.RH },
  'rh.approve': { action: Actions.APPROVE, subject: Subjects.RH },

  // Employés
  'rh.employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'rh.employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'rh.employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },

  // =====================
  // AGENTS TERRAIN
  // =====================
  'terrain.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'terrain.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'terrain.edit': { action: Actions.EDIT, subject: Subjects.AGENT_TERRAIN },
  'terrain.delete': { action: Actions.DELETE, subject: Subjects.AGENT_TERRAIN },
  'terrain.export': { action: Actions.EXPORT, subject: Subjects.TERRAIN },
  'terrain.operations.view': { action: Actions.VIEW, subject: Subjects.OPERATION_TERRAIN },
  'terrain.operations.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.OPERATION_TERRAIN },

  // =====================
  // ADMIN
  // =====================
  'admin.view': { action: Actions.VIEW, subject: Subjects.ADMIN },
  'admin.settings': { action: Actions.EDIT, subject: Subjects.ADMIN },
  'admin.manage': { action: Actions.MANAGE, subject: Subjects.ADMIN },

  // Users
  'users.view': { action: Actions.VIEW, subject: Subjects.USER },
  'users.create': { action: Actions.CREATE, subject: Subjects.USER },
  'users.edit': { action: Actions.EDIT, subject: Subjects.USER },
  'users.delete': { action: Actions.DELETE, subject: Subjects.USER },
  'users.reset_password': { action: Actions.RESET_PASSWORD, subject: Subjects.USER },
  'users.suspend': { action: Actions.SUSPEND, subject: Subjects.USER },
  'users.activate': { action: Actions.ACTIVATE, subject: Subjects.USER },

  // Agences
  'agences.view': { action: Actions.VIEW, subject: Subjects.AGENCE },
  'agences.create': { action: Actions.CREATE, subject: Subjects.AGENCE },
  'agences.edit': { action: Actions.EDIT, subject: Subjects.AGENCE },
  'agences.delete': { action: Actions.DELETE, subject: Subjects.AGENCE },

  // Sessions
  'sessions.view': { action: Actions.VIEW, subject: Subjects.SESSION },
  'sessions.terminate': { action: Actions.DELETE, subject: Subjects.SESSION },

  // Audit logs
  'audit.view': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  'audit.export': { action: Actions.EXPORT, subject: Subjects.AUDIT_LOG },

  // =====================
  // RBAC (Gestion des accès)
  // =====================
  'rbac.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'rbac.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },
  'rbac.roles.view': { action: Actions.VIEW, subject: Subjects.ROLE },
  'rbac.roles.edit': { action: Actions.EDIT, subject: Subjects.ROLE },
  'rbac.permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'rbac.permissions.edit': { action: Actions.EDIT, subject: Subjects.PERMISSION },
  'admin.locks.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'admin.locks.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },

  // =====================
  // NOTIFICATIONS
  // =====================
  'notifications.view': { action: Actions.VIEW, subject: Subjects.NOTIFICATION },
  'notifications.create': { action: Actions.CREATE, subject: Subjects.NOTIFICATION },
  'notifications.edit': { action: Actions.EDIT, subject: Subjects.NOTIFICATION },
};

/**
 * Get CASL mapping for a permission code
 */
export function getPermissionMapping(code: string): PermissionMapping | null {
  return PERMISSION_MAPPINGS[code.toLowerCase()] || null;
}

/**
 * Get permission code from action and subject
 */
export function getPermissionCode(action: Action, subject: Subject): string | null {
  for (const [code, mapping] of Object.entries(PERMISSION_MAPPINGS)) {
    if (mapping.action === action && mapping.subject === subject) {
      return code;
    }
  }
  return null;
}

/**
 * Normalize a permission code to lowercase
 */
export function normalizePermissionCode(code: string): string {
  return code.toLowerCase().trim();
}

/**
 * Parse a permission code into module and action parts
 * Example: "credits.disburse" -> { module: "credits", action: "disburse" }
 */
export function parsePermissionCode(code: string): { module: string; action: string } | null {
  const normalized = normalizePermissionCode(code);
  const parts = normalized.split('.');
  if (parts.length < 2) return null;

  // Handle nested codes like "credits.reevaluations.view"
  const action = parts[parts.length - 1];
  const module = parts.slice(0, -1).join('.');

  return { module, action };
}

/**
 * Get all permission codes for a given subject
 */
export function getPermissionCodesForSubject(subject: Subject): string[] {
  return Object.entries(PERMISSION_MAPPINGS)
    .filter(([_, mapping]) => mapping.subject === subject)
    .map(([code]) => code);
}

/**
 * Get all permission codes for a given action
 */
export function getPermissionCodesForAction(action: Action): string[] {
  return Object.entries(PERMISSION_MAPPINGS)
    .filter(([_, mapping]) => mapping.action === action)
    .map(([code]) => code);
}
