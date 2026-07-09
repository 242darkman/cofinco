/**
 * Hook useEncaisse — Single Source of Truth pour l'Encaisse
 *
 * Ce hook récupère l'encaisse disponible depuis le Grand Livre (GL).
 * C'est la SEULE source de vérité pour l'encaisse affichée dans l'UI.
 *
 * Fonctionnalités:
 * - Calcul depuis GL (comptes 521/531/573/512)
 * - Invalidation automatique via WebSocket TREASURY_UPDATED
 * - Option de réconciliation GL vs Opérationnel
 * - Cache React Query avec staleTime optimisé
 * - Support offline avec dernier snapshot
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { api } from "../../lib/api-client";
import { treasuryKeys } from "../../lib/query-keys";
import type {
  EncaisseCanonique,
  EncaisseBreakdownDetailed,
} from "@shared/schema/treasury";

// ============================================
// API Functions
// ============================================

const treasuryApi = {
  /**
   * Récupère l'encaisse depuis le Grand Livre
   */
  getEncaisse: async (
    agenceId?: string,
    withReconciliation = false
  ): Promise<EncaisseCanonique> => {
    const params = new URLSearchParams();
    if (agenceId && agenceId !== "all") {
      params.set("agenceId", agenceId);
    }
    if (withReconciliation) {
      params.set("withReconciliation", "true");
    }
    const queryString = params.toString();
    const url = `/api/treasury/v2/encaisse${queryString ? `?${queryString}` : ""}`;
    return api.get<EncaisseCanonique>(url);
  },

  /**
   * Récupère l'encaisse avec réconciliation détaillée
   */
  getEncaisseReconciliation: async (
    agenceId?: string
  ): Promise<EncaisseCanonique> => {
    const params = agenceId && agenceId !== "all" ? `?agenceId=${agenceId}` : "";
    return api.get<EncaisseCanonique>(`/api/treasury/v2/encaisse/reconcile${params}`);
  },

  /**
   * Récupère le breakdown détaillé par compte GL
   */
  getBreakdown: async (agenceId?: string): Promise<EncaisseBreakdownDetailed> => {
    const params = agenceId && agenceId !== "all" ? `?agenceId=${agenceId}` : "";
    return api.get<EncaisseBreakdownDetailed>(
      `/api/treasury/v2/encaisse/breakdown${params}`
    );
  },
};

// ============================================
// Hook Options
// ============================================

interface UseEncaisseOptions {
  /** Activer/désactiver le hook */
  enabled?: boolean;
  /** Durée avant que les données soient considérées stale (ms) */
  staleTime?: number;
  /** Intervalle de refetch automatique (ms, false pour désactiver) */
  refetchInterval?: number | false;
  /** Inclure la réconciliation GL vs Opérationnel */
  withReconciliation?: boolean;
}

// ============================================
// Main Hook
// ============================================

/**
 * Hook principal pour récupérer l'encaisse depuis le GL
 *
 * @param agenceId - ID de l'agence (optionnel, 'all' pour toutes)
 * @param options - Options de configuration
 *
 * @example
 * ```tsx
 * const { data: encaisse, isLoading } = useEncaisse(selectedAgence);
 *
 * // Avec réconciliation
 * const { data } = useEncaisse(agenceId, { withReconciliation: true });
 * ```
 */
export function useEncaisse(agenceId?: string, options: UseEncaisseOptions = {}) {
  const queryClient = useQueryClient();
  const {
    enabled = true,
    staleTime = 15_000, // 15 secondes (aligné avec le cache serveur)
    refetchInterval = false,
    withReconciliation = false,
  } = options;

  // Écouter les événements WebSocket pour invalidation
  useEffect(() => {
    const handleTreasuryUpdate = (event: CustomEvent) => {
      const payload = event.detail;

      // Vérifier si l'event concerne notre agence
      if (!agenceId || agenceId === "all" || payload?.agenceId === agenceId) {
        // Invalider les queries treasury
        queryClient.invalidateQueries({ queryKey: treasuryKeys.all });
      }
    };

    const handleBalanceUpdate = (event: CustomEvent) => {
      const payload = event.detail;
      const { entityType } = payload || {};

      // Invalider l'encaisse si c'est une mise à jour de coffre ou caisse
      if (entityType === "coffre" || entityType === "caisse" || entityType === "session_caisse") {
        if (!agenceId || agenceId === "all" || payload?.agenceId === agenceId) {
          queryClient.invalidateQueries({ queryKey: treasuryKeys.encaisse(agenceId) });
        }
      }
    };

    // Écouter les événements custom
    window.addEventListener("treasury-updated", handleTreasuryUpdate as EventListener);
    window.addEventListener("balance-updated", handleBalanceUpdate as EventListener);

    return () => {
      window.removeEventListener("treasury-updated", handleTreasuryUpdate as EventListener);
      window.removeEventListener("balance-updated", handleBalanceUpdate as EventListener);
    };
  }, [agenceId, queryClient]);

  return useQuery({
    queryKey: withReconciliation
      ? treasuryKeys.encaisseWithReconciliation(agenceId)
      : treasuryKeys.encaisse(agenceId),
    queryFn: () => treasuryApi.getEncaisse(agenceId, withReconciliation),
    enabled,
    staleTime,
    refetchInterval,
    // Ne pas refetch sur focus car WebSocket a priorité
    refetchOnWindowFocus: false,
    // Garder les données précédentes pendant le refetch
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook pour récupérer l'encaisse avec réconciliation complète
 * Nécessite la permission ACCOUNTING:READ
 */
export function useEncaisseReconciliation(
  agenceId?: string,
  options: Omit<UseEncaisseOptions, "withReconciliation"> = {}
) {
  const { enabled = true, staleTime = 30_000, refetchInterval = false } = options;

  return useQuery({
    queryKey: treasuryKeys.encaisseWithReconciliation(agenceId),
    queryFn: () => treasuryApi.getEncaisseReconciliation(agenceId),
    enabled,
    staleTime,
    refetchInterval,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook pour récupérer le breakdown détaillé par compte GL
 * Nécessite la permission ACCOUNTING:READ
 */
export function useEncaisseBreakdown(
  agenceId?: string,
  options: Omit<UseEncaisseOptions, "withReconciliation"> = {}
) {
  const { enabled = true, staleTime = 60_000, refetchInterval = false } = options;

  return useQuery({
    queryKey: treasuryKeys.breakdown(agenceId),
    queryFn: () => treasuryApi.getBreakdown(agenceId),
    enabled,
    staleTime,
    refetchInterval,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook pour invalider manuellement les queries treasury
 */
export function useInvalidateEncaisse() {
  const queryClient = useQueryClient();

  return useCallback(
    (agenceId?: string) => {
      if (agenceId) {
        queryClient.invalidateQueries({ queryKey: treasuryKeys.encaisse(agenceId) });
        queryClient.invalidateQueries({
          queryKey: treasuryKeys.encaisseWithReconciliation(agenceId),
        });
        queryClient.invalidateQueries({ queryKey: treasuryKeys.breakdown(agenceId) });
      } else {
        queryClient.invalidateQueries({ queryKey: treasuryKeys.all });
      }
    },
    [queryClient]
  );
}

// Export API pour utilisation directe si nécessaire
export { treasuryApi };
