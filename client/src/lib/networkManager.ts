/**
 * Network Manager
 * Central state machine for network status with circuit breaker
 */

import { CircuitOpenError } from './networkErrors';

// ============================================================================
// Types
// ============================================================================

export type NetworkStatus = 'online' | 'unstable' | 'offline' | 'api_down';
export type CircuitState = 'closed' | 'open' | 'half_open';

export interface NetworkState {
  status: NetworkStatus;
  circuitState: CircuitState;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  nextRetryAt: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  averageLatency: number;
  isNavigatorOnline: boolean;
}

type NetworkStateListener = (state: NetworkState) => void;

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Circuit breaker
  FAILURE_THRESHOLD: 5, // Open circuit after this many failures
  SUCCESS_THRESHOLD: 3, // Close circuit after this many successes
  COOLDOWN_MS: 30_000, // Initial cooldown when circuit opens (30s)
  COOLDOWN_MAX_MS: 60_000, // Max cooldown after failed probe (60s)

  // Latency thresholds
  LATENCY_GOOD_MS: 500, // Below this is considered good
  LATENCY_UNSTABLE_MS: 2_000, // Above this marks as unstable
  LATENCY_SAMPLE_SIZE: 5, // Rolling average size

  // State transitions
  UNSTABLE_TO_ONLINE_SUCCESSES: 3, // Fast responses to return to online
  ONLINE_TO_UNSTABLE_LATENCY_COUNT: 2, // High latency responses to mark unstable
} as const;

// ============================================================================
// Network Manager Class
// ============================================================================

class NetworkManager {
  private state: NetworkState;
  private listeners: Set<NetworkStateListener> = new Set();
  private latencySamples: number[] = [];
  private highLatencyCount = 0;
  private circuitOpenedAt: number | null = null;
  private currentCooldown: number = CONFIG.COOLDOWN_MS;

  constructor() {
    this.state = {
      status: navigator.onLine ? 'online' : 'offline',
      circuitState: 'closed',
      lastSuccessAt: null,
      lastErrorAt: null,
      nextRetryAt: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      averageLatency: 0,
      isNavigatorOnline: navigator.onLine,
    };

    this.setupBrowserListeners();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Get current network state
   */
  getState(): Readonly<NetworkState> {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: NetworkStateListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Report a successful request
   */
  reportSuccess(latencyMs: number): void {
    this.updateLatency(latencyMs);

    const prevState = this.state.status;

    // Update success counters
    this.state.consecutiveSuccesses += 1;
    this.state.consecutiveFailures = 0;
    this.state.lastSuccessAt = Date.now();

    // Circuit breaker state transitions
    if (this.state.circuitState === 'half_open') {
      if (this.state.consecutiveSuccesses >= CONFIG.SUCCESS_THRESHOLD) {
        this.closeCircuit();
      }
    } else if (this.state.circuitState === 'open') {
      // Probe succeeded, transition to half_open
      this.state.circuitState = 'half_open';
      this.state.nextRetryAt = null;
    }

    // Network status transitions
    if (this.state.status === 'offline' || this.state.status === 'api_down') {
      // Recovered from offline/api_down
      this.state.status = latencyMs > CONFIG.LATENCY_UNSTABLE_MS ? 'unstable' : 'online';
      this.highLatencyCount = 0;
    } else if (this.state.status === 'unstable') {
      // Check if we can return to online
      if (
        latencyMs < CONFIG.LATENCY_GOOD_MS &&
        this.state.consecutiveSuccesses >= CONFIG.UNSTABLE_TO_ONLINE_SUCCESSES
      ) {
        this.state.status = 'online';
        this.highLatencyCount = 0;
      }
    } else if (this.state.status === 'online') {
      // Check for degradation
      if (latencyMs > CONFIG.LATENCY_UNSTABLE_MS) {
        this.highLatencyCount++;
        if (this.highLatencyCount >= CONFIG.ONLINE_TO_UNSTABLE_LATENCY_COUNT) {
          this.state.status = 'unstable';
        }
      } else {
        this.highLatencyCount = 0;
      }
    }

    if (prevState !== this.state.status) {
      console.log(`[NetworkManager] Status: ${prevState} → ${this.state.status}`);
    }

    this.notifyListeners();
  }

  /**
   * Report a failed request
   */
  reportError(error: unknown, isApiError: boolean): void {
    const prevState = this.state.status;

    // Update failure counters
    this.state.consecutiveFailures += 1;
    this.state.consecutiveSuccesses = 0;
    this.state.lastErrorAt = Date.now();

    // Check if browser reports offline
    if (!navigator.onLine) {
      this.state.status = 'offline';
      this.state.isNavigatorOnline = false;
      this.notifyListeners();
      return;
    }

    // Determine if this is API down vs other error
    const isApiDown = this.isApiDownError(error);

    // Circuit breaker logic
    if (this.state.circuitState === 'half_open') {
      // Probe failed, reopen circuit with longer cooldown
      this.openCircuit(true);
    } else if (
      this.state.circuitState === 'closed' &&
      this.state.consecutiveFailures >= CONFIG.FAILURE_THRESHOLD
    ) {
      // Too many failures, open circuit
      this.openCircuit(false);
    }

    // Network status transitions
    if (isApiDown) {
      this.state.status = 'api_down';
    } else if (isApiError && this.state.status !== 'api_down') {
      // Non-API-down server error, could be unstable
      if (this.state.status === 'online') {
        this.state.status = 'unstable';
      }
    }

    if (prevState !== this.state.status) {
      console.log(`[NetworkManager] Status: ${prevState} → ${this.state.status}`);
    }

    this.notifyListeners();
  }

  /**
   * Check if circuit breaker is open (requests should be blocked)
   */
  isCircuitOpen(): boolean {
    if (this.state.circuitState !== 'open') {
      return false;
    }

    // Check if cooldown has passed
    if (this.state.nextRetryAt && Date.now() >= this.state.nextRetryAt) {
      // Transition to half_open for probe
      this.state.circuitState = 'half_open';
      this.state.nextRetryAt = null;
      this.notifyListeners();
      return false;
    }

    return true;
  }

  /**
   * Get remaining time until circuit retry (ms)
   */
  getTimeUntilRetry(): number | null {
    if (!this.state.nextRetryAt) return null;
    const remaining = this.state.nextRetryAt - Date.now();
    return remaining > 0 ? remaining : null;
  }

  /**
   * Check if a request should be retried based on method and idempotency
   */
  shouldRetryRequest(method: string, hasIdempotencyKey: boolean): boolean {
    // Circuit is open, don't retry
    if (this.isCircuitOpen()) {
      return false;
    }

    // GET requests are always retryable (idempotent)
    if (method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') {
      return true;
    }

    // Mutations only retry with idempotency key
    return hasIdempotencyKey;
  }

  /**
   * Check circuit before making a request
   * Throws CircuitOpenError if circuit is open
   */
  checkCircuit(): void {
    if (this.isCircuitOpen()) {
      const remaining = this.getTimeUntilRetry() ?? CONFIG.COOLDOWN_MS;
      throw new CircuitOpenError(remaining);
    }
  }

  /**
   * Force update of navigator online status
   */
  updateNavigatorOnline(isOnline: boolean): void {
    if (this.state.isNavigatorOnline === isOnline) return;

    this.state.isNavigatorOnline = isOnline;

    if (!isOnline) {
      this.state.status = 'offline';
    } else if (this.state.status === 'offline') {
      // Browser says online, but we need to verify with health check
      // Status will be updated when health check succeeds
      this.state.status = 'unstable';
    }

    console.log(`[NetworkManager] Navigator online: ${isOnline}`);
    this.notifyListeners();
  }

  /**
   * Force a status (used by health check)
   */
  forceStatus(status: NetworkStatus): void {
    if (this.state.status === status) return;

    const prevStatus = this.state.status;
    this.state.status = status;

    if (status === 'online') {
      this.state.consecutiveFailures = 0;
      this.closeCircuit();
    }

    console.log(`[NetworkManager] Force status: ${prevStatus} → ${status}`);
    this.notifyListeners();
  }

  /**
   * Reset the manager state
   */
  reset(): void {
    this.state = {
      status: navigator.onLine ? 'online' : 'offline',
      circuitState: 'closed',
      lastSuccessAt: null,
      lastErrorAt: null,
      nextRetryAt: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      averageLatency: 0,
      isNavigatorOnline: navigator.onLine,
    };
    this.latencySamples = [];
    this.highLatencyCount = 0;
    this.circuitOpenedAt = null;
    this.currentCooldown = CONFIG.COOLDOWN_MS;
    this.notifyListeners();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private setupBrowserListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.updateNavigatorOnline(true);
    });

    window.addEventListener('offline', () => {
      this.updateNavigatorOnline(false);
    });
  }

