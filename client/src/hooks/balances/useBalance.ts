/**
 * Hooks unifiés pour la gestion des soldes financiers
 * Source unique de vérité côté frontend
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { api } from '../../lib/api-client';
import type { Balance, BalanceEntityType, CashPosition, BalanceUpdatePayload } from '@shared/types/balances';
import { balanceKeys } from '../../lib/query-keys';

// ============================================
// API Functions
// ============================================

const balanceApi = {
  getCompteBalance: (compteId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/compte/${compteId}`);
  },

  getCaisseBalance: (caisseId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/caisse/${caisseId}`);
  },

  getSessionCaisseBalance: (sessionId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/session/${sessionId}`);
  },

  getCreditBalance: (creditId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/credit/${creditId}`);
  },

  getTontineBalance: (tontineId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/tontine/${tontineId}`);
  },

  getCoffreBalance: (coffreId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/coffre/${coffreId}`);
  },

  getCaisseAgentBalance: (caisseAgentId: string): Promise<Balance> => {
    return api.get<Balance>(`/api/balances/caisse-agent/${caisseAgentId}`);
  },

  getGlobalCashPosition: (agenceId?: string): Promise<CashPosition> => {
    const params = agenceId && agenceId !== 'all' ? `?agenceId=${agenceId}` : '';
    return api.get<CashPosition>(`/api/balances/cash-position${params}`);
  }
};

// Helper pour mapper entityType vers les clés centralisées
function getBalanceQueryKey(entityType: BalanceEntityType, entityId: string) {
  switch (entityType) {
    case 'compte':
      return balanceKeys.compte(entityId);
    case 'caisse':
      return balanceKeys.caisse(entityId);
    case 'session_caisse':
      return balanceKeys.session(entityId);
    case 'credit':
      return balanceKeys.credit(entityId);
    case 'tontine':
      return balanceKeys.tontine(entityId);
    case 'coffre':
      return balanceKeys.coffre(entityId);
    case 'caisse_agent':
      return balanceKeys.caisseAgent(entityId);
    default:
      return [`${entityType}-balance`, entityId] as const;
  }
}

// ============================================
// Generic Balance Hook
// ============================================

interface UseBalanceOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
}

/**
 * Hook générique pour récupérer un solde
 * Écoute automatiquement les événements WebSocket BALANCE_UPDATED
 */
