import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCOUNTING_PRESENTATION_STANDARD,
  getAccountingPresentationStandard,
} from '../../apps/api/services/accounting-presentation-standards';

describe('accounting presentation standards', () => {
  it('utilise OHADA comme standard par défaut', () => {
    const standard = getAccountingPresentationStandard();

    expect(DEFAULT_ACCOUNTING_PRESENTATION_STANDARD).toBe('OHADA');
    expect(standard.code).toBe('OHADA');
    expect(standard.libelle).toContain('OHADA');
  });

  it('expose les rubriques nécessaires au bilan et au compte de résultat', () => {
    const standard = getAccountingPresentationStandard('OHADA');

    expect(standard.bilan.actif.map(section => section.titre)).toContain('Créances (Classe 4)');
    expect(standard.bilan.passif.map(section => section.titre)).toContain('Dettes (Classe 4)');
    expect(standard.compteResultat.charges.map(section => section.prefix)).toContain('60');
    expect(standard.compteResultat.produits.map(section => section.prefix)).toContain('70');
  });

  it('centralise les éliminations inter-agences du standard', () => {
    const standard = getAccountingPresentationStandard('OHADA');

    expect(standard.eliminations.bilanInterAgences).toContainEqual({
      debitPrefix: '185',
      creditPrefix: '485',
    });
    expect(standard.eliminations.compteResultatInternePrefixes).toEqual(
      expect.arrayContaining(['186', '486', '7086', '6086']),
    );
  });
});
