/**
 * SyncMonitorService - Real-time Sync Status Monitoring
 *
 * This service provides:
 * - Heartbeat polling every 1 second
 * - Latency measurement via ping
 * - Connection state management (connected/unstable/offline/reconnecting)
 * - Automatic retry with exponential backoff
 * - Offline queue management
 *
 * @module services/SyncMonitorService
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ConnectionState = 'connected' | 'unstable' | 'offline' | 'reconnecting';

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  // Connection
  connectionState: ConnectionState;
  latency: number | null; // in milliseconds

  // Sync statistics
  pending: number;
  syncedSinceLast: number;
  lastSyncAt: Date | null;
  secondsSinceLastSync: number;

  // State
  syncState: SyncState;
  lastError: string | null;

  // Heartbeat tracking
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
  heartbeatIntervalMs: number;      // Default: 1000 (1 second)
  pingIntervalMs: number;           // Default: 5000 (5 seconds)
  counterUpdateIntervalMs: number;  // Default: 1000 (1 second)

  // Thresholds
  latencyUnstableThresholdMs: number;  // Default: 1500
  latencyTimeoutMs: number;            // Default: 3000

  // Retry
  maxConsecutiveFailures: number;      // Default: 3 (before offline)
  unstableThreshold: number;           // Default: 2 (failures before unstable)

  // Backoff
  initialRetryDelayMs: number;   // Default: 1000
  maxRetryDelayMs: number;       // Default: 5000
  backoffMultiplier: number;     // Default: 2

  // Debug
  enableDebugLogs: boolean;      // Default: false
}

const DEFAULT_CONFIG: SyncMonitorConfig = {
  heartbeatIntervalMs: 5000,        // 5 seconds between heartbeats (was 1s - too aggressive)
  pingIntervalMs: 10000,            // 10 seconds between pings
  counterUpdateIntervalMs: 1000,    // 1 second for UI counter
  latencyUnstableThresholdMs: 5000, // 5 seconds before "unstable" (was 1.5s)
  latencyTimeoutMs: 10000,          // 10 second timeout (was 3s)
  maxConsecutiveFailures: 3,        // 3 failures = offline
  unstableThreshold: 2,             // 2 failures = unstable
  initialRetryDelayMs: 2000,        // 2 seconds initial retry
  maxRetryDelayMs: 30000,           // 30 seconds max retry
  backoffMultiplier: 1.5,           // Gentler backoff
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
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private counterInterval: ReturnType<typeof setInterval> | null = null;

  // Retry state
  private currentRetryDelay: number;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  // Browser online status
  private browserOnline: boolean = true;

  // Running state
  private isRunning: boolean = false;

  // Hysteresis: require multiple consecutive successes to transition to "connected"
  private consecutiveSuccesses: number = 0;
  private readonly STABLE_THRESHOLD = 2; // Need 2 consecutive successes to be "connected"

  constructor(config: Partial<SyncMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentRetryDelay = this.config.initialRetryDelayMs;

    // Start with "reconnecting" state to avoid showing scary "offline" on first load
    this.status = {
      connectionState: 'reconnecting',
      latency: null,
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
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.log('Starting SyncMonitor');

    // Initial heartbeat
    this.sendHeartbeat();

    // Start intervals
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs);
    this.pingInterval = setInterval(() => this.measureLatency(), this.config.pingIntervalMs);
    this.counterInterval = setInterval(() => this.updateCounter(), this.config.counterUpdateIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.log('Stopping SyncMonitor');

    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.counterInterval) clearInterval(this.counterInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);

    this.heartbeatInterval = null;
    this.pingInterval = null;
    this.counterInterval = null;
    this.retryTimeout = null;
  }

  /**
   * Subscribe to status updates
   */
  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current status
    listener(this.getStatus());

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current status (immutable copy)
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Force a sync retry
   */
  async forceRetry(): Promise<void> {
    this.log('Force retry requested');

    // Clear error state
    this.updateStatus({ lastError: null, syncState: 'idle' });

    // Reset retry delay
    this.currentRetryDelay = this.config.initialRetryDelayMs;

    // Notify server
    try {
      await fetch('/api/sync/retry', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // Ignore errors
    }

    // Send heartbeat immediately
    await this.sendHeartbeat();
  }

  /**
   * Report a sync operation starting
   */
  async reportSyncStart(): Promise<void> {
    this.updateStatus({ syncState: 'syncing' });

    try {
      await fetch('/api/sync/start', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Report a sync operation completed
   */
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
      // Ignore errors
    }
  }

  /**
   * Report a sync error
   */
  async reportSyncError(message: string): Promise<void> {
    this.updateStatus({
      syncState: 'error',
      lastError: message
    });

    try {
      await fetch('/api/sync/error', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Update pending count (for offline operations)
   */
  updatePendingCount(count: number): void {
    this.updateStatus({ pending: count });
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<SyncMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Cleanup
   */
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
    this.updateStatus({ connectionState: 'reconnecting' });
    this.sendHeartbeat();
  };

  private handleOffline = (): void => {
    this.log('Browser offline');
    this.browserOnline = false;
    this.updateStatus({
      connectionState: 'offline',
      latency: null
    });
  };

  private async sendHeartbeat(): Promise<void> {
    if (!this.browserOnline) {
      this.updateStatus({ connectionState: 'offline' });
      return;
    }

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
    }
  }

  private handleHeartbeatSuccess(data: HeartbeatResponse, latency: number): void {
    const now = new Date();
    const previousState = this.status.connectionState;

    // Increment success counter
    this.consecutiveSuccesses++;

    // Determine connection state with hysteresis
    let connectionState: ConnectionState;

    if (latency > this.config.latencyUnstableThresholdMs) {
      // High latency = unstable (reset success counter)
      connectionState = 'unstable';
      this.consecutiveSuccesses = 0;
    } else if (previousState === 'connected') {
      // Already connected, stay connected
      connectionState = 'connected';
    } else if (this.consecutiveSuccesses >= this.STABLE_THRESHOLD) {
      // Enough consecutive successes to transition to connected
      connectionState = 'connected';
      this.log('Connection stable after multiple successes');
    } else {
      // Not enough successes yet, stay in current state (or use reconnecting)
      connectionState = previousState === 'offline' ? 'reconnecting' : previousState;
    }

    const wasOffline = previousState === 'offline' || previousState === 'reconnecting';

    this.updateStatus({
      connectionState,
      latency,
      pending: data.pending,
      syncedSinceLast: data.syncedSinceLast,
      lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : this.status.lastSyncAt,
      syncState: data.syncState,
      lastError: data.lastError,
      consecutiveFailures: 0,
      lastHeartbeatAt: now,
      serverTime: new Date(data.serverTime)
    });

    // Reset retry delay on success
    this.currentRetryDelay = this.config.initialRetryDelayMs;

    if (wasOffline && connectionState === 'connected') {
      this.log('Connection restored');
    }
  }

  private handleHeartbeatFailure(error: unknown): void {
    const failures = this.status.consecutiveFailures + 1;

    // Reset success counter on failure
    this.consecutiveSuccesses = 0;

    this.log(`Heartbeat failed (${failures}): ${error}`);

    let connectionState: ConnectionState;

    if (!this.browserOnline) {
      connectionState = 'offline';
    } else if (failures >= this.config.maxConsecutiveFailures) {
      connectionState = 'offline';
    } else if (failures >= this.config.unstableThreshold) {
      connectionState = 'unstable';
    } else {
      // Single failure: keep current state if connected, otherwise stay unstable
      connectionState = this.status.connectionState === 'connected' ? 'connected' : 'unstable';
    }

    this.updateStatus({
      connectionState,
      latency: null,
      consecutiveFailures: failures
    });

    // Schedule retry with backoff if needed
    if (failures >= this.config.maxConsecutiveFailures) {
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    this.updateStatus({ connectionState: 'reconnecting' });

    this.retryTimeout = setTimeout(() => {
      this.sendHeartbeat();
    }, this.currentRetryDelay);

    // Increase delay for next retry (exponential backoff)
    this.currentRetryDelay = Math.min(
      this.currentRetryDelay * this.config.backoffMultiplier,
      this.config.maxRetryDelayMs
    );
  }

  private async measureLatency(): Promise<void> {
    if (!this.browserOnline || this.status.connectionState === 'offline') {
      return;
    }

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.latencyTimeoutMs);

      const response = await fetch('/api/sync/ping', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const latency = Date.now() - startTime;
        this.updateStatus({ latency });
      }
    } catch {
      // Ignore ping errors - heartbeat handles connection state
    }
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
