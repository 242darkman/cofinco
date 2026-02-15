import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';

interface DashboardGlobal {
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
  tontinesActives: number;
  totalTontines: number;
  encaisse: number;
  par30: number;
  liquidityRatio: number;
  tresorerieDispo: number;
  montantEpargneTotal: number;
  agentsActifs: number;
  totalAgents: number;
  sessionsOuvertes: number;
}

interface DashboardDaily {
  nouveauxClients: number;
  nouveauxCredits: number;
}

export interface DashboardStats {
  role: string;
  global: DashboardGlobal;
  daily: DashboardDaily;
  weekly: DashboardDaily;
  objectives: {
    monthlyCredits: number;
    monthlyGoal: number;
  };
  charts: {
    monthlyGrowth: unknown[];
    weeklyActivity: unknown[];
    productSplit: unknown[];
    creditStatus: unknown[];
  };
  widgets: {
    recentActivity: unknown[];
    topClients: unknown[];
    upcomingPayments: unknown[];
    alerts: unknown[];
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => api.get<DashboardStats>('/api/dashboard/stats'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
