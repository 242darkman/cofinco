import { useState, useEffect } from 'react';

export interface Candidature {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  posteVise: string;
  experience?: string;
  formation?: string;
  datePostulation: string;
  statut: string; // EN values: 'PENDING' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED'
  cvUrl?: string;
  lettreMotivationUrl?: string;
  notes?: string;
  dateEntretien?: string;
  responsableRhId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useCandidatures() {
  const [candidats, setCandidats] = useState<Candidature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidatures = async (filters?: { statut?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.statut) params.append('statut', filters.statut);

      const url = `/api/hr/candidatures${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des candidatures');
      }
      
      const data = await response.json();
      setCandidats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch candidatures:', err);
    } finally {
      setLoading(false);
    }
  };

  const createCandidature = async (data: {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    posteVise: string;
    experience?: string;
    formation?: string;
  }) => {
    try {
      const response = await fetch('/api/hr/candidatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création');
      }

      const newCandidature = await response.json();
      setCandidats(prev => [newCandidature, ...prev]);
      return true;
    } catch (err) {
      console.error('Erreur création candidature:', err);
      return false;
    }
  };

  const updateStatut = async (id: number, statut: string, notes?: string, dateEntretien?: string) => {
    try {
      const response = await fetch(`/api/hr/candidatures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut, notes, dateEntretien })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      const updated = await response.json();
      setCandidats(prev => prev.map(c => c.id === id ? updated : c));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour candidature:', err);
      return false;
    }
  };

  const uploadCv = async (candidatureId: number, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/hr/candidatures/${candidatureId}/cv`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de l\'upload du CV');
      }

      const updated = await response.json();
      setCandidats(prev => prev.map(c => c.id === candidatureId ? { ...c, cvUrl: updated.cvUrl } : c));
      return updated;
    } catch (err) {
      console.error('Erreur upload CV:', err);
      return null;
    }
  };

  const getCvUrl = async (candidatureId: number): Promise<string | null> => {
    try {
      const response = await fetch(`/api/hr/candidatures/${candidatureId}/cv`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.url;
    } catch {
      return null;
    }
  };

  const updateCandidature = async (id: number, data: { statut?: string; notes?: string; dateEntretien?: string }) => {
    try {
      const response = await fetch(`/api/hr/candidatures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour');

      const updated = await response.json();
      setCandidats(prev => prev.map(c => c.id === id ? updated : c));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour candidature:', err);
      return false;
    }
  };

  useEffect(() => {
    fetchCandidatures();
  }, []);

  return {
    candidats,
    loading,
    error,
    createCandidature,
    updateStatut,
    updateCandidature,
    uploadCv,
    getCvUrl,
    fetchCandidatures
  };
}
