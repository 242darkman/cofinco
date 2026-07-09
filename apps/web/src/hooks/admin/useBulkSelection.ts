/**
 * Hook for managing bulk selection state
 * Provides selection tracking, toggle, and action handlers
 */

import { useState, useCallback, useMemo } from 'react';

export interface BulkSelectionOptions<T> {
  items: T[];
  idKey?: keyof T;
  initialSelected?: Set<string>;
}

export interface BulkSelectionResult<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  selectedCount: number;
  totalCount: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectMultiple: (ids: string[]) => void;
  deselectMultiple: (ids: string[]) => void;
}

export function useBulkSelection<T extends Record<string, any>>(
  options: BulkSelectionOptions<T>
): BulkSelectionResult<T> {
  const { items, idKey = 'id' as keyof T, initialSelected } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected || new Set());

  const allIds = useMemo(
    () => items.map((item) => String(item[idKey])),
    [items, idKey]
  );

  const isAllSelected = useMemo(
    () => items.length > 0 && selectedIds.size === items.length,
    [items.length, selectedIds.size]
  );

  const isPartiallySelected = useMemo(
    () => selectedIds.size > 0 && selectedIds.size < items.length,
    [selectedIds.size, items.length]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(String(item[idKey]))),
    [items, selectedIds, idKey]
  );

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [allIds, items.length]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectMultiple = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const deselectMultiple = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    selectedCount: selectedIds.size,
    totalCount: items.length,
    isSelected,
    toggle,
    toggleAll,
    selectAll,
    clearSelection,
    selectMultiple,
    deselectMultiple,
  };
}

/**
 * Hook for bulk action execution with progress tracking
 */
export interface BulkActionOptions {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: BulkActionResult[]) => void;
  onError?: (error: Error) => void;
  batchSize?: number;
  delayBetweenBatches?: number;
}

export interface BulkActionResult {
  id: string;
  success: boolean;
  error?: string;
}

export function useBulkAction() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<BulkActionResult[]>([]);

  const execute = useCallback(
    async <T>(
      ids: string[],
      action: (id: string) => Promise<{ success: boolean; error?: string }>,
      options: BulkActionOptions = {}
    ): Promise<BulkActionResult[]> => {
      const { onProgress, onComplete, onError, batchSize = 10, delayBetweenBatches = 100 } = options;

      setIsExecuting(true);
      setProgress({ current: 0, total: ids.length });
      setResults([]);

      const allResults: BulkActionResult[] = [];

      try {
        // Process in batches
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);

          const batchResults = await Promise.all(
            batch.map(async (id) => {
              try {
                const result = await action(id);
                return { id, success: result.success, error: result.error };
              } catch (error) {
                return { id, success: false, error: String(error) };
              }
            })
          );

          allResults.push(...batchResults);

          const newProgress = { current: Math.min(i + batchSize, ids.length), total: ids.length };
          setProgress(newProgress);
          onProgress?.(newProgress.current, newProgress.total);

          // Delay between batches to avoid overwhelming the server
          if (i + batchSize < ids.length) {
            await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
          }
        }

        setResults(allResults);
        onComplete?.(allResults);

        return allResults;
      } catch (error) {
        onError?.(error as Error);
        return allResults;
      } finally {
        setIsExecuting(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress({ current: 0, total: 0 });
    setResults([]);
  }, []);

  return {
    isExecuting,
    progress,
    results,
    execute,
    reset,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
  };
}
