/**
 * Hook pour la gestion de l'historique global d'une caisse
 * Utilise React Query pour le caching et la pagination
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import {
  caisseApi,
  CaisseHistoriqueFilters,
  CaisseHistoriqueResult,
  CaisseHistoriqueSummary
} from '../../lib/api-client';
import { caisseKeys } from '../../lib/query-keys';

export interface UseCaisseHistoriqueOptions {
  /** ID de la caisse */
  caisseId: string;
  /** Nombre d'éléments par page */
  pageSize?: number;
  /** Activer la requête */
  enabled?: boolean;
  /** Intervalle de rafraîchissement automatique (ms) */
  refetchInterval?: number;
}

export interface UseCaisseHistoriqueReturn {
  /** Données de l'historique */
  data: CaisseHistoriqueResult | undefined;
  /** Chargement en cours */
  isLoading: boolean;
  /** Erreur éventuelle */
  error: Error | null;
  /** Page actuelle (0-indexed) */
  page: number;
  /** Nombre total de pages */
  totalPages: number;
  /** Filtres actifs */
  filters: CaisseHistoriqueFilters;
  /** Changer de page */
  setPage: (page: number) => void;
  /** Mettre à jour les filtres */
  setFilters: (filters: Partial<CaisseHistoriqueFilters>) => void;
  /** Rafraîchir les données */
  refetch: () => void;
  /** Résumé de l'historique */
  summary: CaisseHistoriqueSummary | undefined;
  /** Chargement du résumé */
  summaryLoading: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

export function useCaisseHistorique({
  caisseId,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
  refetchInterval,
}: UseCaisseHistoriqueOptions): UseCaisseHistoriqueReturn {
  const queryClient = useQueryClient();

  // État local pour la pagination et les filtres
  const [page, setPageState] = useState(0);
  const [filters, setFiltersState] = useState<CaisseHistoriqueFilters>({
    limit: pageSize,
    offset: 0,
  });

  // Construire les filtres avec pagination
  const queryFilters = useMemo<CaisseHistoriqueFilters>(() => ({
    ...filters,
    limit: pageSize,
    offset: page * pageSize,
  }), [filters, page, pageSize]);

  // Query pour l'historique paginé
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: caisseKeys.historique(caisseId, queryFilters),
    queryFn: () => caisseApi.getHistorique(caisseId, queryFilters),
    enabled: enabled && !!caisseId,
    refetchInterval,
    staleTime: 30000, // 30 secondes
  });

  // Query pour le résumé (séparée pour éviter de la recharger à chaque changement de page)
  const {
    data: summaryData,
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: caisseKeys.historiqueSummary(caisseId),
    queryFn: () => caisseApi.getHistoriqueSummary(caisseId),
    enabled: enabled && !!caisseId,
    staleTime: 60000, // 1 minute
  });

  // Calculer le nombre total de pages
  const totalPages = useMemo(() => {
    if (!data?.pagination?.total) return 1;
    return Math.ceil(data.pagination.total / pageSize);
  }, [data?.pagination?.total, pageSize]);

  // Changer de page
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(0, Math.min(newPage, totalPages - 1)));
  }, [totalPages]);

  // Mettre à jour les filtres (reset la page à 0)
  const setFilters = useCallback((newFilters: Partial<CaisseHistoriqueFilters>) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters,
    }));
    setPageState(0); // Reset à la première page
  }, []);

  // Rafraîchir toutes les données
  const handleRefetch = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: caisseKeys.historiqueSummary(caisseId) });
  }, [refetch, queryClient, caisseId]);

  return {
    data,
    isLoading,
    error: error as Error | null,
    page,
    totalPages,
    filters,
    setPage,
    setFilters,
    refetch: handleRefetch,
    summary: summaryData,
    summaryLoading,
  };
}

export default useCaisseHistorique;
