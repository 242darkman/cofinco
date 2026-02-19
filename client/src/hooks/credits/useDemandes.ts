import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { StatutDemande } from '@shared/enum/status-constants';
import type { Facture } from '@shared/schema/operations';
import { creditKeys } from '../../lib/query-keys';

export interface DemandeCredit {
  id: string;
  numero_demande: string;
  client_id: string;
  date_demande: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  deletedAt?: string | null;
  deleted_at?: string | null;
  montantDemande: number;
  montant_demande?: number;
  montantApprouve?: number | null;
  montant_approuve?: number | null;
  duree_mois: number;
  taux_interet: number;
  type_credit: string | null;
  statut: string;
  score_credit: number | null;
  revenus_mensuels?: number;
  charges_mensuelles?: number;
  objetCredit?: string;
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

// ============================================================================
// FETCH FUNCTION
// ============================================================================

async function fetchDemandesFromAPI(): Promise<DemandeCredit[]> {
  const response = await fetch('/api/demandes-credit?includeDeleted=true');
  if (!response.ok) throw new Error('Erreur serveur');
  const data = await response.json();
  return data || [];
}

// ============================================================================
// HOOK
// ============================================================================

export function useDemandes() {
  const queryClient = useQueryClient();

  // ── Query: demandes list ─────────────────────────────────────────────
  const {
    data: demandes = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<DemandeCredit[]>({
    queryKey: creditKeys.demandes(),
    queryFn: fetchDemandesFromAPI,
  });

  const error = queryError instanceof Error ? queryError.message : null;

  // Helper to invalidate demandes + counts after mutations
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: creditKeys.demandes() });
    queryClient.invalidateQueries({ queryKey: creditKeys.demandesCounts() });
  }, [queryClient]);

  // ── Mutations ────────────────────────────────────────────────────────

  const approuverMutation = useMutation({
    mutationFn: async ({ id, montantApprouve }: { id: string; montantApprouve: number }) => {
      const response = await fetch(`/api/demandes-credit/${id}/approuver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant_approuve: montantApprouve }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de l'approbation");
      }
      return montantApprouve;
    },
    onSuccess: (montantApprouve) => {
      invalidateAll();
      toast.success('Demande approuvée', {
        description: `Montant approuvé: ${montantApprouve.toLocaleString()} FCFA`,
      });
    },
    onError: (err: Error) => {
      toast.error("Échec de l'approbation", { description: err.message });
    },
  });

  const rejeterMutation = useMutation({
    mutationFn: async ({ id, motif }: { id: string; motif?: string }) => {
      const response = await fetch(`/api/demandes-credit/${id}/rejeter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors du rejet');
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Demande rejetée', { description: 'Le client sera notifié du rejet' });
    },
    onError: (err: Error) => {
      toast.error('Échec du rejet', { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/demandes-credit/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la suppression');
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Demande supprimée');
    },
    onError: (err: Error) => {
      toast.error('Échec de la suppression', { description: err.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, motif }: { id: string; motif?: string }) => {
      const response = await fetch(`/api/demandes-credit/${id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de l'annulation");
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Demande annulée');
    },
    onError: (err: Error) => {
      toast.error("Échec de l'annulation", { description: err.message });
    },
  });

  const startInvestigationMutation = useMutation({
    mutationFn: async ({ id, agentId, priority, dueDate }: { id: string; agentId: string; priority?: string; dueDate?: string }) => {
      const response = await fetch(`/api/demandes-credit/${id}/start-investigation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, priority, dueDate }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de l'assignation de l'enquête");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Enquête assignée', { description: 'L\'agent terrain a été notifié' });
    },
    onError: (err: Error) => {
      toast.error("Échec de l'assignation", { description: err.message });
    },
  });

  const reassignInvestigationMutation = useMutation({
    mutationFn: async ({ id, agentId, priority, dueDate }: { id: string; agentId: string; priority?: string; dueDate?: string }) => {
      const response = await fetch(`/api/demandes-credit/${id}/reassign-investigation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, priority, dueDate }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de la réassignation");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Enquête réassignée', { description: 'Le nouvel agent terrain a été notifié' });
    },
    onError: (err: Error) => {
      toast.error("Échec de la réassignation", { description: err.message });
    },
  });

  const payerFraisMutation = useMutation({
    mutationFn: async ({
      id,
      montant,
      methodePaiement = 'Espèces',
      sessionCaisseId,
      provider,
      phone,
    }: {
      id: string;
      montant: number;
      methodePaiement?: string;
      sessionCaisseId?: string;
      provider?: 'mtn' | 'airtel';
      phone?: string;
    }) => {
      const response = await fetch(`/api/demandes-credit/${id}/payer-frais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, methode_paiement: methodePaiement, sessionCaisseId, provider, phone }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Erreur paiement frais');
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // ── Backward-compatible wrappers ─────────────────────────────────────
  // These maintain the same return signatures as the old useState version

  const approuverDemande = async (id: string, montantApprouve: number): Promise<boolean> => {
    try {
      await approuverMutation.mutateAsync({ id, montantApprouve });
      return true;
    } catch {
      return false;
    }
  };

  const rejeterDemande = async (id: string, motif?: string): Promise<boolean> => {
    try {
      await rejeterMutation.mutateAsync({ id, motif });
      return true;
    } catch {
      return false;
    }
  };

  const deleteDemande = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const cancelDemande = async (id: string, motif?: string): Promise<boolean> => {
    try {
      await cancelMutation.mutateAsync({ id, motif });
      return true;
    } catch {
      return false;
    }
  };

  const startInvestigation = async (id: string, data: { agentId: string; priority?: string; dueDate?: string }): Promise<boolean> => {
    try {
      await startInvestigationMutation.mutateAsync({ id, ...data });
      return true;
    } catch {
      return false;
    }
  };

  const reassignInvestigation = async (id: string, data: { agentId: string; priority?: string; dueDate?: string }): Promise<boolean> => {
    try {
      await reassignInvestigationMutation.mutateAsync({ id, ...data });
      return true;
    } catch {
      return false;
    }
  };

  // Mutation pour valider une enquête terminée (INVESTIGATION_COMPLETE -> PENDING_APPROVAL)
  const validateInvestigationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/demandes-credit/${id}/validate-investigation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de la validation de l'enquête");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Enquête validée', { description: 'La demande est maintenant en attente d\'approbation par le comité' });
    },
    onError: (err: Error) => {
      toast.error("Échec de la validation", { description: err.message });
    },
  });

  const validateInvestigation = async (id: string): Promise<boolean> => {
    try {
      await validateInvestigationMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const payerFrais = async (
    id: string,
    montant: number,
    methodePaiement: string = 'Espèces',
    sessionCaisseId?: string,
    provider?: 'mtn' | 'airtel',
    phone?: string
  ): Promise<{ success: boolean; facture: Facture | null; paymentPending?: boolean; paymentIntent?: any; message?: string }> => {
    try {
      const data = await payerFraisMutation.mutateAsync({ id, montant, methodePaiement, sessionCaisseId, provider, phone });
      // Handle Mobile Money async response
      if (data.paymentPending) {
        return { success: true, facture: null, paymentPending: true, paymentIntent: data.paymentIntent, message: data.message };
      }
      return { success: true, facture: data.facture };
    } catch {
      return { success: false, facture: null };
    }
  };

  const envoyerEnCaisse = async (
    demandeId: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`/api/demandes-credit/${demandeId}/envoyer-caisse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erreur');
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────

  const normalizeStatut = (statut?: string): string => {
    if (!statut) return StatutDemande.PENDING_FEES;
    return statut.toUpperCase();
  };

  const getDemandesEnAttente = useCallback(
    () => demandes.filter((d) => normalizeStatut(d.statut) === StatutDemande.PENDING_FEES),
    [demandes]
  );

  const getStatutColor = (statut: string) => {
    const normalized = normalizeStatut(statut);
    const colors: Record<string, string> = {
      [StatutDemande.PENDING_FEES]: 'bg-status-warning-bg text-status-warning border-status-warning/30',
      [StatutDemande.READY_FOR_INVESTIGATION]: 'bg-status-info-bg text-status-info border-status-info/30',
      [StatutDemande.UNDER_INVESTIGATION]: 'bg-accent/10 text-accent border-accent/30',
      [StatutDemande.INVESTIGATION_COMPLETE]: 'bg-accent/10 text-accent border-accent/30',
      [StatutDemande.APPROVED]: 'bg-status-success-bg text-status-success border-status-success/30',
      [StatutDemande.REJECTED]: 'bg-status-danger-bg text-status-danger border-status-danger/30',
      [StatutDemande.DISBURSED]: 'bg-status-success-bg text-status-success border-status-success/30',
      [StatutDemande.CLOSED]: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
      [StatutDemande.CANCELLED]: 'bg-surface-subtle/40 text-content-muted border-edge-subtle',
    };
    return colors[normalized] || 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
  };

  return {
    demandes,
    loading,
    error,
    fetchDemandes: refetch,
    approuverDemande,
    rejeterDemande,
    deleteDemande,
    cancelDemande,
    startInvestigation,
    reassignInvestigation,
    validateInvestigation,
    validatingInvestigation: validateInvestigationMutation.isPending,
    getDemandesEnAttente,
    getStatutColor,
    payerFrais,
    envoyerEnCaisse,
  };
}
