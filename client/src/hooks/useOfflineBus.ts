/**
 * useOfflineBus Hook
 *
 * Initializes offline reactors (cache invalidation, UI toasts, sync trigger,
 * limits monitoring, audit log) and wires them to the app's QueryClient,
 * toast system, and sync service.
 *
 * Call this once in the authenticated portion of the app tree.
 * The hook is idempotent — multiple mounts will not re-register reactors.
 *
 * @module useOfflineBus
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  initOfflineReactors,
  updateReactorDeps,
  teardownOfflineReactors,
  areReactorsInitialized,
} from '../lib/offline-reactors';
import { syncService } from '../lib/syncService';
import { offlineBus } from '../lib/offline-bus';

/**
 * Initialize offline reactors with the current app context.
 *
 * @param enabled - Set to false to skip initialization (e.g., when not authenticated)
 */
export function useOfflineBus(enabled: boolean = true): void {
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Build the toast adapter matching the ReactorContext signature
    const showToast = (opts: {
      title: string;
      description?: string;
      variant?: 'default' | 'success' | 'warning' | 'destructive';
    }) => {
      const variant = opts.variant || 'default';
      if (variant === 'success') {
        toast.success(opts.title, { description: opts.description });
      } else if (variant === 'warning') {
        toast.warning(opts.title, { description: opts.description });
      } else if (variant === 'destructive') {
        toast.error(opts.title, { description: opts.description });
      } else {
        toast(opts.title, { description: opts.description });
      }
    };

    // Build the sync service adapter
    const syncAdapter = {
      syncJournal: () => syncService.syncJournal(),
      requestBackgroundSync: (tag: string) => syncService.requestBackgroundSync(tag),
    };

    if (!areReactorsInitialized()) {
      initOfflineReactors({
        queryClient: {
          invalidateQueries: (opts: { queryKey: string[] }) => {
            queryClient.invalidateQueries({ queryKey: opts.queryKey });
          },
        },
        showToast,
        syncService: syncAdapter,
      });
      initializedRef.current = true;
    } else {
      // Reactors already initialized (e.g., HMR) — update deps
      updateReactorDeps({
        queryClient: {
          invalidateQueries: (opts: { queryKey: string[] }) => {
            queryClient.invalidateQueries({ queryKey: opts.queryKey });
          },
        },
        showToast,
        syncService: syncAdapter,
      });
    }

    return () => {
      // Only tear down if we were the ones who initialized
      if (initializedRef.current) {
        teardownOfflineReactors();
        initializedRef.current = false;
      }
    };
  }, [enabled, queryClient]);
}

/**
 * Hook for subscribing to specific OfflineBus system events in components.
 *
 * @param event - System event type to listen for
 * @param handler - Callback when event fires
 */
export function useOfflineBusEvent(
  event: Parameters<typeof offlineBus.onSystem>[0],
  handler: (data: unknown) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = offlineBus.onSystem(event, (data) => {
      handlerRef.current(data);
    });
    return unsub;
  }, [event]);
}
