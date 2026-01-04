import { useState, useEffect, useCallback } from 'react';

interface UseSupabaseQueryOptions<T> {
  table: string;
  select?: string;
  filters?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  onSuccess?: (data: T[]) => void;
  onError?: (error: Error) => void;
}

export function useSupabaseQuery<T = any>(options: UseSupabaseQueryOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      
      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
      }

      if (options.order) {
        params.append('orderBy', options.order.column);
        params.append('orderAsc', String(options.order.ascending ?? false));
      }

      if (options.limit) {
        params.append('limit', String(options.limit));
      }

      const url = `/api/${options.table}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des données');
      }

      const result = await response.json();

      setData(result || []);
      options.onSuccess?.(result || []);
    } catch (err) {
      const error = err as Error;
      setError(error);
      options.onError?.(error);
      console.error('Query error:', error);
    } finally {
      setLoading(false);
    }
  }, [options.table, JSON.stringify(options.filters), options.select, JSON.stringify(options.order), options.limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch
  };
}
