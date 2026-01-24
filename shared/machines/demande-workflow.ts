/**
 * Demande Credit Workflow State Machine
 *
 * Définition stricte des transitions de statut autorisées pour les demandes de crédit.
 * Ce fichier est partagé entre le Backend et le Frontend.
 *
 * Cycle de vie d'une demande de crédit:
 * 1. PENDING_FEES (En attente) - Demande créée, attente paiement frais d'engagement
 * 2. READY_FOR_INVESTIGATION (A enquêter) - Frais payés, prête pour enquête terrain
 * 3. UNDER_INVESTIGATION (En enquête) - Enquête terrain en cours
 * 4. INVESTIGATION_COMPLETE (Enquête terminée) - Enquête soumise, attente validation
 * 5. APPROVED (Approuvée) - Demande approuvée, prête pour décaissement
 * 6. REJECTED (Rejetée) - Demande rejetée
 * 7. CANCELLED (Annulée) - Demande annulée par le client
 * 8. DISBURSED (Décaissée) - Fonds décaissés, crédit créé
 * 9. CLOSED (Clôturée) - Demande archivée
 *
 * États de réévaluation:
 * 10. REEVALUATION_IN_PROGRESS - Réévaluation en cours après rejet initial
 * 11. APPROVED_AFTER_REEVALUATION - Approuvée après réévaluation
 * 12. DEFINITIVELY_REJECTED - Rejetée définitivement (plus de réévaluation possible)
 */

// ============================================================================
// STATUT DEMANDE - VALEURS
// ============================================================================

/**
 * Statuts de demande en anglais (cible standardisée)
 */
export const DemandeStatus = {
  PENDING_FEES: "PENDING_FEES",
  READY_FOR_INVESTIGATION: "READY_FOR_INVESTIGATION",
  UNDER_INVESTIGATION: "UNDER_INVESTIGATION",
  INVESTIGATION_COMPLETE: "INVESTIGATION_COMPLETE",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  DISBURSED: "DISBURSED",
  CLOSED: "CLOSED",
  // Réévaluation workflow
  REEVALUATION_IN_PROGRESS: "REEVALUATION_IN_PROGRESS",
  APPROVED_AFTER_REEVALUATION: "APPROVED_AFTER_REEVALUATION",
  DEFINITIVELY_REJECTED: "DEFINITIVELY_REJECTED",
} as const;

export type DemandeStatusType = typeof DemandeStatus[keyof typeof DemandeStatus];

/**
 * Mapping FR -> EN pour rétro-compatibilité
 */
export const DEMANDE_STATUS_FR_TO_EN: Record<string, DemandeStatusType> = {
  "En attente": DemandeStatus.PENDING_FEES,
  "A enquêter": DemandeStatus.READY_FOR_INVESTIGATION,
  "En enquête": DemandeStatus.UNDER_INVESTIGATION,
  "Enquête terminée": DemandeStatus.INVESTIGATION_COMPLETE,
  "Approuvée": DemandeStatus.APPROVED,
  "Rejetée": DemandeStatus.REJECTED,
  "Annulée": DemandeStatus.CANCELLED,
  "Décaissée": DemandeStatus.DISBURSED,
  "Clôturée": DemandeStatus.CLOSED,
  "Réévaluation en cours": DemandeStatus.REEVALUATION_IN_PROGRESS,
  "Approuvée après réévaluation": DemandeStatus.APPROVED_AFTER_REEVALUATION,
  "Rejetée définitivement": DemandeStatus.DEFINITIVELY_REJECTED,
};

/**
 * Mapping EN -> FR pour affichage
 */
export const DEMANDE_STATUS_EN_TO_FR: Record<DemandeStatusType, string> = {
  [DemandeStatus.PENDING_FEES]: "En attente",
  [DemandeStatus.READY_FOR_INVESTIGATION]: "A enquêter",
  [DemandeStatus.UNDER_INVESTIGATION]: "En enquête",
  [DemandeStatus.INVESTIGATION_COMPLETE]: "Enquête terminée",
  [DemandeStatus.APPROVED]: "Approuvée",
  [DemandeStatus.REJECTED]: "Rejetée",
  [DemandeStatus.CANCELLED]: "Annulée",
  [DemandeStatus.DISBURSED]: "Décaissée",
  [DemandeStatus.CLOSED]: "Clôturée",
  [DemandeStatus.REEVALUATION_IN_PROGRESS]: "Réévaluation en cours",
  [DemandeStatus.APPROVED_AFTER_REEVALUATION]: "Approuvée après réévaluation",
  [DemandeStatus.DEFINITIVELY_REJECTED]: "Rejetée définitivement",
};

