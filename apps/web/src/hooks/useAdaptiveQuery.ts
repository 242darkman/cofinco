/**
 * useAdaptiveQuery Hook
 * TanStack Query hook that adapts behavior based on network state
 */

import { useMemo } from 'react';
import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
  QueryKey,
  QueryFunction,
} from '@tanstack/react-query';
import { useNetworkStatus } from '../contexts/NetworkContext';
import { NetworkStatus } from '../lib/networkManager';

// ============================================================================
// Types
// ============================================================================

type AdaptiveQueryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryKey' | 'queryFn'> & {
  /** Mark as low priority (reduced polling on slow networks) */
  lowPriority?: boolean;
  /** Mark as critical (show errors immediately) */
  critical?: boolean;
  /** Custom staleTime per network state */
  adaptiveStaleTime?: Partial<Record<NetworkStatus, number>>;
  /** Skip adaptation (use provided options as-is) */
  skipAdaptation?: boolean;
};

type AdaptiveQueryResult<TData, TError> = UseQueryResult<TData, TError> & {
  /** Current network status */
  networkStatus: NetworkStatus;
  /** Is data potentially stale due to network issues */
  isDataStale: boolean;
  /** Was data loaded from cache while offline */
  isFromCache: boolean;
};

// ============================================================================
// Default Configurations per Network State
// ============================================================================

const NETWORK_CONFIGS: Record<NetworkStatus, Partial<UseQueryOptions>> = {
  online: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  },
  unstable: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    // Disable interval refetching on unstable
    refetchInterval: false,
  },
  offline: {
    staleTime: Infinity, // Never mark as stale
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false, // Will refetch when we detect online again
    retry: 0, // Don't retry when offline
    enabled: true, // Keep enabled to show cached data
  },
  api_down: {
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
    enabled: true,
  },
};

// Low priority overrides
const LOW_PRIORITY_OVERRIDES: Partial<Record<NetworkStatus, Partial<UseQueryOptions>>> = {
  unstable: {
    refetchInterval: false,
    staleTime: 15 * 60 * 1000, // 15 minutes
  },
  online: {
    refetchInterval: false,
  },
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAdaptiveQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, TQueryKey>,
  options?: AdaptiveQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): AdaptiveQueryResult<TData, TError> {
  const networkStatus = useNetworkStatus();

  const {
    lowPriority = false,
    critical = false,
    adaptiveStaleTime,
    skipAdaptation = false,
    ...queryOptions
  } = options ?? {};

  // Build adapted options based on network state
  const adaptedOptions = useMemo(() => {
    if (skipAdaptation) {
      return queryOptions;
    }

    // Start with network-specific defaults
    const networkDefaults = NETWORK_CONFIGS[networkStatus] ?? NETWORK_CONFIGS.online;

    // Apply low priority overrides
    const priorityOverrides = lowPriority
      ? LOW_PRIORITY_OVERRIDES[networkStatus] ?? {}
      : {};

    // Apply custom staleTime if provided
    const customStaleTime = adaptiveStaleTime?.[networkStatus];

    // Merge all options (user options take precedence)
    const merged = {
      ...networkDefaults,
      ...priorityOverrides,
      ...(customStaleTime !== undefined ? { staleTime: customStaleTime } : {}),
      ...queryOptions,
    };

    // For offline/api_down, ensure we don't disable the query entirely
    if ((networkStatus === 'offline' || networkStatus === 'api_down') && queryOptions.enabled !== false) {
      merged.enabled = true;
    }

    return merged as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
  }, [networkStatus, lowPriority, adaptiveStaleTime, skipAdaptation, queryOptions]);

  // Execute the query
  const queryResult = useQuery<TQueryFnData, TError, TData, TQueryKey>({
    queryKey,
    queryFn,
    ...adaptedOptions,
  });

  // Determine if data is stale/from cache
  const isDataStale = useMemo(() => {
    if (!queryResult.data) return false;

    // If we're offline and have data, it's from cache
    if (networkStatus === 'offline' || networkStatus === 'api_down') {
      return true;
    }

    // If data is marked as stale by TanStack Query
    if (queryResult.isStale) {
      return true;
    }

    return false;
  }, [queryResult.data, queryResult.isStale, networkStatus]);

  const isFromCache = useMemo(() => {
    // Data was served without fetching (from cache)
    return (
      queryResult.data !== undefined &&
      !queryResult.isFetching &&
      queryResult.isStale &&
      (networkStatus === 'offline' || networkStatus === 'api_down')
    );
  }, [queryResult.data, queryResult.isFetching, queryResult.isStale, networkStatus]);

  return {
    ...queryResult,
    networkStatus,
    isDataStale,
    isFromCache,
  };
}

// ============================================================================
// Specialized Variants
// ============================================================================

/**
 * For critical data that should show errors immediately
 */
export function useCriticalQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, TQueryKey>,
  options?: Omit<AdaptiveQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'critical'>
): AdaptiveQueryResult<TData, TError> {
  return useAdaptiveQuery(queryKey, queryFn, {
    ...options,
    critical: true,
    // Critical queries use shorter staleTime
    adaptiveStaleTime: {
      online: 2 * 60 * 1000, // 2 minutes
      unstable: 5 * 60 * 1000, // 5 minutes
      offline: Infinity,
      api_down: Infinity,
      ...options?.adaptiveStaleTime,
    },
  });
}

/**
 * For background/low-priority data
 */
export function useLowPriorityQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, TQueryKey>,
  options?: Omit<AdaptiveQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'lowPriority'>
): AdaptiveQueryResult<TData, TError> {
  return useAdaptiveQuery(queryKey, queryFn, {
    ...options,
    lowPriority: true,
  });
}

/**
 * For data that should only load when online
 */
export function useOnlineOnlyQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, TQueryKey>,
  options?: AdaptiveQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): AdaptiveQueryResult<TData, TError> {
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus === 'online' || networkStatus === 'unstable';

  return useAdaptiveQuery(queryKey, queryFn, {
    ...options,
    enabled: isOnline && (options?.enabled ?? true),
  });
}
