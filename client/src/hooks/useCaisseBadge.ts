/**
 * useCaisseBadge - Real-time badge counter for all pending caisse demands
 *
 * Counts: caisse payment requests + pending loan disbursements.
 * Listens to `caisse-request-update` DOM events and WebSocket loan events.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useWebSocket } from '@/hooks/useWebSocket';

export function useCaisseBadge() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { socket } = useWebSocket();

  const loadCount = useCallback(async () => {
    try {
      const [reqRes, loanRes] = await Promise.all([
        fetch('/api/caisses/payment-requests/count', { credentials: 'include' }),
        fetch('/api/credits/pending-disbursements', { credentials: 'include' }),
      ]);

      let total = 0;

      if (reqRes.ok) {
        const data = await reqRes.json();
        total += data.count || 0;
      }

      if (loanRes.ok) {
        const data = await loanRes.json();
        total += data.count || data.data?.length || 0;
      }

      setPendingCount(total);
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

  // Listen for caisse-request-update DOM events (from WebSocket bridge)
  useEffect(() => {
    const handler = () => loadCount();
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
  }, [loadCount]);

  // Listen for loan disbursement WebSocket events
  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype } = data.payload || {};
          if (['NEW_LOAN_DISBURSEMENT', 'LOAN_DISBURSEMENT_COMPLETED', 'LOAN_DISBURSEMENT_CANCELLED'].includes(subtype)) {
            loadCount();
          }
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, loadCount]);

  return { pendingCount, isLoading, refresh: loadCount };
}

export default useCaisseBadge;
