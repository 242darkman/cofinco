/**
 * CASL Actions - Shared between frontend and backend
 *
 * These are the verbs that define what operations can be performed.
 * Convention: lowercase, verb form
 */

// Base CRUD actions
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

  // Agent terrain/caisse
  APPROVE_AGENT_OP: 'approve_agent_op',
  REJECT_AGENT_OP: 'reject_agent_op',
  SUSPEND_AGENT: 'suspend_agent',

  // RH/Paie
  APPROVE_PAIE: 'approve_paie',

  // Reevaluations
  REEVALUATE: 'reevaluate',

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

// List of all actions for validation
export const ALL_ACTIONS = Object.values(Actions);

// Action categories for UI grouping
export const ACTION_CATEGORIES = {
  crud: [Actions.VIEW, Actions.CREATE, Actions.EDIT, Actions.DELETE],
  workflow: [Actions.APPROVE, Actions.REJECT, Actions.VALIDATE, Actions.CANCEL, Actions.CLOSE],
  export: [Actions.EXPORT, Actions.IMPORT],
  credit: [Actions.DISBURSE, Actions.DISBURSE_CASH, Actions.DISBURSE_ACCOUNT, Actions.DISBURSE_MOMO],
  user: [Actions.RESET_PASSWORD, Actions.SUSPEND, Actions.ACTIVATE],
  caisse: [Actions.OPEN_SESSION, Actions.CLOSE_SESSION, Actions.TRANSFER, Actions.RECONCILE],
} as const;

// Human-readable labels for UI
export const ACTION_LABELS: Record<Action, string> = {
  [Actions.VIEW]: 'Voir',
  [Actions.CREATE]: 'Créer',
  [Actions.EDIT]: 'Modifier',
  [Actions.DELETE]: 'Supprimer',
  [Actions.MANAGE]: 'Gérer (tout)',
  [Actions.APPROVE]: 'Approuver',
  [Actions.REJECT]: 'Rejeter',
  [Actions.VALIDATE]: 'Valider',
  [Actions.CANCEL]: 'Annuler',
  [Actions.CLOSE]: 'Clôturer',
  [Actions.EXPORT]: 'Exporter',
  [Actions.IMPORT]: 'Importer',
  [Actions.DISBURSE]: 'Décaisser',
  [Actions.DISBURSE_CASH]: 'Décaisser (espèces)',
  [Actions.DISBURSE_ACCOUNT]: 'Décaisser (compte)',
  [Actions.DISBURSE_MOMO]: 'Décaisser (mobile)',
  [Actions.COLLECT]: 'Collecter',
  [Actions.VALIDATE_REEVALUATION]: 'Valider réévaluation',
  [Actions.DECIDE_REEVALUATION]: 'Décider réévaluation',
  [Actions.RESET_PASSWORD]: 'Réinitialiser MDP',
  [Actions.MANAGE_ROLES]: 'Gérer les rôles',
  [Actions.SUSPEND]: 'Suspendre',
  [Actions.ACTIVATE]: 'Activer',
  [Actions.OPEN_SESSION]: 'Ouvrir session',
  [Actions.CLOSE_SESSION]: 'Fermer session',
  [Actions.DEPOSIT]: 'Déposer',
  [Actions.WITHDRAW]: 'Retirer',
  [Actions.TRANSFER]: 'Transférer',
  [Actions.RECONCILE]: 'Rapprocher',
  [Actions.INIT_TRANSFER]: 'Initier transfert',
  [Actions.VALIDATE_TRANSFER]: 'Valider transfert',
  [Actions.EXECUTE_TRANSFER]: 'Exécuter transfert',
  [Actions.APPROVE_AGENT_OP]: 'Approuver opération agent',
  [Actions.REJECT_AGENT_OP]: 'Rejeter opération agent',
  [Actions.SUSPEND_AGENT]: 'Suspendre agent',
  [Actions.APPROVE_PAIE]: 'Approuver paie',
  [Actions.REEVALUATE]: 'Réévaluer',
  [Actions.DISTRIBUTE]: 'Distribuer',
  [Actions.GENERATE]: 'Générer',
  [Actions.ASSIGN]: 'Assigner',
  [Actions.REVERSE]: 'Extourner',
  [Actions.SEED]: 'Initialiser',
  [Actions.PURGE]: 'Purger',
  [Actions.TERMINATE]: 'Terminer',
  [Actions.MIGRATE]: 'Migrer',
};
