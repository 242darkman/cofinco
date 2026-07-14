/**
 * KPI Hooks — React Query hooks for KPI data
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

const KPI_STALE_TIME = 5 * 60 * 1000; // 5 min

/** Map frontend period types to API format */
function toApiPeriodType(type: string): string {
  if (type === 'monthly') return 'MONTH';
  if (type === 'yearly') return 'YEAR';
  return type;
}

export interface KpiSnapshotResponse {
  data: any | null;
  message?: string;
}

export function useKpiSnapshot(periodType: string, periodKey: string, scope?: string) {
  const apiPeriodType = toApiPeriodType(periodType);
  return useQuery<KpiSnapshotResponse>({
    queryKey: ['kpi', 'snapshot', apiPeriodType, periodKey, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ periodType: apiPeriodType, periodKey });
      if (scope) params.set('scope', scope);
      const res = await fetch(`/api/kpi?${params}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 403) throw new Error('ACCESS_DENIED');
        throw new Error('Erreur chargement KPI');
      }
      return res.json();
    },
    staleTime: KPI_STALE_TIME,
    enabled: !!periodKey,
  });
}

export interface KpiSeriesPoint {
  periodKey: string;
  generatedAt: string;
  metrics: Record<string, number>;
}

/**
 * Séries temporelles compactes (12 dernières périodes) pour les sparklines.
 * L'agence est résolue côté serveur (header X-Agence-Id / agence de
 * l'utilisateur), comme pour le snapshot ; `scope` ne sert qu'à la clé de
 * cache. Invalidée par le rafraîchissement temps réel (préfixe ['kpi']).
 */
export function useKpiSeries(periodType: string, scope?: string) {
  const apiPeriodType = toApiPeriodType(periodType);
  return useQuery<{ data: KpiSeriesPoint[] }>({
    queryKey: ['kpi', 'series', apiPeriodType, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ periodType: apiPeriodType });
      const res = await fetch(`/api/kpi/series?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement séries KPI');
      return res.json();
    },
    staleTime: KPI_STALE_TIME,
  });
}

export function useKpiPeriods() {
  return useQuery<{ data: Array<{ periodType: string; periodKey: string; generatedAt: string; version: number }> }>({
    queryKey: ['kpi', 'periods'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/periods', { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement périodes');
      return res.json();
    },
    staleTime: KPI_STALE_TIME,
  });
}

export function useKpiRecalculate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodType: string; periodKey: string; agencyId?: string | null }) => {
      const res = await fetch('/api/kpi/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...params, periodType: toApiPeriodType(params.periodType) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erreur lors du recalcul');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi'] });
    },
  });
}

/**
 * Rafraîchissement temps réel : écoute les événements WebSocket `kpi`
 * diffusés par le worker serveur après chaque recalcul de snapshot,
 * et invalide le cache TanStack Query correspondant.
 *
 * À monter sur toute page affichant des KPI (ex. KpiDashboard).
 */
export function useKpiRealtimeRefresh() {
  const { socket } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'REALTIME_EVENT' && message.payload?.aggregateType === 'kpi') {
          queryClient.invalidateQueries({ queryKey: ['kpi'] });
        }
      } catch {
        // Message non-JSON : ignorer
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, queryClient]);
}
