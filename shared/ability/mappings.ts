/**
 * Permission Code Mappings - Shared between frontend and backend
 *
 * Maps database permission codes (format: "module.action") to CASL action/subject pairs.
 * This is the bridge between the legacy permission system and CASL.
 *
 * ⚠️ SOURCE UNIQUE DE VÉRITÉ - NE PAS DUPLIQUER AILLEURS ⚠️
 * Ce fichier est la seule source de mappings permission → CASL.
 * Tout autre fichier doit importer depuis ce module.
 */

import { Actions, type Action } from './actions';
import { Subjects, type Subject } from './subjects';

export interface PermissionMapping {
  action: Action;
  subject: Subject;
  conditions?: Record<string, any>;
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
 *
 * ⚠️ IMPORTANT: Tous les codes utilisés dans PERMISSIONS_DATA (shared/config/rbac.ts)
 * DOIVENT avoir un mapping ici, sinon ils seront ignorés par CASL.
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
  'credits.collect': { action: Actions.COLLECT, subject: Subjects.CREDIT },
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
  'credits.reevaluations.validate': { action: Actions.VALIDATE_REEVALUATION, subject: Subjects.REEVALUATION },
  'credits.reevaluations.decide': { action: Actions.DECIDE_REEVALUATION, subject: Subjects.REEVALUATION },

