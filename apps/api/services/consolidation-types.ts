import type {
  Bilan,
  CompteResultat,
  TrialBalance,
} from './gl-reporting-service';

/**
 * Bilan consolidé toutes agences, hors réciproques inter-agences éliminées.
 */
export interface ConsolidatedBilan extends Omit<Bilan, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
  eliminationsInterAgences: number;
}

/**
 * Compte de résultat consolidé sur une période donnée.
 */
export interface ConsolidatedCompteResultat extends Omit<CompteResultat, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
  eliminationsInterAgences: number;
}

/**
 * Balance consolidée exposée aux rapports comptables multi-agences.
 */
export interface ConsolidatedTrialBalance extends Omit<TrialBalance, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
}

/**
 * Contribution d'une agence aux agrégats consolidés.
 */
export interface AgencyBreakdown {
  agenceId: string;
  agenceNom: string;
  totalActif: number;
  totalPassif: number;
  resultatNet: number;
}

/**
 * Rapport complet de consolidation généré à une date d'arrêté.
 */
export interface ConsolidationReport {
  bilan: ConsolidatedBilan;
  compteResultat: ConsolidatedCompteResultat;
  breakdown: AgencyBreakdown[];
  generatedAt: string;
}

/**
 * Agence active incluse dans le périmètre de consolidation.
 */
export interface ActiveAgency {
  id: string;
  nom: string;
}

/**
 * Ligne brute issue de l'agrégation des soldes de bilan.
 */
export interface ConsolidationBalanceRow {
  numero_compte: string;
  intitule: string;
  classe: number;
  type_compte: string;
  sens_normal: string | null;
  total_debit: string;
  total_credit: string;
}

/**
 * Ligne brute utilisée pour ventiler charges et produits consolidés.
 */
export type ConsolidationResultRow = Omit<ConsolidationBalanceRow, 'sens_normal'>;

/**
 * Ligne SQL de contribution agence avant conversion vers le contrat API.
 */
export interface AgencyBreakdownRow {
  agence_id: string;
  agence_nom: string;
  total_actif: string;
  total_passif: string;
  resultat_net: string;
}
