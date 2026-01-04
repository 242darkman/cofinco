import { useState, useEffect } from 'react';

export interface EnqueteCredit {
  id: string;
  client_id: string;
  credit_id?: string;
  montant_demande: number;
  montant_approuve?: number;
  statut: 'en_attente' | 'en_cours' | 'approuve' | 'rejete' | 'reduit';
  type_activite: string;
  revenus_mensuels?: number;
  charges_mensuelles?: number;
  autres_credits?: boolean;
  montant_autres_credits?: number;
  patrimoine_estime?: number;
  score_final?: number;
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
  const [enquetes, setEnquetes] = useState<EnqueteCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEnquetes, setExpandedEnquetes] = useState<Set<string>>(new Set());

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
      return true;
    } catch (err) {
      console.error('Erreur création enquete:', err);
      setError(err instanceof Error ? err.message : 'Erreur création');
      return false;
    }
  };

  const validateEnquete = async (
    enqueteId: string,
    decision: 'approuve' | 'rejete' | 'reduit',
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

  const normalizeStatut = (statut?: string): 'en_attente' | 'en_cours' | 'approuve' | 'rejete' | 'reduit' => {
    if (!statut) return 'en_attente';
    const normalized = statut.toLowerCase().replace(/[éè]/g, 'e');
    
    if (normalized.includes('attente') || normalized === 'pending') return 'en_attente';
    if (normalized.includes('cours') || normalized === 'in_progress') return 'en_cours';
    if (normalized.includes('approuve') || normalized === 'approved') return 'approuve';
    if (normalized.includes('rejete') || normalized === 'rejected') return 'rejete';
    if (normalized.includes('reduit') || normalized === 'reduced') return 'reduit';
    
    return 'en_attente';
  };

  const formatStatut = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    const labels: Record<string, string> = {
      'en_attente': 'En attente',
      'en_cours': 'En cours',
      'approuve': 'Approuvé',
      'rejete': 'Rejeté',
      'reduit': 'Réduit'
    };
    return labels[normalized] || 'En attente';
  };

  const getStatutColor = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    const colors: Record<string, string> = {
      'en_attente': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'en_cours': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'approuve': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'rejete': 'bg-red-500/20 text-red-400 border-red-500/30',
      'reduit': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[normalized];
  };

  const getEnquetesEnAttente = () => enquetes.filter(e => normalizeStatut(e.statut) === 'en_attente');

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
