/**
 * KPI Refresh Worker — rafraîchissement quasi temps réel des snapshots KPI.
 *
 * Principe : chaque événement financier publié par l'outbox marque les KPI
 * « dirty ». Un debounce regroupe les rafales d'opérations, puis le worker
 * recalcule les snapshots de la période COURANTE (toutes agences + consolidé)
 * et diffuse un événement WebSocket `kpi` pour que les clients invalident
 * leur cache TanStack Query.
 *
 * Garanties :
 * - jamais deux recalculs simultanés (scheduler + verrou consultatif
 *   PostgreSQL dans upsertSnapshot) ;
 * - intervalle minimal entre deux recalculs (KPI_REFRESH_MIN_INTERVAL_MS) ;
 * - la période annuelle est rafraîchie moins souvent (coûteuse, lente à
 *   bouger) — KPI_REFRESH_YEAR_INTERVAL_MS ;
 * - idempotent : recalculer sans changement produit le même snapshot.
 */
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";
import { currentPeriodKeys } from "./kpi-periods";
import { createKpiRefreshScheduler, type KpiRefreshScheduler } from "./kpi-refresh-debounce";
import { refreshAllScopes } from "./kpi-refresh-service";

const logger = createLogger('KpiRefreshWorker');

// Défauts sûrs, surchargeables par variables d'environnement
const DEFAULT_DEBOUNCE_MS = 20_000;          // regroupe les rafales d'événements
const DEFAULT_MIN_INTERVAL_MS = 60_000;      // au plus 1 recalcul global / minute
const DEFAULT_YEAR_REFRESH_MS = 10 * 60_000; // vue annuelle : au plus 1 / 10 min

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let scheduler: KpiRefreshScheduler | null = null;
let lastYearRefreshAt = 0;

/**
 * Diffuse l'événement de mise à jour KPI à tous les clients WebSocket.
 * Utilisé par le worker ET par le recalcul manuel (route /recalculate) :
 * quel que soit le déclencheur, tous les écrans connectés se rafraîchissent.
 */
export function broadcastKpiUpdated(periodKeys: string[]): void {
  const ws = getWsInstance();
  if (!ws) return;
  ws.broadcast({
    type: "REALTIME_EVENT" as any,
    payload: {
      channel: 'kpi:refresh',
      eventType: 'KPI_SNAPSHOT_UPDATED',
      aggregateType: 'kpi',
      aggregateId: 'refresh',
      data: { periodKeys },
      timestamp: new Date(),
    },
  });
}

/** Recalcule la période courante (mois toujours, année au plus 1×/10 min). */
async function refreshCurrentPeriods(): Promise<void> {
  const startMs = Date.now();
  const { monthKey, yearKey } = currentPeriodKeys();
  const refreshedKeys: string[] = [monthKey];

  await refreshAllScopes({ periodType: 'MONTH', periodKey: monthKey, source: 'scheduled' });

  const yearIntervalMs = envInt('KPI_REFRESH_YEAR_INTERVAL_MS', DEFAULT_YEAR_REFRESH_MS);
  if (Date.now() - lastYearRefreshAt >= yearIntervalMs) {
    await refreshAllScopes({ periodType: 'YEAR', periodKey: yearKey, source: 'scheduled' });
    lastYearRefreshAt = Date.now();
    refreshedKeys.push(yearKey);
  }

  broadcastKpiUpdated(refreshedKeys);
  logger.info(
    { periodKeys: refreshedKeys, durationMs: Date.now() - startMs },
    'KPI snapshots rafraîchis (temps réel)',
  );
}

/**
 * Marque les KPI comme obsolètes suite à un événement métier.
 * Appelé par l'outbox worker pour chaque lot d'événements publié,
 * et par le cron filet de sécurité.
 */
export function markKpiDirty(reason?: string): void {
  if (!scheduler) return; // worker non démarré (ex. DISABLE_CRON_JOBS=true)
  scheduler.markDirty(reason);
}

/** Démarre le worker (idempotent). */
export function startKpiRefreshWorker(): void {
  if (scheduler) return;
  scheduler = createKpiRefreshScheduler({
    refresh: refreshCurrentPeriods,
    debounceMs: envInt('KPI_REFRESH_DEBOUNCE_MS', DEFAULT_DEBOUNCE_MS),
    minIntervalMs: envInt('KPI_REFRESH_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS),
  });
  logger.info('KPI refresh worker started');
}

/** Arrête le worker (tests et arrêt propre). */
export function stopKpiRefreshWorker(): void {
  if (!scheduler) return;
  scheduler.stop();
  scheduler = null;
  logger.info('KPI refresh worker stopped');
}
