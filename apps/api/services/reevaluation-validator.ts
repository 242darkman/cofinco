/**
 * Reevaluation Validation Service
 * 
 * Contains all business rules for validating reevaluation eligibility and state transitions.
 */

import { differenceInDays, addDays } from 'date-fns';
import { DemandeCredit, ConfigReevaluation, ReevaluationCredit } from '@shared/schema/finance';
import {
  StatutDemande,
  StatutReevaluation,
} from "@shared/enum/status-constants";

// Type definitions
export interface ValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
  details?: Record<string, any>;
}

export interface ElementNouveau {
  type: string;
  description: string;
  valeurAjoutee?: number;
  documents?: string[];
}

export interface CreateReevaluationPayload {
  elementsNouveaux: ElementNouveau[];
  justification: string;
  nouveauMontantDemande?: number;
  nouvelleDureeValeur?: number;
  nouvelleDureeUnite?: string;
  nouvelleFrequence?: string;
  garantiesAdditionnelles?: Array<{
    type: string;
    description: string;
    valeurEstimee: number;
    documents?: string[];
  }>;
  coEmprunteur?: {
    clientId?: string;
    nom?: string;
    relation: string;
    revenusMensuels: number;
    consentement: boolean;
  };
  documentsJoints?: string[];
}

/**
 * All validation rules for reevaluation workflow
 */
