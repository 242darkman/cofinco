import { describe, it, expect } from 'vitest';
import { extractScalarMetrics, buildSeriesPoints } from '../../apps/api/services/kpi/kpi-series';
import type { KpiPayload } from '@shared/schema/kpi';

function buildPayload(overrides: { encours?: number; par30?: number } = {}): KpiPayload {
  return {
    credit: {
      encoursTotalActif: overrides.encours ?? 1000000,
      nombreCreditsActifs: 120,
      decaissementsPeriode: 50000,
      nombreDecaissements: 8,
      tauxApprobation: 71.3,
      panierMoyen: 6250,
      repartitionParPlan: [{ planId: '', planNom: 'Commerce', count: 10, montant: 100, encours: 90 }],
    },
    risque: {
      par30: overrides.par30 ?? 3.8,
      par60: 2.1, par90: 1.2,
      tauxRecouvrement: 92.4, tauxDefaut: 2.9, tauxRadiation: 0.7,
      creditsEnSouffrance: 43, montantEnSouffrance: 13900000,
    },
    tontinesEpargne: {
      encoursEpargne: 164800000, encoursComptesCourants: 88300000,
      tontinesActives: 96, membresTontines: 1730,
      volumesCollectes: 24600000, volumesRetires: 18200000, cotisationsTontines: 9800000,
    },
    rentabilite: {
      interetsPercus: 21400000, fraisCommissions: 6300000, revenusTontines: 2450000,
      totalRevenus: 30150000, charges: 11900000, resultatNet: 18250000, ratioChargesEncours: 2.5,
    },
    tresorerie: {
      soldeCaisses: 28400000, soldeCoffres: 41200000, soldeBanque: 21300000, soldeMobileMoney: 5500000,
      fluxEntrants: 64800000, fluxSortants: 61300000, ratioLiquidite: 38.1, ecartsCaisses: 45000,
    },
    clients: {
      totalClientsActifs: 4812, nouveauxClients: 148,
      clientsParSegment: { Standard: 3800, Premium: 900 },
      tauxRetention: 94.2,
    },
    rhProductivite: {
      agentsActifs: 38, clientsParAgent: 126.6, encoursParAgent: 12693421, decaissementsParAgent: 2.3,
      topAgents: [], bottomAgents: [], masseSalariale: 14200000,
    },
    deltas: {
      credit: { encoursTotalActif: { value: 100, percent: 1 } },
      risque: {}, tontinesEpargne: {}, rentabilite: {}, tresorerie: {}, clients: {}, rhProductivite: {},
    },
  };
}

describe('KPI Series — extractScalarMetrics', () => {
  it('aplatit les scalaires en clés domaine.indicateur', () => {
    const metrics = extractScalarMetrics(buildPayload({ encours: 482350000, par30: 3.8 }));
    expect(metrics['credit.encoursTotalActif']).toBe(482350000);
    expect(metrics['risque.par30']).toBe(3.8);
    expect(metrics['tresorerie.soldeCaisses']).toBe(28400000);
    expect(metrics['rentabilite.resultatNet']).toBe(18250000);
    expect(metrics['clients.tauxRetention']).toBe(94.2);
  });

  it('exclut tableaux, objets et deltas', () => {
    const metrics = extractScalarMetrics(buildPayload());
    const keys = Object.keys(metrics);
    expect(keys.some((k) => k.includes('repartitionParPlan'))).toBe(false);
    expect(keys.some((k) => k.includes('clientsParSegment'))).toBe(false);
    expect(keys.some((k) => k.includes('topAgents'))).toBe(false);
    expect(keys.some((k) => k.startsWith('deltas'))).toBe(false);
  });

  it('ignore les valeurs non finies', () => {
    const payload = buildPayload();
    (payload.credit as unknown as Record<string, unknown>).panierMoyen = Number.NaN;
    const metrics = extractScalarMetrics(payload);
    expect('credit.panierMoyen' in metrics).toBe(false);
  });
});

describe('KPI Series — buildSeriesPoints', () => {
  it('trie les points par période ascendante quelle que soit l’entrée', () => {
    const points = buildSeriesPoints([
      { periodKey: '2026-07', generatedAt: new Date('2026-07-10T08:00:00Z'), payload: buildPayload({ encours: 300 }) },
      { periodKey: '2026-05', generatedAt: '2026-05-31T23:00:00.000Z', payload: buildPayload({ encours: 100 }) },
      { periodKey: '2026-06', generatedAt: new Date('2026-06-30T23:00:00Z'), payload: buildPayload({ encours: 200 }) },
    ]);

    expect(points.map((p) => p.periodKey)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(points.map((p) => p.metrics['credit.encoursTotalActif'])).toEqual([100, 200, 300]);
    expect(points[0].generatedAt).toBe('2026-05-31T23:00:00.000Z');
  });
});
