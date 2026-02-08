/**
 * useProspectionBadge - Real-time badge counters for prospections
 *
 * Returns:
 * - totalCount: all prospections (for tab badge)
 * - activeCount: non-terminal prospections (for sidebar badge)
 *
 * Listens to 'operations-update' custom DOM events (dispatched by WebSocket)
 * to refresh counts when prospections change.
 */

import { useState, useEffect, useCallback } from 'react';
import { prospectionApi } from '@/lib/api-client';
import { useIsOnline } from '@/contexts/NetworkContext';

export interface ProspectionBadgeData {
  totalCount: number;
  activeCount: number;
  isLoading: boolean;
}

export function useProspectionBadge(agentId?: string) {
  const [data, setData] = useState<ProspectionBadgeData>({
    totalCount: 0,
    activeCount: 0,
    isLoading: true,
  });

  const loadCounts = useCallback(async () => {
    try {
      const params = agentId ? { agentId } : undefined;
      const [allResult, activeResult] = await Promise.all([
        prospectionApi.countAll(params),
        prospectionApi.countActive(params),
      ]);
      setData({
        totalCount: allResult.count || 0,
        activeCount: activeResult.count || 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('[ProspectionBadge] Error loading counts:', error);
      setData(prev => ({ ...prev, isLoading: false }));
    }
  }, [agentId]);

  // Initial load
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => { if (isOnline) loadCounts(); }, [isOnline, loadCounts]);

  // Listen for prospection-related OPERATIONS_UPDATE events
  useEffect(() => {
    const handleUpdate = (event: CustomEvent) => {
      const payload = event.detail || {};
      if (
        payload.type === 'prospection_new' ||
        payload.type === 'prospection_updated' ||
        payload.type === 'prospect_converted'
      ) {
        loadCounts();
      }
    };

    window.addEventListener('operations-update', handleUpdate as EventListener);
    return () => window.removeEventListener('operations-update', handleUpdate as EventListener);
  }, [loadCounts]);

  return { ...data, refresh: loadCounts };
}

export default useProspectionBadge;
