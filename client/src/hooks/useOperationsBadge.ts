/**
 * useOperationsBadge - Real-time badge counter for pending operations
 * 
 * Listens to WebSocket events and custom DOM events to update
 * the badge count for pending validations.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { caisseAgentApi } from '@/lib/api-client';

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
  
  const { socket, isConnected } = useWebSocket();

  // Load initial count
  const loadPendingCount = useCallback(async () => {
    try {
      const response = await caisseAgentApi.listOperations({ statut: 'SUBMITTED' });
      // Backend returns { operations: [...], total } or array directly
      const count = Array.isArray(response)
        ? response.length
        : (response.total || response.operations?.length || response.data?.length || 0);

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

  // WebSocket listener for real-time updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Listen for operation events
        if (data.type === 'OPERATION_TERRAIN_CREATED' || 
            data.type === 'OPERATION_CREATED' ||
            data.aggregate === 'operations-terrain') {
          // Increment count for new submissions
          if (data.payload?.statut === 'SUBMITTED' || data.action === 'SUBMITTED') {
            setBadgeData(prev => ({
              ...prev,
              pendingCount: prev.pendingCount + 1,
              lastUpdated: new Date()
            }));
          }
        }
        
        // Decrement on approval/rejection
        if (data.type === 'OPERATION_TERRAIN_APPROVED' || 
            data.type === 'OPERATION_TERRAIN_REJECTED' ||
            data.action === 'APPROVED' ||
            data.action === 'REJECTED') {
          setBadgeData(prev => ({
            ...prev,
            pendingCount: Math.max(0, prev.pendingCount - 1),
            lastUpdated: new Date()
          }));
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, isConnected]);

  // Listen for custom DOM events (fallback for non-WS updates)
  useEffect(() => {
    const handleOperationUpdate = (event: CustomEvent) => {
      const { type, count } = event.detail || {};
      
      if (type === 'OPERATION_TERRAIN_APPROVED' || type === 'OPERATION_TERRAIN_REJECTED') {
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
