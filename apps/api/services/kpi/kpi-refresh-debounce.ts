/**
 * KPI Refresh Debounce — scheduler générique debounce + intervalle minimal.
 *
 * Module pur (aucune dépendance DB/WS) : testable avec des fake timers.
 * Utilisé par le worker KPI pour regrouper les rafales d'événements outbox
 * en un seul recalcul, avec un intervalle minimal entre deux recalculs.
 */
import { createLogger } from "../../lib/logger";

const logger = createLogger('KpiRefreshScheduler');

export interface KpiRefreshSchedulerOptions {
  /** Fonction de rafraîchissement effectivement exécutée. */
  refresh: () => Promise<void>;
  /** Délai de regroupement des marquages dirty. */
  debounceMs: number;
  /** Intervalle minimal entre deux exécutions de refresh. */
  minIntervalMs: number;
}

export interface KpiRefreshScheduler {
  /** Signale qu'une donnée source a changé. */
  markDirty: (reason?: string) => void;
  /** Arrête le scheduler et annule le timer en attente. */
  stop: () => void;
  /** true si un refresh est planifié ou en cours. */
  isPending: () => boolean;
}

/**
 * Crée un scheduler debounce + intervalle minimal.
 *
 * Garanties :
 * - jamais deux `refresh` simultanés ;
 * - au plus un refresh par `minIntervalMs` ;
 * - un échec de refresh re-marque dirty et replanifie (retry borné par
 *   l'intervalle minimal — pas de boucle chaude) ;
 * - un markDirty pendant un refresh en cours déclenche un nouveau passage.
 */
export function createKpiRefreshScheduler(options: KpiRefreshSchedulerOptions): KpiRefreshScheduler {
  const { refresh, debounceMs, minIntervalMs } = options;

  let dirty = false;
  let running = false;
  let stopped = false;
  let lastRunAt = 0;
  let timer: NodeJS.Timeout | null = null;

  function scheduleFlush(): void {
    if (stopped || timer) return;
    const now = Date.now();
    const earliestNextRun = lastRunAt + minIntervalMs;
    const delay = Math.max(debounceMs, earliestNextRun - now);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
    // Ne pas empêcher l'arrêt du process
    timer.unref?.();
  }

  async function flush(): Promise<void> {
    if (stopped) return;
    if (running) {
      // Un refresh est déjà en cours : on replanifie pour après
      scheduleFlush();
      return;
    }
    dirty = false;
    running = true;
    try {
      await refresh();
    } catch (err) {
      logger.error({ err }, 'KPI refresh failed');
      // Échec : on considère les données toujours dirty pour retenter
      dirty = true;
    } finally {
      running = false;
      lastRunAt = Date.now();
      if (dirty && !stopped) scheduleFlush();
    }
  }

  return {
    markDirty: () => {
      if (stopped) return;
      dirty = true;
      scheduleFlush();
    },
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isPending: () => timer !== null || running,
  };
}
