/**
 * Credit Workflow State Machine
 *
 * Définition stricte des transitions de statut autorisées pour les crédits.
 * Ce fichier est partagé entre le Backend et le Frontend.
 *
 * Cycle de vie d'un crédit:
 * 1. PENDING - Crédit créé, en attente d'activation après décaissement
 * 2. WAITING_DISBURSEMENT - Crédit approuvé, en attente de décaissement physique (CASH)
 * 3. ACTIVE - Crédit actif, en cours de remboursement
 * 4. LATE - Échéances impayées
 * 5. PAID - Remboursement complet
 * 6. CLOSED - Crédit fermé (peut être soldé ou en perte)
 * 7. CANCELLED - Crédit annulé avant activation
 */

// ============================================================================
// STATUT CREDIT - VALEURS
// ============================================================================

export const CreditStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  LATE: "LATE",
  PAID: "PAID",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  WAITING_DISBURSEMENT: "WAITING_DISBURSEMENT",
} as const;

export type CreditStatusType = typeof CreditStatus[keyof typeof CreditStatus];

// ============================================================================
// TRANSITIONS AUTORISÉES
// ============================================================================

/**
 * Définition des transitions autorisées pour chaque statut
 */
export const CREDIT_TRANSITIONS: Record<CreditStatusType, readonly CreditStatusType[]> = {
  /**
   * PENDING
   * - Peut être activé après décaissement automatique (compte)
   * - Peut passer en attente de décaissement (caisse)
   * - Peut être annulé si le décaissement n'a pas lieu
   */
  [CreditStatus.PENDING]: [
    CreditStatus.ACTIVE,
    CreditStatus.WAITING_DISBURSEMENT,
    CreditStatus.CANCELLED,
  ],

  /**
   * WAITING_DISBURSEMENT
   * - Peut être activé quand le caissier effectue le paiement
   * - Peut être annulé si le client ne se présente pas
   */
  [CreditStatus.WAITING_DISBURSEMENT]: [
    CreditStatus.ACTIVE,
    CreditStatus.CANCELLED,
  ],

  /**
   * ACTIVE
   * - Peut passer en retard si échéances impayées
   * - Peut être soldé si remboursement complet
   * - Peut être clôturé (fin de contrat, perte, etc.)
   */
  [CreditStatus.ACTIVE]: [
    CreditStatus.LATE,
    CreditStatus.PAID,
    CreditStatus.CLOSED,
  ],

  /**
   * LATE
   * - Peut revenir actif si régularisation
   * - Peut être soldé si paiement intégral
   * - Peut être clôturé (passage en perte)
   */
  [CreditStatus.LATE]: [
    CreditStatus.ACTIVE,
    CreditStatus.PAID,
    CreditStatus.CLOSED,
  ],

  /**
   * PAID
   * - Peut être clôturé pour archivage
   */
  [CreditStatus.PAID]: [
    CreditStatus.CLOSED,
  ],

  /** CLOSED - État terminal */
  [CreditStatus.CLOSED]: [],

  /** CANCELLED - État terminal */
  [CreditStatus.CANCELLED]: [],
} as const;

// ============================================================================
// HELPERS DE VALIDATION
// ============================================================================

/**
 * Vérifie si une transition est autorisée
 */
export function canTransitionCredit(from: CreditStatusType, to: CreditStatusType): boolean {
  if (from === to) return true;
  return CREDIT_TRANSITIONS[from].includes(to);
}

/**
 * Valide une transition et lance une erreur si interdite
 */
export function validateCreditTransition(from: string, to: string): void {
  const fromStatus = from as CreditStatusType;
  const toStatus = to as CreditStatusType;

  if (fromStatus === toStatus) return;

  if (!canTransitionCredit(fromStatus, toStatus)) {
    const allowedTargets = CREDIT_TRANSITIONS[fromStatus]?.join(", ") || "aucun";
    throw new CreditTransitionError(
      `Transition interdite: "${fromStatus}" → "${toStatus}". Transitions autorisées: [${allowedTargets}]`,
      fromStatus,
      toStatus
    );
  }
}

/**
 * Normalise un statut (rétrocompatibilité simple)
 */
export function normalizeCreditStatus(status: string): CreditStatusType {
  if (Object.values(CreditStatus).includes(status as CreditStatusType)) {
    return status as CreditStatusType;
  }
  console.warn(`[CreditWorkflow] Unknown status: ${status}, defaulting to PENDING`);
  return CreditStatus.PENDING;
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
// METADATA UI
// ============================================================================

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
  [CreditStatus.WAITING_DISBURSEMENT]: {
    label: "En attente décaissement",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    icon: "Wallet",
    description: "Crédit approuvé, en attente de décaissement physique à la caisse",
  },
};

/**
 * Retourne les transitions possibles depuis un statut donné
 */
export function getAvailableCreditTransitions(currentStatus: CreditStatusType): Array<{
  status: CreditStatusType;
  label: string;
  description: string;
}> {
  return CREDIT_TRANSITIONS[currentStatus].map(status => ({
    status,
    label: CREDIT_STATUS_METADATA[status].label,
    description: CREDIT_STATUS_METADATA[status].description,
  }));
}

/**
 * Vérifie si un crédit est dans un état terminal
 */
export function isCreditTerminal(status: CreditStatusType): boolean {
  return CREDIT_TRANSITIONS[status].length === 0;
}

/**
 * Vérifie si un crédit est actif (remboursements en cours)
 */
export function isCreditActive(status: CreditStatusType): boolean {
  return status === CreditStatus.ACTIVE || status === CreditStatus.LATE;
}
