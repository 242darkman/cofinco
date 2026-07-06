import { useState, useEffect } from 'react';

export interface FeatureFlag {
  id: string;
  code: string;
  nom: string;
  description?: string;
  enabled: boolean;
  rollout_percentage: number;
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/feature-flags');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setFlags(data);
    } catch (err) {
      console.error('Erreur fetch feature flags:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/settings/feature-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      setFlags(prev => prev.map(f => f.id === id ? { ...f, enabled } : f));
      return true;
    } catch (err) {
      console.error('Erreur toggle flag:', err);
      setError(err instanceof Error ? err.message : 'Erreur mise à jour');
      return false;
    }
  };

  const updateRollout = async (id: string, percentage: number) => {
    try {
      const response = await fetch(`/api/settings/feature-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollout_percentage: percentage })
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      setFlags(prev => prev.map(f => f.id === id ? { ...f, rollout_percentage: percentage } : f));
      return true;
    } catch (err) {
      console.error('Erreur update rollout:', err);
      setError(err instanceof Error ? err.message : 'Erreur mise à jour');
      return false;
    }
  };

  const isEnabled = (code: string) => {
    const flag = flags.find(f => f.code === code);
    return flag?.enabled || false;
  };

  const getEnabledFlags = () => flags.filter(f => f.enabled);

  useEffect(() => {
    fetchFlags();
  }, []);

  return {
    flags,
    loading,
    error,
    fetchFlags,
    toggleFlag,
    updateRollout,
    isEnabled,
    getEnabledFlags
  };
}
