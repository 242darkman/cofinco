/**
 * Enhanced useOffline Hook
 *
 * Provides comprehensive offline functionality:
 * - Connectivity status with quality awareness
 * - Sync operations with progress
 * - Offline-first fetch with automatic queuing
 * - Background sync integration
 * - Storage management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { connectivityService } from '../lib/connectivityService';
import { syncService, SyncStats, SyncProgress } from '../lib/syncService';
import {
  addOfflineOperation,
  getOperationStats,
  OperationType,
  getCachedQuery,
  setCachedQuery,
  CACHE_TTL,
  saveOfflineSession,
  getOfflineSession,
  clearOfflineSession,
  getStorageStats,
  clearCachedQuery
} from '../lib/offline-db';

// ========== TYPES ==========

export interface UseOfflineResult {
  // Connectivity
  isOnline: boolean;
  connectionQuality: 'good' | 'slow' | 'offline';

  // Sync
  isSyncing: boolean;
  pendingCount: number;
  syncStats: SyncStats;
  syncProgress: SyncProgress | null;

  // Actions
  queueOperation: (
    type: OperationType,
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    payload: any,
    options?: QueueOptions
  ) => Promise<string>;
  forceSyncNow: () => Promise<void>;
  syncByType: (type: OperationType) => Promise<void>;

  // Offline-first fetch
  offlineFetch: <T>(endpoint: string, options?: OfflineFetchOptions<T>) => Promise<T>;

  // Cache management
  getCached: <T>(key: string) => Promise<T | null>;
  setCache: <T>(key: string, data: T, ttl?: number) => Promise<void>;
  clearCache: (key: string) => Promise<void>;

  // Session
  saveSession: (session: SessionData) => Promise<void>;
  getSession: () => Promise<SessionData | null>;
  clearSession: () => Promise<void>;

  // Storage
  getStorageInfo: () => Promise<StorageInfo>;
}

export interface QueueOptions {
  userId?: number;
  agenceId?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

export interface OfflineFetchOptions<T> extends RequestInit {
  offlineType?: OperationType;
  offlineFallback?: T;
  cacheKey?: string;
  cacheTtl?: number;
  forceNetwork?: boolean;
  backgroundSync?: boolean;
}

export interface SessionData {
  userId: number;
  userName: string;
  userRole: string;
  agenceId?: string;
  agenceName?: string;
  permissions: string[];
  expiresAt: number;
}

export interface StorageInfo {
  operations: number;
  clients: number;
  remises: number;
  enquetes: number;
  cachedQueries: number;
  mapTiles: { count: number; sizeEstimate: number };
  conflicts: number;
  estimatedTotalSize: number;
  quotaUsed?: number;
  quotaAvailable?: number;
}

// ========== HOOK ==========

export function useOffline(): UseOfflineResult {
  const [isOnline, setIsOnline] = useState(connectivityService.getStatus());
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'slow' | 'offline'>('good');
  const [syncStats, setSyncStats] = useState<SyncStats>(syncService.getStats());
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Track pending requests for deduplication
  const pendingRequests = useRef<Map<string, Promise<any>>>(new Map());

  // ========== CONNECTIVITY ==========

  useEffect(() => {
    const unsubConnectivity = connectivityService.subscribe((online) => {
      setIsOnline(online);
      setConnectionQuality(online ? 'good' : 'offline');
    });

    const unsubSync = syncService.subscribe(setSyncStats);
    const unsubProgress = syncService.subscribeToProgress(setSyncProgress);

    return () => {
      unsubConnectivity();
      unsubSync();
      unsubProgress();
    };
  }, []);

  // Monitor connection quality
  useEffect(() => {
    if (!isOnline) {
      setConnectionQuality('offline');
      return;
    }

    const connection = (navigator as any).connection;
    if (connection) {
      const updateQuality = () => {
        const effectiveType = connection.effectiveType;
        if (effectiveType === '4g') {
          setConnectionQuality('good');
        } else if (effectiveType === '3g' || effectiveType === '2g') {
          setConnectionQuality('slow');
        } else {
          setConnectionQuality('good');
        }
      };

      updateQuality();
      connection.addEventListener('change', updateQuality);
      return () => connection.removeEventListener('change', updateQuality);
    }
  }, [isOnline]);

  // ========== QUEUE OPERATIONS ==========

  const queueOperation = useCallback(
    async (
      type: OperationType,
      endpoint: string,
      method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      payload: any,
      options?: QueueOptions
    ): Promise<string> => {
      const uuid = await addOfflineOperation(type, endpoint, method, payload, {
        userId: options?.userId,
        agenceId: options?.agenceId
      });

      await syncService.refreshPendingCount();

      // If online, trigger sync
      if (isOnline) {
        setTimeout(() => syncService.forceSyncNow(), 100);
      }

      return uuid;
    },
    [isOnline]
  );

  // ========== SYNC ==========

  const forceSyncNow = useCallback(async (): Promise<void> => {
    if (isOnline) {
      await syncService.forceSyncNow();
    }
  }, [isOnline]);

  const syncByType = useCallback(
    async (type: OperationType): Promise<void> => {
      if (isOnline) {
        await syncService.syncByType(type);
      }
    },
    [isOnline]
  );

  // ========== OFFLINE-FIRST FETCH ==========

  const offlineFetch = useCallback(
    async <T>(endpoint: string, options: OfflineFetchOptions<T> = {}): Promise<T> => {
      const {
        offlineType = 'other',
        offlineFallback,
        cacheKey,
        cacheTtl = CACHE_TTL.RECORD,
        forceNetwork = false,
        backgroundSync = true,
        ...fetchOptions
      } = options;

      const effectiveCacheKey = cacheKey || `fetch:${endpoint}:${fetchOptions.method || 'GET'}`;

      // Check for duplicate in-flight requests
      const pendingKey = `${endpoint}:${JSON.stringify(fetchOptions.body)}`;
      if (pendingRequests.current.has(pendingKey)) {
        return pendingRequests.current.get(pendingKey);
      }

      // For GET requests, check cache first (unless forceNetwork)
      if (!forceNetwork && (!fetchOptions.method || fetchOptions.method === 'GET')) {
        const cached = await getCachedQuery<T>(effectiveCacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      // Create the fetch promise
      const fetchPromise = (async (): Promise<T> => {
        try {
          if (isOnline) {
            const response = await fetch(endpoint, {
              ...fetchOptions,
              credentials: 'include'
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Cache GET responses
            if (!fetchOptions.method || fetchOptions.method === 'GET') {
              await setCachedQuery(effectiveCacheKey, data, cacheTtl);
            }

            return data;
          } else {
            throw new Error('Offline');
          }
        } catch (error) {
          console.log('[useOffline] Requête échouée, passage en mode offline');

          // Handle write operations when offline
          if (fetchOptions.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method)) {
            const body = fetchOptions.body
              ? typeof fetchOptions.body === 'string'
                ? JSON.parse(fetchOptions.body)
                : fetchOptions.body
              : {};

            await queueOperation(
              offlineType,
              endpoint,
              fetchOptions.method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
              body
            );

            // Request background sync if supported
            if (backgroundSync) {
              syncService.requestBackgroundSync();
            }

            return {
              success: true,
              offline: true,
              message: 'Opération enregistrée pour synchronisation'
            } as unknown as T;
          }

          // For GET requests, try cache
          if (!fetchOptions.method || fetchOptions.method === 'GET') {
            const cached = await getCachedQuery<T>(effectiveCacheKey);
            if (cached !== null) {
              return cached;
            }
          }

          // Use fallback if provided
          if (offlineFallback !== undefined) {
            return offlineFallback;
          }

          throw error;
        }
      })();

      // Track the pending request
      pendingRequests.current.set(pendingKey, fetchPromise);

      try {
        const result = await fetchPromise;
        return result;
      } finally {
        pendingRequests.current.delete(pendingKey);
      }
    },
    [isOnline, queueOperation]
  );

  // ========== CACHE MANAGEMENT ==========

  const getCached = useCallback(async <T>(key: string): Promise<T | null> => {
    return getCachedQuery<T>(key);
  }, []);

  const setCache = useCallback(async <T>(key: string, data: T, ttl: number = CACHE_TTL.RECORD): Promise<void> => {
    await setCachedQuery(key, data, ttl);
  }, []);

  const clearCacheHandler = useCallback(async (key: string): Promise<void> => {
    await clearCachedQuery(key);
  }, []);

  // ========== SESSION ==========

  const saveSession = useCallback(async (session: SessionData): Promise<void> => {
    await saveOfflineSession(session);
  }, []);

  const getSession = useCallback(async (): Promise<SessionData | null> => {
    const session = await getOfflineSession();
    if (session) {
      return {
        userId: session.userId,
        userName: session.userName,
        userRole: session.userRole,
        agenceId: session.agenceId,
        agenceName: session.agenceName,
        permissions: session.permissions,
        expiresAt: session.expiresAt
      };
    }
    return null;
  }, []);

  const clearSessionHandler = useCallback(async (): Promise<void> => {
    await clearOfflineSession();
  }, []);

  // ========== STORAGE INFO ==========

  const getStorageInfo = useCallback(async (): Promise<StorageInfo> => {
    const stats = await getStorageStats();

    // Try to get quota info
    let quotaUsed: number | undefined;
    let quotaAvailable: number | undefined;

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        quotaUsed = estimate.usage;
        quotaAvailable = estimate.quota;
      } catch {
        // Ignore errors
      }
    }

    return {
      ...stats,
      quotaUsed,
      quotaAvailable
    };
  }, []);

  return {
    // Connectivity
    isOnline,
    connectionQuality,

    // Sync
    isSyncing: syncStats.isSyncing,
    pendingCount: syncStats.totalPending,
    syncStats,
    syncProgress,

    // Actions
    queueOperation,
    forceSyncNow,
    syncByType,

    // Offline-first fetch
    offlineFetch,

    // Cache management
    getCached,
    setCache,
    clearCache: clearCacheHandler,

    // Session
    saveSession,
    getSession,
    clearSession: clearSessionHandler,

    // Storage
    getStorageInfo
  };
}

export default useOffline;
