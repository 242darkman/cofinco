import { useState, useEffect } from 'react';

export type SanctionWorkflowStatus = 'DRAFT' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'APPEALED' | 'FINAL';

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
  statutWorkflow?: SanctionWorkflowStatus;
  acknowledgedAt?: string;
  appealedAt?: string;
  appealReason?: string;
  finalizedAt?: string;
  finalizedBy?: string;
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

  const updateSanctionStatus = async (
    sanctionId: number,
    newStatus: SanctionWorkflowStatus,
    appealReason?: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(`/api/hr/sanctions/${sanctionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus, appealReason }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la mise à jour');
      }

      const updated = await response.json();
      setSanctions(prev => prev.map(s => s.id === sanctionId ? updated : s));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour sanction:', err);
      return false;
    }
  };

  const updateSanction = async (sanctionId: number, data: Partial<Omit<Sanction, 'id' | 'createdAt'>>) => {
    try {
      const response = await fetch(`/api/hr/sanctions/${sanctionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      const updated = await response.json();
      setSanctions(prev => prev.map(s => s.id === sanctionId ? { ...s, ...updated } : s));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour sanction:', err);
      return false;
    }
  };

  const deleteSanction = async (sanctionId: number) => {
    try {
      const response = await fetch(`/api/hr/sanctions/${sanctionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setSanctions(prev => prev.filter(s => s.id !== sanctionId));
      return true;
    } catch (err) {
      console.error('Erreur suppression sanction:', err);
      return false;
    }
  };

  const uploadSanctionDocument = async (sanctionId: number, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/hr/sanctions/${sanctionId}/document`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de l\'upload');
      }

      const result = await response.json();
      // Update local state with new documentsJoints
      if (result.sanction) {
        setSanctions(prev => prev.map(s => s.id === sanctionId ? { ...s, documentsJoints: result.sanction.documentsJoints } : s));
      }
      return result;
    } catch (err) {
      console.error('Erreur upload document sanction:', err);
      return null;
    }
  };

  const fetchSanctionDocuments = async (sanctionId: number) => {
    try {
      const response = await fetch(`/api/hr/sanctions/${sanctionId}/documents`);
      if (!response.ok) throw new Error('Erreur');
      return await response.json();
    } catch (err) {
      console.error('Erreur fetch documents sanction:', err);
      return [];
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
    updateSanction,
    deleteSanction,
    updateSanctionStatus,
    uploadSanctionDocument,
    fetchSanctionDocuments,
    fetchSanctions
  };
}
