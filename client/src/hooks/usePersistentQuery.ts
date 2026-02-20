/**
 * Custom hook for persistent caching with React Query + IndexedDB
 *
 * Provides offline-first data fetching for slow connections:
 * 1. First, returns cached data from IndexedDB (instant)
 * 2. Then, fetches fresh data from server
 * 3. Updates IndexedDB cache for next time
 *
 * Perfect for 3G/slow networks where latency is high.
 *
 * @module usePersistentQuery
 */

import { useQuery, type UseQueryOptions, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  getCachedQuery,
  setCachedQuery,
  CACHE_TTL,
} from '@/lib/offline-db';

interface PersistentQueryOptions<TData, TError = Error>
  extends Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'> {
  /** Custom TTL for IndexedDB cache (default: 15 min) */
  persistTtl?: number;
  /** Skip IndexedDB caching entirely */
  skipPersist?: boolean;
}

/**
 * React Query hook with automatic IndexedDB persistence
 *
 * @example
 * ```tsx
 * const { data, isLoading } = usePersistentQuery(
 *   ['clients', filters],
 *   () => api.getClients(filters),
 *   {
 *     persistTtl: CACHE_TTL.LIST, // 10 minutes
 *     staleTime: 5 * 60 * 1000,   // 5 minutes in memory
 *   }
 * );
 * ```
 */
export function usePersistentQuery<TData, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: PersistentQueryOptions<TData, TError>
) {
  const {
    persistTtl = CACHE_TTL.RECORD,
    skipPersist = false,
    ...queryOptions
  } = options || {};

  // Serialize query key for IndexedDB storage
  const cacheKey = JSON.stringify(queryKey);

  // Main query with offline-first behavior
  const query = useQuery<TData, TError>({
    queryKey,
    queryFn: async () => {
      try {
        // Try to fetch from server
        const data = await queryFn();
        return data;
      } catch (error) {
        // On network error, try to return cached data
        if (!skipPersist && isNetworkError(error)) {
          const cached = await getCachedQuery<TData>(cacheKey);
          if (cached) {
            if (import.meta.env.DEV) console.log('[PersistentQuery] Returning cached data due to network error');
            return cached;
          }
        }
        throw error;
      }
    },
    // Use cached data as placeholder while fetching
    placeholderData: (previousData) => previousData,
    ...queryOptions,
  });

  // Persist successful data to IndexedDB
  useEffect(() => {
    if (!skipPersist && query.data && query.isSuccess) {
      setCachedQuery(cacheKey, query.data, persistTtl, {
        endpoint: queryKey[0] as string,
      });
    }
  }, [query.data, query.isSuccess, cacheKey, persistTtl, skipPersist, queryKey]);

  return query;
}

/**
 * Hook that loads from IndexedDB first, then fetches
 * Better UX for very slow connections
 */
export function useOfflineFirstQuery<TData, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: PersistentQueryOptions<TData, TError>
) {
  const {
    persistTtl = CACHE_TTL.RECORD,
    skipPersist = false,
    ...queryOptions
  } = options || {};

  const cacheKey = JSON.stringify(queryKey);

  return useQuery<TData, TError>({
    queryKey,
    queryFn: async () => {
      // First, try IndexedDB
      if (!skipPersist) {
        const cached = await getCachedQuery<TData>(cacheKey);
        if (cached) {
          // Return cached immediately, then refetch in background
          // React Query will handle the background refetch via staleTime
          return cached;
        }
      }

      // No cache, fetch from server
      const data = await queryFn();

      // Store in IndexedDB for next time
      if (!skipPersist) {
        await setCachedQuery(cacheKey, data, persistTtl, {
          endpoint: queryKey[0] as string,
        });
      }

      return data;
    },
    // Keep data fresh for shorter time since we're showing cached data
    staleTime: 30 * 1000, // 30 seconds
    ...queryOptions,
  });
}

/**
 * Check if error is a network error
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('offline') ||
      msg.includes('failed to fetch') ||
      msg.includes('net::')
    );
  }
  return false;
}

/**
 * Hook for static configuration data (agences, zones, etc.)
 * Uses longer TTL and aggressive caching
 */
export function useConfigQuery<TData>(
  configKey: string,
  queryFn: () => Promise<TData>,
  options?: Omit<PersistentQueryOptions<TData>, 'persistTtl'>
) {
  return usePersistentQuery<TData>(
    ['config', configKey],
    queryFn,
    {
      persistTtl: CACHE_TTL.CONFIG, // 24 hours
      staleTime: 60 * 60 * 1000,    // 1 hour in memory
      gcTime: 24 * 60 * 60 * 1000,  // 24 hours
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      ...options,
    }
  );
}

/**
 * Hook for dashboard stats (shorter TTL, frequent updates)
 */
export function useStatsQuery<TData>(
  statsKey: string,
  queryFn: () => Promise<TData>,
  options?: Omit<PersistentQueryOptions<TData>, 'persistTtl'>
) {
  return usePersistentQuery<TData>(
    ['stats', statsKey],
    queryFn,
    {
      persistTtl: CACHE_TTL.STATS, // 5 minutes
      staleTime: 60 * 1000,        // 1 minute in memory
      ...options,
    }
  );
}

export default usePersistentQuery;
