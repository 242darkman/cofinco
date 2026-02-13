/**
 * useOfflineOperation Hook
 *
 * React hook for executing financial operations that work both offline and online.
 * Unlike useCriticalMutation (which blocks when offline), this hook routes operations
 * through the offline journal when no network is available.
 *
 * Flow:
 * - Online: Executes via direct API call (existing behavior)
 * - Offline: Routes through executeOfflineOperation() → journal → synced later
 *
 * Provides:
 * - Offline limit pre-validation
 * - Treasury tracking (cash balance updates)
 * - Immutable journal entry creation (hash-chained, ECDSA-signed)
 * - Automatic cache invalidation on success
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { useNetworkStatus } from '../contexts/NetworkContext';
import { toast } from '../lib/toast';
import type { JournalEventType } from '../lib/offline-db';

// ============================================================================
// Types
// ============================================================================

export interface OfflineOperationParams {
  /** Journal event type (determines cash flow direction) */
  type: JournalEventType;
  /** Operation amount in XAF */
  amount: number;
  /** Business payload (client info, account details, etc.) */
  payload: Record<string, unknown>;
  /** Optional metadata (GPS coords, billetage, etc.) */
  metadata?: Record<string, unknown>;
}

export interface OfflineOperationResult {
  /** True if executed offline via journal */
  offline: boolean;
  /** Journal UUID (offline) or server response (online) */
  journalUuid?: string;
  /** Operation reference (EPG-YYYYMMDD-XXXXXX) */
  operationRef?: string;
  /** Updated cash balance after operation */
  newCashBalance?: number;
  /** Server response data (online only) */
  serverData?: unknown;
}

