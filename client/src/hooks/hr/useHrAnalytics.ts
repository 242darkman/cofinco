import { useState, useEffect } from 'react';

export interface HrAnalyticsData {
  effectifsParDepartement: Array<{ departement: string; total: number }>;
  congesTendances: Array<{ mois: string; type: string; total: number }>;
  masseSalariale: Array<{ mois: string; total: number }>;
  sanctionsDistribution: Array<{ gravite: string; total: number }>;
  kpis: {
    totalEmployes: number;
    tauxRotation: number;
    postesOuverts: number;
  };
}

export function useHrAnalytics() {
  const [data, setData] = useState<HrAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/hr/analytics');
      if (!response.ok) throw new Error('Erreur chargement analytics');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur HR analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return { data, loading, error, refresh: fetchAnalytics };
}
