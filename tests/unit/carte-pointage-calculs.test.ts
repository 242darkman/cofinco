/**
 * Tests unitaires — règles de calcul des cartes de pointage.
 *
 * Non-régression sur la formule contractuelle de retrait A = (M × N) − M
 * avec des valeurs métier explicites (AGENTS.md §9), bornes N=1/2/31,
 * arrondis (centimes) et validation des montants.
 */

import { describe, it, expect } from 'vitest';
import {
  NOMBRE_CASES_CARTE_POINTAGE,
  MIN_VERSEMENTS_POUR_RETRAIT,
  calculerRetraitCartePointage,
  montantEnCentimes,
  centimesEnMontant,
  peutPointer,
  peutRetirer,
} from '@shared/utils/carte-pointage';

describe('Carte de pointage — invariants produit', () => {
  it('la carte comporte exactement 31 cases', () => {
    expect(NOMBRE_CASES_CARTE_POINTAGE).toBe(31);
  });

  it('le retrait exige au moins 2 versements', () => {
    expect(MIN_VERSEMENTS_POUR_RETRAIT).toBe(2);
  });
});

describe('calculerRetraitCartePointage — formule A = (M × N) − M', () => {
  it('carte pleine : M=1500 FCFA, N=31 → client 45 000, commission 1 500', () => {
    const r = calculerRetraitCartePointage('1500.00', 31);
    expect(r.totalCollecte).toBe('46500.00'); // 1500 × 31
    expect(r.montantClient).toBe('45000.00'); // 46500 − 1500
    expect(r.commission).toBe('1500.00');
  });

  it('retrait anticipé : M=2000 FCFA, N=12 → client 22 000, commission 2 000', () => {
    const r = calculerRetraitCartePointage('2000', 12);
    expect(r.totalCollecte).toBe('24000.00');
    expect(r.montantClient).toBe('22000.00');
    expect(r.commission).toBe('2000.00');
  });

  it('borne minimale N=2 : le client récupère exactement M', () => {
    const r = calculerRetraitCartePointage('5000', 2);
    expect(r.montantClient).toBe('5000.00');
    expect(r.commission).toBe('5000.00');
  });

  it('N=1 est refusé (le client recevrait 0)', () => {
    expect(() => calculerRetraitCartePointage('1500', 1)).toThrow(/Retrait refusé/);
  });

  it('N=0 et N>31 sont refusés', () => {
    expect(() => calculerRetraitCartePointage('1500', 0)).toThrow(/Retrait refusé/);
    expect(() => calculerRetraitCartePointage('1500', 32)).toThrow(/Retrait refusé/);
  });

  it('N non entier est refusé', () => {
    expect(() => calculerRetraitCartePointage('1500', 2.5)).toThrow(/Retrait refusé/);
  });

  it('gère les centimes sans erreur de flottant (M=1500.55, N=3)', () => {
    const r = calculerRetraitCartePointage('1500.55', 3);
    expect(r.totalCollecte).toBe('4501.65'); // 1500.55 × 3, exact en centimes
    expect(r.montantClient).toBe('3001.10'); // 4501.65 − 1500.55
    expect(r.commission).toBe('1500.55');
  });

  it('cohérence comptable : montantClient + commission = totalCollecte', () => {
    for (const [m, n] of [['1500', 5], ['2000.25', 17], ['500', 31]] as const) {
      const r = calculerRetraitCartePointage(m, n);
      expect(montantEnCentimes(r.montantClient) + montantEnCentimes(r.commission))
        .toBe(montantEnCentimes(r.totalCollecte));
    }
  });
});

describe('montantEnCentimes / centimesEnMontant', () => {
  it('convertit sans perte aller-retour', () => {
    expect(centimesEnMontant(montantEnCentimes('1500'))).toBe('1500.00');
    expect(centimesEnMontant(montantEnCentimes('0.05'))).toBe('0.05');
    expect(centimesEnMontant(montantEnCentimes('12345678.90'))).toBe('12345678.90');
  });

  it('rejette les montants invalides ou non positifs', () => {
    expect(() => montantEnCentimes('0')).toThrow();
    expect(() => montantEnCentimes('-100')).toThrow();
    expect(() => montantEnCentimes('abc')).toThrow();
    expect(() => montantEnCentimes('1.234')).toThrow(); // plus de 2 décimales
    expect(() => montantEnCentimes('1,50')).toThrow(); // virgule non acceptée
  });
});

describe('peutPointer / peutRetirer', () => {
  it('versement possible de 0 à 30 cases, impossible à 31', () => {
    expect(peutPointer(0)).toBe(true);
    expect(peutPointer(30)).toBe(true);
    expect(peutPointer(31)).toBe(false);
    expect(peutPointer(-1)).toBe(false);
  });

  it('retrait possible de 2 à 31 versements uniquement', () => {
    expect(peutRetirer(1)).toBe(false);
    expect(peutRetirer(2)).toBe(true);
    expect(peutRetirer(31)).toBe(true);
    expect(peutRetirer(32)).toBe(false);
  });
});
