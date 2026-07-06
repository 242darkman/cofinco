import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { SERVER_HEALTH_BACKOFF_DELAYS, SERVER_HEALTH_ENDPOINT } from '../lib/serverHealthConfig';

interface ServerHealthContextValue {
  isServerReachable: boolean;
  isChecking: boolean;
  checkHealth: () => Promise<boolean>;
  reportFailure: (error?: unknown) => void;
  reportSuccess: () => void;
  waitForReachable: () => Promise<void>;
}

const ServerHealthContext = createContext<ServerHealthContextValue | undefined>(undefined);

interface ServerHealthBridge {
  getIsServerReachable: () => boolean;
  waitForReachable: () => Promise<void>;
  reportFailure: (error?: unknown) => void;
  reportSuccess: () => void;
}

let serverHealthBridge: ServerHealthBridge | null = null;

export function getServerHealthBridge(): ServerHealthBridge | null {
  return serverHealthBridge;
}

function setServerHealthBridge(bridge: ServerHealthBridge | null) {
  serverHealthBridge = bridge;
}

export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { name?: string }).name === 'AbortError') return false;
  if (error instanceof TypeError) {
    const message = error.message || '';
    return (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed')
    );
  }
  return false;
}

// Threshold: only show offline overlay after this many consecutive failures
const OFFLINE_FAILURE_THRESHOLD = 2;
// Minimum time between showing the overlay again (prevents flickering)
const OFFLINE_DEBOUNCE_MS = 3000;

// Fast probe configuration
const FAST_PROBE_TIMEOUT_MS = 3000;
const FAST_PROBE_DEBOUNCE_MS = 300;
const FAST_PROBE_JITTER_MAX_MS = 200;
const FAST_BACKOFF_DELAYS = [500, 1000, 2000];

