/**
 * Configuration centralisée pour les opérations de caisse
 *
 * Ce fichier définit les types d'opérations et leur impact sur les soldes.
 * Il est utilisé par tous les services de caisse pour garantir une cohérence.
 */

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
  "Dépôt épargne",
  "Versement Épargne",
  "Versement Courant",
  "Versement Bloqué",
  "Dépôt Épargne",
  "Dépôt Courant",
  "Dépôt Bloqué",
  "Dépôt Initial",

  // Crédits
  "Remboursement crédit",
  "Remboursement Crédit",
  "Remboursement Prêt",
  "Frais Engagement",

  // Tontines
  "Cotisation Tontine",
  "Versement Tontine",

  // Encaissements
  "Encaissement",
  "Encaissement Divers",

  // Transferts entrants
  "Approvisionnement coffre", // Argent venant du coffre
  "Transfert Entrant",
] as const;

/**
 * Opérations qui DIMINUENT le solde de la caisse (sorties d'argent)
 * - L'argent sort de la caisse physique
 * - Sens comptable: Débit pour l'institution (actif qui diminue)
 */
export const CAISSE_OUT_OPERATIONS = [
  // Épargne & Comptes
  "Retrait épargne",
  "Retrait Épargne",
  "Retrait Courant",
  "Retrait Bloqué",
  "Retrait Tontine",

  // Crédits
  "Décaissement crédit",
  "Décaissement Crédit",
  "Décaissement Prêt",

  // Frais et sorties
  "Frais",
  "Frais Bancaires",
  "Décaissement Divers",

  // Transferts sortants
  "Versement coffre", // Argent vers le coffre
  "Transfert Sortant",
] as const;

/**
 * Opérations neutres ou qui nécessitent une analyse contextuelle
 * La direction est déterminée par d'autres critères (référence, description)
 */
export const CAISSE_NEUTRAL_OPERATIONS = [
  "Transfert caisse",
  "Ajustement",
  "Virement Interne",
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
  const normalized = typeOperation.toLowerCase();
  return CAISSE_IN_OPERATIONS.some(op =>
    normalized === op.toLowerCase() || normalized.includes(op.toLowerCase())
  );
}

/**
 * Détermine si une opération est une sortie d'argent de caisse
 */
export function isOutgoingOperation(typeOperation: string): boolean {
  const normalized = typeOperation.toLowerCase();
  return CAISSE_OUT_OPERATIONS.some(op =>
    normalized === op.toLowerCase() || normalized.includes(op.toLowerCase())
  );
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
  const normalizedType = typeOperation.toLowerCase();

  if (normalizedType.includes("transfert caisse")) {
    // Analyser la référence ou description pour déterminer le sens
    const ref = context?.reference || "";
    const desc = (context?.description || "").toLowerCase();

    const isIncoming =
      ref.includes("TRF-IN") ||
      desc.includes("réception") ||
      desc.includes("reception") ||
      desc.includes("entrant") ||
      desc.includes("entrée") ||
      desc.includes("entree");

    return isIncoming ? amount : -amount;
  }

  if (normalizedType.includes("ajustement")) {
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
 * Mapping entre type de compte et type d'opération de versement
 */
export const COMPTE_VERSEMENT_MAPPING: Record<string, string> = {
  "Épargne": "Versement Épargne",
  "Courant": "Versement Courant",
  "Bloqué": "Versement Bloqué",
};

/**
 * Mapping entre type de compte et type d'opération de retrait
 */
export const COMPTE_RETRAIT_MAPPING: Record<string, string> = {
  "Épargne": "Retrait Épargne",
  "Courant": "Retrait Courant",
  "Bloqué": "Retrait Bloqué",
};

/**
 * Obtient le type d'opération de versement pour un type de compte
 */
export function getVersementOperation(typeCompte: string): string {
  return COMPTE_VERSEMENT_MAPPING[typeCompte] || "Versement Courant";
}

/**
 * Obtient le type d'opération de retrait pour un type de compte
 */
export function getRetraitOperation(typeCompte: string): string {
  return COMPTE_RETRAIT_MAPPING[typeCompte] || "Retrait Courant";
}

// ============================================================================
// SENS COMPTABLE POUR MOUVEMENTS FINANCIERS
// ============================================================================

export type SensMouvement = "Débit" | "Crédit";

/**
 * Détermine le sens du mouvement financier pour le ledger
 *
 * Convention:
 * - Crédit = Argent qui entre (perspective institution)
 * - Débit = Argent qui sort (perspective institution)
 */
export function getSensMouvement(typeOperation: string): SensMouvement {
  if (isOutgoingOperation(typeOperation)) {
    return "Débit"; // Argent sort de l'institution
  }
  return "Crédit"; // Argent entre dans l'institution
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