interface UseOfflineOperationOptions<TData> {
  /** Agent ID */
  agentId: number;
  /** Agency ID */
  agenceId: string;
  /** Online mutation function (called when network is available) */
  onlineMutationFn?: (params: OfflineOperationParams, idempotencyKey: string) => Promise<TData>;
  /** Query keys to invalidate on success */
  invalidateKeys?: QueryKey[];
  /** Success message */
  successMessage?: string | ((result: OfflineOperationResult) => string);
  /** Error message */
  errorMessage?: string | ((error: Error) => string);
  /** Called on success */
  onSuccess?: (result: OfflineOperationResult) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

interface UseOfflineOperationReturn {
  /** Execute the operation (offline or online) */
  execute: (params: OfflineOperationParams) => Promise<OfflineOperationResult | undefined>;
  /** Whether currently executing */
  isPending: boolean;
  /** Last error */
  error: Error | null;
  /** Whether the operation went through offline path */
  isOffline: boolean;
  /** Pre-check if operation can be executed offline */
  checkOfflineLimits: (type: JournalEventType, amount: number) => Promise<{
    allowed: boolean;
    reason?: string;
    details?: string;
  }>;
}

// ============================================================================
// Hook
// ============================================================================

export function useOfflineOperation<TData = unknown>(
  options: UseOfflineOperationOptions<TData>
): UseOfflineOperationReturn {
  const {
    agentId,
    agenceId,
    onlineMutationFn,
    invalidateKeys = [],
    successMessage,
    errorMessage,
    onSuccess,
    onError,
  } = options;

  const networkStatus = useNetworkStatus();
  const queryClient = useQueryClient();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const abortRef = useRef(false);

  const isNetworkAvailable = networkStatus === 'online' || networkStatus === 'unstable';

  /**
   * Pre-check offline limits without executing.
   */
  const checkOfflineLimits = useCallback(
    async (type: JournalEventType, amount: number) => {
      const { canExecuteOffline } = await import('../lib/offline-treasury');
      return canExecuteOffline(type, amount, agentId);
    },
    [agentId]
  );

  /**
   * Execute the financial operation.
   * Routes to online API if available, otherwise goes through offline journal.
   */
  const execute = useCallback(
    async (params: OfflineOperationParams): Promise<OfflineOperationResult | undefined> => {
      if (isPending) return undefined;

      setIsPending(true);
      setError(null);
      abortRef.current = false;

      try {
        let result: OfflineOperationResult;

        if (isNetworkAvailable && onlineMutationFn) {
          // ===== ONLINE PATH =====
          setIsOffline(false);
          const { generateIdempotencyKey } = await import('../lib/criticalOperations');
          const idempotencyKey = generateIdempotencyKey('offline-op');
          const serverData = await onlineMutationFn(params, idempotencyKey);

          result = {
            offline: false,
            serverData,
          };
        } else {
          // ===== OFFLINE PATH =====
          setIsOffline(true);
          const { executeOfflineOperation } = await import('../lib/offline-treasury');

          const offlineResult = await executeOfflineOperation({
            type: params.type,
            amount: params.amount,
            agentId,
            agenceId,
            payload: params.payload,
            metadata: params.metadata,
          });

          result = {
            offline: true,
            journalUuid: offlineResult.journalUuid,
            operationRef: offlineResult.operationRef,
            newCashBalance: offlineResult.newCashBalance,
          };
        }

        if (abortRef.current) return undefined;

        // Show success toast
        if (successMessage) {
          const msg = typeof successMessage === 'function'
            ? successMessage(result)
            : successMessage;
          const suffix = result.offline ? ' (hors ligne)' : '';
          toast.success(msg + suffix);
        }

        // Invalidate queries
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }

        onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (abortRef.current) return undefined;

        setError(error);

        // Show error toast
        if (errorMessage) {
          const msg = typeof errorMessage === 'function'
            ? errorMessage(error)
            : errorMessage;
          toast.error(msg);
        } else {
          // Parse limit rejection reasons for user-friendly messages
          const reason = extractLimitReason(error.message);
          toast.error(reason || error.message);
        }

        onError?.(error);
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [
      isPending,
      isNetworkAvailable,
      onlineMutationFn,
      agentId,
      agenceId,
      invalidateKeys,
      successMessage,
      errorMessage,
      onSuccess,
      onError,
      queryClient,
    ]
  );

  return {
    execute,
    isPending,
    error,
    isOffline,
    checkOfflineLimits,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract user-friendly message from limit rejection.
 */
function extractLimitReason(message: string): string | null {
  if (message.includes('NO_LIMITS')) return 'Limites offline non configurées. Synchronisation requise.';
  if (message.includes('LIMITS_TAMPERED')) return 'Limites offline corrompues. Synchronisation requise.';
  if (message.includes('TYPE_NOT_ALLOWED')) return 'Ce type d\'opération n\'est pas autorisé hors ligne.';
  if (message.includes('NO_SESSION')) return 'Aucune session ouverte. Ouvrez la caisse d\'abord.';
  if (message.includes('CAISSE_CEILING')) return 'Plafond caisse dépassé.';
  if (message.includes('INSUFFICIENT_CASH')) return 'Solde caisse insuffisant.';
  if (message.includes('SINGLE_OP_LIMIT')) return 'Montant supérieur au plafond par opération.';
  if (message.includes('DAILY_OPS_LIMIT')) return 'Limite journalière d\'opérations atteinte.';
  if (message.includes('DAILY_VOLUME_LIMIT')) return 'Volume journalier maximum dépassé.';
  if (message.includes('OFFLINE_TOO_LONG')) return 'Durée hors ligne dépassée. Synchronisation requise.';
  if (message.includes('SYNC_BACKLOG')) return 'Trop d\'opérations en attente. Synchronisation requise.';
  return null;
}

// ============================================================================
// Specialized Variants
// ============================================================================

/**
 * Hook for offline deposit operations.
 */
export function useOfflineDeposit(options: Omit<UseOfflineOperationOptions<unknown>, 'onlineMutationFn'> & {
  onlineMutationFn?: (params: OfflineOperationParams, idempotencyKey: string) => Promise<unknown>;
}) {
  return useOfflineOperation({
    ...options,
    successMessage: options.successMessage || 'Dépôt enregistré',
  });
}

/**
 * Hook for offline withdrawal operations.
 */
export function useOfflineWithdrawal(options: Omit<UseOfflineOperationOptions<unknown>, 'onlineMutationFn'> & {
  onlineMutationFn?: (params: OfflineOperationParams, idempotencyKey: string) => Promise<unknown>;
}) {
  return useOfflineOperation({
    ...options,
    successMessage: options.successMessage || 'Retrait enregistré',
  });
}

/**
 * Hook for offline loan repayment operations.
 */
export function useOfflineLoanRepayment(options: Omit<UseOfflineOperationOptions<unknown>, 'onlineMutationFn'> & {
  onlineMutationFn?: (params: OfflineOperationParams, idempotencyKey: string) => Promise<unknown>;
}) {
  return useOfflineOperation({
    ...options,
    successMessage: options.successMessage || 'Remboursement enregistré',
  });
}

/**
 * Hook for offline tontine contribution operations.
 */
export function useOfflineTontineContribution(options: Omit<UseOfflineOperationOptions<unknown>, 'onlineMutationFn'> & {
  onlineMutationFn?: (params: OfflineOperationParams, idempotencyKey: string) => Promise<unknown>;
}) {
  return useOfflineOperation({
    ...options,
    successMessage: options.successMessage || 'Cotisation tontine enregistrée',
  });
}
