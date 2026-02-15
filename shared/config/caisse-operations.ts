/**
 * Configuration centralisée pour les opérations de caisse
 *
 * Ce fichier définit les types d'opérations et leur impact sur les soldes.
 * Il est utilisé par tous les services de caisse pour garantir une cohérence.
 *
 * CONVENTION: Toutes les valeurs sont en ANGLAIS (SCREAMING_SNAKE_CASE)
 */

import { TypeCompte } from "@shared/enum/status-constants";

// ============================================================================
// TYPES D'OPÉRATIONS - CLASSIFICATION PAR SENS DE FLUX
// ============================================================================

/**
 * Opérations qui AUGMENTENT le solde de la caisse (entrées d'argent)
 * - L'argent entre dans la caisse physique
 * - Sens comptable: Crédit pour l'institution (actif qui augmente)
 */
export const CAISSE_IN_OPERATIONS = [
  // Épargne & Comptes
  "SAVINGS_DEPOSIT",
  "DEPOSIT_SAVINGS",
  "DEPOSIT_CURRENT",
  "DEPOSIT_BLOCKED",
  "INITIAL_DEPOSIT",

  // Crédits
  "CREDIT_REPAYMENT",
  "LOAN_REPAYMENT",
  "ENGAGEMENT_FEE",

  // Tontines
  "TONTINE_CONTRIBUTION",

  // Encaissements
  "MISC_COLLECTION",

  // Transferts entrants
  "SAFE_SUPPLY",
  "TRANSFER_IN",
] as const;

/**
 * Opérations qui DIMINUENT le solde de la caisse (sorties d'argent)
 * - L'argent sort de la caisse physique
 * - Sens comptable: Débit pour l'institution (actif qui diminue)
 */
export const CAISSE_OUT_OPERATIONS = [
  // Épargne & Comptes
  "SAVINGS_WITHDRAWAL",
  "WITHDRAWAL_SAVINGS",
  "WITHDRAWAL_CURRENT",
  "WITHDRAWAL_BLOCKED",
  "TONTINE_WITHDRAWAL",

  // Crédits
  "CREDIT_DISBURSEMENT",
  "LOAN_DISBURSEMENT",

  // Frais et sorties
  "FEE",
  "BANK_FEE",
  "MISC_DISBURSEMENT",

  // Transferts sortants
  "SAFE_DEPOSIT",
  "TRANSFER_OUT",

  // Agent terrain
  "AGENT_PROVISIONING",
] as const;

/**
 * Opérations neutres ou qui nécessitent une analyse contextuelle
 * La direction est déterminée par d'autres critères (référence, description)
 */
export const CAISSE_NEUTRAL_OPERATIONS = [
  "CASH_TRANSFER",
  "ADJUSTMENT",
  "INTERNAL_TRANSFER",
] as const;

// ============================================================================
// HELPERS POUR CALCUL DES SOLDES
// ============================================================================

export type CaisseInOperation = typeof CAISSE_IN_OPERATIONS[number];
export type CaisseOutOperation = typeof CAISSE_OUT_OPERATIONS[number];
export type CaisseNeutralOperation = typeof CAISSE_NEUTRAL_OPERATIONS[number];
export type CaisseOperation = CaisseInOperation | CaisseOutOperation | CaisseNeutralOperation;

/**
 * Détermine si une opération est une entrée d'argent en caisse
 */
export function isIncomingOperation(typeOperation: string): boolean {
  return (CAISSE_IN_OPERATIONS as readonly string[]).includes(typeOperation);
}

/**
 * Détermine si une opération est une sortie d'argent de caisse
 */
export function isOutgoingOperation(typeOperation: string): boolean {
  return (CAISSE_OUT_OPERATIONS as readonly string[]).includes(typeOperation);
}

/**
 * Calcule le delta (variation) de solde pour une opération
 * @returns montant positif pour entrée, négatif pour sortie, 0 si neutre
 */
