import { useState, useCallback } from 'react';

export interface SimulatedPermission {
  id: string;
  code: string;
  name: string;
  granted: boolean;
  source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'ADMIN' | 'NONE';
  sourceRole?: string;
  expiresAt?: string | null;
}

export interface SimulatedModule {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  permissions: SimulatedPermission[];
}

export interface SimulationResult {
  user: { id: string; nom: string; prenom: string | null };
  roles: string[];
  isAdmin: boolean;
  summary: {
    total: number;
    granted: number;
    denied: number;
    bySource: { role: number; override: number; temporary: number };
  };
  modules: SimulatedModule[];
}

export function usePermissionSimulator() {
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [agenceId, setAgenceId] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async () => {
    if (!targetUserId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (agenceId) params.set('agenceId', agenceId);

      const response = await fetch(
        `/api/rbac/users/${targetUserId}/simulate${params.toString() ? `?${params}` : ''}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la simulation');
      }

      const data = await response.json();
      setSimulation(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, agenceId]);

  return {
    targetUserId,
    setTargetUserId,
    agenceId,
    setAgenceId,
    simulation,
    loading,
    error,
    simulate,
  };
}
