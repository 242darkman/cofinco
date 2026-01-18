/**
 * useOfflineQueue - Offline-first transaction queue with auto-sync
 * 
 * Stores pending operations in localStorage and syncs when online.
 * Generates idempotencyKey to prevent duplicates.
 */

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const QUEUE_STORAGE_KEY = 'pos_offline_queue';

export interface QueuedOperation {
  id: string;
  idempotencyKey: string;
  type: 'COLLECT_CASH' | 'SETTLEMENT_CASH';
  payload: Record<string, any>;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  error?: string;
}

interface UseOfflineQueueReturn {
  queue: QueuedOperation[];
  isOnline: boolean;
  isSyncing: boolean;
  addToQueue: (type: QueuedOperation['type'], payload: Record<string, any>) => QueuedOperation;
  removeFromQueue: (id: string) => void;
  retryFailed: () => void;
  clearQueue: () => void;
  pendingCount: number;
}

export function useOfflineQueue(syncFn?: (op: QueuedOperation) => Promise<void>): UseOfflineQueueReturn {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as QueuedOperation[];
        setQueue(parsed.filter(op => op.status !== 'syncing')); // Reset syncing status
      }
    } catch (e) {
      console.error('[OfflineQueue] Error loading queue:', e);
    }
  }, []);

  // Persist queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('[OfflineQueue] Error saving queue:', e);
    }
  }, [queue]);

  // Online/Offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when online
  useEffect(() => {
    if (isOnline && queue.some(op => op.status === 'pending') && syncFn && !isSyncing) {
      syncQueue();
    }
  }, [isOnline, queue, syncFn, isSyncing]);

  const syncQueue = useCallback(async () => {
    if (!syncFn || isSyncing) return;

    const pendingOps = queue.filter(op => op.status === 'pending');
    if (pendingOps.length === 0) return;

    setIsSyncing(true);

    for (const op of pendingOps) {
      // Mark as syncing
      setQueue(prev => prev.map(o => o.id === op.id ? { ...o, status: 'syncing' as const } : o));

      try {
        await syncFn(op);
        // Remove on success
        setQueue(prev => prev.filter(o => o.id !== op.id));
      } catch (error: any) {
        // Mark as failed
        setQueue(prev => prev.map(o => 
          o.id === op.id 
            ? { ...o, status: 'failed' as const, error: error.message, retryCount: o.retryCount + 1 } 
            : o
        ));
      }
    }

    setIsSyncing(false);
  }, [queue, syncFn, isSyncing]);

  const addToQueue = useCallback((type: QueuedOperation['type'], payload: Record<string, any>): QueuedOperation => {
    const operation: QueuedOperation = {
      id: uuidv4(),
      idempotencyKey: payload.idempotencyKey || uuidv4(),
      type,
      payload: { ...payload, idempotencyKey: payload.idempotencyKey || uuidv4() },
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0
    };

    setQueue(prev => [...prev, operation]);
    return operation;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(op => op.id !== id));
  }, []);

  const retryFailed = useCallback(() => {
    setQueue(prev => prev.map(op => 
      op.status === 'failed' ? { ...op, status: 'pending' as const, error: undefined } : op
    ));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  return {
    queue,
    isOnline,
    isSyncing,
    addToQueue,
    removeFromQueue,
    retryFailed,
    clearQueue,
    pendingCount: queue.filter(op => op.status === 'pending').length
  };
}

export default useOfflineQueue;
