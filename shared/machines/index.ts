/**
 * State Machines Index
 *
 * Ce module exporte toutes les machines à états pour les workflows métier.
 * Utilisable côté Backend et Frontend.
 */

// Credit workflow (for existing credits)
export {
  CreditStatus,
  type CreditStatusType,
  CREDIT_TRANSITIONS,
  CREDIT_STATUS_METADATA,
  normalizeCreditStatus,
  canTransitionCredit,
  validateCreditTransition,
  CreditTransitionError,
  getAvailableCreditTransitions,
  isCreditTerminal,
  isCreditActive,
} from "./credit-workflow";

// Demande workflow (for credit applications)
export {
  DemandeStatus,
  type DemandeStatusType,
  DEMANDE_STATUS_FR_TO_EN,
  DEMANDE_STATUS_EN_TO_FR,
  DEMANDE_TRANSITIONS,
  DEMANDE_STATUS_METADATA,
  normalizeDemandeStatus,
  canTransitionDemande,
  validateDemandeTransition,
  DemandeTransitionError,
  getAvailableDemandeTransitions,
  isDemandeTerminal,
  canReevaluateDemande,
  isDemandeApproved,
  isDemandeInInvestigation,
} from "./demande-workflow";
