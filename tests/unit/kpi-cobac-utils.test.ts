import { describe, it, expect } from 'vitest';
import {
  evaluateRatioStatut,
  statutDisplay,
  summarizeStatuts,
  COBAC_RATIO_DEFINITIONS,
  type CobacRatiosApi,
  type CobacSeuilApi,
} from '../../apps/web/src/components/kpi/kpi-cobac-utils';

const plancher = { seuilMinimum: '10', seuilWarning: '12', seuilMaximum: null };
const plafond = { seuilMinimum: null, seuilWarning: '60', seuilMaximum: '65' };

describe('COBAC — evaluateRatioStatut (ratio plancher, ex. solvabilité ≥ 10 %)', () => {
  it('conforme au-dessus du seuil d’alerte', () => {
    expect(evaluateRatioStatut('16.2', plancher)).toBe('CONFORME');
  });

  it('en alerte entre minimum et seuil d’alerte', () => {
    expect(evaluateRatioStatut('11', plancher)).toBe('ALERTE');
  });

  it('non conforme sous le minimum', () => {
    expect(evaluateRatioStatut('9.99', plancher)).toBe('NON_CONFORME');
  });

  it('borne incluse : exactement le minimum reste en alerte, pas non conforme', () => {
    expect(evaluateRatioStatut('10', plancher)).toBe('ALERTE');
  });

  it('borne incluse : exactement le seuil d’alerte est conforme', () => {
    expect(evaluateRatioStatut('12', plancher)).toBe('CONFORME');
  });
});

describe('COBAC — evaluateRatioStatut (ratio plafond, ex. coefficient d’exploitation ≤ 65 %)', () => {
  it('conforme sous le seuil d’alerte', () => {
    expect(evaluateRatioStatut('55', plafond)).toBe('CONFORME');
  });

  it('en alerte entre alerte et maximum', () => {
    expect(evaluateRatioStatut('63', plafond)).toBe('ALERTE');
  });

  it('non conforme au-dessus du maximum', () => {
    expect(evaluateRatioStatut('65.01', plafond)).toBe('NON_CONFORME');
  });

  it('borne incluse : exactement le maximum reste en alerte', () => {
    expect(evaluateRatioStatut('65', plafond)).toBe('ALERTE');
  });
});

describe('COBAC — cas dégradés', () => {
  it('valeur absente ou invalide : INCONNU', () => {
    expect(evaluateRatioStatut(null, plancher)).toBe('INCONNU');
    expect(evaluateRatioStatut('', plancher)).toBe('INCONNU');
    expect(evaluateRatioStatut('abc', plancher)).toBe('INCONNU');
  });

  it('seuil absent ou vide : INCONNU', () => {
    expect(evaluateRatioStatut('12', undefined)).toBe('INCONNU');
    expect(evaluateRatioStatut('12', { seuilMinimum: null, seuilWarning: null, seuilMaximum: null })).toBe('INCONNU');
  });

  it('plancher sans seuil d’alerte : conforme dès le minimum atteint', () => {
    expect(evaluateRatioStatut('10', { seuilMinimum: '10', seuilWarning: null, seuilMaximum: null })).toBe('CONFORME');
  });
});

describe('COBAC — statutDisplay', () => {
  it('mappe chaque statut vers un libellé français et une variante visuelle', () => {
    expect(statutDisplay('CONFORME')).toEqual({ label: 'Conforme', variant: 'success' });
    expect(statutDisplay('ALERTE')).toEqual({ label: 'Alerte', variant: 'warning' });
    expect(statutDisplay('NON_CONFORME')).toEqual({ label: 'Non conforme', variant: 'danger' });
    expect(statutDisplay('INCONNU')).toEqual({ label: 'Sans seuil', variant: 'neutral' });
  });
});

describe('COBAC — summarizeStatuts', () => {
  it('compte les statuts sur l’ensemble des ratios définis', () => {
    const ratios: CobacRatiosApi = {
      id: 'r1', agenceId: 'a1', periodeDate: '2026-06-30',
      roe: '14.8', roa: '3.1',
      ratioSolvabilite: '16.2', ratioLiquidite: '104',
      coeffExploitation: '61',
      par30: '3.8', par60: '2.1', par90: '1.2',
      tauxRecouvrement: '92.4', tauxDefaut: '2.9',
    };
    const seuils: CobacSeuilApi[] = [
      { id: 's1', ratioCode: 'SOLVABILITE', libelle: 'Solvabilité', seuilMinimum: '10', seuilWarning: '12', seuilMaximum: null },
      { id: 's2', ratioCode: 'LIQUIDITE', libelle: 'Liquidité', seuilMinimum: '100', seuilWarning: '110', seuilMaximum: null },
      { id: 's3', ratioCode: 'COEFF_EXPLOITATION', libelle: 'Coefficient', seuilMinimum: null, seuilWarning: '60', seuilMaximum: '65' },
    ];

    const summary = summarizeStatuts(ratios, seuils);
    // Solvabilité 16.2 ≥ 12 → conforme ; liquidité 104 entre 100 et 110 → alerte ;
    // coeff 61 entre 60 et 65 → alerte ; les 7 autres ratios n'ont pas de seuil
    expect(summary.CONFORME).toBe(1);
    expect(summary.ALERTE).toBe(2);
    expect(summary.NON_CONFORME).toBe(0);
    expect(summary.INCONNU).toBe(COBAC_RATIO_DEFINITIONS.length - 3);
  });
});
