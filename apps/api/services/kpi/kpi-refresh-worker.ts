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
import { createDirtyPeriodTracker } from "./kpi-dirty-tracker";
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
const tracker = createDirtyPeriodTracker();

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

// Au-delà de ce nombre de mois distincts dans une même passe, quelque chose
// d'anormal se produit (rejeu massif) : on traite tout mais on alerte.
const MAX_PERIODS_WARN = 8;

/**
 * Recalcule toutes les périodes marquées dirty (mois toujours, année
 * courante au plus 1×/10 min, années passées immédiatement — cas rare).
 * Les périodes non traitées en cas d'échec sont ré-armées pour la passe
 * suivante.
 */
async function refreshDirtyPeriods(): Promise<void> {
  const startMs = Date.now();
  const current = currentPeriodKeys();
  const drained = tracker.drain();

  // Sécurité : passe déclenchée sans marquage explicite → période courante
  if (drained.monthKeys.length === 0) {
    drained.monthKeys = [current.monthKey];
    drained.yearKeys = [current.yearKey];
  }
  if (drained.monthKeys.length > MAX_PERIODS_WARN) {
    logger.warn(
      { count: drained.monthKeys.length, monthKeys: drained.monthKeys },
      'Nombre inhabituel de périodes à rafraîchir dans une même passe',
    );
  }

  const refreshedKeys: string[] = [];
  const doneMonths = new Set<string>();
  const doneYears = new Set<string>();

  try {
    for (const monthKey of drained.monthKeys) {
      await refreshAllScopes({ periodType: 'MONTH', periodKey: monthKey, source: 'scheduled' });
      doneMonths.add(monthKey);
      refreshedKeys.push(monthKey);
    }

    const yearIntervalMs = envInt('KPI_REFRESH_YEAR_INTERVAL_MS', DEFAULT_YEAR_REFRESH_MS);
    for (const yearKey of drained.yearKeys) {
      if (yearKey === current.yearKey) {
        // Année courante : coûteuse et lente à bouger — cadence limitée
        if (Date.now() - lastYearRefreshAt < yearIntervalMs) {
          doneYears.add(yearKey);
          continue;
        }
        lastYearRefreshAt = Date.now();
      }
      await refreshAllScopes({ periodType: 'YEAR', periodKey: yearKey, source: 'scheduled' });
      doneYears.add(yearKey);
      refreshedKeys.push(yearKey);
    }
  } catch (err) {
    // Ré-armer ce qui n'a pas été traité, puis laisser le scheduler retenter
    tracker.restore({
      monthKeys: drained.monthKeys.filter((k) => !doneMonths.has(k)),
      yearKeys: drained.yearKeys.filter((k) => !doneYears.has(k)),
    });
    throw err;
  }

  broadcastKpiUpdated(refreshedKeys);
  logger.info(
    { periodKeys: refreshedKeys, durationMs: Date.now() - startMs },
    'KPI snapshots rafraîchis (temps réel)',
  );
}

/**
 * Marque la période COURANTE comme obsolète.
 * Appelé par le cron filet de sécurité et l'amorçage au démarrage.
 */
export function markKpiDirty(reason?: string): void {
  if (!scheduler) return; // worker non démarré (ex. DISABLE_CRON_JOBS=true)
  tracker.markCurrent();
  scheduler.markDirty(reason);
}

/**
 * Marque les périodes contenant les dates d'opération données (timezone
 * métier). Une opération antidatée — rejeu offline tardif, écriture sur
 * période antérieure — invalide ainsi SA période, pas seulement la courante.
 * Les dates inexploitables retombent sur la période courante.
 */
export function markKpiDirtyForDates(dates: Array<Date | string | undefined>): void {
  if (!scheduler) return;
  let marked = false;
  for (const raw of dates) {
    if (raw === undefined) continue;
    if (tracker.markDate(raw instanceof Date ? raw : new Date(raw))) marked = true;
  }
  if (!marked) tracker.markCurrent();
  scheduler.markDirty('outbox-events');
}

/** Démarre le worker (idempotent). */
export function startKpiRefreshWorker(): void {
  if (scheduler) return;
  scheduler = createKpiRefreshScheduler({
    refresh: refreshDirtyPeriods,
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
