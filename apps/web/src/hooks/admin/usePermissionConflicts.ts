import { useState, useCallback, useEffect } from 'react';

export type ConflictType = 'DENY_OVERRIDE' | 'GRANT_OVERRIDE' | 'REDUNDANT_GRANT' | 'REDUNDANT_DENY';

export interface PermissionConflict {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  roleGranted: boolean;
  overrideGranted: boolean;
  conflictType: ConflictType;
  sourceRoles: string[];
}

export interface ConflictSummary {
  total: number;
  denyOverrides: number;
  grantOverrides: number;
  redundant: number;
}

export function usePermissionConflicts(userId: string | null) {
  const [conflicts, setConflicts] = useState<PermissionConflict[]>([]);
  const [summary, setSummary] = useState<ConflictSummary>({ total: 0, denyOverrides: 0, grantOverrides: 0, redundant: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConflicts = useCallback(async () => {
    if (!userId) {
      setConflicts([]);
      setSummary({ total: 0, denyOverrides: 0, grantOverrides: 0, redundant: 0 });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/rbac/users/${userId}/conflicts`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la détection des conflits');
      }

      const data = await response.json();
      setConflicts(data.conflicts || []);
      setSummary(data.summary || { total: 0, denyOverrides: 0, grantOverrides: 0, redundant: 0 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  return {
    conflicts,
    summary,
    loading,
    error,
    refresh: fetchConflicts,
  };
}
