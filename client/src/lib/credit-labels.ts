/**
 * Mappings enum -> label français pour les plans de crédit.
 * Utilisé partout où des enums credit plan sont affichés dans l'UI.
 */

const TYPE_CREDIT: Record<string, string> = {
  PERSONAL: "Personnel",
  REAL_ESTATE: "Immobilier",
  COMMERCIAL: "Commercial",
};

const INTEREST_METHOD: Record<string, string> = {
  FLAT: "Taux fixe",
  DECLINING_BALANCE: "Dégressif",
};

const AMORTIZATION_TYPE: Record<string, string> = {
  EQUAL_INSTALLMENTS: "Annuités constantes",
  EQUAL_PRINCIPAL: "Capital constant",
  INTEREST_ONLY_THEN_BALLOON: "In fine",
};

const DUREE_UNITE: Record<string, string> = {
  DAY: "jour",
  WEEK: "semaine",
  MONTH: "mois",
};

const FREQUENCE: Record<string, string> = {
  DAILY: "Journalier",
  WEEKLY: "Hebdomadaire",
  BI_MONTHLY: "Bi-mensuel",
  MONTHLY: "Mensuel",
  QUARTERLY: "Trimestriel",
};

const FREQUENCE_ECHEANCE: Record<string, string> = {
  DAILY: "Échéance journalière",
  WEEKLY: "Échéance hebdo",
  BI_MONTHLY: "Échéance bi-mensuelle",
  MONTHLY: "Mensualité",
  QUARTERLY: "Échéance trimestrielle",
};

function lookup(map: Record<string, string>, value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback ?? "";
  return map[value] ?? fallback ?? value;
}

export function typeCreditLabel(v: string | null | undefined): string {
  return lookup(TYPE_CREDIT, v, "Standard");
}

export function interestMethodLabel(v: string | null | undefined): string {
  return lookup(INTEREST_METHOD, v);
}

export function amortizationLabel(v: string | null | undefined): string {
  return lookup(AMORTIZATION_TYPE, v);
}

export function dureeUniteLabel(v: string | null | undefined, plural = false): string {
  const base = lookup(DUREE_UNITE, v);
  if (!plural || v === "MONTH") return base;
  return base + "s";
}

export function frequenceLabel(v: string | null | undefined): string {
  return lookup(FREQUENCE, v);
}

export function frequenceEcheanceLabel(v: string | null | undefined): string {
  return lookup(FREQUENCE_ECHEANCE, v, "Mensualité");
}
