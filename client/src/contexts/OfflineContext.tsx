/**
 * Offline Context
 *
 * Provides comprehensive offline state management across the application.
 * Features:
 * - Connectivity status
 * - Sync status and progress
 * - Conflict management
 * - Storage statistics
 * - PWA installation prompt
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { connectivityService } from '../lib/connectivityService';
import { syncService, SyncStats, SyncProgress, ConflictInfo } from '../lib/syncService';
import { getStorageStats, getUnresolvedConflicts, OperationType } from '../lib/offline-db';

// ========== TYPES ==========

export interface OfflineContextValue {
  // Connectivity
  isOnline: boolean;
  connectionQuality: 'good' | 'slow' | 'offline';

  // Sync
  syncStats: SyncStats;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  pendingCount: number;

  // Conflicts
  conflictCount: number;
  recentConflict: ConflictInfo | null;

  // Storage
  storageStats: StorageStats | null;

  // PWA
  canInstall: boolean;
  isInstalled: boolean;
  installPwa: () => Promise<void>;

  // Actions
  forceSyncNow: () => Promise<void>;
  syncByType: (type: OperationType) => Promise<void>;
  refreshStats: () => Promise<void>;
  clearConflictNotification: () => void;
}

interface StorageStats {
  operations: number;
  clients: number;
  remises: number;
  enquetes: number;
  cachedQueries: number;
  mapTiles: { count: number; sizeEstimate: number };
  conflicts: number;
  estimatedTotalSize: number;
}

interface OfflineProviderProps {
  children: ReactNode;
}

// ========== CONTEXT ==========

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

// ========== PROVIDER ==========

export function OfflineProvider({ children }: OfflineProviderProps) {
  // Connectivity state
  const [isOnline, setIsOnline] = useState(connectivityService.getStatus());
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'slow' | 'offline'>('good');

  // Sync state
  const [syncStats, setSyncStats] = useState<SyncStats>(syncService.getStats());
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Conflict state
  const [conflictCount, setConflictCount] = useState(0);
  const [recentConflict, setRecentConflict] = useState<ConflictInfo | null>(null);

  // Storage state
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // PWA state
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // ========== CONNECTIVITY ==========

  useEffect(() => {
    const unsubscribe = connectivityService.subscribe((online) => {
      setIsOnline(online);
      setConnectionQuality(online ? 'good' : 'offline');
    });

    // Check if app is installed as PWA
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      setIsInstalled(isStandalone);
    };
    checkInstalled();

    return unsubscribe;
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

  // ========== SYNC ==========

  useEffect(() => {
    const unsubscribeStats = syncService.subscribe(setSyncStats);
    const unsubscribeProgress = syncService.subscribeToProgress(setSyncProgress);
    const unsubscribeConflicts = syncService.subscribeToConflicts((conflict) => {
      setRecentConflict(conflict);
      refreshConflictCount();
    });

    return () => {
      unsubscribeStats();
      unsubscribeProgress();
      unsubscribeConflicts();
    };
  }, []);

  const refreshConflictCount = useCallback(async () => {
    const conflicts = await getUnresolvedConflicts();
    setConflictCount(conflicts.length);
  }, []);

  useEffect(() => {
    refreshConflictCount();
  }, [refreshConflictCount]);

  // ========== STORAGE ==========

  const refreshStorageStats = useCallback(async () => {
    const stats = await getStorageStats();
    setStorageStats(stats);
  }, []);

  useEffect(() => {
    refreshStorageStats();
    // Refresh every 5 minutes
    const interval = setInterval(refreshStorageStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshStorageStats]);

  // ========== PWA INSTALLATION ==========

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setCanInstall(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPwa = useCallback(async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // ========== ACTIONS ==========

  const forceSyncNow = useCallback(async () => {
    await syncService.forceSyncNow();
  }, []);

  const syncByType = useCallback(async (type: OperationType) => {
    await syncService.syncByType(type);
  }, []);

  const refreshStats = useCallback(async () => {
    await syncService.refreshPendingCount();
    await refreshStorageStats();
    await refreshConflictCount();
  }, [refreshStorageStats, refreshConflictCount]);

  const clearConflictNotification = useCallback(() => {
    setRecentConflict(null);
  }, []);

  // ========== CONTEXT VALUE ==========

  const value: OfflineContextValue = {
    // Connectivity
    isOnline,
    connectionQuality,

    // Sync
    syncStats,
    syncProgress,
    isSyncing: syncStats.isSyncing,
    pendingCount: syncStats.totalPending,

    // Conflicts
    conflictCount,
    recentConflict,

    // Storage
    storageStats,

    // PWA
    canInstall,
    isInstalled,
    installPwa,

    // Actions
    forceSyncNow,
    syncByType,
    refreshStats,
    clearConflictNotification
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

// ========== HOOKS ==========

export function useOfflineContext(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOfflineContext must be used within an OfflineProvider');
  }
  return context;
}

/**
 * Hook for basic offline status
 */
export function useIsOnline(): boolean {
  const { isOnline } = useOfflineContext();
  return isOnline;
}

/**
 * Hook for sync status
 */
export function useSyncStatus() {
  const { syncStats, syncProgress, isSyncing, pendingCount, forceSyncNow } = useOfflineContext();
  return { syncStats, syncProgress, isSyncing, pendingCount, forceSyncNow };
}

/**
 * Hook for conflict management
 */
export function useConflicts() {
  const { conflictCount, recentConflict, clearConflictNotification } = useOfflineContext();
  return { conflictCount, recentConflict, clearConflictNotification };
}

/**
 * Hook for PWA installation
 */
export function usePwaInstall() {
  const { canInstall, isInstalled, installPwa } = useOfflineContext();
  return { canInstall, isInstalled, installPwa };
}

export default OfflineContext;
