/**
 * KPI Hooks — React Query hooks for KPI data
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
