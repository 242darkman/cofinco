/**
 * useHrRealtime Hook
 *
 * Provides real-time subscription to HR module events.
 * Automatically invalidates relevant React Query caches when HR data changes.
 *
 * Usage:
 *   const { lastUpdate, isConnected } = useHrRealtime({
 *     entities: ['conge', 'paie'],
 *     onUpdate: (event) => {
 *       console.log('HR updated:', event);
 *     },
 *   });
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// HR Entity types
export type HrEntity =
  | 'employe'
  | 'conge'
  | 'presence'
  | 'paie'
  | 'bulletin'
  | 'formation'
  | 'sanction'
  | 'avantage'
  | 'candidature'
  | 'organigramme';

// HR Action types
export type HrAction =
  | 'created'
  | 'updated'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'deleted'
  | 'assigned'
  | 'generated'
  | 'validated';

// HR Update Event payload
export interface HrUpdateEvent {
  entity: HrEntity;
  action: HrAction;
  id: string | number;
  agenceId?: string;
  employeId?: string;
  timestamp: string;
  actor?: {
    id: string;
    name: string;
  };
  extra?: Record<string, any>;
}

// Hook options
interface UseHrRealtimeOptions {
  /** Filter updates to specific entities */
  entities?: HrEntity[];
  /** Callback when an update is received */
  onUpdate?: (event: HrUpdateEvent) => void;
  /** Show toast notifications for updates (default: false) */
  showToasts?: boolean;
  /** Custom toast messages per entity/action */
  toastMessages?: Partial<Record<HrEntity, Partial<Record<HrAction, string>>>>;
}

// Query key mappings for each entity
const QUERY_KEY_MAPPINGS: Record<HrEntity, string[][]> = {
  employe: [['/api/employes'], ['/api/hr/stats'], ['/api/hr/organigramme']],
  conge: [['/api/hr/conges'], ['/api/hr/stats'], ['/api/hr/conges/balance']],
  presence: [['/api/hr/presence'], ['/api/hr/presence/today'], ['/api/hr/stats']],
  paie: [['/api/hr/paie'], ['/api/hr/bulletins'], ['/api/hr/stats']],
  bulletin: [['/api/hr/bulletins'], ['/api/hr/paie/my'], ['/api/hr/stats']],
  formation: [['/api/hr/formations'], ['/api/hr/stats']],
  sanction: [['/api/hr/sanctions'], ['/api/hr/stats']],
  avantage: [['/api/hr/avantages'], ['/api/hr/stats']],
  candidature: [['/api/hr/candidatures'], ['/api/hr/stats']],
  organigramme: [['/api/hr/organigramme']],
};

// Default toast messages
const DEFAULT_TOAST_MESSAGES: Partial<Record<HrEntity, Partial<Record<HrAction, string>>>> = {
  conge: {
    created: 'Nouvelle demande de congé soumise',
    approved: 'Demande de congé approuvée',
    rejected: 'Demande de congé rejetée',
  },
  paie: {
    generated: 'Fiches de paie générées',
    validated: 'Bulletins de paie validés',
    paid: 'Paiements effectués',
  },
  formation: {
    created: 'Nouvelle formation créée',
    updated: 'Formation mise à jour',
  },
  sanction: {
    created: 'Nouvelle sanction enregistrée',
  },
  candidature: {
    created: 'Nouvelle candidature reçue',
    updated: 'Statut candidature mis à jour',
  },
};

export function useHrRealtime(options: UseHrRealtimeOptions = {}) {
  const {
    entities,
    onUpdate,
    showToasts = false,
    toastMessages = DEFAULT_TOAST_MESSAGES,
  } = options;

  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<HrUpdateEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  // Use refs to avoid stale closures
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Handler for HR update events
  const handleHrUpdate = useCallback(
    (event: CustomEvent<HrUpdateEvent>) => {
      const payload = event.detail;

      // Filter by entities if specified
      if (entities && !entities.includes(payload.entity)) {
        return;
      }

      // Update last event
      setLastUpdate(payload);

      // Trigger sync animation
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 500);
      setTimeout(() => setSyncStatus('idle'), 2000);

      // Invalidate relevant queries
      const queryKeys = QUERY_KEY_MAPPINGS[payload.entity] || [];
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      // Also invalidate generic HR key
      queryClient.invalidateQueries({ queryKey: ['/api/hr'] });

      // Show toast if enabled
      if (showToasts) {
        const message = toastMessages[payload.entity]?.[payload.action];
        if (message) {
          const actorInfo = payload.actor?.name ? ` par ${payload.actor.name}` : '';
          toast.info(`${message}${actorInfo}`, {
            description: `ID: ${payload.id}`,
            duration: 3000,
          });
        }
      }

      // Call custom handler
      onUpdateRef.current?.(payload);
    },
    [entities, queryClient, showToasts, toastMessages]
  );

  // Subscribe to HR events
  useEffect(() => {
    // Listen for custom HR update events dispatched from WebSocketContext
    const handler = (event: Event) => {
      handleHrUpdate(event as CustomEvent<HrUpdateEvent>);
    };

    window.addEventListener('hr-update', handler);
    setIsConnected(true);

    return () => {
      window.removeEventListener('hr-update', handler);
      setIsConnected(false);
    };
  }, [handleHrUpdate]);

  // Manual refresh function
  const refresh = useCallback(
    (entity?: HrEntity) => {
      setSyncStatus('syncing');

      if (entity) {
        const queryKeys = QUERY_KEY_MAPPINGS[entity] || [];
        queryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      } else {
        // Refresh all HR queries
        queryClient.invalidateQueries({ queryKey: ['/api/hr'] });
        Object.values(QUERY_KEY_MAPPINGS).forEach((keys) => {
          keys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        });
      }

      setTimeout(() => setSyncStatus('synced'), 500);
      setTimeout(() => setSyncStatus('idle'), 2000);
    },
    [queryClient]
  );

  return {
    /** Last received HR update event */
    lastUpdate,
    /** Whether WebSocket is connected */
    isConnected,
    /** Current sync status for UI indicators */
    syncStatus,
    /** Manually refresh HR data */
    refresh,
  };
}

/**
 * Hook for displaying a sync status indicator
 */
export function useHrSyncStatus() {
  const { syncStatus, lastUpdate, isConnected } = useHrRealtime();

  const statusText = {
    idle: isConnected ? 'Synchronisé' : 'Hors ligne',
    syncing: 'Synchronisation...',
    synced: 'Mis à jour',
  }[syncStatus];

  const statusColor = {
    idle: isConnected ? 'text-status-success' : 'text-content-muted',
    syncing: 'text-status-info',
    synced: 'text-status-success',
  }[syncStatus];

  return {
    statusText,
    statusColor,
    lastUpdateTime: lastUpdate?.timestamp
      ? new Date(lastUpdate.timestamp).toLocaleTimeString()
      : null,
    isConnected,
  };
}

export default useHrRealtime;
