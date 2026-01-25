import { useQuery } from '@tanstack/react-query';
import { useAgence } from '../../contexts/AgenceContext';
import { dashboardApi } from '../../lib/api-client';
import { dashboardKeys } from '../../lib/query-keys';

export interface BalanceDataPoint {
  date: string;
  fullDate: string;
  solde: number;
  credits: number;
  epargnes: number;
}

export function useBalanceHistory(period: '7d' | '30d' | '90d' | '1y' = '30d') {
  const { selectedAgence } = useAgence();
  
  const { data, isLoading, error, refetch } = useQuery<BalanceDataPoint[]>({
    queryKey: dashboardKeys.balanceHistory(period, selectedAgence?.id),
    queryFn: () => dashboardApi.getBalanceHistory(period),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data: data || [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: refetch
  };
}
