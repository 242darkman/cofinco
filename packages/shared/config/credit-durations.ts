/**
 * ------------------------------------------------------------------
 * CONFIGURATION ET LOGIQUE MÉTIER : FRÉQUENCES & DURÉES
 * ------------------------------------------------------------------
 * Fichier partagé Frontend / Backend.
 * Contient les types, les constantes, les configurations par défaut
 * et les fonctions pures de validation et de conversion.
 *
 * CONVENTION: Toutes les valeurs sont en ANGLAIS (SCREAMING_SNAKE_CASE)
 */

import {
  FrequenceRemboursement,
  FrequenceRemboursementType,
  DureeUnite,
  DureeUniteType,
} from "@shared/enum/status-constants";

// --- CONSTANTES GLOBALES (Pour éviter les "magic numbers") ---
export const DAYS_IN_WEEK = 7;
export const DAYS_IN_MONTH_APPROX = 30; // Moyenne pour estimation UI
export const DAYS_IN_YEAR_COMMERCIAL = 360;
export const MAX_ECHEANCES_SAFE_LIMIT = 365; // Sécurité anti-boucle ou surcharge

// --- TYPES & ENUMS ---

// Re-export pour compatibilité
export type { FrequenceRemboursementType as FrequenceRemboursement };
export type { DureeUniteType as DureeUnite };

/**
 * Codes d'erreur pour la validation.
 * Permet au frontend d'afficher des messages traduits (i18n) au lieu de hardcoder du texte.
 */
export enum DurationErrorCode {
  INCOMPATIBLE_UNIT = "INCOMPATIBLE_UNIT",
  DURATION_TOO_SHORT = "DURATION_TOO_SHORT",
  DURATION_TOO_LONG = "DURATION_TOO_LONG",
  INVALID_FREQUENCY_UNIT = "INVALID_FREQUENCY_UNIT",
}

export interface ValidationResult {
  isValid: boolean;
  errorCode?: DurationErrorCode;
  /** Message de debug (fallback si pas de trad) */
  debugMessage?: string;
}

export interface DureeSuggestion {
  valeur: number;
  unite: DureeUniteType;
  label: string;
  estRecommandee?: boolean;
}

export interface FrequenceConfig {
  frequence: FrequenceRemboursementType;
  uniteParDefaut: DureeUniteType;
  dureesSuggerees: DureeSuggestion[];
}

// --- CONFIGURATION ---

/**
 * Mapping des unités valides par fréquence
 */
export const FREQUENCE_UNITE_MAP: Record<FrequenceRemboursementType, DureeUniteType[]> = {
  [FrequenceRemboursement.DAILY]: [DureeUnite.DAY],
  [FrequenceRemboursement.WEEKLY]: [DureeUnite.WEEK, DureeUnite.MONTH, DureeUnite.DAY],
  [FrequenceRemboursement.MONTHLY]: [DureeUnite.MONTH],
  [FrequenceRemboursement.BI_MONTHLY]: [DureeUnite.MONTH],
  [FrequenceRemboursement.QUARTERLY]: [DureeUnite.MONTH],
};

/**
 * Configuration par défaut des durées suggérées (fallback si DB vide)
 */
export const DEFAULT_DURATIONS_CONFIG: FrequenceConfig[] = [
  {
    frequence: FrequenceRemboursement.DAILY,
    uniteParDefaut: DureeUnite.DAY,
    dureesSuggerees: [
      { valeur: 15, unite: DureeUnite.DAY, label: "15 jours" },
      { valeur: 30, unite: DureeUnite.DAY, label: "30 jours", estRecommandee: true },
      { valeur: 60, unite: DureeUnite.DAY, label: "60 jours" },
      { valeur: 90, unite: DureeUnite.DAY, label: "90 jours" },
    ],
  },
  {
    frequence: FrequenceRemboursement.WEEKLY,
    uniteParDefaut: DureeUnite.MONTH,
    dureesSuggerees: [
      { valeur: 1, unite: DureeUnite.MONTH, label: "1 mois" },
      { valeur: 3, unite: DureeUnite.MONTH, label: "3 mois", estRecommandee: true },
      { valeur: 6, unite: DureeUnite.MONTH, label: "6 mois" },
    ],
  },
  {
    frequence: FrequenceRemboursement.MONTHLY,
    uniteParDefaut: DureeUnite.MONTH,
    dureesSuggerees: [
      { valeur: 3, unite: DureeUnite.MONTH, label: "3 mois" },
      { valeur: 6, unite: DureeUnite.MONTH, label: "6 mois", estRecommandee: true },
      { valeur: 12, unite: DureeUnite.MONTH, label: "12 mois" },
    ],
  },
  {
    frequence: FrequenceRemboursement.BI_MONTHLY,
    uniteParDefaut: DureeUnite.MONTH,
    dureesSuggerees: [
      { valeur: 6, unite: DureeUnite.MONTH, label: "6 mois" },
      { valeur: 12, unite: DureeUnite.MONTH, label: "12 mois", estRecommandee: true },
      { valeur: 18, unite: DureeUnite.MONTH, label: "18 mois" },
    ],
  },
  {
    frequence: FrequenceRemboursement.QUARTERLY,
    uniteParDefaut: DureeUnite.MONTH,
    dureesSuggerees: [
      { valeur: 12, unite: DureeUnite.MONTH, label: "12 mois" },
      { valeur: 24, unite: DureeUnite.MONTH, label: "24 mois", estRecommandee: true },
      { valeur: 36, unite: DureeUnite.MONTH, label: "36 mois" },
    ],
  },
];

// --- LOGIQUE MÉTIER ---