  private openCircuit(extendCooldown: boolean): void {
    this.state.circuitState = 'open';
    this.circuitOpenedAt = Date.now();

    if (extendCooldown) {
      this.currentCooldown = Math.min(this.currentCooldown * 2, CONFIG.COOLDOWN_MAX_MS);
    } else {
      this.currentCooldown = CONFIG.COOLDOWN_MS;
    }

    this.state.nextRetryAt = Date.now() + this.currentCooldown;

    console.log(
      `[NetworkManager] Circuit OPEN, cooldown: ${this.currentCooldown / 1000}s`
    );
  }

  private closeCircuit(): void {
    this.state.circuitState = 'closed';
    this.state.nextRetryAt = null;
    this.currentCooldown = CONFIG.COOLDOWN_MS;
    this.circuitOpenedAt = null;

    console.log('[NetworkManager] Circuit CLOSED');
  }

  private updateLatency(latencyMs: number): void {
    this.latencySamples.push(latencyMs);

    // Keep only recent samples
    if (this.latencySamples.length > CONFIG.LATENCY_SAMPLE_SIZE) {
      this.latencySamples.shift();
    }

    // Calculate rolling average
    this.state.averageLatency =
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  private isApiDownError(error: unknown): boolean {
    // Check for specific status codes
    if (error && typeof error === 'object') {
      const status = (error as { status?: number }).status;
      if (status && [502, 503, 504].includes(status)) {
        return true;
      }

      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode && [502, 503, 504].includes(statusCode)) {
        return true;
      }
    }

    // Check error message
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('bad gateway') ||
        msg.includes('service unavailable') ||
        msg.includes('gateway timeout')
      );
    }

    return false;
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('[NetworkManager] Listener error:', err);
      }
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const networkManager = new NetworkManager();

// Export config for testing/debugging
export { CONFIG as NETWORK_CONFIG };
