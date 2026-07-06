/**
 * useJournalSync Hook
 *
 * Provides React components with real-time journal sync status,
 * manual sync triggers, and journal statistics.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncService, type JournalSyncStats } from '../lib/syncService';

// ============================================================================
// Types
// ============================================================================

interface UseJournalSyncReturn {
  /** Current sync phase */
  phase: JournalSyncStats['phase'];
  /** Whether journal sync is active */
  isSyncing: boolean;
  /** Number of entries uploaded in current/last sync */
  uploaded: number;
  /** Number of entries confirmed by server */
  confirmed: number;
  /** Number of entries rejected by server */
  rejected: number;
  /** Number of conflicts detected */
  conflicts: number;
  /** Last sync error */
  error: string | null;
  /** Pending entries count (local, not yet synced) */
  pendingCount: number;
  /** Trigger a manual journal sync */
  triggerSync: () => Promise<void>;
  /** Trigger a full sync (legacy queue + journal) */
  triggerFullSync: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useJournalSync(): UseJournalSyncReturn {
  const [stats, setStats] = useState<JournalSyncStats>({
    phase: 'idle',
    uploaded: 0,
    confirmed: 0,
    rejected: 0,
    conflicts: 0,
    error: null,
  });
  const [pendingCount, setPendingCount] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Subscribe to journal sync events
  useEffect(() => {
    const unsubscribe = syncService.subscribeToJournalSync((newStats) => {
      setStats(newStats);
    });

    return unsubscribe;
  }, []);

  // Periodically refresh pending count
  useEffect(() => {
    const refreshPending = async () => {
      try {
        const journalStats = await syncService.getJournalSyncStats();
        setPendingCount(journalStats.pending + journalStats.syncing);
      } catch {
        // Non-critical
      }
    };

    refreshPending();
    refreshTimerRef.current = setInterval(refreshPending, 10_000); // Every 10s

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  const triggerSync = useCallback(async () => {
    await syncService.syncJournal();
    // Refresh pending count after sync
    const journalStats = await syncService.getJournalSyncStats();
    setPendingCount(journalStats.pending + journalStats.syncing);
  }, []);

  const triggerFullSync = useCallback(async () => {
    await syncService.fullSync();
    const journalStats = await syncService.getJournalSyncStats();
    setPendingCount(journalStats.pending + journalStats.syncing);
  }, []);

  return {
    phase: stats.phase,
    isSyncing: stats.phase !== 'idle' && stats.phase !== 'done',
    uploaded: stats.uploaded,
    confirmed: stats.confirmed,
    rejected: stats.rejected,
    conflicts: stats.conflicts,
    error: stats.error,
    pendingCount,
    triggerSync,
    triggerFullSync,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Simplified hook that just tells you if there are pending offline entries.
 */
export function useOfflinePendingCount(): { count: number; hasPending: boolean } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        const stats = await syncService.getJournalSyncStats();
        setCount(stats.pending + stats.syncing);
      } catch {
        // Non-critical
      }
    };

    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, []);

  return { count, hasPending: count > 0 };
}
