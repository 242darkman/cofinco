/**
 * useMonEspaceBadge - Real-time badge counter for unread items in Mon Espace
 *
 * Counts: unread bulletins (VALIDATED/PAID not viewed) + new completed documents (not viewed).
 * Listens to `hr-update` DOM events for real-time updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsOnline } from '@/contexts/NetworkContext';

interface MonEspaceUnreadCount {
  unreadBulletins: number;
  newDocuments: number;
  total: number;
}

export function useMonEspaceBadge() {
  const [counts, setCounts] = useState<MonEspaceUnreadCount>({ unreadBulletins: 0, newDocuments: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/mon-espace/unread-count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCounts({
          unreadBulletins: data.unreadBulletins || 0,
          newDocuments: data.newDocuments || 0,
          total: data.total || 0,
        });
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

  // Listen for HR update events (bulletin generated, document completed)
  useEffect(() => {
    const handler = (event: Event) => {
      const entity = (event as CustomEvent).detail?.entity;
      if (!entity || entity === 'bulletin' || entity === 'document_request' || entity === 'paie' || entity === 'salary_payment') {
        loadCount();
      }
    };
    window.addEventListener('hr-update', handler);
    return () => window.removeEventListener('hr-update', handler);
  }, [loadCount]);

  return {
    unreadBulletins: counts.unreadBulletins,
    newDocuments: counts.newDocuments,
    totalUnread: counts.total,
    isLoading,
    refresh: loadCount,
  };
}

export default useMonEspaceBadge;
