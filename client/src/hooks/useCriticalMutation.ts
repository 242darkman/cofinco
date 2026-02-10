/**
 * useCriticalMutation Hook
 * Protected mutation hook for critical financial operations
 * - Automatically generates idempotency keys
 * - Blocks mutations when offline/api_down
 * - Provides retry with same idempotency key
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
  QueryKey,
} from '@tanstack/react-query';
import { useNetwork, useNetworkStatus } from '../contexts/NetworkContext';
import { generateIdempotencyKey, canPerformMutation } from '../lib/criticalOperations';
import { OfflineError } from '../lib/networkErrors';
import { toast } from '../lib/toast';

// ============================================================================
// Types
// ============================================================================

interface CriticalMutationOptions<TData, TError, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'mutationFn'> {
  /** Generate a custom idempotency key from variables */
  getIdempotencyKey?: (variables: TVariables) => string;
  /** Prefix for auto-generated idempotency keys */
  idempotencyPrefix?: string;
  /** Show offline warning toast */
  showOfflineWarning?: boolean;
  /** Custom offline message */
  offlineMessage?: string;
  /** Query keys to invalidate on success */
  invalidateKeys?: QueryKey[];
  /** Query keys to remove on success */
  removeKeys?: QueryKey[];
  /** Success toast message */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Error toast message */
  errorMessage?: string | ((error: TError, variables: TVariables) => string);
}

interface CriticalMutationContext<TContext> {
  idempotencyKey: string;
  previousContext?: TContext;
}

