/**
 * useSyncMonitor - React hook for real-time sync status monitoring
 *
 * Provides reactive sync status updates for React components.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     connectionState,
 *     latency,
 *     pending,
 *     syncedSinceLast,
 *     lastSyncAt,
 *     secondsSinceLastSync,
 *     syncState,
 *     lastError,
 *     forceRetry
 *   } = useSyncMonitor();
 *
 *   return (
 *     <div>
 *       <p>Status: {connectionState}</p>
 *       <p>Latency: {latency}ms</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSyncMonitor,
  type SyncStatus,
  type ConnectionState,
  type SyncState,
  type SyncMonitorConfig
} from '../services/SyncMonitorService';

export interface UseSyncMonitorReturn extends SyncStatus {
  // Actions
  forceRetry: () => Promise<void>;
  reportSyncStart: () => Promise<void>;
  reportSyncComplete: (syncedCount?: number, error?: string | null) => Promise<void>;
  reportSyncError: (message: string) => Promise<void>;
  updatePendingCount: (count: number) => void;

  // Computed
  isConnected: boolean;
  isUnstable: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  isSyncing: boolean;
  hasError: boolean;

  // Formatted values
  latencyFormatted: string;
  lastSyncFormatted: string;
  timeSinceLastSyncFormatted: string;
}

export interface UseSyncMonitorOptions extends Partial<SyncMonitorConfig> {
  autoStart?: boolean;
}

const defaultStatus: SyncStatus = {
  connectionState: 'reconnecting', // Start with reconnecting to avoid scary "offline" on load
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

export function useSyncMonitor(options: UseSyncMonitorOptions = {}): UseSyncMonitorReturn {
  const { autoStart = true, ...config } = options;
  const [status, setStatus] = useState<SyncStatus>(defaultStatus);
  const monitorRef = useRef(getSyncMonitor(config));

  useEffect(() => {
    const monitor = monitorRef.current;

    // Subscribe to updates
    const unsubscribe = monitor.subscribe(setStatus);

    // Start if autoStart is enabled
    if (autoStart) {
      monitor.start();
    }

    return () => {
      unsubscribe();
    };
  }, [autoStart]);

  // Action callbacks
  const forceRetry = useCallback(async () => {
    await monitorRef.current.forceRetry();
  }, []);

  const reportSyncStart = useCallback(async () => {
    await monitorRef.current.reportSyncStart();
  }, []);

  const reportSyncComplete = useCallback(async (syncedCount?: number, error?: string | null) => {
    await monitorRef.current.reportSyncComplete(syncedCount, error);
  }, []);

  const reportSyncError = useCallback(async (message: string) => {
    await monitorRef.current.reportSyncError(message);
  }, []);

  const updatePendingCount = useCallback((count: number) => {
    monitorRef.current.updatePendingCount(count);
  }, []);

  // Computed values
  const isConnected = status.connectionState === 'connected';
  const isUnstable = status.connectionState === 'unstable';
  const isOffline = status.connectionState === 'offline';
  const isReconnecting = status.connectionState === 'reconnecting';
  const isSyncing = status.syncState === 'syncing';
  const hasError = status.syncState === 'error' || status.lastError !== null;

  // Formatted values
  const latencyFormatted = status.latency !== null ? `${status.latency}ms` : '--';

  const lastSyncFormatted = status.lastSyncAt
    ? status.lastSyncAt.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : '--:--:--';

  const timeSinceLastSyncFormatted = formatTimeSince(status.secondsSinceLastSync);

  return {
    ...status,
    // Actions
    forceRetry,
    reportSyncStart,
    reportSyncComplete,
    reportSyncError,
    updatePendingCount,
    // Computed
    isConnected,
    isUnstable,
    isOffline,
    isReconnecting,
    isSyncing,
    hasError,
    // Formatted
    latencyFormatted,
    lastSyncFormatted,
    timeSinceLastSyncFormatted
  };
}

/**
 * Format seconds into human-readable time
 */
function formatTimeSince(seconds: number): string {
  if (seconds < 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Get connection state color for UI
 */
export function getConnectionStateColor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'text-green-400';
    case 'unstable':
      return 'text-yellow-400';
    case 'offline':
      return 'text-red-400';
    case 'reconnecting':
      return 'text-blue-400';
    default:
      return 'text-slate-400';
  }
}

/**
 * Get connection state background color for UI
 */
export function getConnectionStateBgColor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'bg-green-500';
    case 'unstable':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-red-500';
    case 'reconnecting':
      return 'bg-blue-500';
    default:
      return 'bg-slate-500';
  }
}

/**
 * Get connection state label in French
 */
export function getConnectionStateLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connecté';
    case 'unstable':
      return 'Connexion instable';
    case 'offline':
      return 'Hors ligne';
    case 'reconnecting':
      return 'Reconnexion...';
    default:
      return 'Inconnu';
  }
}

/**
 * Get sync state label in French
 */
export function getSyncStateLabel(state: SyncState): string {
  switch (state) {
    case 'idle':
      return 'Prêt';
    case 'syncing':
      return 'Synchronisation...';
    case 'error':
      return 'Erreur';
    default:
      return 'Inconnu';
  }
}

export default useSyncMonitor;
