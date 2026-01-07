/**
 * Configuration centralisee des durees suggerees par frequence de remboursement
 * Utilisee par le frontend ET le backend pour garantir la coherence
 */

export type FrequenceRemboursement = "Journalier" | "Hebdomadaire" | "Mensuel" | "Bimensuel" | "Trimestriel";
export type DureeUnite = "Jour" | "Semaine" | "Mois";

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

/**
 * Mapping des unites valides par frequence
 */
export const FREQUENCE_UNITE_MAP: Record<FrequenceRemboursement, DureeUnite[]> = {
  "Journalier": ["Jour"],
  "Hebdomadaire": ["Semaine", "Mois"],
  "Mensuel": ["Mois"],
  "Bimensuel": ["Mois"],
  "Trimestriel": ["Mois"],
};

/**
 * Configuration par defaut des durees suggerees (fallback si DB vide)
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

/**
 * Convertit une duree en nombre de jours (pour calculs backend)
 */
export function convertirDureeEnJours(valeur: number, unite: DureeUnite): number {
  switch (unite) {
    case "Jour":
      return valeur;
    case "Semaine":
      return valeur * 7;
    case "Mois":
      return valeur * 30; // Approximation standard
    default:
      return valeur;
  }
}

/**
 * Calcule le nombre d'echeances en fonction de la frequence et de la duree
 */
export function calculerNombreEcheances(
  frequence: FrequenceRemboursement,
  dureeValeur: number,
  dureeUnite: DureeUnite
): number {
  const joursTotal = convertirDureeEnJours(dureeValeur, dureeUnite);

  switch (frequence) {
    case "Journalier":
      return joursTotal;
    case "Hebdomadaire":
      return Math.ceil(joursTotal / 7);
    case "Mensuel":
      return Math.ceil(joursTotal / 30);
    case "Bimensuel":
      return Math.ceil(joursTotal / 15);
    case "Trimestriel":
      return Math.ceil(joursTotal / 90);
    default:
      return joursTotal;
  }
}

/**
 * Valide la coherence entre la frequence et la duree
 * Retourne null si valide, sinon un message d'erreur
 */
export function validerCoherenceFrequenceDuree(
  frequence: FrequenceRemboursement,
  dureeValeur: number,
  dureeUnite: DureeUnite
): string | null {
  // Verifier que l'unite est compatible avec la frequence
  const unitesValides = FREQUENCE_UNITE_MAP[frequence];
  if (!unitesValides.includes(dureeUnite)) {
    return `L'unite "${dureeUnite}" n'est pas compatible avec la frequence "${frequence}". Unites acceptees: ${unitesValides.join(", ")}`;
  }

  // Verifier les valeurs minimales
  const nombreEcheances = calculerNombreEcheances(frequence, dureeValeur, dureeUnite);
  if (nombreEcheances < 1) {
    return "La duree doit permettre au moins une echeance";
  }

  // Verifier les valeurs maximales raisonnables
  if (nombreEcheances > 365) {
    return "Le nombre d'echeances ne peut pas depasser 365";
  }

  // Validations specifiques par frequence
  switch (frequence) {
    case "Journalier":
      if (dureeUnite !== "Jour") {
        return "Pour un remboursement journalier, la duree doit etre en jours";
      }
      if (dureeValeur < 7) {
        return "La duree minimale pour un credit journalier est de 7 jours";
      }
      break;
    case "Hebdomadaire":
      if (nombreEcheances < 2) {
        return "Un credit hebdomadaire doit avoir au moins 2 echeances";
      }
      break;
    case "Mensuel":
      if (dureeUnite !== "Mois") {
        return "Pour un remboursement mensuel, la duree doit etre en mois";
      }
      if (dureeValeur < 1) {
        return "La duree minimale pour un credit mensuel est de 1 mois";
      }
      break;
    case "Bimensuel":
      if (dureeValeur < 1) {
        return "La duree minimale pour un credit bimensuel est de 1 mois";
      }
      break;
    case "Trimestriel":
      if (dureeValeur < 3) {
        return "La duree minimale pour un credit trimestriel est de 3 mois";
      }
      break;
  }

  return null;
}

/**
 * Retourne la configuration par defaut pour une frequence donnee
 */
export function getDefaultDureeForFrequence(frequence: FrequenceRemboursement): DureeSuggestion | null {
  const config = DEFAULT_DURATIONS_CONFIG.find(c => c.frequence === frequence);
  if (!config) return null;

  const recommandee = config.dureesSuggerees.find(d => d.estRecommandee);
  return recommandee || config.dureesSuggerees[0] || null;
}

/**
 * Formate un label de duree pour l'affichage
 */
export function formaterLabelDuree(valeur: number, unite: DureeUnite): string {
  const pluriel = valeur > 1;
  switch (unite) {
    case "Jour":
      return `${valeur} jour${pluriel ? "s" : ""}`;
    case "Semaine":
      return `${valeur} semaine${pluriel ? "s" : ""}`;
    case "Mois":
      return `${valeur} mois`;
    default:
      return `${valeur} ${unite}`;
  }
}