export const REEVALUATION_RULES = {
  /**
   * Rule 1: Demande must be in "Rejetée" status (or "Réévaluation en cours" if already created)
   */
  validateDemandeStatus: (demande: DemandeCredit): ValidationResult => {
    // Statuts valides pour une réévaluation:
    // - "Rejetée": état initial permettant de créer une réévaluation
    // - "Réévaluation en cours": réévaluation déjà créée (validation/processing en cours)
    const statutsValides = [StatutDemande.REJECTED, StatutDemande.REEVALUATION_IN_PROGRESS];
    if (!statutsValides.includes(demande.statut as typeof statutsValides[number])) {
      return {
        valid: false,
        code: 'DEMANDE_NOT_REJECTED',
        message: `La demande doit être au statut "Rejetée" pour créer une réévaluation. Statut actuel: ${demande.statut}`
      };
    }
    return { valid: true };
  },

  /**
   * Rule 2: Minimum delay since rejection
   */
  validateDelaiMinimum: (dateRejet: Date | null, config: ConfigReevaluation): ValidationResult => {
    if (!dateRejet) {
      return {
        valid: false,
        code: 'DATE_REJET_MANQUANTE',
        message: 'La date de rejet est manquante'
      };
    }

    const joursDepuisRejet = differenceInDays(new Date(), dateRejet);
    if (joursDepuisRejet < config.delaiMinimumJours) {
      return {
        valid: false,
        code: 'DELAI_NON_RESPECTE',
        message: `Délai minimum de ${config.delaiMinimumJours} jours requis. Jours écoulés: ${joursDepuisRejet}`,
        details: {
          joursRequis: config.delaiMinimumJours,
          joursEcoules: joursDepuisRejet,
          dateEligibilite: addDays(dateRejet, config.delaiMinimumJours)
        }
      };
    }
    return { valid: true };
  },

  /**
   * Rule 3: Maximum number of reevaluations not exceeded
   */
  validateNombreMax: (demande: DemandeCredit, config: ConfigReevaluation): ValidationResult => {
    const nombreActuel = demande.nombreReevaluations ?? 0;
    if (nombreActuel >= config.maxReevaluationsParDemande) {
      return {
        valid: false,
        code: 'MAX_REEVALUATIONS_REACHED',
        message: `Nombre maximum de réévaluations atteint (${config.maxReevaluationsParDemande})`,
        details: {
          nombreActuel,
          maxAutorise: config.maxReevaluationsParDemande
        }
      };
    }
    return { valid: true };
  },

  /**
   * Rule 4: Rejection motif is not blacklisted
   */
  validateMotifReevaluable: (motifRejet: string | null, config: ConfigReevaluation): ValidationResult => {
    if (!motifRejet) {
      return { valid: true }; // No motif to check
    }
    
    const motifsBlacklistes = config.motifsNonReevaluables || [];
    const motifNormalise = motifRejet.toLowerCase().trim();
    
    for (const motifInterdit of motifsBlacklistes) {
      if (motifNormalise.includes(motifInterdit.toLowerCase())) {
        return {
          valid: false,
          code: 'MOTIF_NON_REEVALUABLE',
          message: `Le motif de rejet "${motifRejet}" ne permet pas de réévaluation`,
          details: {
            motifRejet,
            motifInterditDetecte: motifInterdit
          }
        };
      }
    }
    return { valid: true };
  },

  /**
   * Rule 5: No reevaluation already in progress
   */
  validatePasDeReevaluationEnCours: (demande: DemandeCredit): ValidationResult => {
    if (demande.reevaluationEnCours) {
      return {
        valid: false,
        code: 'REEVALUATION_EN_COURS',
        message: 'Une réévaluation est déjà en cours pour cette demande'
      };
    }
    return { valid: true };
  },

  /**
   * Rule 6: Fees must not have been refunded (or must be repaid if refunded)
   */
  validateFraisNonRembourses: (
    demande: DemandeCredit,
    hasRefundPaid: boolean
  ): ValidationResult => {
    // If a refund was paid and fees are not yet repaid, block reevaluation
    if (hasRefundPaid && !demande.fraisEngagementPayes) {
      return {
        valid: false,
        code: 'FRAIS_REMBOURSES_NON_REPAYES',
        message: 'Les frais de dossier ont été remboursés et doivent être repayés avant de pouvoir effectuer une réévaluation'
      };
    }
    return { valid: true };
  },

  /**
   * Rule 7: New elements are required
   */
  validateElementsNouveaux: (
    elementsNouveaux: ElementNouveau[] | undefined, 
    config: ConfigReevaluation
  ): ValidationResult => {
    if (config.elementsNouveauxObligatoires && (!elementsNouveaux || elementsNouveaux.length === 0)) {
      return {
        valid: false,
        code: 'ELEMENTS_NOUVEAUX_REQUIS',
        message: 'Au moins un élément nouveau doit être fourni pour justifier la réévaluation'
      };
    }
    return { valid: true };
  },

  /**
   * Rule 8: Justification minimum length
   */
  validateJustification: (justification: string | undefined): ValidationResult => {
    const MIN_LENGTH = 10;
    const length = justification?.trim().length || 0;
    
    if (length < MIN_LENGTH) {
      return {
        valid: false,
        code: 'JUSTIFICATION_TROP_COURTE',
        message: `La justification doit contenir au moins ${MIN_LENGTH} caractères`,
        details: {
          longueurActuelle: length,
          longueurMinimale: MIN_LENGTH
        }
      };
    }
    return { valid: true };
  },

  /**
   * Rule 9: Minimum number of documents
   */
  validateDocuments: (documents: string[] | undefined, config: ConfigReevaluation): ValidationResult => {
    const nbDocuments = documents?.length || 0;
    if (nbDocuments < config.documentsMinimum) {
      return {
        valid: false,
        code: 'DOCUMENTS_INSUFFISANTS',
        message: `Au moins ${config.documentsMinimum} document(s) requis`,
        details: {
          documentsRequis: config.documentsMinimum,
          documentsFournis: nbDocuments
        }
      };
    }
    return { valid: true };
  },

  /**
   * Rule 10: Reevaluation is not locked
   */
  validateNonVerrouille: (reevaluation: ReevaluationCredit): ValidationResult => {
    if (reevaluation.verrouille) {
      return {
        valid: false,
        code: 'REEVALUATION_VERROUILLEE',
        message: 'Cette réévaluation est verrouillée et ne peut plus être modifiée',
        details: {
          dateVerrouillage: reevaluation.dateVerrouillage
        }
      };
    }
    return { valid: true };
  },

  /**
   * Rule 11: Valid state transitions
   */
  validateTransition: (
    statutActuel: string,
    nouveauStatut: string
  ): ValidationResult => {
    const transitionsPermises: Record<string, string[]> = {
      [StatutReevaluation.REQUESTED]: [StatutReevaluation.ELIGIBILITY_CHECK, StatutReevaluation.CANCELLED],
      [StatutReevaluation.ELIGIBILITY_CHECK]: [StatutReevaluation.AUTHORIZED, StatutReevaluation.REFUSED],
      [StatutReevaluation.AUTHORIZED]: [StatutReevaluation.ADDITIONAL_INVESTIGATION, StatutReevaluation.IN_COMMITTEE, StatutReevaluation.CANCELLED],
      [StatutReevaluation.ADDITIONAL_INVESTIGATION]: [StatutReevaluation.INVESTIGATION_COMPLETE, StatutReevaluation.CANCELLED],
      [StatutReevaluation.INVESTIGATION_COMPLETE]: [StatutReevaluation.IN_COMMITTEE, StatutReevaluation.CANCELLED],
      [StatutReevaluation.IN_COMMITTEE]: [StatutReevaluation.APPROVED, StatutReevaluation.DEFINITIVELY_REJECTED],
      [StatutReevaluation.REFUSED]: [], // Terminal state
      [StatutReevaluation.APPROVED]: [], // Terminal state
      [StatutReevaluation.DEFINITIVELY_REJECTED]: [], // Terminal state
      [StatutReevaluation.CANCELLED]: [] // Terminal state
    };

    const permises = transitionsPermises[statutActuel] || [];
    if (!permises.includes(nouveauStatut)) {
      return {
        valid: false,
        code: 'TRANSITION_INVALIDE',
        message: `Transition de "${statutActuel}" vers "${nouveauStatut}" non autorisée`,
        details: {
          statutActuel,
          nouveauStatut,
          transitionsPermises: permises
        }
      };
    }
    return { valid: true };
  }
};

