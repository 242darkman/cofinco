/**
 * React Query hooks for the OHADA Accounting module
 * Provides cached, real-time data for all accounting screens
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { comptabiliteApi } from '../../lib/api-client';
import { comptabiliteKeys } from '../../lib/query-keys';

// ============================================
// Plan Comptable OHADA
// ============================================

export function useChartOfAccounts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.planOhada(),
    queryFn: () => comptabiliteApi.getPlanOhada(),
    staleTime: 10 * 60 * 1000, // 10 min - chart of accounts rarely changes
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// Journaux
// ============================================

interface JournalStat {
  code: string;
  intitule: string;
  count: number;
}

export function useJournaux(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.journaux(),
    queryFn: () => comptabiliteApi.getJournaux(),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useJournauxStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.journauxStats(),
    queryFn: async (): Promise<JournalStat[]> => {
      const res = await fetch('/api/comptabilite/journaux-stats');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useJournalEntries(journalId: string | undefined) {
  return useQuery({
    queryKey: comptabiliteKeys.journalEntries(journalId || ''),
    queryFn: async () => {
      const res = await fetch(`/api/comptabilite/journaux/${journalId}/ecritures`);
      if (!res.ok) throw new Error('Failed to fetch journal entries');
      return res.json();
    },
    enabled: !!journalId,
    staleTime: 60 * 1000,
  });
}

// ============================================
// Balance Générale
// ============================================

interface BalanceParams {
  dateDebut: string;
  dateFin: string;
  classe?: number;
}

export function useBalanceGenerale(params: BalanceParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.balance(params.dateDebut, params.dateFin, params.classe),
    queryFn: () => comptabiliteApi.getBalance(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// Grand Livre
// ============================================

interface GrandLivreParams {
  dateDebut: string;
  dateFin: string;
  page?: number;
  pageSize?: number;
}

export function useGrandLivre(
  compteId: string | undefined,
  params: GrandLivreParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: comptabiliteKeys.grandLivre(compteId || '', params.dateDebut, params.dateFin, params.page),
    queryFn: () => comptabiliteApi.getGrandLivre(compteId!, params),
    enabled: (options?.enabled ?? true) && !!compteId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// Bilan Synthétique
// ============================================

export function useBilanStats(dateFin?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.bilan(dateFin),
    queryFn: async () => {
      const params = dateFin ? `?dateFin=${dateFin}` : '';
      const res = await fetch(`/api/comptabilite/v2/bilan${params}`);
      if (!res.ok) throw new Error('Failed to fetch bilan');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// Compte de Résultat
// ============================================

export function useCompteResultat(exercice: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.compteResultat(exercice),
    queryFn: () => comptabiliteApi.getCompteResultat(exercice),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// OHADA GL Reports
// ============================================

export function useJournalCentralisateur(year: number, month: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.journalCentralisateur(year, month),
    queryFn: () => comptabiliteApi.getJournalCentralisateur({ year, month }),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useBilanOHADA(dateArret: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.bilanOHADA(dateArret),
    queryFn: () => comptabiliteApi.getBilanOHADA(dateArret),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useCompteResultatOHADA(dateDebut: string, dateFin: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.compteResultatOHADA(dateDebut, dateFin),
    queryFn: () => comptabiliteApi.getCompteResultatOHADA({ dateDebut, dateFin }),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useLivreInventaire(dateInventaire: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.livreInventaire(dateInventaire),
    queryFn: () => comptabiliteApi.getLivreInventaire(dateInventaire),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// Périodes Comptables
// ============================================

export function usePeriods(year?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: comptabiliteKeys.periods(year),
    queryFn: () => comptabiliteApi.getPeriods(year),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useClosePeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { year: number; month: number; notes?: string }) =>
      comptabiliteApi.closePeriod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comptabiliteKeys.all });
    },
  });
}

// ============================================
// Mutations
// ============================================

export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: comptabiliteApi.createEntry,
    onSuccess: () => {
      // Invalidate all accounting queries
      queryClient.invalidateQueries({ queryKey: comptabiliteKeys.all });
    },
  });
}

// ============================================
// WebSocket Real-Time Hook
// ============================================

/**
 * Listens to ACCOUNTING_UPDATE WebSocket events and invalidates
 * the relevant React Query caches so that accounting screens
 * update in real time without manual refresh.
 *
 * Call this once in a parent component (e.g. ComptabiliteSageOHADA)
 * or in each individual tab component.
 */
export function useAccountingWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;

      // Invalidate all accounting queries on any accounting update
      queryClient.invalidateQueries({ queryKey: comptabiliteKeys.all });

      // If the event carries a journal code, also invalidate that journal's entries
      if (detail?.journalId) {
        queryClient.invalidateQueries({
          queryKey: comptabiliteKeys.journalEntries(detail.journalId),
        });
      }
    };

    // The WebSocketContext dispatches these custom events
    window.addEventListener('accounting-update', handler);

    return () => {
      window.removeEventListener('accounting-update', handler);
    };
  }, [queryClient]);
}
