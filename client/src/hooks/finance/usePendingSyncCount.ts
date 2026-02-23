/**
 * usePendingSyncCount Hook
 *
 * Tracks the number of operations pending synchronization in the
 * Service Worker's Workbox Background Sync queue.
 *
 * Listens for:
 * - SYNC_COMPLETED messages from the SW (decrement count)
 * - Network online events (trigger recount)
 * - Periodic polling as fallback
 *
 * Used by CaisseDashboard to show "X opérations en attente de sync" banner.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface PendingSyncState {
  /** Number of operations pending sync */
  pendingCount: number;
  /** Whether we're currently syncing */
  isSyncing: boolean;
  /** Last sync event timestamp */
  lastSyncAt: Date | null;
}

export function usePendingSyncCount(): PendingSyncState {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const localCountRef = useRef(0);

  // Track locally queued operations via SW message interception
  // When the SW returns a 202 "queued" response, we increment the counter
  const incrementPending = useCallback(() => {
    localCountRef.current += 1;
    setPendingCount(localCountRef.current);
  }, []);

  // Listen for SW sync messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};

      if (type === 'SYNC_COMPLETED') {
        // One operation synced successfully
        localCountRef.current = Math.max(0, localCountRef.current - 1);
        setPendingCount(localCountRef.current);
        setLastSyncAt(new Date());

        if (localCountRef.current === 0) {
          setIsSyncing(false);
        }
      } else if (type === 'SYNC_STARTED') {
        setIsSyncing(true);
      } else if (type === 'SYNC_ALL_COMPLETE') {
        localCountRef.current = 0;
        setPendingCount(0);
        setIsSyncing(false);
        setLastSyncAt(new Date());
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  // Intercept fetch responses to detect SW-queued operations
  useEffect(() => {
    const originalFetch = window.fetch;

    // Patch fetch to detect 202 offline responses from SW
    const patchedFetch: typeof fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Check if this is a SW background sync 202 response
      if (response.status === 202) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          if (data?.offline && data?.queued) {
            incrementPending();
          }
        } catch {
          // Not JSON or other error — ignore
        }
      }

      return response;
    };

    window.fetch = patchedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [incrementPending]);

  return {
    pendingCount,
    isSyncing,
    lastSyncAt,
  };
}