/**
 * Validates all rules for creating a new reevaluation
 */
export async function validateReevaluationCreation(
  demande: DemandeCredit,
  config: ConfigReevaluation,
  payload: CreateReevaluationPayload,
  hasRefundPaid: boolean = false
): Promise<{ valid: boolean; errors: ValidationResult[] }> {
  const errors: ValidationResult[] = [];

  // Apply all rules
  const rules = [
    () => REEVALUATION_RULES.validateDemandeStatus(demande),
    () => REEVALUATION_RULES.validateDelaiMinimum(demande.dateRejet, config),
    () => REEVALUATION_RULES.validateNombreMax(demande, config),
    () => REEVALUATION_RULES.validateMotifReevaluable(demande.motifRejet, config),
    () => REEVALUATION_RULES.validatePasDeReevaluationEnCours(demande),
    () => REEVALUATION_RULES.validateFraisNonRembourses(demande, hasRefundPaid),
    () => REEVALUATION_RULES.validateElementsNouveaux(payload.elementsNouveaux, config),
    () => REEVALUATION_RULES.validateJustification(payload.justification),
    () => REEVALUATION_RULES.validateDocuments(payload.documentsJoints, config),
  ];

  for (const rule of rules) {
    const result = rule();
    if (!result.valid) {
      errors.push(result);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Quick eligibility check (returns summary for UI display)
 */
export function checkEligibilityQuick(
  demande: DemandeCredit,
  config: ConfigReevaluation,
  hasRefundPaid: boolean = false
): {
  estEligible: boolean;
  delaiOk: boolean;
  nombreOk: boolean;
  motifBlackliste: boolean;
  reevaluationEnCours: boolean;
  fraisRemboursesNonRepayes: boolean;
  joursDepuisRejet: number;
  delaiMinimum: number;
  nombreReevaluations: number;
  maxAutorise: number;
  motifRefus?: string;
} {
  const joursDepuisRejet = demande.dateRejet
    ? differenceInDays(new Date(), demande.dateRejet)
    : 0;

  const delaiOk = joursDepuisRejet >= config.delaiMinimumJours;
  const nombreOk = (demande.nombreReevaluations ?? 0) < config.maxReevaluationsParDemande;

  const motifBlackliste = demande.motifRejet
    ? (config.motifsNonReevaluables || []).some(m =>
        demande.motifRejet!.toLowerCase().includes(m.toLowerCase())
      )
    : false;

  const reevaluationEnCours = demande.reevaluationEnCours ?? false;

  // Check if fees were refunded and not repaid
  const fraisRemboursesNonRepayes = hasRefundPaid && !demande.fraisEngagementPayes;

  // Status check: for reevaluation validation, the status can be either 'Rejetée' (initial)
  // or 'Réévaluation en cours' (after reevaluation was created)
  const statutValide = demande.statut === StatutDemande.REJECTED || demande.statut === StatutDemande.REEVALUATION_IN_PROGRESS;

  const estEligible =
    statutValide &&
    delaiOk &&
    nombreOk &&
    !motifBlackliste &&
    !reevaluationEnCours &&
    !fraisRemboursesNonRepayes;

  // Determine refusal reason
  let motifRefus: string | undefined;
  if (!delaiOk) {
    motifRefus = `Délai minimum de ${config.delaiMinimumJours} jours non atteint`;
  } else if (!nombreOk) {
    motifRefus = `Nombre maximum de réévaluations atteint (${config.maxReevaluationsParDemande})`;
  } else if (motifBlackliste) {
    motifRefus = 'Le motif de rejet ne permet pas de réévaluation';
  } else if (reevaluationEnCours) {
    motifRefus = 'Une réévaluation est déjà en cours';
  } else if (fraisRemboursesNonRepayes) {
    motifRefus = 'Les frais de dossier ont été remboursés et doivent être repayés';
  }

  return {
    estEligible,
    delaiOk,
    nombreOk,
    motifBlackliste,
    reevaluationEnCours,
    fraisRemboursesNonRepayes,
    joursDepuisRejet,
    delaiMinimum: config.delaiMinimumJours,
    nombreReevaluations: demande.nombreReevaluations ?? 0,
    maxAutorise: config.maxReevaluationsParDemande,
    motifRefus
  };
}
