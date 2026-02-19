/**
 * Query Keys centralisés pour React Query
 * Source unique de vérité pour toutes les clés de cache
 *
 * Convention de nommage:
 * - Préfixe par module (balance, compte, credit, etc.)
 * - Suffixe par type (list, detail, stats, etc.)
 * - Fonctions pour les clés dynamiques
 */

// ============================================
// BALANCES - Source de vérité financière
// ============================================

export const balanceKeys = {
  all: ['balances'] as const,

  // Soldes individuels par entité
  compte: (compteId: string) => ['compte-balance', compteId] as const,
  caisse: (caisseId: string) => ['caisse-balance', caisseId] as const,
  session: (sessionId: string) => ['session-balance', sessionId] as const,
  credit: (creditId: string) => ['credit-balance', creditId] as const,
  tontine: (tontineId: string) => ['tontine-balance', tontineId] as const,
  coffre: (coffreId: string) => ['coffre-balance', coffreId] as const,
  caisseAgent: (caisseAgentId: string) => ['caisse-agent-balance', caisseAgentId] as const,

  // SUPPRIMÉ: cashPosition - utiliser treasuryKeys.encaisse() pour l'encaisse GL
};

// ============================================
// COMPTES (Épargne)
// ============================================

export const compteKeys = {
  all: ['comptes'] as const,
  lists: () => ['comptes', 'list'] as const,
  list: (filters?: Record<string, any>) => ['comptes', 'list', filters] as const,

  // Alias pour compatibilité avec l'ancien code
  epargne: () => ['comptes-epargne'] as const,
  pendingActivation: () => ['comptes', 'pending-activation'] as const,

  // Détails
  detail: (compteId: string) => ['comptes', 'detail', compteId] as const,
  transactions: (compteId: string) => ['transactions', compteId] as const,
  stats: (compteId: string) => ['compte-stats', compteId] as const,
  objectifs: (compteId: string) => ['comptes', 'objectifs', compteId] as const,
};

// ============================================
// CRÉDITS
// ============================================

export const creditKeys = {
  all: ['credits'] as const,
  lists: () => ['credits', 'list'] as const,
  list: (filters?: Record<string, any>) => ['credits', 'list', filters] as const,

  // Détails
  detail: (creditId: string) => ['credit', creditId] as const,
  remboursements: (creditId: string) => ['remboursements', creditId] as const,
  echeancier: (creditId: string) => ['echeancier', creditId] as const,

  // Demandes
  demandes: () => ['demandes-credit'] as const,
  demandesCounts: () => ['/api/demandes-credit/counts'] as const,

  // Stats
  stats: () => ['credits-stats'] as const,

  // Enquêtes
  enquetes: () => ['enquetes-credit'] as const,
};

// ============================================
// CAISSES & SESSIONS
// ============================================

export const caisseKeys = {
  all: ['caisses'] as const,
  lists: () => ['caisses', 'list'] as const,

  // Sessions
  sessions: () => ['session-caisse'] as const,
  sessionActive: () => ['session-caisse', 'active'] as const,
  myCaisses: () => ['session-caisse', 'my-caisses'] as const,
  supervision: () => ['supervision-sessions'] as const,

  // Opérations
  operations: () => ['operations-caisse'] as const,
  operationsToday: () => ['operations-caisse', 'today'] as const,
  operationsDebug: () => ['operations-caisse', 'today', 'debug'] as const,

  // Transactions (caisse module)
  transactions: () => ['caisse-transactions'] as const,

  // Historique
  historique: (caisseId: string, filters?: Record<string, any>) =>
    ['caisse-historique', caisseId, filters] as const,
  historiqueSummary: (caisseId: string) =>
    ['caisse-historique-summary', caisseId] as const,
};

// ============================================
// COFFRES
// ============================================

export const coffreKeys = {
  all: ['coffres'] as const,

  // Stats et mouvements
  stats: (agenceId?: string) => agenceId ? ['coffre-stats', agenceId] : ['coffre-stats'] as const,
  mouvements: (agenceId: string) => ['coffre-mouvements', agenceId] as const,

  // Transferts
  transferts: (agenceId?: string) => agenceId ? ['transferts-coffre', agenceId] : ['transferts-coffre'] as const,

  // Ouvertures sécurisées
  pendingOpeningRequests: (agenceId: string) => ['coffre', 'pending-opening-requests', agenceId] as const,

  // Supervision
  supervision: () => ['treasury-supervision'] as const,
};

// ============================================
// TONTINES
// ============================================

