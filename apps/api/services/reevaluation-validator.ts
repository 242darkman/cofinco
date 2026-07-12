/**
 * Service de validation des réévaluations de crédit.
 *
 * Centralise les règles d'éligibilité et les transitions autorisées afin que
 * les routes et services applicatifs ne dupliquent pas la logique métier.
 */

import { differenceInDays, addDays } from 'date-fns';
import { DemandeCredit, ConfigReevaluation, ReevaluationCredit } from '@shared/schema/finance';
import {
  StatutDemande,
  StatutReevaluation,
} from "@shared/enum/status-constants";
import type {
  CreateReevaluationPayload,
  ElementNouveau,
  ReevaluationEligibilitySummary,
  ValidationResult,
} from './reevaluation-validation-types';

export type {
  CreateReevaluationPayload,
  ElementNouveau,
  ReevaluationEligibilitySummary,
  ValidationResult,
} from './reevaluation-validation-types';

/**
 * Catalogue des règles métier du workflow de réévaluation.
 */
export const REEVALUATION_RULES = {
  /**
   * Vérifie que la demande est dans un statut compatible avec la réévaluation.
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
   * Vérifie le délai minimal entre le rejet et la nouvelle analyse.
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
   * Vérifie que le nombre maximal de réévaluations n'est pas dépassé.
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
   * Vérifie que le motif de rejet autorise une réévaluation.
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
   * Vérifie qu'aucune autre réévaluation n'est déjà ouverte.
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
   * Vérifie l'état des frais de dossier remboursés.
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
   * Vérifie la présence des éléments nouveaux exigés par la configuration.
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
   * Vérifie la longueur minimale de la justification métier.
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
   * Vérifie le nombre minimal de justificatifs.
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
   * Vérifie que la réévaluation n'est pas verrouillée.
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
   * Vérifie qu'une transition de statut est explicitement autorisée.
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
 * Exécute toutes les règles nécessaires à la création d'une réévaluation.
 *
 * @returns Un indicateur global et la liste détaillée des refus.
 */
export async function validateReevaluationCreation(
  demande: DemandeCredit,
  config: ConfigReevaluation,
  payload: CreateReevaluationPayload,
  hasRefundPaid: boolean = false
): Promise<{ valid: boolean; errors: ValidationResult[] }> {
  const errors: ValidationResult[] = [];

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
 * Calcule une synthèse d'éligibilité destinée à l'affichage rapide.
 */
export function checkEligibilityQuick(
  demande: DemandeCredit,
  config: ConfigReevaluation,
  hasRefundPaid: boolean = false
): ReevaluationEligibilitySummary {
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
