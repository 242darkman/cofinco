/**
 * GUARD SYSTEM - Protection contre désynchronisation GL
 *
 * Garantit que toute modification de solde de trésorerie
 * passe par le système de posting GL
 */

import { logger } from "../../lib/logger";
import { currencySymbol } from "@shared/config/currency";

/**
 * Configuration des seuils d'alerte
 */
const THRESHOLDS = {
  // Écart critique nécessitant intervention immédiate
  CRITICAL: 500_000, // 500k FCFA

  // Écart majeur nécessitant investigation
  MAJOR: 100_000, // 100k FCFA

  // Écart mineur à surveiller
  MINOR: 10_000, // 10k FCFA

  // Écart acceptable (frais bancaires, arrondis)
  ACCEPTABLE: 500, // 500 FCFA
};

export interface ReconciliationIssue {
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'ACCEPTABLE';
  entityType: 'COFFRE' | 'CAISSE' | 'MOBILE_MONEY' | 'BANK' | 'TRANSIT' | 'AGENT';
  entityId: string;
  operationalBalance: number;
  glBalance: number;
  discrepancy: number;
  message: string;
}

/**
 * Vérifie qu'un mouvement a bien un GL posting valide
 */
export function assertMouvementHasGlPosting(
  mouvement: {
    id: string;
    montant: string | number;
    requiresGlPosting?: boolean;
    glPostingStatus?: string | null;
  },
  operationName: string
): void {
  // Si le mouvement ne nécessite pas de GL posting, OK
  if (mouvement.requiresGlPosting === false) {
    return;
  }

  // Sinon, vérifier que le GL posting existe
  if (!mouvement.glPostingStatus) {
    throw new Error(
      `[GL GUARD] ${operationName}: Mouvement ${mouvement.id} n'a pas de GL posting status. ` +
      `Montant: ${mouvement.montant} ${currencySymbol()}. ` +
      `Toute opération de trésorerie DOIT poster au GL.`
    );
  }

  // Vérifier que le posting n'a pas échoué
  if (mouvement.glPostingStatus === 'FAILED') {
    throw new Error(
      `[GL GUARD] ${operationName}: Mouvement ${mouvement.id} a un GL posting FAILED. ` +
      `Montant: ${mouvement.montant} ${currencySymbol()}. ` +
      `Transaction annulée pour éviter désynchronisation.`
    );
  }

  // SKIPPED est acceptable (règle comptable manquante)
  // POSTED est OK
  // PENDING sera résolu par job async
}

/**
 * Vérifie qu'un écart de réconciliation est dans les limites acceptables
 */
export function assessDiscrepancy(
  entityType: 'COFFRE' | 'CAISSE' | 'MOBILE_MONEY' | 'BANK' | 'TRANSIT' | 'AGENT',
  entityId: string,
  operationalBalance: number,
  glBalance: number
): ReconciliationIssue {
  const discrepancy = Math.abs(operationalBalance - glBalance);

  let severity: ReconciliationIssue['severity'];
  let message: string;

  if (discrepancy <= THRESHOLDS.ACCEPTABLE) {
    severity = 'ACCEPTABLE';
    message = `Écart acceptable de ${discrepancy.toLocaleString()} ${currencySymbol()}`;
  } else if (discrepancy <= THRESHOLDS.MINOR) {
    severity = 'MINOR';
    message = `Écart mineur de ${discrepancy.toLocaleString()} ${currencySymbol()} - À surveiller`;
  } else if (discrepancy <= THRESHOLDS.MAJOR) {
    severity = 'MAJOR';
    message = `Écart majeur de ${discrepancy.toLocaleString()} ${currencySymbol()} - Investigation requise`;
  } else {
    severity = 'CRITICAL';
    message = `ÉCART CRITIQUE de ${discrepancy.toLocaleString()} ${currencySymbol()} - Intervention immédiate`;
  }

  const issue: ReconciliationIssue = {
    severity,
    entityType,
    entityId,
    operationalBalance,
    glBalance,
    discrepancy,
    message,
  };

  // Logguer selon la sévérité
  if (severity === 'CRITICAL') {
    logger.error({ issue }, '[GL GUARD] Écart critique détecté');
  } else if (severity === 'MAJOR') {
    logger.warn({ issue }, '[GL GUARD] Écart majeur détecté');
  } else if (severity === 'MINOR') {
    logger.info({ issue }, '[GL GUARD] Écart mineur détecté');
  }

  return issue;
}

/**
 * Empêche les modifications directes de solde sans GL posting
 * À appeler AVANT toute mise à jour de solde
 */
export function preventDirectBalanceUpdate(
  entityType: 'COFFRE' | 'CAISSE',
  entityId: string,
  operation: string
): void {
  logger.warn(
    {
      entityType,
      entityId,
      operation,
      stackTrace: new Error().stack,
    },
    '[GL GUARD] Tentative de modification directe de solde détectée'
  );

  throw new Error(
    `[GL GUARD] Modification directe de solde interdite pour ${entityType} ${entityId}. ` +
    `Utilisez les services appropriés qui postent automatiquement au GL: ` +
    `- coffresService.approvisionnerCoffre() pour abondements ` +
    `- transfertService pour transferts ` +
    `- sessionService pour opérations caisse`
  );
}

/**
 * Vérifie qu'une règle comptable existe pour un type d'opération
 */
export async function ensureAccountingRuleExists(
  db: any,
  eventType: string,
  operationDescription: string
): Promise<void> {
  const [rule] = await db
    .select()
    .from('accounting_rules')
    .where('event_type', eventType)
    .where('active', true)
    .limit(1);

  if (!rule) {
    logger.error(
      { eventType, operation: operationDescription },
      '[GL GUARD] Règle comptable manquante'
    );

    throw new Error(
      `[GL GUARD] Aucune règle comptable active pour l'événement "${eventType}". ` +
      `Opération: ${operationDescription}. ` +
      `Ajoutez une règle dans seeds/seed-prod.ts (ACCOUNTING_RULES_DATA) ` +
      `avant d'exécuter cette opération.`
    );
  }
}

/**
 * Wrapper pour les opérations de trésorerie qui garantit le posting GL
 */
export async function withGlPostingGuard<T>(
  operationName: string,
  operation: () => Promise<T>,
  onSuccess?: (result: T) => Promise<void>
): Promise<T> {
  logger.info({ operation: operationName }, '[GL GUARD] Début opération trésorerie');

  try {
    const result = await operation();

    logger.info({ operation: operationName }, '[GL GUARD] Opération réussie');

    if (onSuccess) {
      await onSuccess(result);
    }

    return result;
  } catch (error) {
    logger.error(
      {
        operation: operationName,
        error: error instanceof Error ? error.message : String(error),
      },
      '[GL GUARD] Opération échouée'
    );

    throw error;
  }
}

/**
 * Seuils d'alerte exposés
 */
export { THRESHOLDS };
