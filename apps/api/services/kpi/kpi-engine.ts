/**
 * KPI Engine — Orchestrates computation of all KPI domains
 *
 * Toutes les requêtes (période courante + période précédente) s'exécutent
 * dans UNE transaction PostgreSQL REPEATABLE READ en lecture seule : chaque
 * snapshot KPI reflète donc un instantané MVCC unique de la base (cohérence
 * point-in-time entre domaines), même si des opérations financières sont
 * postées pendant le calcul.
 *
 * Les deltas sont calculés en Decimal (aucune arithmétique flottante JS sur
 * des montants — règle AGENTS.md §9).
 */
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { parsePeriodRange, getPreviousPeriodKey, computeDelta } from "./kpi-periods";
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
  type KpiDb,
} from "./kpi-queries";

const logger = createLogger('KpiEngine');

// Helpers purs (périodes, deltas) — ré-exportés pour compatibilité
export { parsePeriodRange, getPreviousPeriodKey, computeDelta } from "./kpi-periods";

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
  /** Origine du calcul : bouton admin (manual) ou worker/cron (scheduled) */
  source?: KpiMetadata['source'];
}

interface DomainResults {
  credit: KpiCreditPayload;
  risque: KpiRisquePayload;
  tontinesEpargne: KpiTontinesEpargnePayload;
  rentabilite: KpiRentabilitePayload;
  tresorerie: KpiTresoreriePayload;
  clients: KpiClientsPayload;
  rhProductivite: KpiRhProductivitePayload;
}

/**
 * Exécute les 7 domaines séquentiellement sur l'exécuteur fourni.
 * Séquentiel : dans une transaction, une seule connexion est disponible.
 */
async function queryAllDomains(
  agId: string | undefined,
  start: Date,
  end: Date,
  dbx: KpiDb,
): Promise<DomainResults> {
  return {
    credit: await queryCreditKpis(agId, start, end, dbx),
    risque: await queryRisqueKpis(agId, start, end, dbx),
    tontinesEpargne: await queryTontinesEpargneKpis(agId, start, end, dbx),
    rentabilite: await queryRentabiliteKpis(agId, start, end, dbx),
    tresorerie: await queryTresorerieKpis(agId, start, end, dbx),
    clients: await queryClientsKpis(agId, start, end, dbx),
    rhProductivite: await queryRhProductiviteKpis(agId, start, end, dbx),
  };
}

export async function computeKpiPayload(options: ComputeOptions): Promise<{ payload: KpiPayload; metadata: KpiMetadata }> {
  const startMs = Date.now();
  const { periodType, periodKey, agencyId } = options;
  const { start, end } = parsePeriodRange(periodType, periodKey);
  const agId = agencyId || undefined;

  logger.info({ periodType, periodKey, agencyId, start, end }, 'Computing KPI payload');

  const prevPeriodKey = getPreviousPeriodKey(periodType, periodKey);
  const { start: prevStart, end: prevEnd } = parsePeriodRange(periodType, prevPeriodKey);

  // Vue point-in-time unique pour TOUTES les requêtes (courante + précédente)
  const { current, previous } = await db.transaction(
    async (tx) => {
      const currentResults = await queryAllDomains(agId, start, end, tx);
      const previousResults = await queryAllDomains(agId, prevStart, prevEnd, tx);
      return { current: currentResults, previous: previousResults };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );

  // Compute deltas
  const creditKeys: (keyof KpiCreditPayload)[] = ['encoursTotalActif', 'nombreCreditsActifs', 'decaissementsPeriode', 'nombreDecaissements', 'tauxApprobation', 'panierMoyen'];
  const risqueKeys: (keyof KpiRisquePayload)[] = ['par30', 'par60', 'par90', 'tauxRecouvrement', 'tauxDefaut', 'creditsEnSouffrance'];
  const tontineKeys: (keyof KpiTontinesEpargnePayload)[] = ['encoursEpargne', 'encoursComptesCourants', 'tontinesActives', 'membresTontines', 'volumesCollectes', 'volumesRetires'];
  const rentabiliteKeys: (keyof KpiRentabilitePayload)[] = ['interetsPercus', 'fraisCommissions', 'totalRevenus', 'charges', 'resultatNet'];
  const tresorerieKeys: (keyof KpiTresoreriePayload)[] = ['soldeCaisses', 'soldeCoffres', 'fluxEntrants', 'fluxSortants', 'ecartsCaisses'];
  const clientsKeys: (keyof KpiClientsPayload)[] = ['totalClientsActifs', 'nouveauxClients', 'tauxRetention'];
  const rhKeys: (keyof KpiRhProductivitePayload)[] = ['agentsActifs', 'clientsParAgent', 'encoursParAgent', 'decaissementsParAgent', 'masseSalariale'];

  const deltas: KpiDeltas = {
    credit: computeDomainDeltas(current.credit, previous.credit, creditKeys),
    risque: computeDomainDeltas(current.risque, previous.risque, risqueKeys),
    tontinesEpargne: computeDomainDeltas(current.tontinesEpargne, previous.tontinesEpargne, tontineKeys),
    rentabilite: computeDomainDeltas(current.rentabilite, previous.rentabilite, rentabiliteKeys),
    tresorerie: computeDomainDeltas(current.tresorerie, previous.tresorerie, tresorerieKeys),
    clients: computeDomainDeltas(current.clients, previous.clients, clientsKeys),
    rhProductivite: computeDomainDeltas(current.rhProductivite, previous.rhProductivite, rhKeys),
  };

  const computeDurationMs = Date.now() - startMs;
  logger.info({ computeDurationMs, periodKey, agencyId }, 'KPI computation complete');

  return {
    payload: { ...current, deltas },
    metadata: {
      source: options.source ?? 'manual',
      triggeredBy: options.generatedBy,
      computeDurationMs,
      warnings: [],
    },
  };
}
