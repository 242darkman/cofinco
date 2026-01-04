import { useState, useEffect } from 'react';

export interface Sanction {
  id: number;
  employeId: string;
  employeNom: string;
  type: 'Avertissement' | 'Blâme' | 'Mise à pied' | 'Autre';
  motif: string;
  date: string;
  gravite: 'Faible' | 'Moyenne' | 'Grave';
  emetteurId?: string;
  documentsJoints?: string;
  createdAt?: string;
}

export function useSanctions() {
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSanctions = async (filters?: { employeId?: string; gravite?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.employeId) params.append('employeId', filters.employeId);
      if (filters?.gravite) params.append('gravite', filters.gravite);

      const url = `/api/hr/sanctions${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des sanctions');
      }
      
      const data = await response.json();
      setSanctions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch sanctions:', err);
    } finally {
      setLoading(false);
    }
  };

  const createSanction = async (data: {
    employeId: string;
    employeNom: string;
    type: string;
    motif: string;
    date: string;
    gravite: string;
  }) => {
    try {
      const response = await fetch('/api/hr/sanctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création');
      }

      const newSanction = await response.json();
      setSanctions(prev => [newSanction, ...prev]);
      return true;
    } catch (err) {
      console.error('Erreur création sanction:', err);
      return false;
    }
  };

  useEffect(() => {
    fetchSanctions();
  }, []);

  return {
    sanctions,
    loading,
    error,
    createSanction,
    fetchSanctions
  };
}
