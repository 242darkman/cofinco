/**
 * useClosureBadge - Real-time badge counter for pending closure requests
 *
 * Listens to `closure-update` DOM events to keep the count in sync.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

export interface ClosureBadgeData {
  pendingCount: number;
  lastUpdated: Date | null;
  isLoading: boolean;
}

export function useClosureBadge() {
  const [badgeData, setBadgeData] = useState<ClosureBadgeData>({
    pendingCount: 0,
    lastUpdated: null,
    isLoading: true,
  });

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/closure-requests/pending', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch closure requests');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setBadgeData({
        pendingCount: list.length,
        lastUpdated: new Date(),
        isLoading: false,
      });
    } catch (error) {
      console.error('[ClosureBadge] Error loading count:', error);
      setBadgeData(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) {
      loadPendingCount();
    }
  }, [isOnline, loadPendingCount]);

  // Listen for closure-update events
  useEffect(() => {
    const handleClosureUpdate = () => {
      loadPendingCount();
    };

    window.addEventListener('closure-update', handleClosureUpdate);
    return () => window.removeEventListener('closure-update', handleClosureUpdate);
  }, [loadPendingCount]);

  return {
    ...badgeData,
    refresh: loadPendingCount,
  };
}

export default useClosureBadge;
