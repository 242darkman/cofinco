/**
 * Offline Limits — source de vérité serveur des plafonds hors ligne.
 *
 * Modèle de menace : le client (bundle public + IndexedDB) ne peut pas
 * garantir cryptographiquement ses propres limites — un secret HMAC partagé
 * serait forgeable par quiconque lit le bundle. L'application RÉELLE des
 * limites se fait donc ICI, au rejeu du journal offline (§8 AGENTS.md :
 * ne jamais faire confiance au client). Le contrôle côté client reste un
 * garde-fou UX qui évite de saisir des opérations vouées au rejet.
 *
 * Ce module est pur (aucune dépendance DB) pour être testable unitairement ;
 * la lecture des statistiques quotidiennes vit dans le route handler.
 */
import { D } from "../../lib/money";

export interface OfflineLimitsConfig {
  maxCaisseBalance: number;
  maxSingleOperation: number;
  maxDailyOperations: number;
  maxDailyVolume: number;
  maxOfflineDays: number;
  maxPendingSync: number;
  allowedOperationTypes: readonly string[];
}

/**
 * Plafonds offline standard (XAF). Une variation par tenant devra passer
 * par la configuration tenant, pas par une modification en dur ici.
 */
export const OFFLINE_LIMITS: OfflineLimitsConfig = {
  maxCaisseBalance: 5_000_000,   // 5M XAF
  maxSingleOperation: 1_000_000, // 1M XAF
  maxDailyOperations: 50,
  maxDailyVolume: 10_000_000,    // 10M XAF
  maxOfflineDays: 7,
  maxPendingSync: 200,
  allowedOperationTypes: [
    'DEPOSIT', 'WITHDRAWAL', 'LOAN_REPAYMENT',
    'TONTINE_CONTRIBUTION', 'CLIENT_CREATE', 'CLIENT_UPDATE',
    'CAISSE_OPEN', 'CAISSE_CLOSE', 'CAISSE_RECONCILE',
    'REMISE_CREATE', 'SETTLEMENT',
  ],
};

/**
 * Types d'opérations comptant dans le volume et le nombre quotidiens.
 * Miroir de getCashImpact côté client (apps/web/src/lib/offline-treasury.ts).
 */
export const FINANCIAL_OPERATION_TYPES: ReadonlySet<string> = new Set([
  'DEPOSIT', 'WITHDRAWAL', 'LOAN_REPAYMENT', 'TONTINE_CONTRIBUTION',
  'LOAN_DISBURSEMENT', 'TONTINE_DISTRIBUTION', 'REMISE_CREATE', 'SETTLEMENT',
]);

export interface AgentDailyStats {
  /** Nombre d'opérations financières déjà confirmées ce jour-là */
  operationCount: number;
  /** Volume financier cumulé déjà confirmé ce jour-là (XAF) */
  totalVolume: number;
}

export interface LimitValidationInput {
  type: string;
  /** payload.amount de l'entrée, si présent */
  amount: number | null;
  /** Stats confirmées du jour AVANT cette entrée (DB + batch en cours) */
  dailyStats: AgentDailyStats;
}

export type LimitValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string; details: string };

/** Extrait un montant exploitable du payload d'une entrée de journal. */
export function extractEntryAmount(payload: Record<string, unknown>): number | null {
  const raw = payload['amount'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/**
 * Valide une entrée de journal offline contre les plafonds serveur.
 * Pur et déterministe — les stats du jour sont fournies par l'appelant.
 */
export function validateEntryAgainstLimits(
  input: LimitValidationInput,
  limits: OfflineLimitsConfig = OFFLINE_LIMITS,
): LimitValidationResult {
  const { type, amount, dailyStats } = input;

  // 1. Type autorisé hors ligne
  if (!limits.allowedOperationTypes.includes(type)) {
    return {
      allowed: false,
      reason: 'type_not_allowed_offline',
      details: `Type ${type} non autorisé hors ligne`,
    };
  }

  // Les opérations non financières ne comptent ni en montant ni en volume
  if (!FINANCIAL_OPERATION_TYPES.has(type)) {
    return { allowed: true };
  }

  // 2. Une opération financière doit porter un montant exploitable
  if (amount === null) {
    return {
      allowed: false,
      reason: 'missing_amount',
      details: `Montant absent ou invalide pour une opération ${type}`,
    };
  }

  // 3. Plafond par opération
  if (D(amount).gt(limits.maxSingleOperation)) {
    return {
      allowed: false,
      reason: 'amount_exceeds_offline_limit',
      details: `Montant ${amount} > plafond hors ligne ${limits.maxSingleOperation}`,
    };
  }

  // 4. Nombre d'opérations quotidien
  if (dailyStats.operationCount + 1 > limits.maxDailyOperations) {
    return {
      allowed: false,
      reason: 'daily_operations_exceeded',
      details: `${dailyStats.operationCount + 1} opérations > plafond quotidien ${limits.maxDailyOperations}`,
    };
  }

  // 5. Volume quotidien cumulé (Decimal — pas de flottants JS)
  const projectedVolume = D(dailyStats.totalVolume).plus(D(amount));
  if (projectedVolume.gt(limits.maxDailyVolume)) {
    return {
      allowed: false,
      reason: 'daily_volume_exceeded',
      details: `Volume projeté ${projectedVolume.toString()} > plafond quotidien ${limits.maxDailyVolume}`,
    };
  }

  return { allowed: true };
}