interface CriticalMutationResult<TData, TError, TVariables>
  extends Omit<UseMutationResult<TData, TError, TVariables, unknown>, 'mutate' | 'mutateAsync' | 'context'> {
  /** Is offline (cannot execute) */
  isOffline: boolean;
  /** Can execute the mutation */
  canExecute: boolean;
  /** Current idempotency key (for retry) */
  currentIdempotencyKey: string | null;
  /** Execute mutation with offline check */
  mutate: (variables: TVariables) => void;
  /** Execute mutation async with offline check */
  mutateAsync: (variables: TVariables) => Promise<TData>;
  /** Retry the last failed mutation with same idempotency key */
  retry: () => Promise<TData | undefined>;
  /** Check if we can execute and show warning if not */
  executeWithCheck: (variables: TVariables) => Promise<TData | undefined>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCriticalMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options?: CriticalMutationOptions<TData, TError, TVariables, TContext>
): CriticalMutationResult<TData, TError, TVariables> {
  const networkStatus = useNetworkStatus();
  const { checkHealth } = useNetwork();
  const queryClient = useQueryClient();

  const {
    getIdempotencyKey,
    idempotencyPrefix,
    showOfflineWarning = true,
    offlineMessage = 'Cette opération nécessite une connexion active',
    invalidateKeys = [],
    removeKeys = [],
    successMessage,
    errorMessage,
    onMutate: userOnMutate,
    onSuccess: userOnSuccess,
    onError: userOnError,
    onSettled: userOnSettled,
    ...mutationOptions
  } = options ?? {};

  // Track current idempotency key and last variables for retry
  const currentKeyRef = useRef<string | null>(null);
  const lastVariablesRef = useRef<TVariables | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);

  // Determine if we're offline
  const isOffline = networkStatus === 'offline' || networkStatus === 'api_down';
  const canExecute = !isOffline;

  // Create the underlying mutation
  const mutation = useMutation<TData, TError, TVariables, CriticalMutationContext<TContext>>({
    ...mutationOptions,
    mutationFn: async (variables: TVariables) => {
      // Check network status
      if (isOffline) {
        throw new OfflineError(offlineMessage);
      }

      // Get or generate idempotency key
      const key =
        getIdempotencyKey?.(variables) ??
        currentKeyRef.current ??
        generateIdempotencyKey(idempotencyPrefix);

      currentKeyRef.current = key;
      lastVariablesRef.current = variables;
      setCurrentIdempotencyKey(key);

      // Execute the mutation with idempotency key
      return mutationFn(variables, key);
    },
    onMutate: async (variables, _mutationCtx) => {
      // Generate key early for tracking
      const key =
        getIdempotencyKey?.(variables) ??
        generateIdempotencyKey(idempotencyPrefix);

      currentKeyRef.current = key;
      setCurrentIdempotencyKey(key);

      // Call user's onMutate
      const previousContext = await (userOnMutate as ((v: TVariables) => Promise<TContext | undefined> | TContext | undefined) | undefined)?.(variables);

      return {
        idempotencyKey: key,
        previousContext: previousContext as TContext | undefined,
      };
    },
    onSuccess: (data, variables, context, _mutationCtx) => {
      // Reset key on success
      currentKeyRef.current = null;
      lastVariablesRef.current = null;
      setCurrentIdempotencyKey(null);

      // Show success toast
      if (successMessage) {
        const message =
          typeof successMessage === 'function'
            ? successMessage(data, variables)
            : successMessage;
        toast.success(message);
      }

      // Invalidate queries
      if (invalidateKeys.length > 0) {
        invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      // Remove queries
      if (removeKeys.length > 0) {
        removeKeys.forEach((key) => {
          queryClient.removeQueries({ queryKey: key });
        });
      }

      // Call user's onSuccess
      (userOnSuccess as any)?.(data, variables, context?.previousContext as TContext, _mutationCtx);
    },
    onError: (error, variables, context, _mutationCtx) => {
      // Keep key for retry on error
      // Don't reset currentKeyRef

      // Show error toast
      if (errorMessage) {
        const message =
          typeof errorMessage === 'function'
            ? errorMessage(error, variables)
            : errorMessage;
        toast.error(message);
      } else if (error instanceof OfflineError) {
        toast.error(error.message);
      }

      // Call user's onError
      (userOnError as any)?.(error, variables, context?.previousContext as TContext, _mutationCtx);
    },
    onSettled: (data, error, variables, context, _mutationCtx) => {
      (userOnSettled as any)?.(data, error, variables, context?.previousContext as TContext, _mutationCtx);
    },
  });

  // Enhanced mutate that checks offline status
  const mutate = useCallback(
    (variables: TVariables) => {
      if (isOffline) {
        if (showOfflineWarning) {
          toast.error(offlineMessage);
        }
        return;
      }

      // Generate new key for this mutation attempt
      currentKeyRef.current = null;
      mutation.mutate(variables);
    },
    [isOffline, showOfflineWarning, offlineMessage, mutation]
  );

  // Enhanced mutateAsync that checks offline status
  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      if (isOffline) {
        if (showOfflineWarning) {
          toast.error(offlineMessage);
        }
        throw new OfflineError(offlineMessage);
      }

      // Generate new key for this mutation attempt
      currentKeyRef.current = null;
      return mutation.mutateAsync(variables);
    },
    [isOffline, showOfflineWarning, offlineMessage, mutation]
  );

  // Retry with same idempotency key
  const retry = useCallback(async (): Promise<TData | undefined> => {
    if (!currentKeyRef.current || !lastVariablesRef.current) {
      console.warn('[CriticalMutation] No previous mutation to retry');
      return undefined;
    }

    if (isOffline) {
      // Try to reconnect first
      const connected = await checkHealth();
      if (!connected) {
        if (showOfflineWarning) {
          toast.error('Impossible de réessayer: pas de connexion');
        }
        return undefined;
      }
    }

    // Retry with the same key and variables
    return mutation.mutateAsync(lastVariablesRef.current);
  }, [isOffline, checkHealth, showOfflineWarning, mutation]);

  // Execute with check and warning
  const executeWithCheck = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      if (isOffline) {
        if (showOfflineWarning) {
          toast.error(offlineMessage);
        }
        return undefined;
      }

      try {
        return await mutateAsync(variables);
      } catch (error) {
        // Error already handled by onError
        return undefined;
      }
    },
    [isOffline, showOfflineWarning, offlineMessage, mutateAsync]
  );

  // Destructure to exclude context (internal type mismatch)
  const { context: _context, ...mutationRest } = mutation;

  return {
    ...mutationRest,
    isOffline,
    canExecute,
    currentIdempotencyKey,
    mutate,
    mutateAsync,
    retry,
    executeWithCheck,
  };
}

// ============================================================================
// Specialized Variants
// ============================================================================

/**
 * For caisse operations (dépôt, retrait)
 */
export function useCaisseMutation<TData, TVariables>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options?: Omit<
    CriticalMutationOptions<TData, Error, TVariables, unknown>,
    'idempotencyPrefix'
  >
) {
  return useCriticalMutation<TData, Error, TVariables>(mutationFn, {
    ...options,
    idempotencyPrefix: 'caisse',
  });
}

/**
 * For credit operations (décaissement, remboursement)
 */
export function useCreditMutation<TData, TVariables>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options?: Omit<
    CriticalMutationOptions<TData, Error, TVariables, unknown>,
    'idempotencyPrefix'
  >
) {
  return useCriticalMutation<TData, Error, TVariables>(mutationFn, {
    ...options,
    idempotencyPrefix: 'credit',
  });
}

/**
 * For transfer operations
 */
export function useTransferMutation<TData, TVariables>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options?: Omit<
    CriticalMutationOptions<TData, Error, TVariables, unknown>,
    'idempotencyPrefix'
  >
) {
  return useCriticalMutation<TData, Error, TVariables>(mutationFn, {
    ...options,
    idempotencyPrefix: 'transfer',
  });
}
