/**
 * useEnqueteBadge - Real-time badge counters for credit investigations (enquêtes)
 *
 * Returns:
 * - pendingCount: investigations assigned to current agent but not yet completed
 * - totalCount: all investigations assigned to agent (for history)
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

export function useEnqueteBadge() {
  const [data, setData] = useState<EnqueteBadgeData>({
    pendingCount: 0,
    totalCount: 0,
    isLoading: true,
  });

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/credit-investigations/investigations?status=ASSIGNED&limit=1', {
        credentials: 'include',
      });
      if (!response.ok) {
        setData(prev => ({ ...prev, isLoading: false }));
        return;
      }
      const result = await response.json();
      const assigned = (result && Array.isArray(result.data)) ? result.data : [];

      // Also fetch in-progress
      const inProgressRes = await fetch('/api/credit-investigations/investigations?status=IN_PROGRESS&limit=1', {
        credentials: 'include',
      });
      let inProgress: any[] = [];
      if (inProgressRes.ok) {
        const ipResult = await inProgressRes.json();
        inProgress = (ipResult && Array.isArray(ipResult.data)) ? ipResult.data : [];
      }

      // Fetch all for total
      const allRes = await fetch('/api/credit-investigations/investigations?limit=1', {
        credentials: 'include',
      });
      let total = 0;
      if (allRes.ok) {
        const allResult = await allRes.json();
        total = (allResult && Array.isArray(allResult.data)) ? allResult.data.length : 0;
      }

      setData({
        pendingCount: assigned.length + inProgress.length,
        totalCount: total,
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
        payload.type === 'investigation_submitted' ||
        payload.type === 'investigation_reviewed' ||
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
