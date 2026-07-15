import { describe, it, expect } from 'vitest';
import {
  validateEntryAgainstLimits,
  extractEntryAmount,
  OFFLINE_LIMITS,
  FINANCIAL_OPERATION_TYPES,
} from '../../apps/api/services/sync-journal/offline-limits';

const noActivity = { operationCount: 0, totalVolume: 0 };

describe('Offline Limits — validation serveur au rejeu', () => {
  it('accepte une opération financière standard dans les plafonds', () => {
    const result = validateEntryAgainstLimits({
      type: 'DEPOSIT',
      amount: 250_000,
      dailyStats: noActivity,
    });
    expect(result.allowed).toBe(true);
  });

  it('rejette un type non autorisé hors ligne', () => {
    const result = validateEntryAgainstLimits({
      type: 'WIRE_TRANSFER',
      amount: 1_000,
      dailyStats: noActivity,
    });
    expect(result).toMatchObject({ allowed: false, reason: 'type_not_allowed_offline' });
  });

  it('rejette un montant au-dessus du plafond par opération', () => {
    const result = validateEntryAgainstLimits({
      type: 'WITHDRAWAL',
      amount: OFFLINE_LIMITS.maxSingleOperation + 1,
      dailyStats: noActivity,
    });
    expect(result).toMatchObject({ allowed: false, reason: 'amount_exceeds_offline_limit' });
  });

  it('accepte exactement le plafond par opération (borne incluse)', () => {
    const result = validateEntryAgainstLimits({
      type: 'WITHDRAWAL',
      amount: OFFLINE_LIMITS.maxSingleOperation,
      dailyStats: noActivity,
    });
    expect(result.allowed).toBe(true);
  });

  it('rejette une opération financière sans montant exploitable', () => {
    const result = validateEntryAgainstLimits({
      type: 'DEPOSIT',
      amount: null,
      dailyStats: noActivity,
    });
    expect(result).toMatchObject({ allowed: false, reason: 'missing_amount' });
  });

  it('rejette au-delà du nombre quotidien d\'opérations', () => {
    const result = validateEntryAgainstLimits({
      type: 'DEPOSIT',
      amount: 1_000,
      dailyStats: { operationCount: OFFLINE_LIMITS.maxDailyOperations, totalVolume: 0 },
    });
    expect(result).toMatchObject({ allowed: false, reason: 'daily_operations_exceeded' });
  });

  it('rejette quand le volume quotidien projeté dépasse le plafond', () => {
    const result = validateEntryAgainstLimits({
      type: 'LOAN_REPAYMENT',
      amount: 600_000,
      dailyStats: { operationCount: 10, totalVolume: OFFLINE_LIMITS.maxDailyVolume - 500_000 },
    });
    expect(result).toMatchObject({ allowed: false, reason: 'daily_volume_exceeded' });
  });

  it('accepte quand le volume projeté atteint exactement le plafond', () => {
    const result = validateEntryAgainstLimits({
      type: 'LOAN_REPAYMENT',
      amount: 500_000,
      dailyStats: { operationCount: 10, totalVolume: OFFLINE_LIMITS.maxDailyVolume - 500_000 },
    });
    expect(result.allowed).toBe(true);
  });

  it('ignore montant et volume pour les opérations non financières', () => {
    const result = validateEntryAgainstLimits({
      type: 'CLIENT_CREATE',
      amount: null,
      dailyStats: { operationCount: OFFLINE_LIMITS.maxDailyOperations, totalVolume: OFFLINE_LIMITS.maxDailyVolume },
    });
    expect(result.allowed).toBe(true);
  });

  it('les types financiers sont tous des types autorisés ou explicitement hors liste', () => {
    // Cohérence interne : un type financier autorisé doit passer le filtre type
    for (const type of FINANCIAL_OPERATION_TYPES) {
      const result = validateEntryAgainstLimits({ type, amount: 1_000, dailyStats: noActivity });
      if (OFFLINE_LIMITS.allowedOperationTypes.includes(type)) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result).toMatchObject({ allowed: false, reason: 'type_not_allowed_offline' });
      }
    }
  });
});

describe('Offline Limits — extractEntryAmount', () => {
  it('extrait un montant numérique', () => {
    expect(extractEntryAmount({ amount: 5000 })).toBe(5000);
  });

  it('extrait un montant en chaîne', () => {
    expect(extractEntryAmount({ amount: '7500.50' })).toBe(7500.5);
  });

  it('rejette les montants négatifs, NaN, absents ou non numériques', () => {
    expect(extractEntryAmount({ amount: -100 })).toBeNull();
    expect(extractEntryAmount({ amount: 'abc' })).toBeNull();
    expect(extractEntryAmount({ amount: Infinity })).toBeNull();
    expect(extractEntryAmount({})).toBeNull();
    expect(extractEntryAmount({ amount: null })).toBeNull();
  });
});
