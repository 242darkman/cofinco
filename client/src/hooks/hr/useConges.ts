import { useState, useEffect } from 'react';

export interface DemandeConge {
  id: number;
  employeId: string;
  employeNom: string;
  type: string;
  dateDebut: string;
  dateFin: string;
  motif?: string;
  statut: 'En attente' | 'Approuvé' | 'Refusé';
  approuvePar?: string;
  dateDecision?: string;
  commentaire?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useConges() {
  const [demandesConges, setDemandesConges] = useState<DemandeConge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConges = async (filters?: { statut?: string; employeId?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.statut) params.append('statut', filters.statut);
      if (filters?.employeId) params.append('employeId', filters.employeId);

      const url = `/api/hr/conges${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des congés');
      }
      
      const data = await response.json();
      setDemandesConges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch congés:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveConge = async (id: number, commentaire?: string) => {
    try {
      const response = await fetch(`/api/hr/conges/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'approbation');
      }

      const updated = await response.json();
      setDemandesConges(prev => prev.map(c => c.id === id ? updated : c));
    } catch (err) {
      console.error('Erreur approbation congé:', err);
      throw err;
    }
  };

  const rejectConge = async (id: number, commentaire?: string) => {
    try {
      const response = await fetch(`/api/hr/conges/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire })
      });

      if (!response.ok) {
        throw new Error('Erreur lors du rejet');
      }

      const updated = await response.json();
      setDemandesConges(prev => prev.map(c => c.id === id ? updated : c));
    } catch (err) {
      console.error('Erreur rejet congé:', err);
      throw err;
    }
  };

  const createConge = async (data: {
    employeId: string;
    employeNom: string;
    type: string;
    dateDebut: string;
    dateFin: string;
    motif?: string;
  }) => {
    try {
      const response = await fetch('/api/hr/conges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création');
      }

      const newConge = await response.json();
      setDemandesConges(prev => [newConge, ...prev]);
      return true;
    } catch (err) {
      console.error('Erreur création congé:', err);
      return false;
    }
  };

  const getStats = () => ({
    enCours: demandesConges.filter(c => c.statut === 'Approuvé').length,
    enAttente: demandesConges.filter(c => c.statut === 'En attente').length,
    approuves: demandesConges.filter(c => c.statut === 'Approuvé').length,
    refuses: demandesConges.filter(c => c.statut === 'Refusé').length
  });

  useEffect(() => {
    fetchConges();
  }, []);

  return {
    demandesConges,
    loading,
    error,
    approveConge,
    rejectConge,
    createConge,
    getStats,
    fetchConges
  };
}
