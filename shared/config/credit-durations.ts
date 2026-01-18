/**
 * ------------------------------------------------------------------
 * CONFIGURATION ET LOGIQUE MÉTIER : FRÉQUENCES & DURÉES
 * ------------------------------------------------------------------
 * Fichier partagé Frontend / Backend.
 * Contient les types, les constantes, les configurations par défaut
 * et les fonctions pures de validation et de conversion.
 */

// --- CONSTANTES GLOBALES (Pour éviter les "magic numbers") ---
export const DAYS_IN_WEEK = 7;
export const DAYS_IN_MONTH_APPROX = 30; // Moyenne pour estimation UI
export const DAYS_IN_YEAR_COMMERCIAL = 360;
export const MAX_ECHEANCES_SAFE_LIMIT = 365; // Sécurité anti-boucle ou surcharge

// --- TYPES & ENUMS ---

export type FrequenceRemboursement = "Journalier" | "Hebdomadaire" | "Mensuel" | "Bimensuel" | "Trimestriel";
export type DureeUnite = "Jour" | "Semaine" | "Mois";

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
  unite: DureeUnite;
  label: string;
  estRecommandee?: boolean;
}

export interface FrequenceConfig {
  frequence: FrequenceRemboursement;
  uniteParDefaut: DureeUnite;
  dureesSuggerees: DureeSuggestion[];
}

// --- CONFIGURATION ---

/**
 * Mapping des unités valides par fréquence
 */
export const FREQUENCE_UNITE_MAP: Record<FrequenceRemboursement, DureeUnite[]> = {
  "Journalier": ["Jour"],
  "Hebdomadaire": ["Semaine", "Mois", "Jour"],
  "Mensuel": ["Mois"],
  "Bimensuel": ["Mois"],
  "Trimestriel": ["Mois"],
};

/**
 * Configuration par défaut des durées suggérées (fallback si DB vide)
 */
export const DEFAULT_DURATIONS_CONFIG: FrequenceConfig[] = [
  {
    frequence: "Journalier",
    uniteParDefaut: "Jour",
    dureesSuggerees: [
      { valeur: 15, unite: "Jour", label: "15 jours" },
      { valeur: 30, unite: "Jour", label: "30 jours", estRecommandee: true },
      { valeur: 60, unite: "Jour", label: "60 jours" },
      { valeur: 90, unite: "Jour", label: "90 jours" },
    ],
  },
  {
    frequence: "Hebdomadaire",
    uniteParDefaut: "Mois",
    dureesSuggerees: [
      { valeur: 1, unite: "Mois", label: "1 mois" },
      { valeur: 3, unite: "Mois", label: "3 mois", estRecommandee: true },
      { valeur: 6, unite: "Mois", label: "6 mois" },
    ],
  },
  {
    frequence: "Mensuel",
    uniteParDefaut: "Mois",
    dureesSuggerees: [
      { valeur: 3, unite: "Mois", label: "3 mois" },
      { valeur: 6, unite: "Mois", label: "6 mois", estRecommandee: true },
      { valeur: 12, unite: "Mois", label: "12 mois" },
    ],
  },
  {
    frequence: "Bimensuel",
    uniteParDefaut: "Mois",
    dureesSuggerees: [
      { valeur: 6, unite: "Mois", label: "6 mois" },
      { valeur: 12, unite: "Mois", label: "12 mois", estRecommandee: true },
      { valeur: 18, unite: "Mois", label: "18 mois" },
    ],
  },
  {
    frequence: "Trimestriel",
    uniteParDefaut: "Mois",
    dureesSuggerees: [
      { valeur: 12, unite: "Mois", label: "12 mois" },
      { valeur: 24, unite: "Mois", label: "24 mois", estRecommandee: true },
      { valeur: 36, unite: "Mois", label: "36 mois" },
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
export function convertirDureeEnJours(valeur: number, unite: DureeUnite): number {
  switch (unite) {
    case "Jour":
      return valeur;
    case "Semaine":
      return valeur * DAYS_IN_WEEK;
    case "Mois":
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
  frequence: FrequenceRemboursement,
  dureeValeur: number,
  dureeUnite: DureeUnite
): number {
  // Optimisation: Calcul direct si l'unité est alignée avec la fréquence
  if (dureeUnite === "Mois") {
    if (frequence === "Mensuel") return dureeValeur;
    if (frequence === "Bimensuel") return dureeValeur * 2; // 2x par mois
    if (frequence === "Trimestriel") return Math.ceil(dureeValeur / 3);
  }

  // Fallback: Calcul via conversion en jours (pour Hebdomadaire sur X Mois par ex)
  const joursTotal = convertirDureeEnJours(dureeValeur, dureeUnite);

  switch (frequence) {
    case "Journalier":
      return joursTotal;
    case "Hebdomadaire":
      return Math.ceil(joursTotal / DAYS_IN_WEEK);
    case "Mensuel":
      return Math.ceil(joursTotal / DAYS_IN_MONTH_APPROX);
    case "Bimensuel":
      return Math.ceil(joursTotal / 15);
    case "Trimestriel":
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
  frequence: FrequenceRemboursement,
  dureeValeur: number,
  dureeUnite: DureeUnite
): ValidationResult {
  
  // 1. Validation de l'unité
  const unitesValides = FREQUENCE_UNITE_MAP[frequence];
  if (!unitesValides.includes(dureeUnite)) {
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
    case "Journalier":
      if (dureeUnite !== "Jour") {
        return { isValid: false, errorCode: DurationErrorCode.INVALID_FREQUENCY_UNIT };
      }
      if (dureeValeur < 7) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 7 jours pour journalier" };
      }
      break;

    case "Hebdomadaire":
      if (nombreEcheances < 2) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 2 semaines pour hebdo" };
      }
      break;

    case "Mensuel":
    case "Bimensuel":
      if (dureeUnite !== "Mois") {
         return { isValid: false, errorCode: DurationErrorCode.INVALID_FREQUENCY_UNIT };
      }
      if (dureeValeur < 1) {
        return { isValid: false, errorCode: DurationErrorCode.DURATION_TOO_SHORT, debugMessage: "Min 1 mois requis" };
      }
      break;
      
    case "Trimestriel":
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
export function getDefaultDureeForFrequence(frequence: FrequenceRemboursement): DureeSuggestion | null {
  const config = DEFAULT_DURATIONS_CONFIG.find(c => c.frequence === frequence);
  if (!config) return null;

  const recommandee = config.dureesSuggerees.find(d => d.estRecommandee);
  return recommandee || config.dureesSuggerees[0] || null;
}

/**
 * Formate un label de durée pour l'affichage (Helper UI)
 */
export function formaterLabelDuree(valeur: number, unite: DureeUnite): string {
  const pluriel = valeur > 1 ? "s" : "";
  // Note: Idéalement, utiliser une lib i18n ici aussi, mais acceptable pour un helper
  switch (unite) {
    case "Jour": return `${valeur} jour${pluriel}`;
    case "Semaine": return `${valeur} semaine${pluriel}`;
    case "Mois": return `${valeur} mois`; // "Mois" est invariant
    default: return `${valeur} ${unite}`;
  }
}
