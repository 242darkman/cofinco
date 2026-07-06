/**
 * useOperationsBadge - Real-time badge counter for pending operations
 * 
 * Listens to WebSocket events and custom DOM events to update
 * the badge count for pending validations.
 */

import { useState, useEffect, useCallback } from 'react';
import { caisseAgentApi } from '@/lib/api-client';
import { useIsOnline } from '@/contexts/NetworkContext';

export interface OperationsBadgeData {
  pendingCount: number;
  lastUpdated: Date | null;
  isLoading: boolean;
}

export function useOperationsBadge() {
  const [badgeData, setBadgeData] = useState<OperationsBadgeData>({
    pendingCount: 0,
    lastUpdated: null,
    isLoading: true
  });
  
  // Load initial count
  const loadPendingCount = useCallback(async () => {
    try {
      const response = await caisseAgentApi.listOperations({ statut: 'SUBMITTED' });
      // Backend returns { operations: [...], total } structure
      const count = response.total || response.operations?.length || 0;

      setBadgeData({
        pendingCount: count,
        lastUpdated: new Date(),
        isLoading: false
      });
    } catch (error) {
      console.error('[OperationsBadge] Error loading count:', error);
      setBadgeData(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // Refetch when back online
  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) {
      loadPendingCount();
    }
  }, [isOnline, loadPendingCount]);

  // Listen for custom DOM events (fallback for non-WS updates)
  useEffect(() => {
    const handleOperationUpdate = (event: CustomEvent) => {
      const { type, count } = event.detail || {};

      // Decrement count when operation is no longer pending (approved, rejected, or settled)
      if (type === 'OPERATION_TERRAIN_APPROVED' ||
          type === 'OPERATION_TERRAIN_REJECTED' ||
          type === 'OPERATION_TERRAIN_SETTLED') {
        setBadgeData(prev => ({
          ...prev,
          pendingCount: Math.max(0, prev.pendingCount - 1),
          lastUpdated: new Date()
        }));
      } else if (type === 'BULK_APPROVE' && typeof count === 'number') {
        setBadgeData(prev => ({
          ...prev,
          pendingCount: Math.max(0, prev.pendingCount - count),
          lastUpdated: new Date()
        }));
      } else if (type === 'OPERATION_TERRAIN_CREATED') {
        setBadgeData(prev => ({
          ...prev,
          pendingCount: prev.pendingCount + 1,
          lastUpdated: new Date()
        }));
      } else if (type === 'REFRESH_BADGE') {
        loadPendingCount();
      }
    };

    window.addEventListener('operation-update', handleOperationUpdate as EventListener);
    return () => window.removeEventListener('operation-update', handleOperationUpdate as EventListener);
  }, [loadPendingCount]);

  return {
    ...badgeData,
    refresh: loadPendingCount
  };
}

export default useOperationsBadge;
