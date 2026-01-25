import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StatutDemande } from '@shared/enum/status-constants';
import { creditKeys } from '../../lib/query-keys';

export interface DemandeCredit {
  id: string;
  numero_demande: string;
  client_id: string;
  date_demande: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  montant_demande: number;
  montant_approuve?: number | null;
  duree_mois: number;
  taux_interet: number;
  type_credit: string | null;
  statut: string;
  score_credit: number | null;
  revenus_mensuels?: number;
  charges_mensuelles?: number;
  objet_credit?: string;
  description_activite?: string;
  clients?: {
    nom: string;
    prenom?: string;
    phone: string;
    photo_url?: string;
    agence?: string;
    agenceId?: string;
  };
}

export function useDemandes() {
  const queryClient = useQueryClient();
  const [demandes, setDemandes] = useState<DemandeCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to invalidate counts after mutations
  const invalidateCounts = () => {
    queryClient.invalidateQueries({ queryKey: creditKeys.demandesCounts() });
  };

  const fetchDemandes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/demandes-credit?includeDeleted=true');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setDemandes(data || []);
    } catch (err) {
      console.error('Erreur fetch demandes:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const approuverDemande = async (id: string, montantApprouve: number) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}/approuver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant_approuve: montantApprouve })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de l\'approbation');
      }

      await fetchDemandes();
      invalidateCounts();
      toast.success('Demande approuvée', {
        description: `Montant approuvé: ${montantApprouve.toLocaleString()} FCFA`
      });
      return true;
    } catch (err) {
      console.error('Erreur approbation:', err);
      const message = err instanceof Error ? err.message : 'Erreur approbation';
      setError(message);
      toast.error('Échec de l\'approbation', { description: message });
      return false;
    }
  };

  const rejeterDemande = async (id: string, motif?: string) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}/rejeter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors du rejet');
      }

      await fetchDemandes();
      invalidateCounts();
      toast.success('Demande rejetée', {
        description: 'Le client sera notifié du rejet'
      });
      return true;
    } catch (err) {
      console.error('Erreur rejet:', err);
      const message = err instanceof Error ? err.message : 'Erreur rejet';
      setError(message);
      toast.error('Échec du rejet', { description: message });
      return false;
    }
  };

  const deleteDemande = async (id: string) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la suppression');
      }

      await fetchDemandes();
      invalidateCounts();
      toast.success('Demande supprimée', {
        description: 'La demande a été supprimée avec succès'
      });
      return true;
    } catch (err) {
      console.error('Erreur suppression:', err);
      const message = err instanceof Error ? err.message : 'Erreur suppression';
      setError(message);
      toast.error('Échec de la suppression', { description: message });
      return false;
    }
  };

  const cancelDemande = async (id: string, motif?: string) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de l\'annulation');
      }

      await fetchDemandes();
      invalidateCounts();
      toast.success('Demande annulée', {
        description: 'La demande a été annulée avec succès'
      });
      return true;
    } catch (err) {
      console.error('Erreur annulation:', err);
      const message = err instanceof Error ? err.message : 'Erreur annulation';
      setError(message);
      toast.error('Échec de l\'annulation', { description: message });
      return false;
    }
  };

  const payerFrais = async (id: string, montant: number, methodePaiement: string = 'Espèces', sessionCaisseId?: string) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}/payer-frais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, methode_paiement: methodePaiement, sessionCaisseId })
      });

      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Erreur paiement frais');
      }

      const data = await response.json();
      await fetchDemandes();
      invalidateCounts();

      // Return the full response including facture
      return { success: true, facture: data.facture };
    } catch (err) {
      console.error('Erreur paiement frais:', err);
      const message = err instanceof Error ? err.message : 'Erreur paiement frais';
      setError(message);
      toast.error(message);
      return { success: false, facture: null };
    }
  };

  const normalizeStatut = (statut?: string): string => {
    if (!statut) return StatutDemande.PENDING_FEES;
    return statut.toUpperCase();
  };

  const getDemandesEnAttente = () => demandes.filter(d => {
    const normalized = normalizeStatut(d.statut);
    return normalized === StatutDemande.PENDING_FEES;
  });

  const getStatutColor = (statut: string) => {
    const normalized = normalizeStatut(statut);
    const colors: Record<string, string> = {
      [StatutDemande.PENDING_FEES]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [StatutDemande.READY_FOR_INVESTIGATION]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      [StatutDemande.UNDER_INVESTIGATION]: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      [StatutDemande.INVESTIGATION_COMPLETE]: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      [StatutDemande.APPROVED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      [StatutDemande.REJECTED]: 'bg-red-500/20 text-red-400 border-red-500/30',
      [StatutDemande.DISBURSED]: 'bg-green-500/20 text-green-400 border-green-500/30',
      [StatutDemande.CLOSED]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      [StatutDemande.CANCELLED]: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    };
    return colors[normalized] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  useEffect(() => {
    fetchDemandes();

    const handleUpdate = () => {
        fetchDemandes();
    };

    window.addEventListener('credit-update', handleUpdate);
    return () => window.removeEventListener('credit-update', handleUpdate);
  }, []);

  return {
    demandes,
    loading,
    error,
    fetchDemandes,
    approuverDemande,
    rejeterDemande,
    deleteDemande,
    cancelDemande,
    getDemandesEnAttente,
    getStatutColor,
    payerFrais
  };
}