  // =====================
  // REMBOURSEMENTS
  // =====================
  'remboursements.view': { action: Actions.VIEW, subject: Subjects.REMBOURSEMENT },
  'remboursements.create': { action: Actions.CREATE, subject: Subjects.REMBOURSEMENT },

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
  'epargnes.deposit': { action: Actions.DEPOSIT, subject: Subjects.COMPTE },
  'epargnes.withdraw': { action: Actions.WITHDRAW, subject: Subjects.COMPTE },

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
  'tontines.manage': { action: Actions.MANAGE, subject: Subjects.TONTINE },

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
  'caisse.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE },
  'caisse.deposit': { action: Actions.DEPOSIT, subject: Subjects.CAISSE },
  'caisse.withdraw': { action: Actions.WITHDRAW, subject: Subjects.CAISSE },
  'caisse.transfer': { action: Actions.TRANSFER, subject: Subjects.CAISSE },
  'caisse.paiement': { action: Actions.CREATE, subject: Subjects.PAIEMENT_TERRAIN },

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
  'caisseagent.reject': { action: Actions.REJECT_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.suspend': { action: Actions.SUSPEND_AGENT, subject: Subjects.CAISSE_AGENT },
  'caisseagent.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.operations.view': { action: Actions.VIEW, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.create': { action: Actions.CREATE, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.OPERATION_TERRAIN },

  // Paiements
  'paiements.view': { action: Actions.VIEW, subject: Subjects.PAIEMENT_TERRAIN },
  'paiements.create': { action: Actions.CREATE, subject: Subjects.PAIEMENT_TERRAIN },

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
  'coffre.transfert.init': { action: Actions.INIT_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.validate': { action: Actions.VALIDATE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.execute': { action: Actions.EXECUTE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.config.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'coffre.config.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },
  'coffre.supervision.view': { action: Actions.VIEW, subject: Subjects.COFFRE },
  // Evacuation de cash (vide de coffre)
  'coffre.evacuation.view': { action: Actions.VIEW, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.create': { action: Actions.CREATE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.approve': { action: Actions.APPROVE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.prepare': { action: Actions.PREPARE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.dispatch': { action: Actions.DISPATCH, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.deposit': { action: Actions.DEPOSIT, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.reconcile': { action: Actions.RECONCILE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.config': { action: Actions.EDIT, subject: Subjects.SETTINGS },

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
  'comptabilite.write': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.reports': { action: Actions.VIEW, subject: Subjects.RAPPORTS },

  // =====================
  // RAPPORTS
  // =====================
  'rapports.view': { action: Actions.VIEW, subject: Subjects.RAPPORTS },
  'rapports.create': { action: Actions.CREATE, subject: Subjects.RAPPORTS },
  'rapports.export': { action: Actions.EXPORT, subject: Subjects.RAPPORTS },
  'rapports.schedule': { action: Actions.SCHEDULE, subject: Subjects.RAPPORTS },

  // =====================
  // RH
  // =====================
  'rh.view': { action: Actions.VIEW, subject: Subjects.RH },
  'rh.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.edit': { action: Actions.EDIT, subject: Subjects.RH },
  'rh.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'rh.export': { action: Actions.EXPORT, subject: Subjects.RH },
  'rh.approve': { action: Actions.APPROVE, subject: Subjects.RH },
  'rh.manage': { action: Actions.MANAGE, subject: Subjects.RH },

  // Employés
  'rh.employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'rh.employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'rh.employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },

  // Paie
  'paie.view': { action: Actions.VIEW, subject: Subjects.PAIE },
  'paie.create': { action: Actions.CREATE, subject: Subjects.PAIE },
  'paie.edit': { action: Actions.EDIT, subject: Subjects.PAIE },
  'paie.approve': { action: Actions.APPROVE_PAIE, subject: Subjects.PAIE },

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

  // Agent (alias pour terrain)
  'agent.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'agent.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'agent.edit': { action: Actions.EDIT, subject: Subjects.AGENT_TERRAIN },
  'agent.collect': { action: Actions.COLLECT, subject: Subjects.AGENT_TERRAIN },
  'agent.manage': { action: Actions.MANAGE, subject: Subjects.AGENT_TERRAIN },

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
  'prospection.edit': { action: Actions.EDIT, subject: Subjects.PROSPECTION },
  'prospection.delete': { action: Actions.DELETE, subject: Subjects.PROSPECTION },
  'prospection.convert': { action: Actions.CONVERT, subject: Subjects.PROSPECTION },
  'prospection.export': { action: Actions.EXPORT, subject: Subjects.PROSPECTION },

  // Primes de prospection
  'prospection.primes.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.approve': { action: Actions.APPROVE, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.reject': { action: Actions.REJECT, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.pay': { action: Actions.VALIDATE, subject: Subjects.PROSPECTION_PRIME },

  // Configuration primes prospection
  'prospection.config.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION_CONFIG },
  'prospection.config.edit': { action: Actions.EDIT, subject: Subjects.PROSPECTION_CONFIG },

  // Supervision prospection
  'prospection.supervision.view': { action: Actions.VIEW, subject: Subjects.TERRAIN },

  // Zones commerciales (Arrondissements & Marchés)
  'zones.view': { action: Actions.VIEW, subject: Subjects.ARRONDISSEMENT },
  'zones.create': { action: Actions.CREATE, subject: Subjects.ARRONDISSEMENT },
  'zones.edit': { action: Actions.EDIT, subject: Subjects.ARRONDISSEMENT },
  'zones.delete': { action: Actions.DELETE, subject: Subjects.ARRONDISSEMENT },

  // =====================
  // ADMIN
  // =====================
  'admin.view': { action: Actions.VIEW, subject: Subjects.ADMIN },
  'admin.settings': { action: Actions.MANAGE, subject: Subjects.SETTINGS },
  'admin.manage': { action: Actions.MANAGE, subject: Subjects.ADMIN },
  'admin.users': { action: Actions.MANAGE, subject: Subjects.USER },
  'admin.roles': { action: Actions.MANAGE_ROLES, subject: Subjects.ROLE },
  'admin.logs': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },

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
  'agences.manage': { action: Actions.MANAGE, subject: Subjects.AGENCE },

  // Sessions
  'sessions.view': { action: Actions.VIEW, subject: Subjects.SESSION },
  'sessions.terminate': { action: Actions.TERMINATE, subject: Subjects.SESSION },

  // Audit logs
  'audit.view': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  'audit.export': { action: Actions.EXPORT, subject: Subjects.AUDIT_LOG },

  // =====================
  // RBAC (Gestion des accès)
  // =====================
  'rbac.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'rbac.create': { action: Actions.CREATE, subject: Subjects.RBAC },
  'rbac.edit': { action: Actions.EDIT, subject: Subjects.RBAC },
  'rbac.delete': { action: Actions.DELETE, subject: Subjects.RBAC },
  'rbac.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },
  'rbac.roles.view': { action: Actions.VIEW, subject: Subjects.ROLE },
  'rbac.roles.edit': { action: Actions.EDIT, subject: Subjects.ROLE },
  'rbac.permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'rbac.permissions.edit': { action: Actions.EDIT, subject: Subjects.PERMISSION },
  'permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'permissions.assign': { action: Actions.ASSIGN, subject: Subjects.PERMISSION },
  'admin.locks.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'admin.locks.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },

  // =====================
  // NOTIFICATIONS
  // =====================
  'notifications.view': { action: Actions.VIEW, subject: Subjects.NOTIFICATION },
  'notifications.create': { action: Actions.CREATE, subject: Subjects.NOTIFICATION },
  'notifications.edit': { action: Actions.EDIT, subject: Subjects.NOTIFICATION },
  'notifications.manage': { action: Actions.MANAGE, subject: Subjects.NOTIFICATION },

  // =====================
  // COMMUNICATIONS / MESSAGES
  // =====================
  'communications.view': { action: Actions.VIEW, subject: Subjects.COMMUNICATION },
  'communications.create': { action: Actions.CREATE, subject: Subjects.COMMUNICATION },
  'communications.edit': { action: Actions.EDIT, subject: Subjects.COMMUNICATION },
  'communications.delete': { action: Actions.DELETE, subject: Subjects.COMMUNICATION },
  'communications.send': { action: Actions.SEND, subject: Subjects.MESSAGE },
  'communications.broadcast': { action: Actions.BROADCAST, subject: Subjects.COMMUNICATION },
  'communications.schedule': { action: Actions.SCHEDULE, subject: Subjects.COMMUNICATION },
  'communications.archive': { action: Actions.ARCHIVE, subject: Subjects.COMMUNICATION },
  'messages.view': { action: Actions.VIEW, subject: Subjects.MESSAGE },
  'messages.send': { action: Actions.SEND, subject: Subjects.MESSAGE },

  // =====================
  // TRANSFERTS / VIREMENTS
  // =====================
  'transferts.view': { action: Actions.VIEW, subject: Subjects.TRANSFERT },
  'transferts.send': { action: Actions.CREATE, subject: Subjects.TRANSFERT },
  'transferts.receive': { action: Actions.APPROVE, subject: Subjects.TRANSFERT },
  'virements_programmes.view': { action: Actions.VIEW, subject: Subjects.VIREMENT },
  'virements_programmes.edit': { action: Actions.EDIT, subject: Subjects.VIREMENT },

  // =====================
  // MAINTENANCE
  // =====================
  'maintenance.view': { action: Actions.VIEW, subject: Subjects.MAINTENANCE },
  'maintenance.purge': { action: Actions.PURGE, subject: Subjects.MAINTENANCE },
  'maintenance.migrate': { action: Actions.MIGRATE, subject: Subjects.MAINTENANCE },
  'maintenance.seed': { action: Actions.SEED, subject: Subjects.MAINTENANCE },
  'maintenance.manage': { action: Actions.MANAGE, subject: Subjects.MAINTENANCE },

  // =====================
  // FIDÉLITÉ (LOYALTY)
  // =====================
  'loyalty.view': { action: Actions.VIEW, subject: Subjects.LOYALTY },
  'loyalty.create': { action: Actions.CREATE, subject: Subjects.LOYALTY },
  'loyalty.edit': { action: Actions.EDIT, subject: Subjects.LOYALTY },
  'loyalty.delete': { action: Actions.DELETE, subject: Subjects.LOYALTY },
  'loyalty.manage': { action: Actions.MANAGE, subject: Subjects.LOYALTY },
  'loyalty.redeem': { action: Actions.REDEEM, subject: Subjects.LOYALTY },
  'loyalty.award': { action: Actions.AWARD, subject: Subjects.LOYALTY },
  'loyalty.adjust': { action: Actions.ADJUST_POINTS, subject: Subjects.LOYALTY },
  'loyalty.expire': { action: Actions.EXPIRE_POINTS, subject: Subjects.LOYALTY },

  // =====================
  // RÉGULARISATION
  // =====================
  'regularisation.view': { action: Actions.VIEW, subject: Subjects.REGULARISATION },
  'regularisation.create': { action: Actions.CREATE, subject: Subjects.REGULARISATION },
  'regularisation.approve': { action: Actions.APPROVE, subject: Subjects.REGULARISATION },
  'regularisation.reject': { action: Actions.REJECT, subject: Subjects.REGULARISATION },
  'regularisation.manage': { action: Actions.MANAGE, subject: Subjects.REGULARISATION },

  // =====================
  // DÉPARTEMENTS
  // =====================
  'departments.view': { action: Actions.VIEW, subject: Subjects.DEPARTMENT },
  'departments.create': { action: Actions.CREATE, subject: Subjects.DEPARTMENT },
  'departments.edit': { action: Actions.EDIT, subject: Subjects.DEPARTMENT },
  'departments.delete': { action: Actions.DELETE, subject: Subjects.DEPARTMENT },
  'departments.manage': { action: Actions.MANAGE, subject: Subjects.DEPARTMENT },

  // =====================
  // EMPLOYÉS (standalone)
  // =====================
  'employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'employes.manage': { action: Actions.MANAGE, subject: Subjects.EMPLOYE },

  // =====================
  // PARAMÈTRES
  // =====================
  'parametres.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'parametres.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },

  // =====================
  // BOURSE
  // =====================
  'bourse.view': { action: Actions.VIEW, subject: Subjects.BOURSE },
  'bourse.trade': { action: Actions.TRADE, subject: Subjects.BOURSE },

  // =====================
  // LOGE (STOCKAGE)
  // =====================
  'loge.view': { action: Actions.VIEW, subject: Subjects.LOGE },
  'loge.upload': { action: Actions.UPLOAD, subject: Subjects.LOGE },
  'loge.delete': { action: Actions.DELETE, subject: Subjects.LOGE },
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

/**
 * MODULE_PERMISSION_BUNDLES - Bundles exhaustifs par module
 * =========================================================
 *
 * Définit TOUS les codes de permissions associés à chaque module.
 * Utilisé par "Tout activer" pour garantir l'activation complète.
 *
 * ⚠️ SOURCE UNIQUE DE VÉRITÉ pour les bundles de permissions par module.
 * Chaque code DOIT exister dans PERMISSION_MAPPINGS ci-dessus.
 *
 * Les clés correspondent aux noms de modules dans APP_MODULES (shared/config/rbac.ts).
 */
export const MODULE_PERMISSION_BUNDLES: Record<string, string[]> = {
  // === GÉNÉRAL ===
  'Dashboard': [
    'dashboard.view',
    'dashboard.export',
  ],

  // === FINANCE - CRÉDITS ===
  'Crédits': [
    'credits.view',
    'credits.create',
    'credits.edit',
    'credits.delete',
    'credits.approve',
    'credits.reject',
    'credits.disburse',
    'credits.disburse_cash',
    'credits.disburse_account',
    'credits.disburse_momo',
    'credits.collect',
    'credits.export',
    'credits.close',
    // Demandes de crédit
    'demandes.view',
    'demandes.create',
    'demandes.edit',
    'demandes.approve',
    'demandes.reject',
    // Réévaluations
    'reevaluations.view',
    'reevaluations.create',
    'reevaluations.approve',
    'credits.reevaluations.view',
    'credits.reevaluations.create',
    'credits.reevaluations.approve',
    'credits.reevaluations.validate',
    'credits.reevaluations.decide',
  ],

  'Remboursements': [
    'remboursements.view',
    'remboursements.create',
  ],

  // === FINANCE - CLIENTS ===
  'Clients': [
    'clients.view',
    'clients.create',
    'clients.edit',
    'clients.delete',
    'clients.export',
    'clients.import',
  ],

  // === FINANCE - COMPTES ===
  'Comptes': [
    'comptes.view',
    'comptes.create',
    'comptes.edit',
    'comptes.delete',
    'comptes.export',
    'comptes.transfer',
    'epargnes.view',
    'epargnes.create',
    'epargnes.edit',
    'epargnes.delete',
    'epargnes.export',
    'epargnes.deposit',
    'epargnes.withdraw',
    'comptes-bloques.view',
    'comptes-bloques.create',
    'comptes-bloques.edit',
  ],

  // === FINANCE - TONTINES ===
  'Tontines': [
    'tontines.view',
    'tontines.create',
    'tontines.edit',
    'tontines.delete',
    'tontines.approve',
    'tontines.distribute',
    'tontines.export',
    'tontines.close',
    'tontines.manage',
    'tontines.membres.view',
    'tontines.membres.create',
    'tontines.membres.edit',
    'tontines.membres.delete',
    'tontines.contributions.view',
    'tontines.contributions.create',
  ],

  // === OPÉRATIONS - CAISSE ===
  'Caisse': [
    'caisse.view',
    'caisse.create',
    'caisse.edit',
    'caisse.export',
    'caisse.manage',
    'caisse.deposit',
    'caisse.withdraw',
    'caisse.transfer',
    'caisse.paiement',
    'caisse.sessions.view',
    'caisse.sessions.create',
    'caisse.sessions.open',
    'caisse.sessions.close',
    'caisse.open',
    'caisse.close',
  ],

  'CaisseAgent': [
    'caisseagent.view',
    'caisseagent.create',
    'caisseagent.edit',
    'caisseagent.approve',
    'caisseagent.reject',
    'caisseagent.suspend',
    'caisseagent.manage',
    'caisseagent.operations.view',
    'caisseagent.operations.create',
    'caisseagent.operations.approve',
  ],

  'Paiements Agent': [
    'paiements.view',
    'paiements.create',
  ],

  // === OPÉRATIONS - COFFRE-FORT ===
  'Coffre-Fort': [
    'coffre.view',
    'coffre.create',
    'coffre.edit',
    'coffre.approve',
    'coffre.transfer',
    'coffre.transferts.view',
    'coffre.transferts.create',
    'coffre.transferts.approve',
    'coffre.transfert.init',
    'coffre.transfert.validate',
    'coffre.transfert.execute',
    'coffre.config.view',
    'coffre.config.edit',
    'coffre.supervision.view',
    // Evacuation
    'coffre.evacuation.view',
    'coffre.evacuation.create',
    'coffre.evacuation.approve',
    'coffre.evacuation.prepare',
    'coffre.evacuation.dispatch',
    'coffre.evacuation.deposit',
    'coffre.evacuation.reconcile',
    'coffre.evacuation.config',
  ],

  // === OPÉRATIONS - COMPTABILITÉ ===
  'Comptabilité': [
    'comptabilite.view',
    'comptabilite.create',
    'comptabilite.edit',
    'comptabilite.export',
    'comptabilite.ecritures.view',
    'comptabilite.ecritures.create',
    'comptabilite.ecritures.edit',
    'comptabilite.ecritures.delete',
    'comptabilite.ecritures.approve',
    'comptabilite.journaux.view',
    'comptabilite.journaux.create',
    'comptabilite.journaux.edit',
    'comptabilite.write',
    'comptabilite.reports',
  ],

  'Rapports': [
    'rapports.view',
    'rapports.create',
    'rapports.export',
    'rapports.schedule',
  ],

  // === OPÉRATIONS - TERRAIN ===
  'Agent Terrain': [
    'terrain.view',
    'terrain.create',
    'terrain.edit',
    'terrain.delete',
    'terrain.export',
    'terrain.operations.view',
    'terrain.operations.approve',
    'agent.view',
    'agent.create',
    'agent.edit',
    'agent.collect',
    'agent.manage',
  ],

  'Incidents': [
    'incidents.view',
    'incidents.create',
    'incidents.edit',
    'incidents.manage',
  ],

  'Visites': [
    'visites.view',
    'visites.create',
  ],

  'Prospection': [
    'prospection.view',
    'prospection.create',
    'prospection.edit',
    'prospection.delete',
    'prospection.convert',
    'prospection.export',
    'prospection.primes.view',
    'prospection.primes.approve',
    'prospection.primes.reject',
    'prospection.primes.pay',
    'prospection.config.view',
    'prospection.config.edit',
    'prospection.supervision.view',
  ],

  'Zones Commerciales': [
    'zones.view',
    'zones.create',
    'zones.edit',
    'zones.delete',
  ],

  // === OPÉRATIONS - TRANSFERTS ===
  'Transferts': [
    'transferts.view',
    'transferts.send',
    'transferts.receive',
  ],

  'Virements Programmes': [
    'virements_programmes.view',
    'virements_programmes.edit',
  ],

  // === RH ===
  'RH': [
    'rh.view',
    'rh.create',
    'rh.edit',
    'rh.delete',
    'rh.export',
    'rh.approve',
    'rh.manage',
    'rh.employes.view',
    'rh.employes.create',
    'rh.employes.edit',
    'rh.employes.delete',
    'paie.view',
    'paie.create',
    'paie.edit',
    'paie.approve',
  ],

  'Employés': [
    'employes.view',
    'employes.create',
    'employes.edit',
    'employes.delete',
    'employes.manage',
  ],

  'Départements': [
    'departments.view',
    'departments.create',
    'departments.edit',
    'departments.delete',
    'departments.manage',
  ],

  // === ADMINISTRATION ===
  'Administration': [
    'admin.view',
    'admin.settings',
    'admin.manage',
    'admin.users',
    'admin.roles',
    'admin.logs',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'users.reset_password',
    'users.suspend',
    'users.activate',
    'sessions.view',
    'sessions.terminate',
  ],

  'Agences': [
    'agences.view',
    'agences.create',
    'agences.edit',
    'agences.delete',
    'agences.manage',
  ],

  'RBAC': [
    'rbac.view',
    'rbac.create',
    'rbac.edit',
    'rbac.delete',
    'rbac.manage',
    'rbac.roles.view',
    'rbac.roles.edit',
    'rbac.permissions.view',
    'rbac.permissions.edit',
    'permissions.view',
    'permissions.assign',
    'admin.locks.view',
    'admin.locks.manage',
  ],

  'Audit': [
    'audit.view',
    'audit.export',
  ],

  'Paramètres': [
    'parametres.view',
    'parametres.edit',
  ],

  'Maintenance': [
    'maintenance.view',
    'maintenance.purge',
    'maintenance.migrate',
    'maintenance.seed',
    'maintenance.manage',
  ],

  // === COMMUNICATIONS ===
  'Communications': [
    'communications.view',
    'communications.create',
    'communications.edit',
    'communications.delete',
    'communications.send',
    'communications.broadcast',
    'communications.schedule',
    'communications.archive',
  ],

  'Messages': [
    'messages.view',
    'messages.send',
  ],

  // === NOTIFICATIONS ===
  'Notifications': [
    'notifications.view',
    'notifications.create',
    'notifications.edit',
    'notifications.manage',
  ],

  // === AUTRES MODULES ===
  'Fidélité': [
    'loyalty.view',
    'loyalty.create',
    'loyalty.edit',
    'loyalty.delete',
    'loyalty.manage',
    'loyalty.redeem',
    'loyalty.award',
    'loyalty.adjust',
    'loyalty.expire',
  ],

  'Régularisation': [
    'regularisation.view',
    'regularisation.create',
    'regularisation.approve',
    'regularisation.reject',
    'regularisation.manage',
  ],

  'Bourse': [
    'bourse.view',
    'bourse.trade',
  ],

  'Loge': [
    'loge.view',
    'loge.upload',
    'loge.delete',
  ],
};

/**
 * Get all permission codes for a module
 */
export function getModulePermissionBundle(moduleName: string): string[] {
  return MODULE_PERMISSION_BUNDLES[moduleName] || [];
}

/**
 * Get all module names that have permission bundles
 */
export function getAllModulesWithBundles(): string[] {
  return Object.keys(MODULE_PERMISSION_BUNDLES);
}

/**
 * Validate that all bundle codes exist in PERMISSION_MAPPINGS
 * Use in tests or startup to catch configuration errors
 */
export function validateModuleBundles(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [moduleName, codes] of Object.entries(MODULE_PERMISSION_BUNDLES)) {
    for (const code of codes) {
      if (!PERMISSION_MAPPINGS[code]) {
        errors.push(`Module "${moduleName}": code "${code}" not found in PERMISSION_MAPPINGS`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
