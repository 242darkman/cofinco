import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface DemandeCredit {
  id: string;
  numero_demande: string;
  client_id: string;
  date_demande: string;
  created_at?: string;
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
  };
}

export function useDemandes() {
  const [demandes, setDemandes] = useState<DemandeCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDemandes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/demandes-credit');
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

      if (!response.ok) throw new Error('Erreur approbation');

      await fetchDemandes();
      return true;
    } catch (err) {
      console.error('Erreur approbation:', err);
      setError(err instanceof Error ? err.message : 'Erreur approbation');
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

      if (!response.ok) throw new Error('Erreur rejet');

      await fetchDemandes();
      return true;
    } catch (err) {
      console.error('Erreur rejet:', err);
      setError(err instanceof Error ? err.message : 'Erreur rejet');
      return false;
    }
  };

  const deleteDemande = async (id: string) => {
    try {
      const response = await fetch(`/api/demandes-credit/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Erreur suppression');

      await fetchDemandes();
      return true;
    } catch (err) {
      console.error('Erreur suppression:', err);
      setError(err instanceof Error ? err.message : 'Erreur suppression');
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

      if (!response.ok) throw new Error('Erreur annulation');

      await fetchDemandes();
      return true;
    } catch (err) {
      console.error('Erreur annulation:', err);
      setError(err instanceof Error ? err.message : 'Erreur annulation');
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

  const getDemandesEnAttente = () => demandes.filter(d => d.statut === 'en_attente' || d.statut === 'pending');

  const getStatutColor = (statut: string) => {
    const colors: Record<string, string> = {
      'en_attente': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'pending': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'approuve': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'approved': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'rejete': 'bg-red-500/20 text-red-400 border-red-500/30',
      'rejected': 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[statut.toLowerCase()] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
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
