/**
 * Network Context
 * React context wrapper for unified network state management
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { networkManager, NetworkState, NetworkStatus } from '../lib/networkManager';
import { useServerHealth } from './ServerHealthContext';

// ============================================================================
// Types
// ============================================================================

interface NetworkContextValue extends NetworkState {
  /** Check health and update status */
  checkHealth: () => Promise<boolean>;
  /** Is currently checking health */
  isChecking: boolean;
  /** Time of last successful sync (from any query) */
  lastSyncAt: Date | null;
  /** Seconds until next retry (null if not applicable) */
  nextRetryInSeconds: number | null;
  /** Is the connection usable (online or unstable) */
  isUsable: boolean;
  /** Is completely offline */
  isOffline: boolean;
  /** Is API down but internet works */
  isApiDown: boolean;
  /** Force a health check and retry */
  forceRetry: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface NetworkProviderProps {
  children: React.ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  // Get state from networkManager using useState + useEffect
  // (simpler than useSyncExternalStore and avoids reference comparison issues)
  const [networkState, setNetworkState] = useState<NetworkState>(() => networkManager.getState());

  // Subscribe to networkManager changes
  useEffect(() => {
    const unsubscribe = networkManager.subscribe((newState) => {
      setNetworkState({ ...newState }); // Create new object to trigger re-render
    });
    return unsubscribe;
  }, []);

  // Integrate with existing ServerHealthContext
  const { isServerReachable, isChecking, checkHealth: serverCheckHealth } = useServerHealth();

  // Track last sync time
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [nextRetryInSeconds, setNextRetryInSeconds] = useState<number | null>(null);

  // Countdown interval ref
  const countdownIntervalRef = useRef<number | null>(null);

  // Track previous server reachable state to avoid loops
  const prevServerReachableRef = useRef<boolean | null>(null);
  const hasMountedRef = useRef(false);

  // Sync networkManager status with ServerHealthContext
  // Only react to actual changes in isServerReachable after mount
  useEffect(() => {
    // Skip first render - let networkManager initialize on its own
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevServerReachableRef.current = isServerReachable;
      return;
    }

    // Only process if isServerReachable actually changed
    if (prevServerReachableRef.current === isServerReachable) {
      return;
    }

    const prevValue = prevServerReachableRef.current;
    prevServerReachableRef.current = isServerReachable;

    // Only sync when transitioning between reachable/unreachable
    if (prevValue !== null) {
      if (!isServerReachable) {
        // Server became unreachable
        if (navigator.onLine) {
          networkManager.forceStatus('api_down');
        } else {
          networkManager.forceStatus('offline');
        }
      } else {
        // Server became reachable again
        networkManager.forceStatus('online');
      }
    }
  }, [isServerReachable]);

  // Note: networkManager already listens to browser online/offline events internally
  // No need to sync with connectivityService here (would cause duplicate updates)

  // Update lastSyncAt when we get a success
  useEffect(() => {
    if (networkState.lastSuccessAt) {
      setLastSyncAt(new Date(networkState.lastSuccessAt));
    }
  }, [networkState.lastSuccessAt]);

  // Countdown timer for circuit breaker retry
  useEffect(() => {
    if (networkState.nextRetryAt) {
      const updateCountdown = () => {
        const remaining = networkManager.getTimeUntilRetry();
        if (remaining !== null && remaining > 0) {
          setNextRetryInSeconds(Math.ceil(remaining / 1000));
        } else {
          setNextRetryInSeconds(null);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      };

      updateCountdown();
      countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    } else {
      setNextRetryInSeconds(null);
    }
  }, [networkState.nextRetryAt]);

  // Enhanced health check
  const checkHealth = useCallback(async (): Promise<boolean> => {
    const result = await serverCheckHealth();

    if (result) {
      networkManager.reportSuccess(0); // Will be overwritten by actual latency
      setLastSyncAt(new Date());
    } else {
      networkManager.reportError({ message: 'Health check failed' }, true);
    }

    return result;
  }, [serverCheckHealth]);

  // Force retry (bypasses circuit breaker for manual retry)
  const forceRetry = useCallback(async (): Promise<void> => {
    // Reset circuit breaker state for manual retry
    networkManager.reset();
    await checkHealth();
  }, [checkHealth]);

  // Computed values
  const isUsable = networkState.status === 'online' || networkState.status === 'unstable';
  const isOffline = networkState.status === 'offline';
  const isApiDown = networkState.status === 'api_down';

  const value = useMemo<NetworkContextValue>(
    () => ({
      ...networkState,
      checkHealth,
      isChecking,
      lastSyncAt,
      nextRetryInSeconds,
      isUsable,
      isOffline,
      isApiDown,
      forceRetry,
    }),
    [
      networkState,
      checkHealth,
      isChecking,
      lastSyncAt,
      nextRetryInSeconds,
      isUsable,
      isOffline,
      isApiDown,
      forceRetry,
    ]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get full network context
 */
export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

/**
 * Get just the network status
 */
export function useNetworkStatus(): NetworkStatus {
  const { status } = useNetwork();
  return status;
}

/**
 * Check if the network is usable (online or unstable)
 */
export function useIsOnline(): boolean {
  const { isUsable } = useNetwork();
  return isUsable;
}

/**
 * Get last sync timestamp
 */
export function useLastSyncAt(): Date | null {
  const { lastSyncAt } = useNetwork();
  return lastSyncAt;
}

/**
 * Get seconds until next retry (for circuit breaker)
 */
export function useNextRetryIn(): number | null {
  const { nextRetryInSeconds } = useNetwork();
  return nextRetryInSeconds;
}

/**
 * Check if offline
 */
export function useIsOffline(): boolean {
  const { isOffline } = useNetwork();
  return isOffline;
}

/**
 * Check if API is down (internet works but server doesn't respond)
 */
export function useIsApiDown(): boolean {
  const { isApiDown } = useNetwork();
  return isApiDown;
}

/**
 * Get circuit breaker state
 */
export function useCircuitState() {
  const { circuitState, nextRetryInSeconds } = useNetwork();
  return { circuitState, nextRetryInSeconds };
}

// ============================================================================
// Utility: Report network events from anywhere
// ============================================================================

/**
 * Report a successful network request
 * Call this from fetch wrapper or query success handlers
 */
export function reportNetworkSuccess(latencyMs: number): void {
  networkManager.reportSuccess(latencyMs);
}

/**
 * Report a failed network request
 * Call this from fetch wrapper or query error handlers
 */
export function reportNetworkError(error: unknown, isApiError: boolean): void {
  networkManager.reportError(error, isApiError);
}

/**
 * Check if circuit breaker allows request
 * Throws CircuitOpenError if circuit is open
 */
export function checkCircuitBreaker(): void {
  networkManager.checkCircuit();
}

/**
 * Check if request should be retried
 */
export function shouldRetryRequest(method: string, hasIdempotencyKey: boolean): boolean {
  return networkManager.shouldRetryRequest(method, hasIdempotencyKey);
}