export const tontineKeys = {
  all: ['/api/tontines'] as const,
  lists: () => ['/api/tontines', 'list'] as const,

  // Détails
  detail: (tontineId: string) => ['tontine', tontineId] as const,
  dashboard: (tontineId: string) => ['tontine-dashboard', tontineId] as const,

  // Contributions et distributions
  contributions: (tontineId: string) => ['tontine-contributions', tontineId] as const,
  distributions: (tontineId: string) => ['tontine-distributions', tontineId] as const,

  // Membres
  membres: (tontineId: string) => ['tontine-membres', tontineId] as const,
};

// ============================================
// DASHBOARD
// ============================================

export const dashboardKeys = {
  stats: (role?: string, agenceId?: string) => ['dashboard-stats', role, agenceId] as const,
  statsLight: (role?: string, agenceId?: string) => ['dashboard-stats-light', role, agenceId] as const,
  balanceHistory: (period: string, agenceId?: string) => ['balance-history', period, agenceId] as const,
  liveActivity: () => ['live-activity'] as const,
};

// ============================================
// CLIENTS
// ============================================

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => ['clients', 'list'] as const,
  list: (filters?: Record<string, any>) => ['clients', 'list', filters] as const,

  // Détails
  detail: (clientId: string) => ['client', clientId] as const,
  portfolio: (clientId: string) => ['client-portfolio', clientId] as const,
};

// ============================================
// COMPTABILITÉ
// ============================================

export const comptabiliteKeys = {
  all: ['/api/comptabilite'] as const,

  // Plan comptable OHADA
  planOhada: () => ['/api/comptabilite', 'plan-ohada'] as const,

  // Journaux
  journaux: () => ['/api/comptabilite', 'journaux'] as const,
  journauxStats: () => ['/api/comptabilite', 'journaux-stats'] as const,
  journalEntries: (journalId: string) => ['/api/comptabilite', 'journal-entries', journalId] as const,

  // Balance générale
  balance: (dateDebut?: string, dateFin?: string, classe?: number) =>
    ['/api/comptabilite/v2/balance', { dateDebut, dateFin, classe }] as const,

  // Grand livre
  grandLivre: (compteId: string, dateDebut?: string, dateFin?: string, page?: number) =>
    ['/api/comptabilite/v2/grand-livre', compteId, { dateDebut, dateFin, page }] as const,

  // Bilan synthétique
  bilan: (dateFin?: string) => ['/api/comptabilite', 'bilan', dateFin] as const,

  // Compte de résultat
  compteResultat: (exercice?: string) => ['/api/comptabilite', 'compte-resultat', exercice] as const,

  // Périodes comptables
  periods: (year?: number) => ['/api/comptabilite', 'periods', year] as const,

  // OHADA GL Reports
  journalCentralisateur: (year: number, month: number) =>
    ['/api/comptabilite', 'reports', 'journal-centralisateur', year, month] as const,
  bilanOHADA: (dateArret: string) =>
    ['/api/comptabilite', 'reports', 'bilan', dateArret] as const,
  compteResultatOHADA: (dateDebut: string, dateFin: string) =>
    ['/api/comptabilite', 'reports', 'compte-resultat', dateDebut, dateFin] as const,
  livreInventaire: (dateInventaire: string) =>
    ['/api/comptabilite', 'reports', 'livre-inventaire', dateInventaire] as const,

  // Factures
  factures: () => ['/api/factures'] as const,
};

// ============================================
// TREASURY v2 (Encaisse canonique basée sur GL)
// ============================================

export const treasuryKeys = {
  all: ['treasury'] as const,

  // Stats page Trésorerie (caisses, coffres, soldes)
  stats: () => ['tresorerie-stats'] as const,

  // Encaisse canonique (Single Source of Truth depuis GL)
  encaisse: (agenceId?: string) => ['treasury', 'encaisse', agenceId] as const,

  // Encaisse avec réconciliation
  encaisseWithReconciliation: (agenceId?: string) =>
    ['treasury', 'encaisse', 'reconciliation', agenceId] as const,

  // Breakdown détaillé par compte GL
  breakdown: (agenceId?: string) => ['treasury', 'breakdown', agenceId] as const,
};

// ============================================
// AGENTS TERRAIN
// ============================================

