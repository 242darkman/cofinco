/**
 * Types pour la gestion unifiée des soldes financiers
 * Source de vérité unique pour toutes les entités financières
 */

export type BalanceEntityType =
  | 'compte'
  | 'caisse'
  | 'session_caisse'
  | 'credit'
  | 'tontine'
  | 'coffre'
  | 'caisse_agent';

/**
 * Représentation standardisée d'un solde
 */
export interface Balance {
  entityId: string;
  entityType: BalanceEntityType;
  current: number;        // Solde actuel
  available: number;      // Solde disponible (excluant blocages)
  pending: number;        // Opérations en attente
  currency: string;       // Devise (FCFA par défaut)
  asOf: Date;             // Timestamp du solde
}

/**
 * Event WebSocket normalisé pour mise à jour de solde
 */
export interface BalanceUpdatePayload {
  entityType: BalanceEntityType;
  entityId: string;
  agenceId: string;
  newBalance: number;
  previousBalance: number;
  delta: number;
  mouvementRef: string;
  sourceModule: string;
  typePaiement?: string;
  timestamp: string;
}

export interface BalanceUpdateEvent {
  type: 'BALANCE_UPDATED';
  payload: BalanceUpdatePayload;
}

/**
 * Position de trésorerie globale
 */
export interface CashPosition {
  totalCoffres: number;
  totalCaisses: number;
  totalCaissesAgent: number;
  grandTotal: number;
  breakdown: {
    byAgence: Record<string, { coffre: number; caisses: number; total: number }>;
    byCaisse: Record<string, number>;
    byCoffre: Record<string, number>;
  };
  asOf: Date;
}

/**
 * Résultat de réconciliation
 */
export interface ReconciliationResult {
  entityType: BalanceEntityType;
  entityId: string;
  entityRef?: string;      // Référence humaine (numéro compte, code caisse, etc.)
  persistedBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  hasDiscrepancy: boolean;
  severity: 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  lastMovement?: {
    id: string;
    reference: string;
    date: Date;
    montant: number;
  };
  checkedAt: Date;
}

/**
 * Seuils de tolérance pour réconciliation
 */
export const RECONCILIATION_THRESHOLDS = {
  MINOR: 100,      // < 100 FCFA = tolérance arrondi
  MAJOR: 10000,    // < 10,000 FCFA = écart à investiguer
  CRITICAL: 100000 // >= 100,000 FCFA = alerte immédiate
} as const;

/**
 * Rapport de réconciliation global
 */
export interface ReconciliationReport {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  totalEntities: number;
  checkedEntities: number;
  discrepancies: ReconciliationResult[];
  summary: {
    ok: number;
    minor: number;
    major: number;
    critical: number;
    totalDiscrepancyAmount: number;
  };
}

/**
 * Filtre pour requête de soldes
 */
export interface BalanceFilter {
  entityType?: BalanceEntityType;
  agenceId?: string;
  clientId?: string;
  minBalance?: number;
  maxBalance?: number;
  includeZero?: boolean;
  includeClosed?: boolean;
}

/**
 * Historique de solde pour graphiques
 */
export interface BalanceHistoryPoint {
  date: Date;
  balance: number;
  delta?: number;
  mouvementCount?: number;
}

export interface BalanceHistory {
  entityType: BalanceEntityType;
  entityId: string;
  period: 'day' | 'week' | 'month' | 'year';
  points: BalanceHistoryPoint[];
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
}

/**
 * Stats agrégées par type d'entité
 */
export interface BalanceStats {
  entityType: BalanceEntityType;
  count: number;
  totalBalance: number;
  averageBalance: number;
  minBalance: number;
  maxBalance: number;
  zeroBalanceCount: number;
}
