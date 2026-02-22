/**
 * useHrBadge - Real-time badge counter for pending HR items
 *
 * Counts: pending leave requests + pending document requests.
 * Listens to `hr-update` DOM events for real-time updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

export function useHrBadge() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/pending-count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.total || 0);
      }
    } catch {
      // Silent fail — badge just won't show
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCount();
  }, [loadCount]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) loadCount();
  }, [isOnline, loadCount]);

  // Listen for HR update events (from WebSocket bridge)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      // Only refetch for relevant entities (conge, document_request, employe)
      const entity = detail?.entity;
      if (!entity || entity === 'conge' || entity === 'document_request' || entity === 'employe') {
        loadCount();
      }
    };
    window.addEventListener('hr-update', handler);
    return () => window.removeEventListener('hr-update', handler);
  }, [loadCount]);

  return { pendingCount, isLoading, refresh: loadCount };
}

export default useHrBadge;
