/**
 * COBAC Utils — évaluation pure de la conformité des ratios prudentiels.
 *
 * Module sans dépendance React : testable unitairement.
 * Les seuils viennent de l'API (/api/comptabilite/cobac/seuils) et sont
 * configurables ; l'évaluation suit deux directions :
 * - ratio « plancher » (seuilMinimum défini) : conforme au-dessus du seuil
 *   d'alerte, en alerte entre minimum et alerte, non conforme sous le minimum ;
 * - ratio « plafond » (seuilMaximum défini) : symétrique inversé.
 */

export type RatioStatut = 'CONFORME' | 'ALERTE' | 'NON_CONFORME' | 'INCONNU';

export interface CobacSeuilApi {
  id: string;
  ratioCode: string;
  libelle: string;
  seuilMinimum: string | null;
  seuilWarning: string | null;
  seuilMaximum: string | null;
}

export interface CobacRatiosApi {
  id: string;
  agenceId: string;
  periodeDate: string;
  roe: string | null;
  roa: string | null;
  ratioSolvabilite: string | null;
  ratioLiquidite: string | null;
  coeffExploitation: string | null;
  par30: string | null;
  par60: string | null;
  par90: string | null;
  tauxRecouvrement: string | null;
  tauxDefaut: string | null;
}

/** Définition d'affichage d'un ratio (libellé, description métier). */
export interface RatioDefinition {
  code: string;
  field: keyof CobacRatiosApi;
  label: string;
  description: string;
}

/** Ratios affichés dans l'onglet, dans l'ordre réglementaire. */
export const COBAC_RATIO_DEFINITIONS: RatioDefinition[] = [
  { code: 'SOLVABILITE', field: 'ratioSolvabilite', label: 'Ratio de solvabilité', description: 'Fonds propres rapportés à l’encours pondéré' },
  { code: 'LIQUIDITE', field: 'ratioLiquidite', label: 'Ratio de liquidité', description: 'Actifs liquides rapportés aux passifs court terme' },
  { code: 'COEFF_EXPLOITATION', field: 'coeffExploitation', label: 'Coefficient d’exploitation', description: 'Charges d’exploitation rapportées au PNB' },
  { code: 'ROE', field: 'roe', label: 'ROE', description: 'Résultat net rapporté aux capitaux propres' },
  { code: 'ROA', field: 'roa', label: 'ROA', description: 'Résultat net rapporté au total actif' },
  { code: 'PAR30', field: 'par30', label: 'PAR 30', description: 'Portefeuille à risque à plus de 30 jours' },
  { code: 'PAR60', field: 'par60', label: 'PAR 60', description: 'Portefeuille à risque à plus de 60 jours' },
  { code: 'PAR90', field: 'par90', label: 'PAR 90', description: 'Portefeuille à risque à plus de 90 jours' },
  { code: 'TAUX_RECOUVREMENT', field: 'tauxRecouvrement', label: 'Taux de recouvrement', description: 'Remboursements effectifs sur échéances dues' },
  { code: 'TAUX_DEFAUT', field: 'tauxDefaut', label: 'Taux de défaut', description: 'Part des crédits en défaut dans le portefeuille' },
];

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Évalue la conformité d'une valeur de ratio vs son seuil configuré.
 * Sans seuil ou sans valeur : INCONNU (informatif, jamais bloquant).
 */
export function evaluateRatioStatut(
  rawValue: string | number | null | undefined,
  seuil: Pick<CobacSeuilApi, 'seuilMinimum' | 'seuilWarning' | 'seuilMaximum'> | undefined,
): RatioStatut {
  const value = toNumber(rawValue);
  if (value === null || !seuil) return 'INCONNU';

  const min = toNumber(seuil.seuilMinimum);
  const warn = toNumber(seuil.seuilWarning);
  const max = toNumber(seuil.seuilMaximum);

  // Ratio plancher : la valeur doit rester AU-DESSUS du minimum
  if (min !== null) {
    if (value < min) return 'NON_CONFORME';
    if (warn !== null && value < warn) return 'ALERTE';
    return 'CONFORME';
  }

  // Ratio plafond : la valeur doit rester EN DESSOUS du maximum
  if (max !== null) {
    if (value > max) return 'NON_CONFORME';
    if (warn !== null && value > warn) return 'ALERTE';
    return 'CONFORME';
  }

  return 'INCONNU';
}

/** Libellé et variante visuelle d'un statut (badge). */
export function statutDisplay(statut: RatioStatut): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (statut) {
    case 'CONFORME': return { label: 'Conforme', variant: 'success' };
    case 'ALERTE': return { label: 'Alerte', variant: 'warning' };
    case 'NON_CONFORME': return { label: 'Non conforme', variant: 'danger' };
    default: return { label: 'Sans seuil', variant: 'neutral' };
  }
}

/** Résumé d'un jeu de ratios : nombre par statut (pour l'en-tête de l'onglet). */
export function summarizeStatuts(
  ratios: CobacRatiosApi,
  seuils: CobacSeuilApi[],
): Record<RatioStatut, number> {
  const seuilByCode = new Map(seuils.map(s => [s.ratioCode, s]));
  const summary: Record<RatioStatut, number> = { CONFORME: 0, ALERTE: 0, NON_CONFORME: 0, INCONNU: 0 };
  for (const def of COBAC_RATIO_DEFINITIONS) {
    const statut = evaluateRatioStatut(ratios[def.field] as string | null, seuilByCode.get(def.code));
    summary[statut] += 1;
  }
  return summary;
}