/**
 * Convertit une durée en nombre de jours ESTIMÉS.
 * @warning Cette fonction utilise des approximations (Mois = 30j).
 * NE PAS UTILISER pour le calcul comptable d'intérêts ou les dates de calendrier exactes.
 * Utiliser uniquement pour l'UI ou des estimations de volume.
 */
export function convertirDureeEnJours(valeur: number, unite: DureeUniteType): number {
  switch (unite) {
    case DureeUnite.DAY:
      return valeur;
    case DureeUnite.WEEK:
      return valeur * DAYS_IN_WEEK;
    case DureeUnite.MONTH:
      return valeur * DAYS_IN_MONTH_APPROX;
    default:
      return valeur;
  }
}

/**
 * Calcule le nombre d'échéances théoriques.
 * Gère spécifiquement les fréquences basées sur les mois pour éviter les erreurs d'arrondi.
 */
export function calculerNombreEcheances(
  frequence: FrequenceRemboursementType,
  dureeValeur: number,
  dureeUnite: DureeUniteType
): number {
  // Optimisation: Calcul direct si l'unité est alignée avec la fréquence
  if (dureeUnite === DureeUnite.MONTH) {
    if (frequence === FrequenceRemboursement.MONTHLY) return dureeValeur;
    if (frequence === FrequenceRemboursement.BI_MONTHLY) return dureeValeur * 2; // 2x par mois
    if (frequence === FrequenceRemboursement.QUARTERLY) return Math.ceil(dureeValeur / 3);
  }

  // Fallback: Calcul via conversion en jours (pour Hebdomadaire sur X Mois par ex)
  const joursTotal = convertirDureeEnJours(dureeValeur, dureeUnite);

  switch (frequence) {
    case FrequenceRemboursement.DAILY:
      return joursTotal;
    case FrequenceRemboursement.WEEKLY:
      return Math.ceil(joursTotal / DAYS_IN_WEEK);
    case FrequenceRemboursement.MONTHLY:
      return Math.ceil(joursTotal / DAYS_IN_MONTH_APPROX);
    case FrequenceRemboursement.BI_MONTHLY:
      return Math.ceil(joursTotal / 15);
    case FrequenceRemboursement.QUARTERLY:
      return Math.ceil(joursTotal / 90);
    default:
      return joursTotal;
  }
}

/**
 * Valide la cohérence entre la fréquence et la durée.
 * Retourne un objet ValidationResult pour faciliter l'i18n.
 */
export function validerCoherenceFrequenceDuree(
  frequence: FrequenceRemboursementType,
  dureeValeur: number,
  dureeUnite: DureeUniteType
): ValidationResult {

  // 1. Validation de l'unité
  const unitesValides = FREQUENCE_UNITE_MAP[frequence];
  if (!unitesValides?.includes(dureeUnite)) {
    return {
      isValid: false,
      errorCode: DurationErrorCode.INCOMPATIBLE_UNIT,
      debugMessage: `Unité ${dureeUnite} incompatible avec fréquence ${frequence}`
    };
  }

  // 2. Calcul des échéances
  const nombreEcheances = calculerNombreEcheances(frequence, dureeValeur, dureeUnite);

  if (nombreEcheances < 1) {
    return {
      isValid: false,
      errorCode: DurationErrorCode.DURATION_TOO_SHORT,
      debugMessage: "Au moins 1 échéance requise"
    };
  }

  if (nombreEcheances > MAX_ECHEANCES_SAFE_LIMIT) {
    return {
      isValid: false,
      errorCode: DurationErrorCode.DURATION_TOO_LONG,
      debugMessage: `Max échéances dépassé (${nombreEcheances} > ${MAX_ECHEANCES_SAFE_LIMIT})`
    };
  }

  // 3. Règles métier spécifiques (Hard rules)
  // Ces règles peuvent être ajustées selon le risk policy
  switch (frequence) {
    case FrequenceRemboursement.DAILY:
      if (dureeUnite !== DureeUnite.DAY) {
        return { isValid: false, errorCode: DurationErrorCode.INVALID_FREQUENCY_UNIT };
      }
      if (dureeValeur < 7) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 7 jours pour journalier" };
      }
      break;

    case FrequenceRemboursement.WEEKLY:
      if (nombreEcheances < 2) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 2 semaines pour hebdo" };
      }
      break;

    case FrequenceRemboursement.MONTHLY:
    case FrequenceRemboursement.BI_MONTHLY:
      if (dureeUnite !== DureeUnite.MONTH) {
         return { isValid: false, errorCode: DurationErrorCode.INVALID_FREQUENCY_UNIT };
      }
      if (dureeValeur < 1) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 1 mois requis" };
      }
      break;

    case FrequenceRemboursement.QUARTERLY:
      if (dureeValeur < 3) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 3 mois (1 trimestre)" };
      }
      break;
  }

  return { isValid: true };
}

/**
 * Retourne la configuration par défaut pour une fréquence donnée
 */
export function getDefaultDureeForFrequence(frequence: FrequenceRemboursementType): DureeSuggestion | null {
  const config = DEFAULT_DURATIONS_CONFIG.find(c => c.frequence === frequence);
  if (!config) return null;

  const recommandee = config.dureesSuggerees.find(d => d.estRecommandee);
  return recommandee || config.dureesSuggerees[0] || null;
}

/**
 * Formate un label de durée pour l'affichage (Helper UI)
 */
export function formaterLabelDuree(valeur: number, unite: DureeUniteType): string {
  const pluriel = valeur > 1 ? "s" : "";
  switch (unite) {
    case DureeUnite.DAY: return `${valeur} jour${pluriel}`;
    case DureeUnite.WEEK: return `${valeur} semaine${pluriel}`;
    case DureeUnite.MONTH: return `${valeur} mois`; // "Mois" est invariant
    default: return `${valeur} ${unite}`;
  }
}
