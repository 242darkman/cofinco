/**
 * useSyncMonitor - React hook for real-time sync status monitoring
 *
 * Provides reactive sync status updates for React components.
 * Simplified to only two visible states: connected and offline.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     connectionState,
 *     latency,
 *     latencyQuality,
 *     pending,
 *     isConnected,
 *     isOffline,
 *     forceRetry
 *   } = useSyncMonitor();
 *
 *   return (
 *     <div>
 *       <p>Status: {connectionState}</p>
 *       <p>Latency: {latency}ms ({latencyQuality})</p>
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
  type LatencyQuality,
  type SyncMonitorConfig
} from '../services/SyncMonitorService';

export interface UseSyncMonitorReturn extends SyncStatus {
  // Actions
  forceRetry: () => Promise<void>;
  reportSyncStart: () => Promise<void>;
  reportSyncComplete: (syncedCount?: number, error?: string | null) => Promise<void>;
  reportSyncError: (message: string) => Promise<void>;
  updatePendingCount: (count: number) => void;

  // Computed - simplified (only connected/offline matter now)
  isConnected: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  hasError: boolean;

  // Legacy computed (kept for backward compat, always false now)
  isUnstable: boolean;
  isReconnecting: boolean;

  // Formatted values
  latencyFormatted: string;
  lastSyncFormatted: string;
  timeSinceLastSyncFormatted: string;
}

export interface UseSyncMonitorOptions extends Partial<SyncMonitorConfig> {
  autoStart?: boolean;
}

const defaultStatus: SyncStatus = {
  connectionState: 'connected', // Start optimistically connected
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

  // Computed values - simplified
  const isConnected = status.connectionState === 'connected';
  const isOffline = status.connectionState === 'offline';
  const isSyncing = status.syncState === 'syncing';
  const hasError = status.syncState === 'error' || status.lastError !== null;

  // Legacy computed (always false now - kept for backward compat)
  const isUnstable = false;
  const isReconnecting = false;

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
    isOffline,
    isUnstable,
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
 * Get connection state color for UI (simplified)
 */
export function getConnectionStateColor(state: ConnectionState): string {
  return state === 'connected' ? 'text-green-400' : 'text-red-400';
}

/**
 * Get connection state background color for UI (simplified)
 */
export function getConnectionStateBgColor(state: ConnectionState): string {
  return state === 'connected' ? 'bg-green-500' : 'bg-red-500';
}

/**
 * Get connection state label in French (simplified)
 */
export function getConnectionStateLabel(state: ConnectionState): string {
  return state === 'connected' ? 'En ligne' : 'Hors ligne';
}

/**
 * Get latency quality color for UI
 */
export function getLatencyQualityColor(quality: LatencyQuality): string {
  switch (quality) {
    case 'good':
      return 'text-green-400';
    case 'fair':
      return 'text-yellow-400';
    case 'poor':
      return 'text-orange-400';
    default:
      return 'text-slate-400';
  }
}

/**
 * Get latency quality background color for UI
 */
export function getLatencyQualityBgColor(quality: LatencyQuality): string {
  switch (quality) {
    case 'good':
      return 'bg-green-500/20';
    case 'fair':
      return 'bg-yellow-500/20';
    case 'poor':
      return 'bg-orange-500/20';
    default:
      return 'bg-slate-500/20';
  }
}

/**
 * Get latency quality label in French
 */
export function getLatencyQualityLabel(quality: LatencyQuality): string {
  switch (quality) {
    case 'good':
      return 'Bonne';
    case 'fair':
      return 'Moyenne';
    case 'poor':
      return 'Lente';
    default:
      return 'Inconnue';
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
