import { useState, useEffect } from 'react';

export interface Formation {
  id: number;
  titre: string;
  formateur: string;
  dateDebut: string;
  duree: string;
  lieu?: string;
  description?: string;
  statut: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  capaciteMax?: number;
  participants?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FormationParticipant {
  formationId: number;
  employeId: string;
  employeNom: string;
  dateInscription: string;
  presence?: string;
  evaluation?: string;
  scoreEvaluation?: number | null;
  competencesAcquises?: string | null;
  recommandation?: string | null;
  evaluateurId?: string | null;
  evaluatedAt?: string | null;
}

export function useFormations() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFormations = async (filters?: { statut?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.statut) params.append('statut', filters.statut);

      const url = `/api/hr/formations${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des formations');
      }
      
      const data = await response.json();
      setFormations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch formations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipants = async (formationId: number) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}/participants`);
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des participants');
      }
      return await response.json();
    } catch (err) {
      console.error('Erreur fetch participants:', err);
      return [];
    }
  };

  const createFormation = async (data: {
    titre: string;
    formateur: string;
    dateDebut: string;
    duree: string;
    lieu?: string;
    description?:string;
    capaciteMax?: number;
  }) => {
    try {
      const response = await fetch('/api/hr/formations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la création');
      }

      const newFormation = await response.json();
      
      // Ajouter les participants sélectionnés
      if (selectedParticipants.length > 0 && newFormation.id) {
        await Promise.all(
          selectedParticipants.map(employeId =>
            fetch(`/api/hr/formations/${newFormation.id}/participants`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ employeId, employeNom: employeId }) // TODO: obtenir nom réel
            })
          )
        );
      }

      setFormations(prev => [newFormation, ...prev]);
      setSelectedParticipants([]); // Reset sélection
      return true;
    } catch (err) {
      console.error('Erreur création formation:', err);
      return false;
    }
  };

  const toggleParticipant = (employeId: string) => {
    setSelectedParticipants(prev =>
      prev.includes(employeId)
        ? prev.filter(id => id !== employeId)
        : [...prev, employeId]
    );
  };

  const addParticipant = async (formationId: number, employeId: string, employeNom: string) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeId, employeNom })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'ajout du participant');
      }

      return true;
    } catch (err) {
      console.error('Erreur ajout participant:', err);
      return false;
    }
  };

  const removeParticipant = async (formationId: number, employeId: string) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}/participants/${employeId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Erreur lors du retrait du participant');
      }

      return true;
    } catch (err) {
      console.error('Erreur retrait participant:', err);
      return false;
    }
  };

  const updateStatut = async (formationId: number, statut: Formation['statut']) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      const updated = await response.json();
      setFormations(prev => prev.map(f => f.id === formationId ? updated : f));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour statut:', err);
      return false;
    }
  };

  const updateFormation = async (formationId: number, data: Partial<Omit<Formation, 'id' | 'createdAt' | 'updatedAt' | 'participants'>>) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      const updated = await response.json();
      setFormations(prev => prev.map(f => f.id === formationId ? { ...f, ...updated } : f));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour formation:', err);
      return false;
    }
  };

  const deleteFormation = async (formationId: number) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setFormations(prev => prev.filter(f => f.id !== formationId));
      return true;
    } catch (err) {
      console.error('Erreur suppression formation:', err);
      return false;
    }
  };

  const evaluateParticipant = async (
    formationId: number,
    employeId: string,
    data: { scoreEvaluation: number; recommandation: string; competencesAcquises?: string[]; evaluation?: string }
  ) => {
    try {
      const response = await fetch(`/api/hr/formations/${formationId}/participants/${employeId}/evaluate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de l\'évaluation');
      return await response.json();
    } catch (err) {
      console.error('Erreur évaluation participant:', err);
      return null;
    }
  };

  const getFormationsByStatut = (statut: Formation['statut']) => {
    return formations.filter(f => f.statut === statut);
  };

  useEffect(() => {
    fetchFormations();
  }, []);

  return {
    formations,
    selectedParticipants,
    loading,
    error,
    createFormation,
    updateFormation,
    deleteFormation,
    toggleParticipant,
    addParticipant,
    removeParticipant,
    fetchParticipants,
    updateStatut,
    evaluateParticipant,
    getFormationsByStatut,
    fetchFormations
  };
}
