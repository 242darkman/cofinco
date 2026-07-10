import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKpiRefreshScheduler } from '../../apps/api/services/kpi/kpi-refresh-debounce';

describe('KPI Refresh Scheduler — debounce + intervalle minimal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('regroupe une rafale de markDirty en un seul refresh après le debounce', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 1000, minIntervalMs: 5000 });

    scheduler.markDirty('op-1');
    scheduler.markDirty('op-2');
    scheduler.markDirty('op-3');

    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('respecte l\'intervalle minimal entre deux refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 1000, minIntervalMs: 10000 });

    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Nouveau dirty juste après : le prochain refresh doit attendre minInterval
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(1000); // debounce écoulé mais pas minInterval
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9000); // minInterval atteint
    expect(refresh).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('un markDirty pendant un refresh en cours déclenche un nouveau passage', async () => {
    let resolveFirst: () => void;
    const firstRun = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const refresh = vi.fn()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 100, minIntervalMs: 200 });

    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Pendant que le premier refresh tourne, une nouvelle opération arrive
    scheduler.markDirty();
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(300);
    expect(refresh).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('retente après un échec de refresh (données toujours dirty)', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('DB indisponible'))
      .mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 100, minIntervalMs: 1000 });

    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);

    // L'échec replanifie automatiquement (borné par minInterval — pas de boucle chaude)
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('stop() annule le refresh planifié', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 1000, minIntervalMs: 5000 });

    scheduler.markDirty();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('isPending reflète l\'état planifié/inactif', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createKpiRefreshScheduler({ refresh, debounceMs: 500, minIntervalMs: 500 });

    expect(scheduler.isPending()).toBe(false);
    scheduler.markDirty();
    expect(scheduler.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(scheduler.isPending()).toBe(false);

    scheduler.stop();
  });
});
