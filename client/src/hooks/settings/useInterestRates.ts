import { useState, useEffect } from 'react';

export interface InterestRate {
  id: string;
  nom: string;
  type_credit?: string;
  taux_mensuel: number;
  taux_annuel: number;
  date_debut: string;
  date_fin?: string;
  actif: boolean;
  description?: string;
}

export function useInterestRates() {
  const [rates, setRates] = useState<InterestRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/interest-rates');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setRates(data);
    } catch (err) {
      console.error('Erreur fetch interest rates:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const toggleRate = async (id: string, actif: boolean) => {
    try {
      const response = await fetch(`/api/settings/interest-rates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif })
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      setRates(prev => prev.map(r => r.id === id ? { ...r, actif } : r));
      return true;
    } catch (err) {
      console.error('Erreur toggle rate:', err);
      setError(err instanceof Error ? err.message : 'Erreur mise à jour');
      return false;
    }
  };

  const addRate = async (rate: Omit<InterestRate, 'id'>) => {
    try {
      const response = await fetch('/api/settings/interest-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rate)
      });

      if (!response.ok) throw new Error('Erreur création');

      const newRate = await response.json();
      setRates(prev => [...prev, newRate]);
      return true;
    } catch (err) {
      console.error('Erreur add rate:', err);
      setError(err instanceof Error ? err.message : 'Erreur création');
      return false;
    }
  };

  const updateRate = async (id: string, data: Partial<InterestRate>) => {
    try {
      const response = await fetch(`/api/settings/interest-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      const updated = await response.json();
      setRates(prev => prev.map(r => r.id === id ? updated : r));
      return true;
    } catch (err) {
      console.error('Erreur update rate:', err);
      setError(err instanceof Error ? err.message : 'Erreur mise à jour');
      return false;
    }
  };

  const getActiveRates = () => rates.filter(r => r.actif);

  const getRatesByType = (type: string) => rates.filter(r => r.type_credit === type);

  useEffect(() => {
    fetchRates();
  }, []);

  return {
    rates,
    loading,
    error,
    fetchRates,
    toggleRate,
    addRate,
    updateRate,
    getActiveRates,
    getRatesByType
  };
}
