/**
 * useOpeningBadge - Real-time badge counter for pending account opening requests
 *
 * Listens to `opening-update` DOM events to keep the count in sync.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

export interface OpeningBadgeData {
  pendingCount: number;
  lastUpdated: Date | null;
  isLoading: boolean;
}

export function useOpeningBadge() {
  const [badgeData, setBadgeData] = useState<OpeningBadgeData>({
    pendingCount: 0,
    lastUpdated: null,
    isLoading: true,
  });

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/opening-requests/pending', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch opening requests');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setBadgeData({
        pendingCount: list.length,
        lastUpdated: new Date(),
        isLoading: false,
      });
    } catch (error) {
      console.error('[OpeningBadge] Error loading count:', error);
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

  // Listen for opening-update events
  useEffect(() => {
    const handleOpeningUpdate = () => {
      loadPendingCount();
    };

    window.addEventListener('opening-update', handleOpeningUpdate);
    return () => window.removeEventListener('opening-update', handleOpeningUpdate);
  }, [loadPendingCount]);

  return {
    ...badgeData,
    refresh: loadPendingCount,
  };
}

export default useOpeningBadge;
