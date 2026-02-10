/**
 * P2.3: Optimistic UI utilities for TanStack Query
 * Provides immediate feedback for mutations on slow connections
 */

import { useMutation, useQueryClient, UseMutationOptions, QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface OptimisticMutationOptions<TData, TError, TVariables, TContext> {
  // The mutation function
  mutationFn: (variables: TVariables) => Promise<TData>;

  // Query key(s) to update optimistically
  queryKey: QueryKey | QueryKey[];

  // Function to generate optimistic data
  optimisticUpdate: (variables: TVariables, previousData: unknown) => unknown;

  // Optional: Customize the cache update (default: setQueryData)
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;

  // Success message (optional)
  successMessage?: string | ((data: TData, variables: TVariables) => string);

  // Error message (optional)
  errorMessage?: string | ((error: TError) => string);

  // Additional mutation options
  onSuccess?: UseMutationOptions<TData, TError, TVariables, TContext>['onSuccess'];
  onError?: UseMutationOptions<TData, TError, TVariables, TContext>['onError'];
  onSettled?: UseMutationOptions<TData, TError, TVariables, TContext>['onSettled'];
}

/**
 * Hook for creating optimistic mutations with automatic rollback
 */
export function useOptimisticMutation<TData, TError = Error, TVariables = void, TContext = unknown>({
  mutationFn,
  queryKey,
  optimisticUpdate,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
  onSettled,
}: OptimisticMutationOptions<TData, TError, TVariables, TContext>) {
  const queryClient = useQueryClient();

  // Normalize query keys to array
  const queryKeys = Array.isArray(queryKey[0]) ? (queryKey as QueryKey[]) : [queryKey as QueryKey];

  return useMutation<TData, TError, TVariables, { previousData: Map<string, unknown> }>({
    mutationFn,

    // Optimistically update the cache before the mutation
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwrites
      await Promise.all(
        queryKeys.map(key => queryClient.cancelQueries({ queryKey: key }))
      );

      // Snapshot previous values
      const previousData = new Map<string, unknown>();
      queryKeys.forEach(key => {
        previousData.set(JSON.stringify(key), queryClient.getQueryData(key));
      });

      // Optimistically update each query
      queryKeys.forEach(key => {
        const previous = queryClient.getQueryData(key);
        queryClient.setQueryData(key, optimisticUpdate(variables, previous));
      });

      return { previousData };
    },

    // On error, rollback to previous values
    onError: (error, variables, context, _mutationCtx) => {
      // Rollback
      context?.previousData.forEach((data, keyStr) => {
        const key = JSON.parse(keyStr);
        queryClient.setQueryData(key, data);
      });

      // Show error toast
      const message = errorMessage
        ? typeof errorMessage === 'function'
          ? errorMessage(error)
          : errorMessage
        : 'Une erreur est survenue';
      toast.error(message);

      // Call custom onError
      (onError as any)?.(error, variables, context as TContext, _mutationCtx);
    },

    // On success, optionally show toast
    onSuccess: (data, variables, context, _mutationCtx) => {
      if (successMessage) {
        const message = typeof successMessage === 'function'
          ? successMessage(data, variables)
          : successMessage;
        toast.success(message);
      }

      (onSuccess as any)?.(data, variables, context as TContext, _mutationCtx);
    },

    // Always refetch after mutation settles
    onSettled: (data, error, variables, context, _mutationCtx) => {
      // Invalidate queries to ensure data consistency
      queryKeys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      (onSettled as any)?.(data, error, variables, context as TContext, _mutationCtx);
    },
  });
}

/**
 * Optimistic list operations helpers
 */
export const optimisticListHelpers = {
  // Add item to beginning of list
  prepend: <T>(newItem: T) => (variables: unknown, previousData: unknown): T[] => {
    const list = (previousData as T[]) || [];
    return [newItem, ...list];
  },

  // Add item to end of list
  append: <T>(newItem: T) => (variables: unknown, previousData: unknown): T[] => {
    const list = (previousData as T[]) || [];
    return [...list, newItem];
  },

  // Update item in list by id
  updateById: <T extends { id: string | number }>(
    getId: (variables: unknown) => string | number,
    updateFn: (item: T, variables: unknown) => T
  ) => (variables: unknown, previousData: unknown): T[] => {
    const list = (previousData as T[]) || [];
    const id = getId(variables);
    return list.map(item => (item.id === id ? updateFn(item, variables) : item));
  },

  // Remove item from list by id
  removeById: <T extends { id: string | number }>(
    getId: (variables: unknown) => string | number
  ) => (variables: unknown, previousData: unknown): T[] => {
    const list = (previousData as T[]) || [];
    const id = getId(variables);
    return list.filter(item => item.id !== id);
  },

  // Toggle boolean field on item
  toggleField: <T extends { id: string | number }>(
    getId: (variables: unknown) => string | number,
    field: keyof T
  ) => (variables: unknown, previousData: unknown): T[] => {
    const list = (previousData as T[]) || [];
    const id = getId(variables);
    return list.map(item =>
      item.id === id ? { ...item, [field]: !item[field] } : item
    );
  },
};

/**
 * Hook for optimistic toggle mutations (e.g., favorite, archive, etc.)
 */
export function useOptimisticToggle<T extends { id: string }>(
  queryKey: QueryKey,
  field: keyof T,
  mutationFn: (id: string, value: boolean) => Promise<T>
) {
  const queryClient = useQueryClient();

  return useMutation<T, Error, { id: string; value: boolean }, { previousData: T[] | undefined }>({
    mutationFn: ({ id, value }) => mutationFn(id, value),

    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<T[]>(queryKey);

      queryClient.setQueryData<T[]>(queryKey, old =>
        old?.map(item =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );

      return { previousData };
    },

    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previousData);
      toast.error('Échec de la mise à jour');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/**
 * Hook for optimistic delete with undo capability
 */
export function useOptimisticDelete<T extends { id: string }>(
  queryKey: QueryKey,
  deleteFn: (id: string) => Promise<void>,
  options?: {
    undoDuration?: number;
    itemLabel?: string;
  }
) {
  const queryClient = useQueryClient();
  const { undoDuration = 5000, itemLabel = 'élément' } = options || {};

  return useMutation<void, Error, string, { previousData: T[] | undefined; deletedItem: T | undefined }>({
    mutationFn: deleteFn,

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<T[]>(queryKey);
      const deletedItem = previousData?.find(item => item.id === id);

      queryClient.setQueryData<T[]>(queryKey, old =>
        old?.filter(item => item.id !== id)
      );

      return { previousData, deletedItem };
    },

    onSuccess: (_data, id, context) => {
      // Show toast with undo action
      toast.success(`${itemLabel} supprimé`, {
        duration: undoDuration,
        action: context?.deletedItem
          ? {
              label: 'Annuler',
              onClick: () => {
                // Restore the item in cache
                queryClient.setQueryData<T[]>(queryKey, old => {
                  if (!old || !context.deletedItem) return old;
                  return [...old, context.deletedItem];
                });
                // Invalidate to sync with server
                queryClient.invalidateQueries({ queryKey });
              },
            }
          : undefined,
      });
    },

    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKey, context?.previousData);
      toast.error('Échec de la suppression');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
