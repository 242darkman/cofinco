/**
 * SyncMonitorService - Real-time Sync Status Monitoring (Simplified & Stable)
 *
 * This service provides:
 * - Heartbeat polling for connection status
 * - Latency measurement
 * - Stable connection state (only "connected" or "offline" visible)
 * - Debounced state changes to prevent flickering
 *
 * @module services/SyncMonitorService
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Internal states (for logic)
type InternalState = 'connected' | 'checking' | 'failing' | 'offline';

// Visible states (for UI) - simplified
export type ConnectionState = 'connected' | 'offline';

export type SyncState = 'idle' | 'syncing' | 'error';

// Latency quality for visual indicators
export type LatencyQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface SyncStatus {
  // Connection - simplified to binary
  connectionState: ConnectionState;
  latency: number | null;
  latencyQuality: LatencyQuality;

  // Sync statistics
  pending: number;
  syncedSinceLast: number;
  lastSyncAt: Date | null;
  secondsSinceLastSync: number;

  // State
  syncState: SyncState;
  lastError: string | null;

  // Internal tracking (for debugging)
  consecutiveFailures: number;
  lastHeartbeatAt: Date | null;

  // Server info
  serverTime: Date | null;
}

export interface HeartbeatResponse {
  status: 'ok' | 'error';
  serverTime: string;
  pending: number;
  syncedSinceLast: number;
  lastSyncAt: string | null;
  syncState: SyncState;
  lastError: string | null;
  responseTime?: number;
}

export type SyncStatusListener = (status: SyncStatus) => void;

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface SyncMonitorConfig {
  // Timing
  heartbeatIntervalMs: number;
  counterUpdateIntervalMs: number;

  // Thresholds
  latencyTimeoutMs: number;

  // Latency quality thresholds
  latencyGoodMs: number;
  latencyFairMs: number;

  // State change thresholds
  failuresBeforeOffline: number;
  successesBeforeOnline: number;

  // Debounce - minimum time before showing state change
  stateDebounceMs: number;

  // Debug
  enableDebugLogs: boolean;
}

const DEFAULT_CONFIG: SyncMonitorConfig = {
  heartbeatIntervalMs: 15000,        // 15 seconds between heartbeats (safe for slow connections & rate limiting)
  counterUpdateIntervalMs: 1000,     // 1 second for UI counter (no network request, just UI update)
  latencyTimeoutMs: 20000,           // 20 second timeout (very generous)

  // Latency quality thresholds
  latencyGoodMs: 2000,               // < 2s = good
  latencyFairMs: 5000,               // < 5s = fair, >= 5s = poor

  // State thresholds
  failuresBeforeOffline: 3,          // 3 consecutive failures = offline
  successesBeforeOnline: 1,          // 1 success = back online (fast recovery)

  // Debounce
  stateDebounceMs: 2000,             // Wait 2 seconds before showing state change

  enableDebugLogs: false
};

// ============================================================================
// SYNC MONITOR SERVICE
// ============================================================================

class SyncMonitorService {
  private config: SyncMonitorConfig;
  private status: SyncStatus;
  private listeners: Set<SyncStatusListener> = new Set();

  // Intervals
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private counterInterval: ReturnType<typeof setInterval> | null = null;

  // Retry state
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  // Browser online status
  private browserOnline: boolean = true;

  // Running state
  private isRunning: boolean = false;

  // Internal state tracking
  private internalState: InternalState = 'checking';
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;

  // Debounce tracking
  private pendingStateChange: ConnectionState | null = null;
  private stateChangeTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastStateChangeTime: number = 0;

  // Heartbeat in progress tracking
  private heartbeatInProgress: boolean = false;

  constructor(config: Partial<SyncMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start optimistically as "connected" - we'll correct if needed
    this.status = {
      connectionState: 'connected',
      latency: null,
      latencyQuality: 'unknown',
      pending: 0,
      syncedSinceLast: 0,
      lastSyncAt: null,
      secondsSinceLastSync: 0,
      syncState: 'idle',
      lastError: null,
      consecutiveFailures: 0,
      lastHeartbeatAt: null,
      serverTime: null
    };

    // Listen to browser online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      this.browserOnline = navigator.onLine;

      // If browser is offline at start, set offline immediately
      if (!this.browserOnline) {
        this.status.connectionState = 'offline';
        this.internalState = 'offline';
      }
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.log('Starting SyncMonitor');

    // Initial heartbeat
    this.sendHeartbeat();

    // Start intervals
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs);
    this.counterInterval = setInterval(() => this.updateCounter(), this.config.counterUpdateIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.log('Stopping SyncMonitor');

    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.counterInterval) clearInterval(this.counterInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    if (this.stateChangeTimeout) clearTimeout(this.stateChangeTimeout);

    this.heartbeatInterval = null;
    this.counterInterval = null;
    this.retryTimeout = null;
    this.stateChangeTimeout = null;
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async forceRetry(): Promise<void> {
    this.log('Force retry requested');
    this.updateStatus({ lastError: null, syncState: 'idle' });

    // Reset failure tracking
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;

    try {
      await fetch('/api/sync/retry', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // Ignore
    }

    await this.sendHeartbeat();
  }

  async reportSyncStart(): Promise<void> {
    this.updateStatus({ syncState: 'syncing' });
    try {
      await fetch('/api/sync/start', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore
    }
  }

  async reportSyncComplete(syncedCount: number = 0, error: string | null = null): Promise<void> {
    const newState: Partial<SyncStatus> = {
      syncState: error ? 'error' : 'idle',
      lastError: error,
      lastSyncAt: new Date(),
      secondsSinceLastSync: 0
    };

    if (syncedCount > 0) {
      newState.syncedSinceLast = this.status.syncedSinceLast + syncedCount;
    }

    this.updateStatus(newState);

    try {
      await fetch('/api/sync/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncedCount, error })
      });
    } catch {
      // Ignore
    }
  }

  async reportSyncError(message: string): Promise<void> {
    this.updateStatus({ syncState: 'error', lastError: message });
    try {
      await fetch('/api/sync/error', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
    } catch {
      // Ignore
    }
  }

  updatePendingCount(count: number): void {
    this.updateStatus({ pending: count });
  }

  updateConfig(newConfig: Partial<SyncMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private handleOnline = (): void => {
    this.log('Browser online');
    this.browserOnline = true;

    // Reset tracking
    this.consecutiveFailures = 0;
    this.internalState = 'checking';

    // Send heartbeat immediately
    this.sendHeartbeat();
  };

  private handleOffline = (): void => {
    this.log('Browser offline');
    this.browserOnline = false;
    this.internalState = 'offline';

    // Immediate state change for browser offline (no debounce)
    this.setConnectionState('offline', true);
  };

  private async sendHeartbeat(): Promise<void> {
    // Prevent overlapping heartbeats
    if (this.heartbeatInProgress) {
      this.log('Heartbeat already in progress, skipping');
      return;
    }

    if (!this.browserOnline) {
      this.setConnectionState('offline', true);
      return;
    }

    this.heartbeatInProgress = true;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.latencyTimeoutMs);

      const response = await fetch('/api/sync/heartbeat', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: HeartbeatResponse = await response.json();
      const latency = Date.now() - startTime;

      this.handleHeartbeatSuccess(data, latency);
    } catch (error) {
      this.handleHeartbeatFailure(error);
    } finally {
      this.heartbeatInProgress = false;
    }
  }

  private handleHeartbeatSuccess(data: HeartbeatResponse, latency: number): void {
    const now = new Date();

    // Update success tracking
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.internalState = 'connected';

    // Calculate latency quality
    const latencyQuality = this.getLatencyQuality(latency);

    // Update status (always update data, state change is debounced)
    this.updateStatus({
      latency,
      latencyQuality,
      pending: data.pending,
      syncedSinceLast: data.syncedSinceLast,
      lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : this.status.lastSyncAt,
      syncState: data.syncState,
      lastError: data.lastError,
      consecutiveFailures: 0,
      lastHeartbeatAt: now,
      serverTime: new Date(data.serverTime)
    });

    // Set connection state (with debounce for stability)
    if (this.consecutiveSuccesses >= this.config.successesBeforeOnline) {
      this.setConnectionState('connected');
    }

    this.log(`Heartbeat OK - latency: ${latency}ms (${latencyQuality})`);
  }

  private handleHeartbeatFailure(error: unknown): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    this.log(`Heartbeat failed (${this.consecutiveFailures}): ${error}`);

    // Update internal state based on failure count
    if (this.consecutiveFailures >= this.config.failuresBeforeOffline) {
      this.internalState = 'offline';
      // Force immediate state change after multiple failures
      this.setConnectionState('offline', true);
    } else {
      this.internalState = 'failing';
      // Don't change visible state yet - might recover
    }

    this.updateStatus({
      latency: null,
      latencyQuality: 'unknown',
      consecutiveFailures: this.consecutiveFailures
    });
  }

  private setConnectionState(newState: ConnectionState, immediate: boolean = false): void {
    const currentState = this.status.connectionState;

    // No change needed
    if (currentState === newState) {
      this.pendingStateChange = null;
      if (this.stateChangeTimeout) {
        clearTimeout(this.stateChangeTimeout);
        this.stateChangeTimeout = null;
      }
      return;
    }

    // For immediate changes (browser offline, multiple failures)
    if (immediate) {
      this.pendingStateChange = null;
      if (this.stateChangeTimeout) {
        clearTimeout(this.stateChangeTimeout);
        this.stateChangeTimeout = null;
      }
      this.updateStatus({ connectionState: newState });
      this.lastStateChangeTime = Date.now();
      this.log(`State changed immediately to: ${newState}`);
      return;
    }

    // Debounced change
    if (this.pendingStateChange === newState) {
      // Already pending this change
      return;
    }

    this.pendingStateChange = newState;

    // Clear any existing timeout
    if (this.stateChangeTimeout) {
      clearTimeout(this.stateChangeTimeout);
    }

    // Calculate debounce time - shorter for going online, longer for going offline
    const debounceTime = newState === 'connected'
      ? Math.max(500, this.config.stateDebounceMs / 2)  // Faster recovery
      : this.config.stateDebounceMs;                     // Slower to show offline

    this.stateChangeTimeout = setTimeout(() => {
      if (this.pendingStateChange === newState) {
        this.updateStatus({ connectionState: newState });
        this.lastStateChangeTime = Date.now();
        this.log(`State changed (debounced) to: ${newState}`);
      }
      this.pendingStateChange = null;
      this.stateChangeTimeout = null;
    }, debounceTime);
  }

  private getLatencyQuality(latency: number): LatencyQuality {
    if (latency < this.config.latencyGoodMs) return 'good';
    if (latency < this.config.latencyFairMs) return 'fair';
    return 'poor';
  }

  private updateCounter(): void {
    if (this.status.lastSyncAt) {
      const secondsSinceLastSync = Math.floor(
        (Date.now() - this.status.lastSyncAt.getTime()) / 1000
      );
      if (secondsSinceLastSync !== this.status.secondsSinceLastSync) {
        this.updateStatus({ secondsSinceLastSync });
      }
    }
  }

  private updateStatus(partial: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...partial };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('[SyncMonitor] Listener error:', error);
      }
    });
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.config.enableDebugLogs) {
      console.log(`[SyncMonitor] ${message}`, ...args);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: SyncMonitorService | null = null;

export function getSyncMonitor(config?: Partial<SyncMonitorConfig>): SyncMonitorService {
  if (!instance) {
    instance = new SyncMonitorService(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

export function destroySyncMonitor(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export default SyncMonitorService;
