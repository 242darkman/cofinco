/**
 * Credit Workflow State Machine
 *
 * Définition stricte des transitions de statut autorisées pour les crédits.
 * Ce fichier est partagé entre le Backend et le Frontend.
 *
 * Convention:
 * - Les valeurs EN sont la cible (nouvelles valeurs standardisées)
 * - Les valeurs FR sont supportées pour rétro-compatibilité (legacy)
 *
 * Cycle de vie d'un crédit:
 * 1. PENDING (En attente) - Crédit créé, en attente d'activation après décaissement
 * 2. ACTIVE (Actif) - Crédit actif, en cours de remboursement
 * 3. LATE (En retard) - Échéances impayées
 * 4. PAID (Soldé) - Remboursement complet
 * 5. CLOSED (Clôturé) - Crédit fermé (peut être soldé ou en perte)
 * 6. CANCELLED (Annulé) - Crédit annulé avant activation
 */

// ============================================================================
// STATUT CREDIT - VALEURS
// ============================================================================

/**
 * Statuts de crédit en anglais (cible standardisée)
 */
export const CreditStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  LATE: "LATE",
  PAID: "PAID",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type CreditStatusType = typeof CreditStatus[keyof typeof CreditStatus];

/**
 * Mapping FR -> EN pour rétro-compatibilité
 * Les valeurs françaises actuellement en base de données
 */
export const CREDIT_STATUS_FR_TO_EN: Record<string, CreditStatusType> = {
  "En attente": CreditStatus.PENDING,
  "Actif": CreditStatus.ACTIVE,
  "En retard": CreditStatus.LATE,
  "Soldé": CreditStatus.PAID,
  "Clôturé": CreditStatus.CLOSED,
  "Annulé": CreditStatus.CANCELLED,
};

/**
 * Mapping EN -> FR pour affichage
 */
export const CREDIT_STATUS_EN_TO_FR: Record<CreditStatusType, string> = {
  [CreditStatus.PENDING]: "En attente",
  [CreditStatus.ACTIVE]: "Actif",
  [CreditStatus.LATE]: "En retard",
  [CreditStatus.PAID]: "Soldé",
  [CreditStatus.CLOSED]: "Clôturé",
  [CreditStatus.CANCELLED]: "Annulé",
};

/**
 * Normalise un statut (FR ou EN) vers la valeur EN standardisée
 */
export function normalizeCreditStatus(status: string): CreditStatusType {
  // Déjà en EN ?
  if (Object.values(CreditStatus).includes(status as CreditStatusType)) {
    return status as CreditStatusType;
  }
  // Conversion FR -> EN
  const normalized = CREDIT_STATUS_FR_TO_EN[status];
  if (normalized) {
    return normalized;
  }
  // Fallback: retourner tel quel (peut causer une erreur de validation plus tard)
  console.warn(`[CreditWorkflow] Unknown status: ${status}, defaulting to PENDING`);
  return CreditStatus.PENDING;
}

// ============================================================================
// TRANSITIONS AUTORISÉES
// ============================================================================

/**
 * Définition des transitions autorisées pour chaque statut
 *
 * Format: { [fromStatus]: [allowedTargetStatuses] }
 */
export const CREDIT_TRANSITIONS: Record<CreditStatusType, readonly CreditStatusType[]> = {
  /**
   * PENDING (En attente)
   * - Peut être activé après décaissement
   * - Peut être annulé si le décaissement n'a pas lieu
   */
  [CreditStatus.PENDING]: [
    CreditStatus.ACTIVE,     // Décaissement effectué
    CreditStatus.CANCELLED,  // Annulation avant décaissement
  ],

  /**
   * ACTIVE (Actif)
   * - Peut passer en retard si échéances impayées
   * - Peut être soldé si remboursement complet
   * - Peut être clôturé (fin de contrat, perte, etc.)
   */
  [CreditStatus.ACTIVE]: [
    CreditStatus.LATE,   // Retard de paiement
    CreditStatus.PAID,   // Remboursement complet
    CreditStatus.CLOSED, // Clôture (perte, radiation, etc.)
  ],

  /**
   * LATE (En retard)
   * - Peut revenir actif si régularisation
   * - Peut être soldé si paiement intégral
   * - Peut être clôturé (passage en perte)
   */
  [CreditStatus.LATE]: [
    CreditStatus.ACTIVE, // Régularisation des arriérés
    CreditStatus.PAID,   // Remboursement complet
    CreditStatus.CLOSED, // Passage en perte / radiation
  ],

  /**
   * PAID (Soldé)
   * - Peut être clôturé pour archivage
   * - État quasi-terminal
   */
  [CreditStatus.PAID]: [
    CreditStatus.CLOSED, // Archivage final
  ],

  /**
   * CLOSED (Clôturé)
   * - État terminal, aucune transition possible
   */
  [CreditStatus.CLOSED]: [],

  /**
   * CANCELLED (Annulé)
   * - État terminal, aucune transition possible
   */
  [CreditStatus.CANCELLED]: [],
} as const;

