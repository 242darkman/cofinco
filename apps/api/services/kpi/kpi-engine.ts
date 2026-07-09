/**
 * KPI Engine — Orchestrates computation of all KPI domains
 *
 * Runs all domain queries in parallel and computes deltas vs previous period.
 */
import { createLogger } from "../../lib/logger";
import type {
  KpiPayload,
  KpiCreditPayload,
  KpiRisquePayload,
  KpiTontinesEpargnePayload,
  KpiRentabilitePayload,
  KpiTresoreriePayload,
  KpiClientsPayload,
  KpiRhProductivitePayload,
  KpiDeltas,
  KpiDelta,
  KpiPeriodType,
  KpiMetadata,
} from "@shared/schema/kpi";
import {
  queryCreditKpis,
  queryRisqueKpis,
  queryTontinesEpargneKpis,
  queryRentabiliteKpis,
  queryTresorerieKpis,
  queryClientsKpis,
  queryRhProductiviteKpis,
} from "./kpi-queries";

const logger = createLogger('KpiEngine');

// =====================
// Period helpers
// =====================

export function parsePeriodRange(periodType: KpiPeriodType, periodKey: string): { start: Date; end: Date } {
  if (periodType === 'MONTH') {
    // periodKey = '2026-02'
    const [year, month] = periodKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // First day of next month
    return { start, end };
  }
  // YEAR — periodKey = '2026'
  const year = Number(periodKey);
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
}

export function getPreviousPeriodKey(periodType: KpiPeriodType, periodKey: string): string {
  if (periodType === 'MONTH') {
    const [year, month] = periodKey.split('-').map(Number);
    if (month === 1) return `${year - 1}-12`;
    return `${year}-${String(month - 1).padStart(2, '0')}`;
  }
  return String(Number(periodKey) - 1);
}

// =====================
// Delta computation
// =====================

function computeDelta(current: number, previous: number): KpiDelta {
  return {
    value: Math.round((current - previous) * 100) / 100,
    percent: previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100 : 0,
  };
}

function computeDomainDeltas<T extends Record<string, any>>(
  current: T,
  previous: T,
  keys: (keyof T)[],
): Partial<Record<keyof T, KpiDelta>> {
  const deltas: Partial<Record<keyof T, KpiDelta>> = {};
  for (const key of keys) {
    if (typeof current[key] === 'number' && typeof previous[key] === 'number') {
      deltas[key] = computeDelta(current[key] as number, previous[key] as number);
    }
  }
  return deltas;
}

// =====================
// Main compute function
// =====================

export interface ComputeOptions {
  periodType: KpiPeriodType;
  periodKey: string;
  agencyId?: string | null;
  generatedBy?: string;
}

export async function computeKpiPayload(options: ComputeOptions): Promise<{ payload: KpiPayload; metadata: KpiMetadata }> {
  const startMs = Date.now();
  const { periodType, periodKey, agencyId } = options;
  const { start, end } = parsePeriodRange(periodType, periodKey);
  const agId = agencyId || undefined;

  logger.info({ periodType, periodKey, agencyId, start, end }, 'Computing KPI payload');

  // Current period — all domains in parallel
  const [credit, risque, tontinesEpargne, rentabilite, tresorerie, clients, rhProductivite] = await Promise.all([
    queryCreditKpis(agId, start, end),
    queryRisqueKpis(agId, start, end),
    queryTontinesEpargneKpis(agId, start, end),
    queryRentabiliteKpis(agId, start, end),
    queryTresorerieKpis(agId, start, end),
    queryClientsKpis(agId, start, end),
    queryRhProductiviteKpis(agId, start, end),
  ]);

  // Previous period for deltas
  const prevPeriodKey = getPreviousPeriodKey(periodType, periodKey);
  const { start: prevStart, end: prevEnd } = parsePeriodRange(periodType, prevPeriodKey);

  const [prevCredit, prevRisque, prevTontinesEpargne, prevRentabilite, prevTresorerie, prevClients, prevRh] = await Promise.all([
    queryCreditKpis(agId, prevStart, prevEnd),
    queryRisqueKpis(agId, prevStart, prevEnd),
    queryTontinesEpargneKpis(agId, prevStart, prevEnd),
    queryRentabiliteKpis(agId, prevStart, prevEnd),
    queryTresorerieKpis(agId, prevStart, prevEnd),
    queryClientsKpis(agId, prevStart, prevEnd),
    queryRhProductiviteKpis(agId, prevStart, prevEnd),
  ]);

  // Compute deltas
  const creditKeys: (keyof KpiCreditPayload)[] = ['encoursTotalActif', 'nombreCreditsActifs', 'decaissementsPeriode', 'nombreDecaissements', 'tauxApprobation', 'panierMoyen'];
  const risqueKeys: (keyof KpiRisquePayload)[] = ['par30', 'par60', 'par90', 'tauxRecouvrement', 'tauxDefaut', 'creditsEnSouffrance'];
  const tontineKeys: (keyof KpiTontinesEpargnePayload)[] = ['encoursEpargne', 'encoursComptesCourants', 'tontinesActives', 'membresTontines', 'volumesCollectes', 'volumesRetires'];
  const rentabiliteKeys: (keyof KpiRentabilitePayload)[] = ['interetsPercus', 'fraisCommissions', 'totalRevenus', 'charges', 'resultatNet'];
  const tresorerieKeys: (keyof KpiTresoreriePayload)[] = ['soldeCaisses', 'soldeCoffres', 'fluxEntrants', 'fluxSortants', 'ecartsCaisses'];
  const clientsKeys: (keyof KpiClientsPayload)[] = ['totalClientsActifs', 'nouveauxClients', 'tauxRetention'];
  const rhKeys: (keyof KpiRhProductivitePayload)[] = ['agentsActifs', 'clientsParAgent', 'encoursParAgent', 'decaissementsParAgent', 'masseSalariale'];

  const deltas: KpiDeltas = {
    credit: computeDomainDeltas(credit, prevCredit, creditKeys),
    risque: computeDomainDeltas(risque, prevRisque, risqueKeys),
    tontinesEpargne: computeDomainDeltas(tontinesEpargne, prevTontinesEpargne, tontineKeys),
    rentabilite: computeDomainDeltas(rentabilite, prevRentabilite, rentabiliteKeys),
    tresorerie: computeDomainDeltas(tresorerie, prevTresorerie, tresorerieKeys),
    clients: computeDomainDeltas(clients, prevClients, clientsKeys),
    rhProductivite: computeDomainDeltas(rhProductivite, prevRh, rhKeys),
  };

  const computeDurationMs = Date.now() - startMs;
  logger.info({ computeDurationMs, periodKey, agencyId }, 'KPI computation complete');

  return {
    payload: { credit, risque, tontinesEpargne, rentabilite, tresorerie, clients, rhProductivite, deltas },
    metadata: {
      source: 'manual',
      triggeredBy: options.generatedBy,
      computeDurationMs,
      warnings: [],
    },
  };
}
