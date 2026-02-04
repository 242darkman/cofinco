/**
 * P2.1: Route-based prefetching hook
 * Prefetches API data for likely next navigation targets based on current module
 * Optimized for 3G/slow connections - only prefetches on good connections
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { dashboardKeys, clientKeys, creditKeys } from '@/lib/query-keys';
import { dashboardApi } from '@/lib/api-client';
import { clientsApi, creditsApi } from '@/lib/api';

// Connection quality check
function isGoodConnection(): boolean {
  const connection = (navigator as any).connection;
  if (!connection) return true; // Assume good if API not available

  // Don't prefetch on slow connections or data saver mode
  const slowTypes = ['slow-2g', '2g', '3g'];
  if (connection.saveData) return false;
  if (slowTypes.includes(connection.effectiveType)) return false;

  return true;
}

// Define prefetch rules: which data to prefetch from which module
const PREFETCH_RULES: Record<string, Array<{
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
}>> = {
  // From dashboard, users often go to clients or credits
  dashboard: [
    {
      queryKey: clientKeys.all,
      queryFn: () => clientsApi.getAll(),
      staleTime: 60_000,
    },
    {
      queryKey: creditKeys.all,
      queryFn: () => creditsApi.getAll(),
      staleTime: 60_000,
    },
  ],

  // From clients, users often go to credits or back to dashboard
  clients: [
    {
      queryKey: creditKeys.all,
      queryFn: () => creditsApi.getAll(),
      staleTime: 60_000,
    },
    {
      queryKey: dashboardKeys.stats(),
      queryFn: () => dashboardApi.getStats(),
      staleTime: 30_000,
    },
  ],

  // From credits, users often go to clients
  credits: [
    {
      queryKey: clientKeys.all,
      queryFn: () => clientsApi.getAll(),
      staleTime: 60_000,
    },
  ],
};

// Navigation link prefetch targets
const NAV_PREFETCH_MAP: Record<string, Array<{
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}>> = {
  dashboard: [
    { queryKey: dashboardKeys.stats(), queryFn: () => dashboardApi.getStats() },
  ],
  clients: [
    { queryKey: clientKeys.all, queryFn: () => clientsApi.getAll() },
  ],
  credits: [
    { queryKey: creditKeys.all, queryFn: () => creditsApi.getAll() },
  ],
};

export function usePrefetch(currentModule: string) {
  const queryClient = useQueryClient();

  // Prefetch data for likely next navigations (based on current module)
  useEffect(() => {
    // Only prefetch on good connections
    if (!isGoodConnection()) return;

    const rules = PREFETCH_RULES[currentModule];
    if (!rules) return;

    // Delay prefetch to not compete with current page load
    const timer = setTimeout(() => {
      rules.forEach(({ queryKey, queryFn, staleTime }) => {
        queryClient.prefetchQuery({
          queryKey,
          queryFn,
          staleTime: staleTime || 60_000,
        });
      });
    }, 2000); // Wait 2s after module loads before prefetching

    return () => clearTimeout(timer);
  }, [currentModule, queryClient]);

  // Prefetch on navigation link hover
  const prefetchOnHover = useCallback((moduleKey: string) => {
    // Only prefetch on good connections
    if (!isGoodConnection()) return;

    const targets = NAV_PREFETCH_MAP[moduleKey];
    if (!targets) return;

    targets.forEach(({ queryKey, queryFn }) => {
      // Check if data is already cached and fresh
      const cached = queryClient.getQueryData(queryKey);
      if (cached) return;

      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: 60_000,
      });
    });
  }, [queryClient]);

  // Prefetch specific client data (for client list items)
  const prefetchClient = useCallback((clientId: string) => {
    if (!isGoodConnection()) return;

    queryClient.prefetchQuery({
      queryKey: clientKeys.detail(clientId),
      queryFn: () => clientsApi.getById(clientId),
      staleTime: 60_000,
    });
  }, [queryClient]);

  return {
    prefetchOnHover,
    prefetchClient,
    isGoodConnection: useMemo(() => isGoodConnection(), []),
  };
}

// Utility hook for prefetching on element hover
export function usePrefetchOnHover(moduleKey: string) {
  const { prefetchOnHover } = usePrefetch('');

  return {
    onMouseEnter: () => prefetchOnHover(moduleKey),
    onFocus: () => prefetchOnHover(moduleKey),
  };
}
