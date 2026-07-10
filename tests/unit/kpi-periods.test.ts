import { describe, it, expect } from 'vitest';
import {
  parsePeriodRange,
  getPreviousPeriodKey,
  computeDelta,
  currentPeriodKeys,
} from '../../apps/api/services/kpi/kpi-periods';

describe('KPI Periods — parsePeriodRange', () => {
  it('parse une période mensuelle [début, début mois suivant)', () => {
    const { start, end } = parsePeriodRange('MONTH', '2026-07');
    expect(start).toEqual(new Date(2026, 6, 1));
    expect(end).toEqual(new Date(2026, 7, 1));
  });

  it('gère le passage décembre → janvier', () => {
    const { start, end } = parsePeriodRange('MONTH', '2026-12');
    expect(start).toEqual(new Date(2026, 11, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });

  it('parse une période annuelle', () => {
    const { start, end } = parsePeriodRange('YEAR', '2026');
    expect(start).toEqual(new Date(2026, 0, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
});

describe('KPI Periods — getPreviousPeriodKey', () => {
  it('mois précédent standard', () => {
    expect(getPreviousPeriodKey('MONTH', '2026-07')).toBe('2026-06');
  });

  it('janvier → décembre année précédente', () => {
    expect(getPreviousPeriodKey('MONTH', '2026-01')).toBe('2025-12');
  });

  it('année précédente', () => {
    expect(getPreviousPeriodKey('YEAR', '2026')).toBe('2025');
  });
});

describe('KPI Periods — computeDelta (Decimal, valeurs métier)', () => {
  it('delta exact sur montants FCFA typiques', () => {
    // Encours : 1 234 567.89 → 1 500 000.00
    const delta = computeDelta(1500000, 1234567.89);
    expect(delta.value).toBe(265432.11);
    expect(delta.percent).toBe(21.5); // 265432.11 / 1234567.89 × 100 = 21.4999...→ 21.5
  });

  it('pas d\'artefact flottant sur différences décimales', () => {
    // En flottant JS : 0.3 - 0.1 = 0.19999999999999998
    const delta = computeDelta(0.3, 0.1);
    expect(delta.value).toBe(0.2);
    expect(delta.percent).toBe(200);
  });

  it('précédent = 0 → percent 0 (pas de division par zéro)', () => {
    const delta = computeDelta(5000, 0);
    expect(delta.value).toBe(5000);
    expect(delta.percent).toBe(0);
  });

  it('précédent négatif → percent basé sur |précédent|', () => {
    // Résultat net : -100 000 → -50 000 = amélioration de +50%
    const delta = computeDelta(-50000, -100000);
    expect(delta.value).toBe(50000);
    expect(delta.percent).toBe(50);
  });

  it('baisse → delta négatif', () => {
    const delta = computeDelta(800, 1000);
    expect(delta.value).toBe(-200);
    expect(delta.percent).toBe(-20);
  });
});

describe('KPI Periods — currentPeriodKeys', () => {
  it('retourne les clés mois et année de la date fournie', () => {
    const keys = currentPeriodKeys(new Date(2026, 6, 9));
    expect(keys.monthKey).toBe('2026-07');
    expect(keys.yearKey).toBe('2026');
  });

  it('pad le mois sur deux chiffres', () => {
    const keys = currentPeriodKeys(new Date(2026, 0, 15));
    expect(keys.monthKey).toBe('2026-01');
  });
});
