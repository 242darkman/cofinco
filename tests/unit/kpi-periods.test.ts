import { describe, it, expect, afterEach } from 'vitest';
import {
  parsePeriodRange,
  getPreviousPeriodKey,
  computeDelta,
  currentPeriodKeys,
  resolveBusinessTimeZone,
} from '../../apps/api/services/kpi/kpi-periods';

describe('KPI Periods — parsePeriodRange (timezone métier)', () => {
  it('borne le mois à minuit Africa/Brazzaville (UTC+1)', () => {
    const { start, end } = parsePeriodRange('MONTH', '2026-07', 'Africa/Brazzaville');
    // Minuit du 01/07 à Brazzaville = 30/06 23:00 UTC
    expect(start.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-31T23:00:00.000Z');
  });

  it('borne le mois à minuit UTC quand la timezone est UTC', () => {
    const { start, end } = parsePeriodRange('MONTH', '2026-07', 'UTC');
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('gère le passage décembre → janvier', () => {
    const { end } = parsePeriodRange('MONTH', '2026-12', 'UTC');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('borne l\'année en timezone métier', () => {
    const { start, end } = parsePeriodRange('YEAR', '2026', 'Africa/Brazzaville');
    expect(start.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('les périodes consécutives sont jointives (fin N = début N+1)', () => {
    const juin = parsePeriodRange('MONTH', '2026-06', 'Africa/Brazzaville');
    const juillet = parsePeriodRange('MONTH', '2026-07', 'Africa/Brazzaville');
    expect(juin.end.getTime()).toBe(juillet.start.getTime());
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

describe('KPI Periods — currentPeriodKeys (timezone métier)', () => {
  it('le 30/06 23h30 UTC est déjà juillet à Brazzaville', () => {
    const keys = currentPeriodKeys(new Date('2026-06-30T23:30:00Z'), 'Africa/Brazzaville');
    expect(keys.monthKey).toBe('2026-07');
    expect(keys.yearKey).toBe('2026');
  });

  it('le même instant reste juin en UTC', () => {
    const keys = currentPeriodKeys(new Date('2026-06-30T23:30:00Z'), 'UTC');
    expect(keys.monthKey).toBe('2026-06');
  });

  it('le 31/12 23h30 UTC bascule d\'année à Brazzaville', () => {
    const keys = currentPeriodKeys(new Date('2026-12-31T23:30:00Z'), 'Africa/Brazzaville');
    expect(keys.monthKey).toBe('2027-01');
    expect(keys.yearKey).toBe('2027');
  });

  it('pad le mois sur deux chiffres', () => {
    const keys = currentPeriodKeys(new Date('2026-01-15T12:00:00Z'), 'UTC');
    expect(keys.monthKey).toBe('2026-01');
  });
});

describe('KPI Periods — resolveBusinessTimeZone', () => {
  const original = process.env.KPI_TIMEZONE;

  afterEach(() => {
    if (original === undefined) delete process.env.KPI_TIMEZONE;
    else process.env.KPI_TIMEZONE = original;
  });

  it('défaut sûr : Africa/Brazzaville sans variable', () => {
    delete process.env.KPI_TIMEZONE;
    expect(resolveBusinessTimeZone()).toBe('Africa/Brazzaville');
  });

  it('respecte une timezone valide', () => {
    process.env.KPI_TIMEZONE = 'Africa/Douala';
    expect(resolveBusinessTimeZone()).toBe('Africa/Douala');
  });

  it('repli sur le défaut si la timezone est invalide', () => {
    process.env.KPI_TIMEZONE = 'Invalid/Zone';
    expect(resolveBusinessTimeZone()).toBe('Africa/Brazzaville');
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
