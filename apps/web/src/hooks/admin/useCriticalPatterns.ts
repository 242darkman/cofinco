import { useState, useCallback, useEffect } from 'react';

export interface CriticalPattern {
  id: string;
  pattern: string;
  description: string | null;
  requireReason: boolean;
  requireSupervisorApproval: boolean;
  createdAt: string;
}

export function useCriticalPatterns() {
  const [patterns, setPatterns] = useState<CriticalPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rbac/critical-patterns', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des patterns');
      }

      const data = await response.json();
      setPatterns(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const createPattern = useCallback(async (data: {
    pattern: string;
    description?: string;
    requireReason?: boolean;
    requireSupervisorApproval?: boolean;
  }) => {
    const response = await fetch('/api/rbac/critical-patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la création');
    }

    const newPattern = await response.json();
    setPatterns(prev => [...prev, newPattern].sort((a, b) => a.pattern.localeCompare(b.pattern)));
    return newPattern;
  }, []);

  const updatePattern = useCallback(async (id: string, data: Partial<CriticalPattern>) => {
    const response = await fetch(`/api/rbac/critical-patterns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la mise à jour');
    }

    const updated = await response.json();
    setPatterns(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  const deletePattern = useCallback(async (id: string) => {
    const response = await fetch(`/api/rbac/critical-patterns/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la suppression');
    }

    setPatterns(prev => prev.filter(p => p.id !== id));
  }, []);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  return {
    patterns,
    loading,
    error,
    refresh: fetchPatterns,
    createPattern,
    updatePattern,
    deletePattern,
  };
}