/**
 * Normalise un statut (FR ou EN) vers la valeur EN standardisée
 */
export function normalizeDemandeStatus(status: string): DemandeStatusType {
  // Déjà en EN ?
  if (Object.values(DemandeStatus).includes(status as DemandeStatusType)) {
    return status as DemandeStatusType;
  }
  // Conversion FR -> EN
  const normalized = DEMANDE_STATUS_FR_TO_EN[status];
  if (normalized) {
    return normalized;
  }
  console.warn(`[DemandeWorkflow] Unknown status: ${status}, defaulting to PENDING_FEES`);
  return DemandeStatus.PENDING_FEES;
}

// ============================================================================
// TRANSITIONS AUTORISÉES
// ============================================================================

/**
 * Définition des transitions autorisées pour chaque statut
 */
export const DEMANDE_TRANSITIONS: Record<DemandeStatusType, readonly DemandeStatusType[]> = {
  /**
   * PENDING_FEES (En attente)
   * - Passe à "A enquêter" quand frais payés
   * - Peut être annulée par le client
   */
  [DemandeStatus.PENDING_FEES]: [
    DemandeStatus.READY_FOR_INVESTIGATION, // Frais payés
    DemandeStatus.CANCELLED,               // Annulation client
  ],

  /**
   * READY_FOR_INVESTIGATION (A enquêter)
   * - Passe en enquête quand un agent prend le dossier
   * - Peut être annulée
   * - Peut retourner en attente (remboursement frais exceptionnel)
   */
  [DemandeStatus.READY_FOR_INVESTIGATION]: [
    DemandeStatus.UNDER_INVESTIGATION, // Début enquête
    DemandeStatus.CANCELLED,           // Annulation
    DemandeStatus.PENDING_FEES,        // Retour (cas exceptionnel)
  ],

  /**
   * UNDER_INVESTIGATION (En enquête)
   * - Passe à "Enquête terminée" quand rapport soumis
   * - Peut retourner à "A enquêter" si complément nécessaire
   * - Peut être annulée
   */
  [DemandeStatus.UNDER_INVESTIGATION]: [
    DemandeStatus.INVESTIGATION_COMPLETE, // Rapport soumis
    DemandeStatus.READY_FOR_INVESTIGATION, // Retour pour complément
    DemandeStatus.CANCELLED,               // Annulation
  ],

  /**
   * INVESTIGATION_COMPLETE (Enquête terminée)
   * - Peut être approuvée par le comité
   * - Peut être rejetée
   * - Peut retourner en enquête si complément nécessaire
   */
  [DemandeStatus.INVESTIGATION_COMPLETE]: [
    DemandeStatus.APPROVED,                // Approbation
    DemandeStatus.REJECTED,                // Rejet
    DemandeStatus.UNDER_INVESTIGATION,     // Retour enquête (complément)
  ],

  /**
   * APPROVED (Approuvée)
   * - Peut être décaissée
   * - Peut être rejetée (révision commission)
   * - Peut être annulée (abandon client)
   * - Peut être clôturée sans décaissement (expiration)
   */
  [DemandeStatus.APPROVED]: [
    DemandeStatus.DISBURSED,  // Décaissement
    DemandeStatus.REJECTED,   // Rejet par commission (révision)
    DemandeStatus.CANCELLED,  // Abandon client
    DemandeStatus.CLOSED,     // Expiration
  ],

  /**
   * REJECTED (Rejetée)
   * - Peut passer en réévaluation si le client apporte des éléments
   * - Peut être clôturée (archivage)
   * - Peut être rejetée définitivement
   */
  [DemandeStatus.REJECTED]: [
    DemandeStatus.REEVALUATION_IN_PROGRESS, // Demande de réévaluation
    DemandeStatus.CLOSED,                    // Archivage
    DemandeStatus.DEFINITIVELY_REJECTED,     // Rejet définitif
  ],

  /**
   * CANCELLED (Annulée)
   * - État terminal, peut être clôturée pour archivage
   */
  [DemandeStatus.CANCELLED]: [
    DemandeStatus.CLOSED, // Archivage
  ],

  /**
   * DISBURSED (Décaissée)
   * - État quasi-terminal, crédit créé
   * - Peut être clôturée pour archivage
   */
  [DemandeStatus.DISBURSED]: [
    DemandeStatus.CLOSED, // Archivage
  ],

  /**
   * CLOSED (Clôturée)
   * - État terminal, aucune transition possible
   */
  [DemandeStatus.CLOSED]: [],

  // ====== WORKFLOW RÉÉVALUATION ======

  /**
   * REEVALUATION_IN_PROGRESS (Réévaluation en cours)
   * - Peut être approuvée après réévaluation
   * - Peut être rejetée définitivement
   * - Peut être annulée
   */
  [DemandeStatus.REEVALUATION_IN_PROGRESS]: [
    DemandeStatus.APPROVED_AFTER_REEVALUATION, // Approbation post-rééval
    DemandeStatus.DEFINITIVELY_REJECTED,        // Rejet final
    DemandeStatus.CANCELLED,                    // Annulation
  ],

  /**
   * APPROVED_AFTER_REEVALUATION (Approuvée après réévaluation)
   * - Mêmes transitions qu'une approbation normale
   */
  [DemandeStatus.APPROVED_AFTER_REEVALUATION]: [
    DemandeStatus.DISBURSED,  // Décaissement
    DemandeStatus.CANCELLED,  // Abandon
    DemandeStatus.CLOSED,     // Expiration
  ],

  /**
   * DEFINITIVELY_REJECTED (Rejetée définitivement)
   * - État terminal, peut être clôturée
   */
  [DemandeStatus.DEFINITIVELY_REJECTED]: [
    DemandeStatus.CLOSED, // Archivage final
  ],
} as const;

