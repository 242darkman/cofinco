import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StatutEnqueteCredit, STATUT_ENQUETE_CREDIT_LABELS } from '@shared/enum/status-constants';

type StatutEnqueteCreditType = typeof StatutEnqueteCredit[keyof typeof StatutEnqueteCredit];

export interface EnqueteCredit {
  id: string;
  client_id: string;
  credit_id?: string;
  montant_demande: number;
  montant_approuve?: number;
  statut: StatutEnqueteCreditType;
  type_activite: string;
  revenus_mensuels?: number;
  charges_mensuelles?: number;
  autres_credits?: boolean;
  montant_autres_credits?: number;
  patrimoine_estime?: number;
  score_global?: number;
  recommandation?: string;
  commentaire?: string;
  date_enquete: string;
  enqueteur?: string;
  clients?: {
    nom: string;
    prenom?: string;
    telephone: string;
    adresse_domicile?: string;
    profession?: string;
  };
}

export function useEnquetes() {
  const queryClient = useQueryClient();
  const [enquetes, setEnquetes] = useState<EnqueteCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEnquetes, setExpandedEnquetes] = useState<Set<string>>(new Set());

  // Helper to invalidate counts after mutations
  const invalidateCounts = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/demandes-credit/counts'] });
  };

  const fetchEnquetes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/enquetes-credit');
      if (!response.ok) throw new Error('Erreur serveur');

      const data = await response.json();
      setEnquetes(data || []);
    } catch (err) {
      console.error('Erreur fetch enquetes:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const createEnquete = async (enqueteData: Partial<EnqueteCredit>) => {
    try {
      const response = await fetch('/api/enquetes-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enqueteData)
      });

      if (!response.ok) throw new Error('Erreur création');

      await fetchEnquetes();
      invalidateCounts();
      return true;
    } catch (err) {
      console.error('Erreur création enquete:', err);
      setError(err instanceof Error ? err.message : 'Erreur création');
      return false;
    }
  };

  const validateEnquete = async (
    enqueteId: string,
    decision: 'APPROVED' | 'REJECTED' | 'REDUCED',
    montantApprouve?: number,
    commentaire?: string,
    raison?: string
  ) => {
    try {
      const response = await fetch(`/api/enquetes-credit/${enqueteId}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          montant_approuve: montantApprouve,
          commentaire,
          raison
        })
      });

      if (!response.ok) throw new Error('Erreur validation');

      await fetchEnquetes();
      invalidateCounts();
      return true;
    } catch (err) {
      console.error('Erreur validation:', err);
      setError(err instanceof Error ? err.message : 'Erreur validation');
      return false;
    }
  };

  const toggleEnqueteDetails = (id: string) => {
    setExpandedEnquetes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const isExpanded = (id: string) => expandedEnquetes.has(id);

  // Normalize legacy French statuses to English enum values
  const normalizeStatut = (statut?: string): StatutEnqueteCreditType => {
    if (!statut) return StatutEnqueteCredit.PENDING;
    const normalized = statut.toLowerCase().replace(/[éè]/g, 'e');

    // Handle both legacy French and new English values
    if (normalized === 'pending' || normalized.includes('attente')) return StatutEnqueteCredit.PENDING;
    if (normalized === 'in_progress' || normalized.includes('cours')) return StatutEnqueteCredit.IN_PROGRESS;
    if (normalized === 'approved' || normalized.includes('approuve')) return StatutEnqueteCredit.APPROVED;
    if (normalized === 'rejected' || normalized.includes('rejete')) return StatutEnqueteCredit.REJECTED;
    if (normalized === 'reduced' || normalized.includes('reduit')) return StatutEnqueteCredit.REDUCED;

    return StatutEnqueteCredit.PENDING;
  };

  const formatStatut = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    return STATUT_ENQUETE_CREDIT_LABELS[normalized] || 'En attente';
  };

  const getStatutColor = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    const colors: Record<StatutEnqueteCreditType, string> = {
      [StatutEnqueteCredit.PENDING]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [StatutEnqueteCredit.IN_PROGRESS]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      [StatutEnqueteCredit.APPROVED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      [StatutEnqueteCredit.REJECTED]: 'bg-red-500/20 text-red-400 border-red-500/30',
      [StatutEnqueteCredit.REDUCED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[normalized];
  };

  const getEnquetesEnAttente = () => enquetes.filter(e => normalizeStatut(e.statut) === StatutEnqueteCredit.PENDING);

  useEffect(() => {
    fetchEnquetes();
  }, []);

  return {
    enquetes,
    loading,
    error,
    fetchEnquetes,
    createEnquete,
    validateEnquete,
    toggleEnqueteDetails,
    isExpanded,
    normalizeStatut,
    formatStatut,
    getStatutColor,
    getEnquetesEnAttente
  };
}
