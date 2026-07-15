import { describe, it, expect } from 'vitest';
import {
  parseMonthKey,
  formatMonthKey,
  formatPeriodLabel,
  availablePeriodKeys,
  buildYearBounds,
  buildYearList,
  isFutureMonth,
} from '../../apps/web/src/components/kpi/kpi-period-utils';

describe('Period Utils — parse et format des clés', () => {
  it('parse une clé mensuelle valide', () => {
    expect(parseMonthKey('2026-07')).toEqual({ year: 2026, month: 7 });
    expect(parseMonthKey('2026-12')).toEqual({ year: 2026, month: 12 });
  });

  it('rejette les clés invalides', () => {
    expect(parseMonthKey('2026')).toBeNull();
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
    expect(parseMonthKey('juillet 2026')).toBeNull();
  });

  it('formate avec un mois sur deux chiffres', () => {
    expect(formatMonthKey(2026, 7)).toBe('2026-07');
    expect(formatMonthKey(2026, 11)).toBe('2026-11');
  });

  it('libellé lisible fr-FR, tolérant aux clés inattendues', () => {
    expect(formatPeriodLabel('monthly', '2026-07')).toBe('Juillet 2026');
    expect(formatPeriodLabel('yearly', '2026')).toBe('2026');
    expect(formatPeriodLabel('monthly', 'n-importe-quoi')).toBe('n-importe-quoi');
  });
});

describe('Period Utils — disponibilité des snapshots', () => {
  const periods = [
    { periodType: 'MONTH', periodKey: '2026-07' },
    { periodType: 'MONTH', periodKey: '2026-06' },
    { periodType: 'YEAR', periodKey: '2026' },
  ];

  it('filtre par type de période', () => {
    const monthly = availablePeriodKeys(periods, 'monthly');
    expect(monthly.has('2026-07')).toBe(true);
    expect(monthly.has('2026')).toBe(false);

    const yearly = availablePeriodKeys(periods, 'yearly');
    expect(yearly.has('2026')).toBe(true);
    expect(yearly.has('2026-07')).toBe(false);
  });

  it('ensemble vide sans données', () => {
    expect(availablePeriodKeys(undefined, 'monthly').size).toBe(0);
  });
});

describe('Period Utils — bornes de navigation', () => {
  it('plancher de 5 ans sur une instance neuve', () => {
    expect(buildYearBounds(undefined, 2026)).toEqual({ minYear: 2022, maxYear: 2026 });
    expect(buildYearBounds([], 2026)).toEqual({ minYear: 2022, maxYear: 2026 });
  });

  it('étend la borne basse jusqu’au plus ancien snapshot (pérennité)', () => {
    const periods = [
      { periodType: 'MONTH', periodKey: '2019-03' },
      { periodType: 'MONTH', periodKey: '2026-07' },
    ];
    expect(buildYearBounds(periods, 2026)).toEqual({ minYear: 2019, maxYear: 2026 });
  });

  it('ignore les clés d’années aberrantes', () => {
    const periods = [{ periodType: 'MONTH', periodKey: '0000-01' }];
    expect(buildYearBounds(periods, 2026)).toEqual({ minYear: 2022, maxYear: 2026 });
  });

  it('liste des années en ordre descendant', () => {
    expect(buildYearList(2024, 2026)).toEqual([2026, 2025, 2024]);
  });
});

describe('Period Utils — mois futurs désactivés', () => {
  const now = new Date(2026, 6, 15); // 15 juillet 2026

  it('le mois courant et le passé sont sélectionnables', () => {
    expect(isFutureMonth(2026, 7, now)).toBe(false);
    expect(isFutureMonth(2026, 1, now)).toBe(false);
    expect(isFutureMonth(2025, 12, now)).toBe(false);
  });

  it('les mois et années futurs sont désactivés', () => {
    expect(isFutureMonth(2026, 8, now)).toBe(true);
    expect(isFutureMonth(2027, 1, now)).toBe(true);
  });
});
