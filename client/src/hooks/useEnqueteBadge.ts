/**
 * useEnqueteBadge - Real-time badge counters for credit investigations (enquêtes)
 *
 * Returns:
 * - pendingCount: investigations assigned/in_progress for current agent
 * - totalCount: all investigations assigned to agent
 *
 * Listens to 'credit-update' custom DOM events (dispatched by WebSocket)
 * to refresh counts when enquêtes are assigned/updated.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

export interface EnqueteBadgeData {
  pendingCount: number;
  totalCount: number;
  isLoading: boolean;
}

const PENDING_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ASSIGNMENT'];

export function useEnqueteBadge() {
  const [data, setData] = useState<EnqueteBadgeData>({
    pendingCount: 0,
    totalCount: 0,
    isLoading: true,
  });

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/enquetes-credit/mes-enquetes', {
        credentials: 'include',
      });
      if (!response.ok) {
        setData(prev => ({ ...prev, isLoading: false }));
        return;
      }
      const result = await response.json();
      const investigations: any[] = Array.isArray(result.data) ? result.data : [];

      const pendingCount = investigations.filter(i => PENDING_STATUSES.includes(i.statut)).length;

      setData({
        pendingCount,
        totalCount: investigations.length,
        isLoading: false,
      });
    } catch (error) {
      console.error('[EnqueteBadge] Error loading counts:', error);
      setData(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Initial load
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => { if (isOnline) loadCounts(); }, [isOnline, loadCounts]);

  // Listen for credit-update events (enquête assignment, completion, etc.)
  useEffect(() => {
    const handleCreditUpdate = (event: CustomEvent) => {
      const payload = event.detail || {};
      if (
        payload.type === 'enquete_new' ||
        payload.type === 'enquete_assigned' ||
        payload.type === 'enquete_updated' ||
        payload.type === 'investigation_assigned' ||
        payload.type === 'investigation_started' ||
        payload.type === 'investigation_submitted' ||
        payload.type === 'investigation_reassigned' ||
        payload.type === 'demande_updated'
      ) {
        loadCounts();
      }
    };

    window.addEventListener('credit-update', handleCreditUpdate as EventListener);
    return () => window.removeEventListener('credit-update', handleCreditUpdate as EventListener);
  }, [loadCounts]);

  // Polling fallback every 60s
  useEffect(() => {
    const interval = setInterval(loadCounts, 60000);
    return () => clearInterval(interval);
  }, [loadCounts]);

  return { ...data, refresh: loadCounts };
}

export default useEnqueteBadge;
