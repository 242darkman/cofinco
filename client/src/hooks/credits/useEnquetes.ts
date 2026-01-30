import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StatutEnquete, StatutEnqueteType } from '@shared/enum/status-constants';
import { creditKeys } from '../../lib/query-keys';

// Labels for enquête status
const STATUT_ENQUETE_LABELS: Record<StatutEnqueteType, string> = {
  [StatutEnquete.PENDING]: 'En attente',
  [StatutEnquete.IN_PROGRESS]: 'En cours',
  [StatutEnquete.APPROVED]: 'Approuvé',
  [StatutEnquete.REJECTED]: 'Rejeté',
  [StatutEnquete.REDUCED]: 'Réduit'
};

// Interface pour les photos géotaggées
export interface GeotaggedPhoto {
  url: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp?: string;
}

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
  // Géolocalisation
  geo_latitude?: string | number;
  geo_longitude?: string | number;
  geo_accuracy?: string | number;
  geo_timestamp?: string;
  // Photos de l'activité (avec géolocalisation)
  photos_activite?: string[];
  photos_geotagged?: GeotaggedPhoto[];
  clients?: {
    nom: string;
    prenom?: string;
    telephone: string;
    adresse_domicile?: string;
    profession?: string;
    latitude?: string | number;
    longitude?: string | number;
  };
}

// ============================================================================
// FETCH FUNCTION
// ============================================================================

async function fetchEnquetesFromAPI(): Promise<EnqueteCredit[]> {
  const response = await fetch('/api/enquetes-credit');
  if (!response.ok) throw new Error('Erreur serveur');
  const data = await response.json();
  return data || [];
}

// ============================================================================
// HOOK
// ============================================================================

export function useEnquetes() {
  const queryClient = useQueryClient();

  // UI-only state for expanded details
  const [expandedEnquetes, setExpandedEnquetes] = useState<Set<string>>(new Set());

  // ── Query: enquêtes list ─────────────────────────────────────────────
  const {
    data: enquetes = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<EnqueteCredit[]>({
    queryKey: creditKeys.enquetes(),
    queryFn: fetchEnquetesFromAPI,
  });

  const error = queryError instanceof Error ? queryError.message : null;

  // Helper to invalidate enquêtes + counts after mutations
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: creditKeys.enquetes() });
    queryClient.invalidateQueries({ queryKey: creditKeys.demandesCounts() });
  }, [queryClient]);

  // ── Mutations ────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (enqueteData: Partial<EnqueteCredit>) => {
      console.log('[useEnquetes] Creating enquete with data:', enqueteData);
      console.log('[useEnquetes] demandeId in payload:', (enqueteData as any).demandeId);

      const response = await fetch('/api/enquetes-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enqueteData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors de la création de l'enquête");
      }
      const result = await response.json();
      console.log('[useEnquetes] Server response:', result);
      return result;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Enquête enregistrée', {
        description: "L'enquête est terminée et prête pour approbation",
      });
    },
    onError: (err: Error) => {
      toast.error('Échec de la création', { description: err.message });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async ({
      enqueteId,
      decision,
      montantApprouve,
      commentaire,
      raison,
    }: {
      enqueteId: string;
      decision: 'APPROVED' | 'REJECTED' | 'REDUCED';
      montantApprouve?: number;
      commentaire?: string;
      raison?: string;
    }) => {
      const response = await fetch(`/api/enquetes-credit/${enqueteId}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          montant_approuve: montantApprouve,
          commentaire,
          raison,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la validation');
      }
      return { decision, montantApprouve };
    },
    onSuccess: ({ decision, montantApprouve }) => {
      invalidateAll();
      const messages: Record<string, { title: string; description: string }> = {
        APPROVED: { title: 'Demande approuvée', description: 'Le crédit est prêt pour décaissement' },
        REJECTED: { title: 'Demande rejetée', description: 'Le client sera notifié du rejet' },
        REDUCED: { title: 'Montant réduit', description: `Nouveau montant: ${montantApprouve?.toLocaleString()} FCFA` },
      };
      const msg = messages[decision] || { title: 'Validation effectuée', description: '' };
      toast.success(msg.title, { description: msg.description });
    },
    onError: (err: Error) => {
      toast.error('Échec de la validation', { description: err.message });
    },
  });

  // ── Backward-compatible wrappers ─────────────────────────────────────

  const createEnquete = async (enqueteData: Partial<EnqueteCredit>): Promise<boolean> => {
    try {
      await createMutation.mutateAsync(enqueteData);
      return true;
    } catch {
      return false;
    }
  };

  const validateEnquete = async (
    enqueteId: string,
    decision: 'APPROVED' | 'REJECTED' | 'REDUCED',
    montantApprouve?: number,
    commentaire?: string,
    raison?: string
  ): Promise<boolean> => {
    try {
      await validateMutation.mutateAsync({ enqueteId, decision, montantApprouve, commentaire, raison });
      return true;
    } catch {
      return false;
    }
  };

  // ── UI state ─────────────────────────────────────────────────────────

  const toggleEnqueteDetails = (id: string) => {
    setExpandedEnquetes((prev) => {
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

  // ── Derived data / helpers ───────────────────────────────────────────

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
      [StatutEnquete.REDUCED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
    return colors[normalized];
  };

  const getEnquetesEnAttente = useCallback(
    () => enquetes.filter((e) => normalizeStatut(e.statut) === StatutEnquete.PENDING),
    [enquetes]
  );

  return {
    enquetes,
    loading,
    error,
    fetchEnquetes: refetch,
    createEnquete,
    validateEnquete,
    toggleEnqueteDetails,
    isExpanded,
    normalizeStatut,
    formatStatut,
    getStatutColor,
    getEnquetesEnAttente,
  };
}
