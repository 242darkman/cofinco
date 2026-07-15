/**
 * Résultat standard d'une règle de validation de réévaluation.
 *
 * `details` reste volontairement générique : il transporte des informations
 * métier contextualisées pour l'interface ou les journaux sans imposer un
 * schéma unique à toutes les règles.
 */
export interface ValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Élément nouveau présenté par le client pour justifier la reprise d'analyse.
 */
export interface ElementNouveau {
  type: string;
  description: string;
  valeurAjoutee?: number;
  documents?: string[];
}

/**
 * Payload métier accepté lors de la création d'une réévaluation de crédit.
 */
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
 * Synthèse légère utilisée par l'interface pour afficher l'éligibilité.
 */
export interface ReevaluationEligibilitySummary {
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
}