// ============================================================================
// HELPERS DE VALIDATION
// ============================================================================

/**
 * Vérifie si une transition est autorisée
 */
export function canTransitionDemande(from: string, to: string): boolean {
  const normalizedFrom = normalizeDemandeStatus(from);
  const normalizedTo = normalizeDemandeStatus(to);

  if (normalizedFrom === normalizedTo) {
    return true;
  }

  const allowedTransitions = DEMANDE_TRANSITIONS[normalizedFrom];
  return allowedTransitions.includes(normalizedTo);
}

/**
 * Valide une transition et lance une erreur si interdite
 */
export function validateDemandeTransition(from: string, to: string): void {
  const normalizedFrom = normalizeDemandeStatus(from);
  const normalizedTo = normalizeDemandeStatus(to);

  if (normalizedFrom === normalizedTo) {
    return;
  }

  if (!canTransitionDemande(normalizedFrom, normalizedTo)) {
    const fromLabel = DEMANDE_STATUS_EN_TO_FR[normalizedFrom] || normalizedFrom;
    const toLabel = DEMANDE_STATUS_EN_TO_FR[normalizedTo] || normalizedTo;
    const allowedTargets = DEMANDE_TRANSITIONS[normalizedFrom]
      .map(s => DEMANDE_STATUS_EN_TO_FR[s] || s)
      .join(", ") || "aucun";

    throw new DemandeTransitionError(
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
export class DemandeTransitionError extends Error {
  public readonly code = "DEMANDE_TRANSITION_ERROR";
  public readonly statusCode = 400;

  constructor(
    message: string,
    public readonly fromStatus: DemandeStatusType,
    public readonly toStatus: DemandeStatusType
  ) {
    super(message);
    this.name = "DemandeTransitionError";
  }
}

// ============================================================================
// METADATA & HELPERS UI
// ============================================================================

/**
 * Métadonnées pour chaque statut
 */
export const DEMANDE_STATUS_METADATA: Record<DemandeStatusType, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
  phase: "submission" | "investigation" | "decision" | "disbursement" | "terminal" | "reevaluation";
}> = {
  [DemandeStatus.PENDING_FEES]: {
    label: "En attente",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    icon: "Clock",
    description: "En attente du paiement des frais d'engagement",
    phase: "submission",
  },
  [DemandeStatus.READY_FOR_INVESTIGATION]: {
    label: "A enquêter",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    icon: "Search",
    description: "Frais payés, prête pour enquête terrain",
    phase: "investigation",
  },
  [DemandeStatus.UNDER_INVESTIGATION]: {
    label: "En enquête",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    icon: "UserSearch",
    description: "Enquête terrain en cours",
    phase: "investigation",
  },
  [DemandeStatus.INVESTIGATION_COMPLETE]: {
    label: "Enquête terminée",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
    icon: "FileCheck",
    description: "Rapport d'enquête soumis, en attente de décision",
    phase: "decision",
  },
  [DemandeStatus.APPROVED]: {
    label: "Approuvée",
    color: "text-green-700",
    bgColor: "bg-green-100",
    icon: "CheckCircle",
    description: "Demande approuvée, prête pour décaissement",
    phase: "disbursement",
  },
  [DemandeStatus.REJECTED]: {
    label: "Rejetée",
    color: "text-red-700",
    bgColor: "bg-red-100",
    icon: "XCircle",
    description: "Demande rejetée par le comité",
    phase: "terminal",
  },
  [DemandeStatus.CANCELLED]: {
    label: "Annulée",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    icon: "Ban",
    description: "Demande annulée par le client",
    phase: "terminal",
  },
  [DemandeStatus.DISBURSED]: {
    label: "Décaissée",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    icon: "Banknote",
    description: "Fonds décaissés, crédit créé",
    phase: "terminal",
  },
  [DemandeStatus.CLOSED]: {
    label: "Clôturée",
    color: "text-gray-700",
    bgColor: "bg-gray-200",
    icon: "Archive",
    description: "Demande archivée",
    phase: "terminal",
  },
  [DemandeStatus.REEVALUATION_IN_PROGRESS]: {
    label: "Réévaluation",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    icon: "RefreshCw",
    description: "Réévaluation en cours suite à rejet",
    phase: "reevaluation",
  },
  [DemandeStatus.APPROVED_AFTER_REEVALUATION]: {
    label: "Approuvée (rééval)",
    color: "text-green-600",
    bgColor: "bg-green-50",
    icon: "CheckCircle2",
    description: "Approuvée après réévaluation",
    phase: "disbursement",
  },
  [DemandeStatus.DEFINITIVELY_REJECTED]: {
    label: "Rejet définitif",
    color: "text-red-800",
    bgColor: "bg-red-200",
    icon: "XOctagon",
    description: "Rejetée définitivement, plus de réévaluation possible",
    phase: "terminal",
  },
};

/**
 * Retourne les transitions possibles depuis un statut donné
 */
export function getAvailableDemandeTransitions(currentStatus: string): Array<{
  status: DemandeStatusType;
  label: string;
  description: string;
}> {
  const normalized = normalizeDemandeStatus(currentStatus);
  const transitions = DEMANDE_TRANSITIONS[normalized];

  return transitions.map(status => ({
    status,
    label: DEMANDE_STATUS_METADATA[status].label,
    description: DEMANDE_STATUS_METADATA[status].description,
  }));
}

/**
 * Vérifie si une demande est dans un état terminal
 */
export function isDemandeTerminal(status: string): boolean {
  const normalized = normalizeDemandeStatus(status);
  return DEMANDE_TRANSITIONS[normalized].length === 0;
}

/**
 * Vérifie si une demande peut être réévaluée
 */
export function canReevaluateDemande(status: string): boolean {
  const normalized = normalizeDemandeStatus(status);
  return normalized === DemandeStatus.REJECTED;
}

/**
 * Vérifie si une demande est en phase d'approbation (peut être décaissée)
 */
export function isDemandeApproved(status: string): boolean {
  const normalized = normalizeDemandeStatus(status);
  return normalized === DemandeStatus.APPROVED ||
         normalized === DemandeStatus.APPROVED_AFTER_REEVALUATION;
}

/**
 * Vérifie si une demande est en phase d'investigation
 */
export function isDemandeInInvestigation(status: string): boolean {
  const normalized = normalizeDemandeStatus(status);
  return normalized === DemandeStatus.READY_FOR_INVESTIGATION ||
         normalized === DemandeStatus.UNDER_INVESTIGATION ||
         normalized === DemandeStatus.INVESTIGATION_COMPLETE;
}
