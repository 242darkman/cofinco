/**
 * useCaisseBadge - Real-time badge counter for all pending caisse demands
 *
 * Counts: caisse payment requests + pending loan disbursements.
 * Listens to `caisse-request-update` DOM events and WebSocket loan events.
 *
 * Badge only shows when:
 * - The user has an active caisse session (OPEN / CLOSING_COUNT / CLOSING_VALIDATION)
 * - OR the user is an admin (supervisor visibility)
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useWebSocket } from '@/hooks/useWebSocket';

const ACTIVE_STATUTS = ['OPEN', 'CLOSING_COUNT', 'CLOSING_VALIDATION'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];

export function useCaisseBadge(userRole?: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const { socket } = useWebSocket();

  const isAdmin = userRole ? ADMIN_ROLES.includes(userRole) : false;

  // Check if user has an active caisse session
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions-caisse/active', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHasActiveSession(!!data && ACTIVE_STATUTS.includes(data.statut));
      } else {
        setHasActiveSession(false);
      }
    } catch {
      setHasActiveSession(false);
    }
  }, []);

  // Initial session check
  useEffect(() => {
    if (!isAdmin) {
      checkSession();
    }
  }, [isAdmin, checkSession]);

  const loadCount = useCallback(async () => {
    // Only fetch count if user has active session or is admin
    if (!hasActiveSession && !isAdmin) {
      setPendingCount(0);
      setIsLoading(false);
      return;
    }

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
  }, [hasActiveSession, isAdmin]);

  // Load count when session state or admin status changes
  useEffect(() => {
    loadCount();
  }, [loadCount]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) {
      if (!isAdmin) checkSession();
      loadCount();
    }
  }, [isOnline, loadCount, isAdmin, checkSession]);

  // Listen for caisse-request-update DOM events (from WebSocket bridge)
  useEffect(() => {
    const handler = () => loadCount();
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
  }, [loadCount]);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Loan disbursement events
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype } = data.payload || {};
          if (['NEW_LOAN_DISBURSEMENT', 'LOAN_DISBURSEMENT_COMPLETED', 'LOAN_DISBURSEMENT_CANCELLED'].includes(subtype)) {
            loadCount();
          }
        }

        // Session lifecycle events — re-check session status
        if (['SESSION_OPENED', 'SESSION_CLOSED', 'CAISSE_SESSION_UPDATE'].includes(data.type)) {
          checkSession();
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, loadCount, checkSession]);

  return { pendingCount, isLoading, refresh: loadCount };
}

export default useCaisseBadge;
