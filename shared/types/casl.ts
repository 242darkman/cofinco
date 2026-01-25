/**
 * CASL Types - Shared between Frontend and Backend
 * =================================================
 *
 * These types define the Actions and Subjects used in CASL abilities.
 * They are used by both the server and client to ensure type safety.
 *
 * NOTE: This file is synchronized with shared/ability/actions.ts and shared/ability/subjects.ts
 */

/**
 * Standard CRUD actions + business-specific actions
 */
export const Actions = {
  // Standard CRUD
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',

  // Meta actions
  MANAGE: 'manage', // Superuser - can do anything on subject

  // Workflow actions
  APPROVE: 'approve',
  REJECT: 'reject',
  VALIDATE: 'validate',
  CANCEL: 'cancel',
  CLOSE: 'close',

  // Export/Import
  EXPORT: 'export',
  IMPORT: 'import',

  // Credit-specific
  DISBURSE: 'disburse',
  DISBURSE_CASH: 'disburse_cash',
  DISBURSE_ACCOUNT: 'disburse_account',
  DISBURSE_MOMO: 'disburse_momo',
  COLLECT: 'collect',

  // Reevaluation workflow
  REEVALUATE: 'reevaluate',
  VALIDATE_REEVALUATION: 'validate_reevaluation',
  DECIDE_REEVALUATION: 'decide_reevaluation',

  // User-specific
  RESET_PASSWORD: 'reset_password',
  MANAGE_ROLES: 'manage_roles',
  SUSPEND: 'suspend',
  ACTIVATE: 'activate',

  // Caisse-specific
  OPEN_SESSION: 'open_session',
  CLOSE_SESSION: 'close_session',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  TRANSFER: 'transfer',
  RECONCILE: 'reconcile',

  // Coffre operations
  INIT_TRANSFER: 'init_transfer',
  VALIDATE_TRANSFER: 'validate_transfer',
  EXECUTE_TRANSFER: 'execute_transfer',

  // Agent Caisse/Terrain
  APPROVE_AGENT_OP: 'approve_agent_op',
  REJECT_AGENT_OP: 'reject_agent_op',
  SUSPEND_AGENT: 'suspend_agent',

  // RH/Paie
  APPROVE_PAIE: 'approve_paie',

  // Tontine
  DISTRIBUTE: 'distribute',

  // Generation/Processing
  GENERATE: 'generate',
  ASSIGN: 'assign',
  REVERSE: 'reverse',
  SEED: 'seed',
  PURGE: 'purge',
  TERMINATE: 'terminate',
  MIGRATE: 'migrate',
} as const;

export type Action = (typeof Actions)[keyof typeof Actions];

/**
 * Subjects represent resources/entities in the system
 * Using PascalCase for CASL convention
 */
export const Subjects = {
  // Meta
  ALL: 'all', // Superuser - can act on anything

  // Modules (match menu items / feature areas)
  DASHBOARD: 'dashboard',
  CLIENTS: 'clients',
  CREDITS: 'credits',
  EPARGNES: 'epargnes',
  COMPTES: 'comptes',
  TONTINES: 'tontines',
  CAISSE: 'caisse',
  COFFRE: 'coffre',
  COMPTABILITE: 'comptabilite',
  RAPPORTS: 'rapports',
  RH: 'rh',
  ADMIN: 'admin',
  RBAC: 'rbac',
  TERRAIN: 'terrain',
  SETTINGS: 'settings',
  MAINTENANCE: 'maintenance',
  LOYALTY: 'loyalty',
  REGULARISATION: 'regularisation',

  // Entities (for granular resource-level checks)
  USER: 'User',
  CLIENT: 'Client',
  CREDIT: 'Credit',
  DEMANDE_CREDIT: 'DemandeCredit',
  ECHEANCE: 'Echeance',
  COMPTE: 'Compte',
  COMPTE_EPARGNE: 'CompteEpargne',
  COMPTE_COURANT: 'CompteCourant',
  COMPTE_BLOQUE: 'CompteBloque',
  TONTINE: 'Tontine',
  TONTINE_MEMBRE: 'TontineMembre',
  TONTINE_CONTRIBUTION: 'TontineContribution',
  CAISSE_SESSION: 'CaisseSession',
  CAISSE_OPERATION: 'CaisseOperation',
  CAISSE_AGENT: 'CaisseAgent',
  COFFRE_TRANSFERT: 'CoffreTransfert',
  ECRITURE_COMPTABLE: 'EcritureComptable',
  JOURNAL: 'Journal',
  AGENCE: 'Agence',
  EMPLOYE: 'Employe',
  AGENT_TERRAIN: 'AgentTerrain',
  OPERATION_TERRAIN: 'OperationTerrain',
  REEVALUATION: 'Reevaluation',
  NOTIFICATION: 'Notification',
  AUDIT_LOG: 'AuditLog',
  SESSION: 'Session',
  ROLE: 'Role',
  PERMISSION: 'Permission',
  DEPARTMENT: 'Department',
  JOB_POSITION: 'JobPosition',
  PLAN_CREDIT: 'PlanCredit',
  REMBOURSEMENT: 'Remboursement',
  ZONE: 'Zone',
  OBJECTIF: 'Objectif',
  POS_DEVICE: 'PosDevice',
  PROSPECTION: 'Prospection',
  PAIEMENT_TERRAIN: 'PaiementTerrain',
  HORAIRE: 'Horaire',
  PAIE: 'Paie',
  DECLARATION_TVA: 'DeclarationTVA',
  INVOICE: 'Invoice',

  // Legacy aliases for backward compatibility
  EPARGNE: 'Epargne',
  OPERATION: 'Operation',
  PAIEMENT: 'Paiement',
  VIREMENT: 'Virement',
  TRANSFERT: 'Transfert',
  VISITE: 'Visite',
  INCIDENT: 'Incident',
  ECRITURE: 'Ecriture',
  RAPPORT: 'Rapport',
  AUDIT: 'Audit',
  MODULE: 'Module',
  CONGE: 'Conge',
  FORMATION: 'Formation',
  MESSAGE: 'Message',
  COMMUNICATION: 'Communication',
} as const;

export type Subject = (typeof Subjects)[keyof typeof Subjects];

/**
 * CASL Rule structure (JSON-serializable)
 */
export interface CaslRule {
  action: Action | Action[];
  subject: Subject | Subject[];
  conditions?: Record<string, any>;
  inverted?: boolean;
  reason?: string;
}

/**
 * API Response type for /api/my-permissions
 */
export interface PermissionsResponseV2 {
  // Legacy support
  role: string;
  roles: string[];
  permissions: Record<string, string[]>;
  isAdmin: boolean;

  // CASL rules
  caslRules: CaslRule[];

  // Context
  agenceIdActive?: string;
  agenceNom?: string;
  lockedFeatures?: string[];
}

/**
 * Required ability for a feature/route
 */
export interface RequiredAbility {
  action: Action;
  subject: Subject;
}
