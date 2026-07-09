import { useState, useEffect } from 'react';

export interface Avantage {
  id: number;
  nom: string;
  type: string;
  montantParDefaut: number;
  description: string;
  eligibleContrats?: string[] | any;
  modeCalcul: string;
  pourcentage?: string | null;
  plafond?: number | null;
  frequence: string;
  dateDebut?: string | null;
  dateFin?: string | null;
  imposable: boolean;
  soumisCnss: boolean;
  autoAttribution: boolean;
  categorie: string;
}

export interface AvantageFormData {
  nom: string;
  type: string;
  montantParDefaut: number;
  description?: string;
  eligibleContrats?: string[];
  modeCalcul?: string;
  pourcentage?: number;
  plafond?: number;
  frequence?: string;
  dateDebut?: string;
  dateFin?: string;
  imposable?: boolean;
  soumisCnss?: boolean;
  autoAttribution?: boolean;
  categorie?: string;
}

export function useAvantages() {
  const [avantagesList, setAvantagesList] = useState<Avantage[]>([]);

  useEffect(() => {
    fetchAvantages();
  }, []);

  const fetchAvantages = async () => {
    try {
        const res = await fetch('/api/hr/avantages');
        if (res.ok) {
            const data = await res.json();
            setAvantagesList(data);
        }
    } catch (e) {
        console.error("Error fetching avantages", e);
    }
  };

  const createAvantage = async (data: AvantageFormData) => {
    try {
      const response = await fetch('/api/hr/avantages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la création');
      const created = await response.json();
      setAvantagesList(prev => [...prev, created]);
      return true;
    } catch (err) {
      console.error('Erreur création avantage:', err);
      return false;
    }
  };

  const updateAvantage = async (id: number, data: Partial<Omit<Avantage, 'id'>>) => {
    try {
      const response = await fetch(`/api/hr/avantages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      const updated = await response.json();
      setAvantagesList(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour avantage:', err);
      return false;
    }
  };

  const deleteAvantage = async (id: number) => {
    try {
      const response = await fetch(`/api/hr/avantages/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setAvantagesList(prev => prev.filter(a => a.id !== id));
      return true;
    } catch (err) {
      console.error('Erreur suppression avantage:', err);
      return false;
    }
  };

  return {
    avantagesList,
    createAvantage,
    updateAvantage,
    deleteAvantage,
  };
}
