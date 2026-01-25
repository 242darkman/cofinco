import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StatutEnquete, StatutEnqueteType } from '@shared/enum/status-constants';

// Labels for enquête status
const STATUT_ENQUETE_LABELS: Record<StatutEnqueteType, string> = {
  [StatutEnquete.PENDING]: 'En attente',
  [StatutEnquete.IN_PROGRESS]: 'En cours',
  [StatutEnquete.APPROVED]: 'Approuvé',
  [StatutEnquete.REJECTED]: 'Rejeté',
  [StatutEnquete.REDUCED]: 'Réduit'
};

export interface EnqueteCredit {
  id: string;
  client_id: string;
  credit_id?: string;
  montant_demande: number;
  montant_approuve?: number;
  statut: StatutEnqueteType;
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la création de l\'enquête');
      }

      await fetchEnquetes();
      invalidateCounts();
      toast.success('Enquête créée avec succès', {
        description: 'Le dossier est maintenant en cours d\'enquête'
      });
      return true;
    } catch (err) {
      console.error('Erreur création enquete:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la création';
      setError(message);
      toast.error('Échec de la création', { description: message });
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la validation');
      }

      await fetchEnquetes();
      invalidateCounts();

      // Toast de succès selon la décision
      const messages: Record<string, { title: string; description: string }> = {
        APPROVED: { title: 'Demande approuvée', description: 'Le crédit est prêt pour décaissement' },
        REJECTED: { title: 'Demande rejetée', description: 'Le client sera notifié du rejet' },
        REDUCED: { title: 'Montant réduit', description: `Nouveau montant: ${montantApprouve?.toLocaleString()} FCFA` }
      };
      const msg = messages[decision] || { title: 'Validation effectuée', description: '' };
      toast.success(msg.title, { description: msg.description });

      return true;
    } catch (err) {
      console.error('Erreur validation:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la validation';
      setError(message);
      toast.error('Échec de la validation', { description: message });
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

  const normalizeStatut = (statut?: string): StatutEnqueteType => {
    if (!statut) return StatutEnquete.PENDING;
    const normalized = statut.toUpperCase() as StatutEnqueteType;
    return Object.values(StatutEnquete).includes(normalized) ? normalized : StatutEnquete.PENDING;
  };

  const formatStatut = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    return STATUT_ENQUETE_LABELS[normalized] || 'En attente';
  };

  const getStatutColor = (statut?: string) => {
    const normalized = normalizeStatut(statut);
    const colors: Record<StatutEnqueteType, string> = {
      [StatutEnquete.PENDING]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [StatutEnquete.IN_PROGRESS]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      [StatutEnquete.APPROVED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      [StatutEnquete.REJECTED]: 'bg-red-500/20 text-red-400 border-red-500/30',
      [StatutEnquete.REDUCED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[normalized];
  };

  const getEnquetesEnAttente = () => enquetes.filter(e => normalizeStatut(e.statut) === StatutEnquete.PENDING);

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