export function useBalance(
  entityType: BalanceEntityType,
  entityId: string | undefined,
  options: UseBalanceOptions = {}
) {
  const queryClient = useQueryClient();
  const { enabled = true, staleTime = 5 * 60 * 1000, refetchInterval = false } = options;

  // Mapping entityType -> API function
  const fetchBalance = useCallback(async (): Promise<Balance> => {
    if (!entityId) throw new Error('entityId required');

    switch (entityType) {
      case 'compte':
        return balanceApi.getCompteBalance(entityId);
      case 'caisse':
        return balanceApi.getCaisseBalance(entityId);
      case 'session_caisse':
        return balanceApi.getSessionCaisseBalance(entityId);
      case 'credit':
        return balanceApi.getCreditBalance(entityId);
      case 'tontine':
        return balanceApi.getTontineBalance(entityId);
      case 'coffre':
        return balanceApi.getCoffreBalance(entityId);
      case 'caisse_agent':
        return balanceApi.getCaisseAgentBalance(entityId);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }, [entityType, entityId]);

  // Query key - utilise les clés centralisées
  const queryKey = entityId ? getBalanceQueryKey(entityType, entityId) : [`${entityType}-balance`, entityId];

  // Écoute des événements BALANCE_UPDATED via WebSocket
  useEffect(() => {
    if (!entityId) return;

    const handler = (event: CustomEvent<BalanceUpdatePayload>) => {
      const { entityType: evtType, entityId: evtId, newBalance } = event.detail;

      // Si l'événement concerne cette entité, mettre à jour le cache optimistiquement
      if (evtType === entityType && evtId === entityId) {
        queryClient.setQueryData(queryKey, (old: Balance | undefined) => {
          if (!old) return old;
          return {
            ...old,
            current: newBalance,
            available: entityType === 'credit' ? 0 : newBalance, // Credit balance isn't "available"
            asOf: new Date()
          };
        });
      }
    };

    window.addEventListener('balance-updated', handler as EventListener);
    return () => window.removeEventListener('balance-updated', handler as EventListener);
  }, [entityType, entityId, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: fetchBalance,
    enabled: enabled && !!entityId,
    staleTime,
    refetchInterval,
    // Désactiver le refetch auto si WebSocket actif
    refetchOnWindowFocus: false,
  });
}

// ============================================
// Specialized Hooks
// ============================================

/**
 * Hook pour le solde d'un compte client
 */
export function useCompteBalance(compteId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('compte', compteId, options);
}

/**
 * Hook pour le solde d'une caisse
 */
export function useCaisseBalance(caisseId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('caisse', caisseId, options);
}

/**
 * Hook pour le solde d'une session caisse (théorique temps réel)
 */
export function useSessionCaisseBalance(sessionId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('session_caisse', sessionId, options);
}

/**
 * Hook pour le solde restant d'un crédit
 */
export function useCreditBalance(creditId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('credit', creditId, options);
}

/**
 * Hook pour le solde d'une tontine
 */
export function useTontineBalance(tontineId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('tontine', tontineId, options);
}

/**
 * Hook pour le solde d'un coffre
 */
export function useCoffreBalance(coffreId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('coffre', coffreId, options);
}

/**
 * Hook pour le solde validé d'une caisse agent
 */
export function useCaisseAgentBalance(caisseAgentId: string | undefined, options?: UseBalanceOptions) {
  return useBalance('caisse_agent', caisseAgentId, options);
}

// ============================================
// Global Cash Position Hook
// ============================================

/**
 * Hook pour la position de trésorerie globale
 * Utilisé principalement dans le dashboard et la supervision
 */
export function useGlobalCashPosition(agenceId?: string, options?: UseBalanceOptions) {
  const queryClient = useQueryClient();
  const { enabled = true, staleTime = 60 * 1000, refetchInterval = 30000 } = options || {};

  // Écoute des événements BALANCE_UPDATED pour invalidation
  useEffect(() => {
    const handler = (event: CustomEvent<BalanceUpdatePayload>) => {
      const { entityType } = event.detail;
      // Invalider si changement sur caisse, coffre, ou session
      if (['caisse', 'session_caisse', 'coffre', 'caisse_agent'].includes(entityType)) {
        queryClient.invalidateQueries({ queryKey: balanceKeys.cashPosition() });
      }
    };

    window.addEventListener('balance-updated', handler as EventListener);
    return () => window.removeEventListener('balance-updated', handler as EventListener);
  }, [queryClient]);

  return useQuery({
    queryKey: balanceKeys.cashPosition(agenceId),
    queryFn: () => balanceApi.getGlobalCashPosition(agenceId),
    enabled,
    staleTime,
    refetchInterval,
  });
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook pour formater un solde en FCFA
 */
export function useFormatBalance() {
  return useCallback((amount: number | undefined | null, options?: { showSign?: boolean }) => {
    if (amount === undefined || amount === null) return '--';

    const formatted = new Intl.NumberFormat('fr-FR', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));

    const sign = options?.showSign && amount !== 0
      ? (amount > 0 ? '+' : '-')
      : '';

    return `${sign}${formatted} FCFA`;
  }, []);
}

/**
 * Hook pour calculer la variation de solde
 */
export function useBalanceDelta(current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined) {
    return { delta: 0, percent: 0, trend: 'neutral' as const };
  }

  const delta = current - previous;
  const percent = previous !== 0 ? (delta / previous) * 100 : 0;
  const trend = delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'neutral' as const;

  return { delta, percent: Number(percent.toFixed(2)), trend };
}
