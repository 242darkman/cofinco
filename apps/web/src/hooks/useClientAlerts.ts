import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

interface ClientAlert {
  id: string;
  clientId: string;
  alertType: string;
  alertLevel: 'info' | 'warning' | 'critical';
  message: string;
  isResolved: boolean;
  resolvedAt?: string;
  createdAt: string;
  action?: string;
  targetTab?: string;
}

interface ResolvedEntry {
  alertType: string;
  resolvedAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

interface SnoozedEntry {
  alertType: string;
  snoozedAt: string;
  snoozedUntil: string;
  snoozedBy?: string;
  snoozedByName?: string;
}

export interface AlertsData {
  active: ClientAlert[];
  resolved: ResolvedEntry[];
  snoozed: SnoozedEntry[];
}

export type { ClientAlert, ResolvedEntry, SnoozedEntry };

const QUERY_KEY = 'client-alerts';

export function clientAlertsQueryKey(clientId: string) {
  return [QUERY_KEY, clientId] as const;
}

/**
 * Shared React Query hook for client alerts.
 * Both ClientAlerts and ClientOverviewTab consume this hook
 * so they share the same cache entry — no duplicate API calls.
 */
export function useClientAlerts(clientId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<AlertsData>({
    queryKey: clientAlertsQueryKey(clientId),
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/alerts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement alertes');
      const data = await res.json();
      const sorted = (data.active || []).sort((a: ClientAlert, b: ClientAlert) => {
        const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (levelOrder[a.alertLevel] ?? 3) - (levelOrder[b.alertLevel] ?? 3);
      });
      return {
        active: sorted,
        resolved: data.resolved || [],
        snoozed: data.snoozed || [],
      };
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  // Auto-invalidate on WebSocket events
  useEffect(() => {
    if (!clientId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.clientId || detail.clientId === clientId) {
        queryClient.invalidateQueries({ queryKey: clientAlertsQueryKey(clientId) });
      }
    };
    window.addEventListener('client-update', handler);
    window.addEventListener('score-updated', handler);
    return () => {
      window.removeEventListener('client-update', handler);
      window.removeEventListener('score-updated', handler);
    };
  }, [clientId, queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: clientAlertsQueryKey(clientId) }),
    setData: (updater: (prev: AlertsData | undefined) => AlertsData | undefined) =>
      queryClient.setQueryData(clientAlertsQueryKey(clientId), updater),
  };
}
