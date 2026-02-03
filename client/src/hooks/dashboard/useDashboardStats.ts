import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAgence } from '../../contexts/AgenceContext';
import { dashboardApi } from '../../lib/api-client';
import { dashboardKeys } from '../../lib/query-keys';

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
    tresorerieDispo: number;
    encaisse: number;
    par30: number;
    liquidityRatio: number;
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
  // Flag for lightweight data
  isLightweight?: boolean;
}

// Lightweight stats interface (from /api/dashboard/stats-light)
interface LightweightStats {
  kpis: {
    totalClients: number;
    clientsActifs: number;
    totalCredits: number;
    creditsEnCours: number;
    creditsEnRetard: number;
    encaisse: number;
    par30: number;
    liquidite: number;
    sessionsOuvertes: number;
  };
  isLightweight: true;
  timestamp: string;
}

/**
 * Detect slow network connection (3G or worse)
 * Returns true if connection is slow or unknown (conservative)
 */
function isSlowConnection(): boolean {
  const connection = (navigator as any).connection;
  if (!connection) return false; // Assume fast if API not available

  const slowTypes = ['slow-2g', '2g', '3g'];
  const effectiveType = connection.effectiveType;

  // Also check saveData preference
  if (connection.saveData) return true;

  return slowTypes.includes(effectiveType);
}

/**
 * Convert lightweight stats to full stats structure
 * Fills in missing data with defaults/zeros
 */
function lightweightToFullStats(light: LightweightStats): DashboardStats {
  return {
    role: 'user',
    global: {
      totalClients: light.kpis.totalClients,
      clientsActifs: light.kpis.clientsActifs,
      totalCredits: light.kpis.totalCredits,
      creditsEnCours: light.kpis.creditsEnCours,
      creditsEnAttente: 0,
      creditsRetard: light.kpis.creditsEnRetard,
      montantCreditsTotal: 0,
      montantDecaisse: 0,
      montantRecouvre: 0,
      montantEnAttente: 0,
      tauxRecouvrement: 0,
      totalEpargnes: 0,
      epargneActive: 0,
      montantEpargneTotal: 0,
      tontinesActives: 0,
      totalTontines: 0,
      agentsActifs: 0,
      totalAgents: 0,
      sessionsOuvertes: light.kpis.sessionsOuvertes,
      tresorerieDispo: light.kpis.encaisse,
      encaisse: light.kpis.encaisse,
      par30: light.kpis.par30,
      liquidityRatio: light.kpis.liquidite,
    },
    daily: { nouveauxClients: 0, nouveauxCredits: 0 },
    weekly: { nouveauxClients: 0, nouveauxCredits: 0 },
    charts: {
      monthlyGrowth: [],
      weeklyActivity: [],
      productSplit: [],
      creditStatus: [],
    },
    widgets: {
      recentActivity: [],
      topClients: [],
      upcomingPayments: [],
      alerts: [],
    },
    objectives: { monthlyCredits: 0, monthlyGoal: 30 },
    isLightweight: true,
  };
}

export function useDashboardStats(userRole?: string) {
  const { selectedAgence } = useAgence();
  const queryClient = useQueryClient();

  // Detect slow connection once
  const isSlow = useMemo(() => isSlowConnection(), []);

  // On slow connections: fetch lightweight stats first (fast initial load)
  const { data: lightStats } = useQuery<LightweightStats>({
    queryKey: dashboardKeys.statsLight(userRole, selectedAgence?.id),
    queryFn: () => dashboardApi.getStatsLight(),
    enabled: isSlow, // Only fetch on slow connections
    staleTime: 60_000, // 1 minute - lightweight can be cached longer
    gcTime: 5 * 60_000, // 5 minutes
  });

  // Full stats query (always runs, but delayed on slow connections)
  const { data: fullStats, isLoading: fullLoading, error, refetch } = useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats(userRole, selectedAgence?.id),
    queryFn: () => dashboardApi.getStats(),
    // On slow connections: longer stale time, no polling
    staleTime: isSlow ? 60_000 : 10_000,
    refetchInterval: isSlow ? false : 30_000, // Disable polling on 3G
    refetchOnWindowFocus: !isSlow, // Don't auto-refresh on slow connections
    // On slow connections with light stats: mark as not essential initially
    ...(isSlow && lightStats ? { refetchOnMount: false } : {}),
  });

  // Prefetch full stats in background after lightweight loads
  useEffect(() => {
    if (isSlow && lightStats && !fullStats) {
      // Wait a bit then prefetch full stats in background
      const timer = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: dashboardKeys.stats(userRole, selectedAgence?.id),
          queryFn: () => dashboardApi.getStats(),
        });
      }, 2000); // 2s delay to let UI settle first

      return () => clearTimeout(timer);
    }
  }, [isSlow, lightStats, fullStats, queryClient, userRole, selectedAgence?.id]);

  // Use lightweight stats as fallback while full stats load
  const stats = useMemo(() => {
    if (fullStats) return fullStats;
    if (lightStats) return lightweightToFullStats(lightStats);
    return null;
  }, [fullStats, lightStats]);

  // Loading state: only true if we have neither stats
  const loading = !stats && fullLoading;

  return {
    stats,
    loading,
    error: error ? (error as Error).message : null,
    refresh: () => refetch(),
    isLightweight: stats?.isLightweight ?? false,
    isSlow,
  };
}
