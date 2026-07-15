import { describe, it, expect } from 'vitest';
import { checkConsolidatedCoherence } from '../../apps/api/services/kpi/kpi-coherence';
import type { KpiPayload } from '@shared/schema/kpi';

/** Construit un payload KPI complet à partir de quelques valeurs métier. */
function buildPayload(overrides: {
  encoursTotalActif?: number;
  soldeCaisses?: number;
  totalClientsActifs?: number;
  charges?: number;
} = {}): KpiPayload {
  return {
    credit: {
      encoursTotalActif: overrides.encoursTotalActif ?? 0,
      nombreCreditsActifs: 0,
      decaissementsPeriode: 0,
      nombreDecaissements: 0,
      tauxApprobation: 50, // ratio : non additif, ne doit jamais générer d'écart
      panierMoyen: 0,
      repartitionParPlan: [],
    },
    risque: {
      par30: 0, par60: 0, par90: 0,
      tauxRecouvrement: 0, tauxDefaut: 0, tauxRadiation: 0,
      creditsEnSouffrance: 0, montantEnSouffrance: 0,
    },
    tontinesEpargne: {
      encoursEpargne: 0, encoursComptesCourants: 0,
      tontinesActives: 0, membresTontines: 0,
      volumesCollectes: 0, volumesRetires: 0, cotisationsTontines: 0,
    },
    rentabilite: {
      interetsPercus: 0, fraisCommissions: 0, revenusTontines: 0,
      totalRevenus: 0, charges: overrides.charges ?? 0, resultatNet: 0,
      ratioChargesEncours: 0,
    },
    tresorerie: {
      soldeCaisses: overrides.soldeCaisses ?? 0,
      soldeCoffres: 0, soldeBanque: 0, soldeMobileMoney: 0,
      fluxEntrants: 0, fluxSortants: 0, ratioLiquidite: 0, ecartsCaisses: 0,
    },
    clients: {
      totalClientsActifs: overrides.totalClientsActifs ?? 0,
      nouveauxClients: 0, clientsParSegment: {}, tauxRetention: 0,
    },
    rhProductivite: {
      agentsActifs: 0, clientsParAgent: 0, encoursParAgent: 0,
      decaissementsParAgent: 0, topAgents: [], bottomAgents: [], masseSalariale: 0,
    },
    deltas: {
      credit: {}, risque: {}, tontinesEpargne: {}, rentabilite: {},
      tresorerie: {}, clients: {}, rhProductivite: {},
    },
  };
}

describe('KPI Coherence — consolidé = somme des agences', () => {
  it('cohérent quand le consolidé égale exactement la somme', () => {
    const agencies = [
      buildPayload({ encoursTotalActif: 1000000.5, soldeCaisses: 250000.25, totalClientsActifs: 120 }),
      buildPayload({ encoursTotalActif: 2500000.75, soldeCaisses: 100000.1, totalClientsActifs: 80 }),
    ];
    const consolidated = buildPayload({
      encoursTotalActif: 3500001.25,
      soldeCaisses: 350000.35,
      totalClientsActifs: 200,
    });

    const result = checkConsolidatedCoherence(agencies, consolidated);
    expect(result.coherent).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('tolère les écarts d\'arrondi (≤ tolérance)', () => {
    const agencies = [
      buildPayload({ encoursTotalActif: 100.01 }),
      buildPayload({ encoursTotalActif: 200.01 }),
    ];
    // Écart de 0.02 pour 2 agences → tolérance 0.01 × 3 = 0.03 : accepté
    const consolidated = buildPayload({ encoursTotalActif: 300.04 });

    const result = checkConsolidatedCoherence(agencies, consolidated);
    expect(result.coherent).toBe(true);
  });

  it('détecte un écart réel et produit un warning explicite', () => {
    const agencies = [
      buildPayload({ soldeCaisses: 500000 }),
      buildPayload({ soldeCaisses: 300000 }),
    ];
    // 75 000 manquants dans le consolidé (ex. caisse hors périmètre agence)
    const consolidated = buildPayload({ soldeCaisses: 725000 });

    const result = checkConsolidatedCoherence(agencies, consolidated);
    expect(result.coherent).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('tresorerie.soldeCaisses');
    expect(result.warnings[0]).toContain('consolidé=725000');
    expect(result.warnings[0]).toContain('somme=800000');
  });

  it('ne compare pas les ratios (non additifs)', () => {
    // tauxApprobation vaut 50 partout : la « somme » (100) ≠ consolidé (50),
    // mais aucun warning ne doit être émis pour une clé non additive.
    const agencies = [buildPayload(), buildPayload()];
    const consolidated = buildPayload();

    const result = checkConsolidatedCoherence(agencies, consolidated);
    expect(result.coherent).toBe(true);
  });

  it('zéro agence : consolidé non nul → écart signalé', () => {
    const consolidated = buildPayload({ totalClientsActifs: 10 });
    const result = checkConsolidatedCoherence([], consolidated);
    expect(result.coherent).toBe(false);
    expect(result.warnings.some(w => w.includes('clients.totalClientsActifs'))).toBe(true);
  });
});
