/**
 * Hooks TanStack Query — Cartes de pointage.
 *
 * Centralise les clés de requête et les invalidations après mutation
 * (AGENTS.md §7). L'état serveur reste dans TanStack Query ; les composants
 * ne font aucun appel réseau direct.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cartePointageApi,
  type CartePointageDto,
  type RetraitCartePointageDto,
  type TransactionPointageDto,
} from '@/lib/api-client';

/** Clés de requête centralisées du module. */
export const cartesPointageKeys = {
  all: ['cartes-pointage'] as const,
  lists: () => [...cartesPointageKeys.all, 'list'] as const,
  list: (filter: { clientId?: string; status?: 'ACTIVE' | 'WITHDRAWN' }) =>
    [...cartesPointageKeys.lists(), filter] as const,
  detail: (id: string) => [...cartesPointageKeys.all, 'detail', id] as const,
};

/** Liste des cartes du périmètre (option : filtrer par client ou statut). */
export function useCartesPointage(filter: { clientId?: string; status?: 'ACTIVE' | 'WITHDRAWN' } = {}) {
  return useQuery({
    queryKey: cartesPointageKeys.list(filter),
    queryFn: () => cartePointageApi.getAll(filter),
  });
}

/** Détail d'une carte + historique des transactions. */
export function useCartePointageDetail(id: string | null) {
  return useQuery({
    queryKey: cartesPointageKeys.detail(id ?? ''),
    queryFn: () => cartePointageApi.getById(id!),
    enabled: !!id,
  });
}

/** Génère une clé d'idempotence unique côté client (protection anti-doublon). */
export function generateIdempotencyKey(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

/** Invalidation précise après mutation : listes + détail concerné. */
function useInvalidateCartes() {
  const queryClient = useQueryClient();
  return (cardId?: string) => {
    queryClient.invalidateQueries({ queryKey: cartesPointageKeys.lists() });
    if (cardId) {
      queryClient.invalidateQueries({ queryKey: cartesPointageKeys.detail(cardId) });
    }
  };
}

/** Ouverture d'une carte (montant unitaire M figé à l'ouverture). */
export function useCreateCartePointage() {
  const invalidate = useInvalidateCartes();
  return useMutation<CartePointageDto, Error, { clientId: string; unitAmount: string }>({
    mutationFn: (data) => cartePointageApi.create(data),
    onSuccess: () => invalidate(),
  });
}

/** Versement : coche la case suivante de la carte. */
export function useDeposerCartePointage() {
  const invalidate = useInvalidateCartes();
  return useMutation<
    TransactionPointageDto,
    Error,
    { cardId: string; paymentMethod: 'CASH' | 'MOBILE_MONEY'; idempotencyKey: string }
  >({
    mutationFn: ({ cardId, ...data }) => cartePointageApi.deposer(cardId, data),
    onSuccess: (_data, variables) => invalidate(variables.cardId),
  });
}

/** Retrait : restitue M×N − M au client et clôture la carte. */
export function useRetirerCartePointage() {
  const invalidate = useInvalidateCartes();
  return useMutation<
    RetraitCartePointageDto,
    Error,
    { cardId: string; paymentMethod: 'CASH' | 'MOBILE_MONEY'; idempotencyKey: string }
  >({
    mutationFn: ({ cardId, ...data }) => cartePointageApi.retirer(cardId, data),
    onSuccess: (_data, variables) => invalidate(variables.cardId),
  });
}
