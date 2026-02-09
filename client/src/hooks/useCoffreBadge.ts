/**
 * useCoffreBadge - Real-time badge counter for pending coffre transfers
 */

import { useState, useEffect, useCallback } from 'react';
import { coffreApi } from '@/lib/api-client';
import { useIsOnline } from '@/contexts/NetworkContext';
import { authService } from '@/lib/auth';

export function useCoffreBadge() {
  const [pendingCount, setPendingCount] = useState(0);
  const isOnline = useIsOnline();
  const user = authService.getCurrentUser();

  const loadCount = useCallback(async () => {
    try {
      if (!user?.agenceId) return;
      const response = await coffreApi.listTransferts({
        agenceId: user.agenceId,
        statut: 'REQUESTED',
        limit: 100,
      });
      const count = response?.pagination?.total ?? response?.data?.length ?? 0;
      setPendingCount(count);
    } catch {
      // Silent - sidebar badge
    }
  }, [user?.agenceId]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  useEffect(() => {
    if (isOnline) loadCount();
  }, [isOnline, loadCount]);

  // Listen for coffre events
  useEffect(() => {
    const handler = () => loadCount();
    window.addEventListener('coffre-update', handler);
    return () => window.removeEventListener('coffre-update', handler);
  }, [loadCount]);

  // Poll every 30s for real-time feel
  useEffect(() => {
    const interval = setInterval(loadCount, 30_000);
    return () => clearInterval(interval);
  }, [loadCount]);

  return { pendingCount, refresh: loadCount };
}