// ============================================================================
// HELPERS DE VALIDATION
// ============================================================================

/**
 * Vérifie si une transition est autorisée
 *
 * @param from - Statut actuel (FR ou EN)
 * @param to - Statut cible (FR ou EN)
 * @returns true si la transition est autorisée
 */
export function canTransitionCredit(from: string, to: string): boolean {
  const normalizedFrom = normalizeCreditStatus(from);
  const normalizedTo = normalizeCreditStatus(to);

  // Même statut = pas de transition nécessaire
  if (normalizedFrom === normalizedTo) {
    return true;
  }

  const allowedTransitions = CREDIT_TRANSITIONS[normalizedFrom];
  return allowedTransitions.includes(normalizedTo);
}

/**
 * Valide une transition et lance une erreur si interdite
 *
 * @param from - Statut actuel (FR ou EN)
 * @param to - Statut cible (FR ou EN)
 * @throws Error si la transition est interdite
 */
export function validateCreditTransition(from: string, to: string): void {
  const normalizedFrom = normalizeCreditStatus(from);
  const normalizedTo = normalizeCreditStatus(to);

  // Même statut = OK
  if (normalizedFrom === normalizedTo) {
    return;
  }

  if (!canTransitionCredit(normalizedFrom, normalizedTo)) {
    const fromLabel = CREDIT_STATUS_EN_TO_FR[normalizedFrom] || normalizedFrom;
    const toLabel = CREDIT_STATUS_EN_TO_FR[normalizedTo] || normalizedTo;
    const allowedTargets = CREDIT_TRANSITIONS[normalizedFrom]
      .map(s => CREDIT_STATUS_EN_TO_FR[s] || s)
      .join(", ") || "aucun";

    throw new CreditTransitionError(
      `Transition interdite: "${fromLabel}" → "${toLabel}". ` +
      `Transitions autorisées depuis "${fromLabel}": [${allowedTargets}]`,
      normalizedFrom,
      normalizedTo
    );
  }
}

/**
 * Erreur personnalisée pour les transitions interdites
 */
export class CreditTransitionError extends Error {
  public readonly code = "CREDIT_TRANSITION_ERROR";
  public readonly statusCode = 400;

  constructor(
    message: string,
    public readonly fromStatus: CreditStatusType,
    public readonly toStatus: CreditStatusType
  ) {
    super(message);
    this.name = "CreditTransitionError";
  }
}

// ============================================================================
// METADATA & HELPERS UI
// ============================================================================

/**
 * Métadonnées pour chaque statut (couleurs, icônes, etc.)
 */
export const CREDIT_STATUS_METADATA: Record<CreditStatusType, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}> = {
  [CreditStatus.PENDING]: {
    label: "En attente",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    icon: "Clock",
    description: "Crédit en attente d'activation après décaissement",
  },
  [CreditStatus.ACTIVE]: {
    label: "Actif",
    color: "text-green-700",
    bgColor: "bg-green-100",
    icon: "CheckCircle",
    description: "Crédit actif, en cours de remboursement",
  },
  [CreditStatus.LATE]: {
    label: "En retard",
    color: "text-red-700",
    bgColor: "bg-red-100",
    icon: "AlertTriangle",
    description: "Échéances impayées, client en retard",
  },
  [CreditStatus.PAID]: {
    label: "Soldé",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    icon: "CheckCircle2",
    description: "Crédit intégralement remboursé",
  },
  [CreditStatus.CLOSED]: {
    label: "Clôturé",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
    icon: "Archive",
    description: "Crédit clôturé et archivé",
  },
  [CreditStatus.CANCELLED]: {
    label: "Annulé",
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    icon: "XCircle",
    description: "Crédit annulé avant activation",
  },
};

/**
 * Retourne les transitions possibles depuis un statut donné
 */
export function getAvailableCreditTransitions(currentStatus: string): Array<{
  status: CreditStatusType;
  label: string;
  description: string;
}> {
  const normalized = normalizeCreditStatus(currentStatus);
  const transitions = CREDIT_TRANSITIONS[normalized];

  return transitions.map(status => ({
    status,
    label: CREDIT_STATUS_METADATA[status].label,
    description: CREDIT_STATUS_METADATA[status].description,
  }));
}

/**
 * Vérifie si un crédit est dans un état terminal
 */
export function isCreditTerminal(status: string): boolean {
  const normalized = normalizeCreditStatus(status);
  return CREDIT_TRANSITIONS[normalized].length === 0;
}

/**
 * Vérifie si un crédit est actif (remboursements en cours)
 */
export function isCreditActive(status: string): boolean {
  const normalized = normalizeCreditStatus(status);
  return normalized === CreditStatus.ACTIVE || normalized === CreditStatus.LATE;
}