export function ServerHealthProvider({ children }: { children: React.ReactNode }) {
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const pendingResolversRef = useRef<Array<() => void>>([]);
  const backoffIndexRef = useRef(0);
  const pollTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const consecutiveFailuresRef = useRef(0);
  const lastOfflineTimeRef = useRef(0);

  // Fast probe state
  const probeInProgressRef = useRef(false);
  const fastProbeDebounceRef = useRef<number | null>(null);
  const fastProbeTimeoutRef = useRef<number | null>(null);

  const resolvePending = useCallback(() => {
    const resolvers = pendingResolversRef.current;
    pendingResolversRef.current = [];
    resolvers.forEach((resolve) => resolve());
  }, []);

  const clearPolling = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const runHealthCheck = useCallback(async (): Promise<boolean> => {
    if (!isMountedRef.current) return false;
    setIsChecking(true);
    let reachable = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FAST_PROBE_TIMEOUT_MS);
      const response = await fetch(SERVER_HEALTH_ENDPOINT, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      reachable = response.ok;
    } catch {
      reachable = false;
    }

    if (!isMountedRef.current) return false;
    setIsChecking(false);

    if (reachable) {
      consecutiveFailuresRef.current = 0;
      backoffIndexRef.current = 0;
      clearPolling();
      resolvePending();
      setIsServerReachable((prev) => (prev ? prev : true));
      return true;
    }

    setIsServerReachable((prev) => (prev ? false : prev));
    return false;
  }, [clearPolling, resolvePending]);

  const scheduleNextCheck = useCallback(() => {
    if (pollTimeoutRef.current !== null) return;
    const baseDelay =
      SERVER_HEALTH_BACKOFF_DELAYS[
        Math.min(backoffIndexRef.current, SERVER_HEALTH_BACKOFF_DELAYS.length - 1)
      ];
    // Add jitter (+-20%) to prevent thundering herd
    const jitter = baseDelay * (0.8 + Math.random() * 0.4);
    pollTimeoutRef.current = window.setTimeout(async () => {
      pollTimeoutRef.current = null;
      const ok = await runHealthCheck();
      if (!ok) {
        scheduleNextCheck();
      }
    }, jitter);
    backoffIndexRef.current = Math.min(
      backoffIndexRef.current + 1,
      SERVER_HEALTH_BACKOFF_DELAYS.length - 1
    );
  }, [runHealthCheck]);

  const checkHealth = useCallback(async () => {
    clearPolling();
    const ok = await runHealthCheck();
    if (!ok) {
      scheduleNextCheck();
    }
    return ok;
  }, [clearPolling, runHealthCheck, scheduleNextCheck]);

  // ============================================================
  // Fast Reconnect Probe
  // ============================================================
  // Triggered by browser events (online, focus, visibilitychange, pageshow).
  // Uses fast backoff (500ms → 1s → 2s) with debounce + jitter + concurrency lock.

  const runFastProbe = useCallback(async () => {
    if (probeInProgressRef.current || !isMountedRef.current) return;
    probeInProgressRef.current = true;

    try {
      // Try with fast backoff: 500ms → 1s → 2s
      for (let attempt = 0; attempt < FAST_BACKOFF_DELAYS.length; attempt++) {
        if (!isMountedRef.current) break;

        const ok = await runHealthCheck();
        if (ok) {
          if (import.meta.env.DEV) console.log(`[ServerHealth] Fast probe succeeded (attempt ${attempt + 1})`);
          return;
        }

        // Wait before next fast attempt (unless last attempt)
        if (attempt < FAST_BACKOFF_DELAYS.length - 1) {
          await new Promise((r) => {
            fastProbeTimeoutRef.current = window.setTimeout(r, FAST_BACKOFF_DELAYS[attempt]);
          });
          fastProbeTimeoutRef.current = null;
        }
      }

      // Fast probe exhausted — fall back to normal backoff
      if (import.meta.env.DEV) console.log('[ServerHealth] Fast probe exhausted, falling back to normal backoff');
      scheduleNextCheck();
    } finally {
      probeInProgressRef.current = false;
    }
  }, [runHealthCheck, scheduleNextCheck]);

  const triggerFastProbe = useCallback(() => {
    // Skip if already probing
    if (probeInProgressRef.current) return;

    // Debounce: coalesce rapid triggers (online + focus + visibility all firing)
    if (fastProbeDebounceRef.current !== null) {
      clearTimeout(fastProbeDebounceRef.current);
    }

    fastProbeDebounceRef.current = window.setTimeout(() => {
      fastProbeDebounceRef.current = null;

      // Add random jitter (0–200ms) to prevent thundering herd across clients
      const jitter = Math.random() * FAST_PROBE_JITTER_MAX_MS;
      window.setTimeout(() => {
        // Cancel any existing scheduled backoff — the fast probe takes over
        clearPolling();
        runFastProbe();
      }, jitter);
    }, FAST_PROBE_DEBOUNCE_MS);
  }, [clearPolling, runFastProbe]);

  // ============================================================
  // Browser Event Listeners for Fast Reconnect
  // ============================================================

  useEffect(() => {
    const handleOnline = () => {
      if (import.meta.env.DEV) console.log('[ServerHealth] Browser online event — triggering fast probe');
      triggerFastProbe();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (import.meta.env.DEV) console.log('[ServerHealth] Tab visible — triggering fast probe');
        triggerFastProbe();
      }
    };

    const handleFocus = () => {
      if (import.meta.env.DEV) console.log('[ServerHealth] Window focus — triggering fast probe');
      triggerFastProbe();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        if (import.meta.env.DEV) console.log('[ServerHealth] Page restored from bfcache — triggering fast probe');
        triggerFastProbe();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [triggerFastProbe]);

  const reportFailure = useCallback(() => {
    consecutiveFailuresRef.current += 1;

    if (consecutiveFailuresRef.current >= OFFLINE_FAILURE_THRESHOLD) {
      const now = Date.now();
      const timeSinceLastOffline = now - lastOfflineTimeRef.current;

      if (timeSinceLastOffline > OFFLINE_DEBOUNCE_MS) {
        setIsServerReachable((prev) => {
          if (!prev) return prev;
          lastOfflineTimeRef.current = now;
          return false;
        });
      }
    }

    scheduleNextCheck();
  }, [scheduleNextCheck]);

  const reportSuccess = useCallback(() => {
    consecutiveFailuresRef.current = 0;
    backoffIndexRef.current = 0;
    clearPolling();
    resolvePending();
    setIsServerReachable((prev) => (prev ? prev : true));
  }, [clearPolling, resolvePending]);

  const waitForReachable = useCallback(() => {
    if (isServerReachable) return Promise.resolve();
    return new Promise<void>((resolve) => {
      pendingResolversRef.current.push(resolve);
    });
  }, [isServerReachable]);

  const value = useMemo(
    () => ({
      isServerReachable,
      isChecking,
      checkHealth,
      reportFailure,
      reportSuccess,
      waitForReachable,
    }),
    [isServerReachable, isChecking, checkHealth, reportFailure, reportSuccess, waitForReachable]
  );

  useEffect(() => {
    setServerHealthBridge({
      getIsServerReachable: () => isServerReachable,
      waitForReachable,
      reportFailure,
      reportSuccess,
    });

    return () => {
      setServerHealthBridge(null);
    };
  }, [isServerReachable, waitForReachable, reportFailure, reportSuccess]);

  useEffect(() => {
    onlineManager.setOnline(isServerReachable);
  }, [isServerReachable]);

  // Only run health check once on mount
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    void checkHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearPolling();
      if (fastProbeDebounceRef.current !== null) clearTimeout(fastProbeDebounceRef.current);
      if (fastProbeTimeoutRef.current !== null) clearTimeout(fastProbeTimeoutRef.current);
      pendingResolversRef.current = [];
      consecutiveFailuresRef.current = 0;
    };
  }, [clearPolling]);

  return (
    <ServerHealthContext.Provider value={value}>
      {children}
    </ServerHealthContext.Provider>
  );
}

export function useServerHealth() {
  const context = useContext(ServerHealthContext);
  if (!context) {
    throw new Error('useServerHealth must be used within a ServerHealthProvider');
  }
  return context;
}
