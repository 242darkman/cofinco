import { useQuery } from '@tanstack/react-query';
import { useAgence } from '../../contexts/AgenceContext';
import { dashboardApi } from '../../lib/api-client';

export interface DashboardStats {
  role: string;
  global: {
    totalClients: number;
    clientsActifs: number;
    totalCredits: number;
    creditsEnCours: number;
    creditsEnAttente: number;
    creditsRetard: number;
    montantCreditsTotal: number;
    montantDecaisse: number;
    montantRecouvre: number;
    montantEnAttente: number;
    tauxRecouvrement: number;
    totalEpargnes: number;
    epargneActive: number;
    montantEpargneTotal: number;
    tontinesActives: number;
    totalTontines: number;
    agentsActifs: number;
    totalAgents: number;
    sessionsOuvertes: number;
  };
  daily: {
    nouveauxClients: number;
    nouveauxCredits: number;
  };
  weekly: {
    nouveauxClients: number;
    nouveauxCredits: number;
  };
  charts: {
    monthlyGrowth: { name: string; clients: number; credits: number; epargne: number }[];
    weeklyActivity: { name: string; transactions: number; collectes: number }[];
    productSplit: { name: string; value: number; color: string }[];
    creditStatus: { name: string; value: number; color: string }[];
  };
  widgets: {
    recentActivity: { action: string; user: string; time: string; type: string }[];
    topClients: { name: string; credits: number; total: number }[];
    upcomingPayments: { client: string; amount: number; date: string; status: string }[];
    alerts: { id: number; type: 'warning' | 'info' | 'success'; message: string; time: string }[];
  };
  objectives: {
    monthlyCredits: number;
    monthlyGoal: number;
  };
}

export function useDashboardStats(userRole?: string) {
  const { selectedAgence } = useAgence();
  
  const { data: stats, isLoading: loading, error, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', userRole, selectedAgence?.id],
    queryFn: () => dashboardApi.getStats(),
    // Smart Polling Strategy (Performance Optimized)
    refetchInterval: 30_000, // 30s background polling (mobile-friendly)
    refetchOnWindowFocus: true, // Auto-refresh when returning to tab
    staleTime: 10_000, // Don't re-fetch if data is < 10s old
  });

  return {
    stats: stats || null,
    loading,
    error: error ? (error as Error).message : null,
    refresh: () => refetch()
  };
}
