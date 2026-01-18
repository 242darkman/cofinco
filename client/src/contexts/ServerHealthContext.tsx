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

export function ServerHealthProvider({ children }: { children: React.ReactNode }) {
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const pendingResolversRef = useRef<Array<() => void>>([]);
  const backoffIndexRef = useRef(0);
  const pollTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

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
      const response = await fetch(SERVER_HEALTH_ENDPOINT, { cache: 'no-store' });
      reachable = response.ok;
    } catch {
      reachable = false;
    }

    if (!isMountedRef.current) return false;
    setIsChecking(false);

    if (reachable) {
      setIsServerReachable(true);
      backoffIndexRef.current = 0;
      clearPolling();
      resolvePending();
      return true;
    }

    setIsServerReachable(false);
    return false;
  }, [clearPolling, resolvePending]);

  const scheduleNextCheck = useCallback(() => {
    if (pollTimeoutRef.current !== null) return;
    const delay =
      SERVER_HEALTH_BACKOFF_DELAYS[
        Math.min(backoffIndexRef.current, SERVER_HEALTH_BACKOFF_DELAYS.length - 1)
      ];
    pollTimeoutRef.current = window.setTimeout(async () => {
      pollTimeoutRef.current = null;
      const ok = await runHealthCheck();
      if (!ok) {
        scheduleNextCheck();
      }
    }, delay);
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

  const reportFailure = useCallback(() => {
    setIsServerReachable((prev) => {
      if (!prev) return prev;
      return false;
    });
    scheduleNextCheck();
  }, [scheduleNextCheck]);

  const reportSuccess = useCallback(() => {
    setIsServerReachable(true);
    backoffIndexRef.current = 0;
    clearPolling();
    resolvePending();
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

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearPolling();
      pendingResolversRef.current = [];
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
