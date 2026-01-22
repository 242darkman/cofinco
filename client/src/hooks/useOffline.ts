import { useState, useEffect, useCallback } from 'react';
import { connectivityService } from '../lib/connectivityService';
import { syncService, SyncStats } from '../lib/syncService';
import {
  addOfflineOperation,
  getOperationStats,
  OperationType
} from '../lib/offline-db';

export interface UseOfflineResult {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncStats: SyncStats;
  queueOperation: (
    type: OperationType,
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    payload: any
  ) => Promise<string>;
  forceSyncNow: () => Promise<void>;
  offlineFetch: <T>(
    endpoint: string,
    options: RequestInit & { 
      offlineType?: OperationType;
      offlineFallback?: T;
    }
  ) => Promise<T>;
}

export function useOffline(): UseOfflineResult {
  const [isOnline, setIsOnline] = useState(connectivityService.getStatus());
  const [syncStats, setSyncStats] = useState<SyncStats>({
    totalPending: 0,
    synced: 0,
    failed: 0,
    conflicts: 0,
    isSyncing: false,
    lastSyncAt: null
  });

  useEffect(() => {
    const unsubConnectivity = connectivityService.subscribe(setIsOnline);
    const unsubSync = syncService.subscribe(setSyncStats);

    return () => {
      unsubConnectivity();
      unsubSync();
    };
  }, []);

  const queueOperation = useCallback(async (
    type: OperationType,
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    payload: any
  ): Promise<string> => {
    const uuid = await addOfflineOperation(type, endpoint, method, payload);
    await syncService.refreshPendingCount();
    
    if (isOnline) {
      setTimeout(() => syncService.forceSyncNow(), 100);
    }
    
    return uuid;
  }, [isOnline]);

  const forceSyncNow = useCallback(async (): Promise<void> => {
    if (isOnline) {
      await syncService.forceSyncNow();
    }
  }, [isOnline]);

  const offlineFetch = useCallback(async <T>(
    endpoint: string,
    options: RequestInit & { 
      offlineType?: OperationType;
      offlineFallback?: T;
    } = {}
  ): Promise<T> => {
    const { offlineType = 'other', offlineFallback, ...fetchOptions } = options;

    if (isOnline) {
      try {
        const response = await fetch(endpoint, {
          ...fetchOptions,
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.log('[useOffline] Requête échouée, passage en mode offline');
        
        if (fetchOptions.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method)) {
          const body = fetchOptions.body 
            ? (typeof fetchOptions.body === 'string' 
                ? JSON.parse(fetchOptions.body) 
                : fetchOptions.body)
            : {};
          
          await queueOperation(
            offlineType,
            endpoint,
            fetchOptions.method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
            body
          );

          return {
            success: true,
            offline: true,
            message: 'Opération enregistrée pour synchronisation'
          } as unknown as T;
        }

        if (offlineFallback !== undefined) {
          return offlineFallback;
        }
        
        throw error;
      }
    } else {
      if (fetchOptions.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method)) {
        const body = fetchOptions.body 
          ? (typeof fetchOptions.body === 'string' 
              ? JSON.parse(fetchOptions.body) 
              : fetchOptions.body)
          : {};
        
        await queueOperation(
          offlineType,
          endpoint,
          fetchOptions.method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          body
        );

        return {
          success: true,
          offline: true,
          message: 'Opération enregistrée pour synchronisation'
        } as unknown as T;
      }

      if (offlineFallback !== undefined) {
        return offlineFallback;
      }

      throw new Error('Mode hors ligne - données non disponibles');
    }
  }, [isOnline, queueOperation]);

  return {
    isOnline,
    isSyncing: syncStats.isSyncing,
    pendingCount: syncStats.totalPending,
    syncStats,
    queueOperation,
    forceSyncNow,
    offlineFetch
  };
}

export default useOffline;
