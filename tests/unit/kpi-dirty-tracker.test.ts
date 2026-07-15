import { describe, it, expect } from 'vitest';
import { createDirtyPeriodTracker } from '../../apps/api/services/kpi/kpi-dirty-tracker';

describe('KPI Dirty Tracker — marquage par période', () => {
  it('une opération antidatée marque SA période, pas la courante', () => {
    const tracker = createDirtyPeriodTracker();
    // Rejeu offline daté du mois précédent
    tracker.markDate(new Date('2026-06-15T10:00:00Z'));
    tracker.markCurrent(new Date('2026-07-15T10:00:00Z'));

    const drained = tracker.drain();
    expect(drained.monthKeys).toEqual(['2026-06', '2026-07']);
    expect(drained.yearKeys).toEqual(['2026']);
  });

  it('bascule de mois en timezone métier : 23h30 UTC le 30/06 = juillet à Brazzaville', () => {
    const tracker = createDirtyPeriodTracker();
    tracker.markDate(new Date('2026-06-30T23:30:00Z'));
    expect(tracker.drain().monthKeys).toEqual(['2026-07']);
  });

  it('rejeu à cheval sur deux années marque les deux clés annuelles', () => {
    const tracker = createDirtyPeriodTracker();
    tracker.markDate(new Date('2025-12-20T10:00:00Z'));
    tracker.markDate(new Date('2026-01-05T10:00:00Z'));

    const drained = tracker.drain();
    expect(drained.monthKeys).toEqual(['2025-12', '2026-01']);
    expect(drained.yearKeys).toEqual(['2025', '2026']);
  });

  it('déduplique les dates du même mois', () => {
    const tracker = createDirtyPeriodTracker();
    tracker.markDate(new Date('2026-07-01T08:00:00Z'));
    tracker.markDate(new Date('2026-07-20T08:00:00Z'));
    expect(tracker.size()).toBe(1);
  });

  it('rejette les dates invalides sans rien marquer', () => {
    const tracker = createDirtyPeriodTracker();
    expect(tracker.markDate(new Date('n-importe-quoi'))).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it('drain vide le tracker ; restore ré-arme les périodes non traitées', () => {
    const tracker = createDirtyPeriodTracker();
    tracker.markDate(new Date('2026-06-15T10:00:00Z'));
    tracker.markDate(new Date('2026-07-15T10:00:00Z'));

    const drained = tracker.drain();
    expect(tracker.size()).toBe(0);

    // Échec simulé : juillet non traité, ré-armé pour la passe suivante
    tracker.restore({ monthKeys: ['2026-07'], yearKeys: ['2026'] });
    const second = tracker.drain();
    expect(second.monthKeys).toEqual(['2026-07']);
    expect(second.yearKeys).toEqual(['2026']);
    expect(drained.monthKeys).toEqual(['2026-06', '2026-07']);
  });
});
