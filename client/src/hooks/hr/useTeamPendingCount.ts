import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

export function useTeamPendingCount() {
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined);
  const [isManager, setIsManager] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/conges/team/count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIsManager(!!data.isManager);
        setPendingCount(data.isManager ? (data.pending ?? 0) : undefined);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) loadCount();
  }, [isOnline, loadCount]);

  // Listen for HR update events (conge entity)
  useEffect(() => {
    const handler = (event: Event) => {
      const entity = (event as CustomEvent).detail?.entity;
      if (!entity || entity === 'conge') {
        loadCount();
      }
    };
    window.addEventListener('hr-update', handler);
    return () => window.removeEventListener('hr-update', handler);
  }, [loadCount]);

  return { pendingCount, isManager, isLoading, refresh: loadCount };
}

export default useTeamPendingCount;