export const agentKeys = {
  all: ['/api/agents-terrain'] as const,

  // Caisse agent
  caisseAgent: (agentId: string) => ['caisse-agent', agentId] as const,

  // Sessions GL agent
  sessions: () => ['/api/caisse-agent/sessions'] as const,
  sessionActive: (agentId: string) => ['/api/caisse-agent/sessions', 'active', agentId] as const,
  sessionDetail: (sessionId: string) => ['/api/caisse-agent/sessions', sessionId] as const,

  // Prospections
  prospections: () => ['/api/prospections'] as const,

  // Zones
  zones: () => ['/api/zones'] as const,

  // Objectifs
  objectifs: () => ['/api/objectifs-mensuels'] as const,

  // Paiements terrain
  paiements: () => ['/api/paiements-terrain'] as const,

  // Incidents
  incidents: (agentId?: string) => agentId
    ? ['/api/agent-incidents', agentId] as const
    : ['/api/agent-incidents'] as const,
};

// ============================================
// SYSTÈME & ADMIN
// ============================================

export const systemKeys = {
  settings: () => ['/api/system-settings'] as const,
  agences: () => ['/api/agences'] as const,
  myAgences: () => ['/api/me/agences'] as const,
  employes: () => ['/api/employes'] as const,

  // RBAC
  permissions: () => ['/api/permissions'] as const,
  rolePermissions: () => ['/api/role-permissions'] as const,
  myPermissions: () => ['/api/my-permissions'] as const,
  userPermissions: () => ['/api/user-permissions'] as const,
  rbac: () => ['/api/rbac'] as const,
};

// ============================================
// HR (Ressources Humaines)
// ============================================

export const hrKeys = {
  all: ['/api/hr'] as const,

  conges: () => ['/api/hr/conges'] as const,
  congesBalance: () => ['/api/hr/conges/balance'] as const,

  bulletins: () => ['/api/hr/bulletins'] as const,
  paie: () => ['/api/hr/paie/my'] as const,

  formations: () => ['/api/hr/formations'] as const,
  sanctions: () => ['/api/hr/sanctions'] as const,
  presence: () => ['/api/hr/presence/today'] as const,
  candidatures: () => ['/api/hr/candidatures'] as const,
  avantages: () => ['/api/hr/avantages'] as const,
  organigramme: () => ['/api/hr/organigramme'] as const,
  avances: () => ['/api/hr/avances'] as const,
};

// ============================================
// LOYALTY
// ============================================

export const loyaltyKeys = {
  all: ['/api/loyalty'] as const,
};

// ============================================
// MESSAGING
// ============================================

export const messageKeys = {
  conversationsV2: () => ['/api/conversations'] as const,
  conversationMessages: (conversationId: string) => ['/api/conversations', conversationId, 'messages'] as const,
};

// ============================================
// VIREMENTS PROGRAMMÉS (Scheduled Transfers)
// ============================================

export const scheduledTransferKeys = {
  all: ['scheduled-transfers'] as const,
  lists: () => ['scheduled-transfers', 'list'] as const,
  list: (filters?: Record<string, any>) => ['scheduled-transfers', 'list', filters] as const,

  // Stats
  stats: () => ['scheduled-transfers', 'stats'] as const,

  // Détails
  detail: (transferId: string) => ['scheduled-transfers', 'detail', transferId] as const,
  history: (transferId: string) => ['scheduled-transfers', 'history', transferId] as const,

  // Santé système
  health: () => ['scheduled-transfers', 'health'] as const,
};

// ============================================
// HELPER: Invalidation par module
// ============================================

/**
 * Retourne toutes les clés à invalider pour un type d'entité donné
 * Utilisé par les handlers WebSocket pour maintenir la cohérence
 */
export function getInvalidationKeysForEntity(
  entityType: 'compte' | 'caisse' | 'session_caisse' | 'credit' | 'tontine' | 'coffre' | 'caisse_agent',
  entityId?: string
): readonly (readonly (string | undefined)[])[] {
  switch (entityType) {
    case 'compte':
      return [
        entityId ? balanceKeys.compte(entityId) : balanceKeys.all,
        compteKeys.epargne(),
        dashboardKeys.stats(),
      ];

    case 'caisse':
    case 'session_caisse':
      return [
        caisseKeys.sessions(),
        caisseKeys.sessionActive(),
        caisseKeys.operations(),
        dashboardKeys.stats(),
      ];

    case 'credit':
      return [
        creditKeys.all,
        entityId ? creditKeys.detail(entityId) : creditKeys.all,
        dashboardKeys.stats(),
      ];

    case 'tontine':
      return [
        tontineKeys.all,
        entityId ? tontineKeys.detail(entityId) : tontineKeys.all,
      ];

    case 'coffre':
      return [
        coffreKeys.stats(),
        dashboardKeys.stats(),
      ];

    case 'caisse_agent':
      return [
        entityId ? agentKeys.caisseAgent(entityId) : agentKeys.all,
      ];

    default:
      return [];
  }
}