export function getOperationDelta(
  typeOperation: string,
  montant: number | string,
  context?: {
    reference?: string | null;
    description?: string | null;
  }
): number {
  const amount = typeof montant === 'string' ? parseFloat(montant) : montant;

  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }

  // Cas des opérations clairement entrantes
  if (isIncomingOperation(typeOperation)) {
    return amount;
  }

  // Cas des opérations clairement sortantes
  if (isOutgoingOperation(typeOperation)) {
    return -amount;
  }

  // Cas des opérations neutres nécessitant analyse contextuelle
  if (typeOperation === "CASH_TRANSFER") {
    // Analyser la référence ou description pour déterminer le sens
    const ref = context?.reference || "";
    const desc = (context?.description || "").toLowerCase();

    const isIncoming =
      ref.includes("TRF-IN") ||
      desc.includes("incoming") ||
      desc.includes("in");

    return isIncoming ? amount : -amount;
  }

  if (typeOperation === "ADJUSTMENT") {
    // Les ajustements peuvent être positifs ou négatifs
    // Par convention, le montant signé indique déjà le sens
    return amount;
  }

  // Par défaut, opération neutre
  return 0;
}

// ============================================================================
// CONFIGURATION DES SEUILS ET LIMITES
// ============================================================================

export const CAISSE_THRESHOLDS = {
  /** Écart maximum toléré sans alerte (en FCFA) */
  MAX_ECART_SANS_ALERTE: 50000,

  /** Écart nécessitant une justification obligatoire */
  ECART_JUSTIFICATION_REQUISE: 100000,

  /** Seuil pour alerte de solde bas */
  SOLDE_BAS_ALERTE: 500000,

  /** Plafond de caisse recommandé (au-delà, verser au coffre) */
  PLAFOND_CAISSE: 5000000,

  /** Heures d'inactivité avant avertissement */
  INACTIVITE_WARNING_HOURS: 6,

  /** Heures d'inactivité critique */
  INACTIVITE_CRITICAL_HOURS: 10,

  /** Heures avant fermeture automatique */
  TIMEOUT_AUTO_CLOSE_HOURS: 12,
} as const;

// ============================================================================
// MAPPING COMPTE/OPERATION
// ============================================================================

/**
 * Mapping entre type de compte et type d'opération de versement (EN)
 */
export const COMPTE_VERSEMENT_MAPPING: Record<string, string> = {
  [TypeCompte.SAVINGS]: "DEPOSIT_SAVINGS",
  [TypeCompte.CURRENT]: "DEPOSIT_CURRENT",
  [TypeCompte.BLOCKED]: "DEPOSIT_BLOCKED",
};

/**
 * Mapping entre type de compte et type d'opération de retrait (EN)
 */
export const COMPTE_RETRAIT_MAPPING: Record<string, string> = {
  [TypeCompte.SAVINGS]: "WITHDRAWAL_SAVINGS",
  [TypeCompte.CURRENT]: "WITHDRAWAL_CURRENT",
  [TypeCompte.BLOCKED]: "WITHDRAWAL_BLOCKED",
};

/**
 * Obtient le type d'opération de versement pour un type de compte
 */
export function getVersementOperation(typeCompte: string): string {
  return COMPTE_VERSEMENT_MAPPING[typeCompte] || "DEPOSIT_CURRENT";
}

/**
 * Obtient le type d'opération de retrait pour un type de compte
 */
export function getRetraitOperation(typeCompte: string): string {
  return COMPTE_RETRAIT_MAPPING[typeCompte] || "WITHDRAWAL_CURRENT";
}

// ============================================================================
// SENS COMPTABLE POUR MOUVEMENTS FINANCIERS
// ============================================================================

export type SensMouvement = "DEBIT" | "CREDIT";

/**
 * Détermine le sens du mouvement financier pour le ledger
 *
 * Convention:
 * - CREDIT = Argent qui entre (perspective institution)
 * - DEBIT = Argent qui sort (perspective institution)
 */
export function getSensMouvement(typeOperation: string): SensMouvement {
  if (isOutgoingOperation(typeOperation)) {
    return "DEBIT"; // Argent sort de l'institution
  }
  return "CREDIT"; // Argent entre dans l'institution
}

/**
 * Détermine l'impact sur le compte client
 * Convention inverse du sens caisse:
 * - Dépôt client = Crédit compte client (dette de l'institution envers le client)
 * - Retrait client = Débit compte client
 */
export function getImpactCompteClient(typeOperation: string): {
  delta: 1 | -1 | 0;
  description: string;
} {
  if (isIncomingOperation(typeOperation)) {
    // Dépôt = compte client augmente
    return { delta: 1, description: "Crédit compte client" };
  }
  if (isOutgoingOperation(typeOperation)) {
    // Retrait = compte client diminue
    return { delta: -1, description: "Débit compte client" };
  }
  return { delta: 0, description: "Sans impact" };
}
