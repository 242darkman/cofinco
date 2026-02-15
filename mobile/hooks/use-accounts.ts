import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';
import { useAuthStore } from '@/stores/auth-store';

export interface AccountProduct {
  id: string;
  code: string;
  nom: string;
  typeCompte: string;
  tauxInteret?: number;
}

export interface Account {
  id: string;
  clientId: string;
  numeroCompte: string;
  numero_compte: string;
  typeCompte: string;
  type_compte: string;
  statut: string;
  soldeCourant: string;
  solde: number;
  solde_courant: string;
  agenceId?: string;
  blocageActif?: boolean;
  blocageMotif?: string;
  produit?: AccountProduct | null;
  createdAt: string;
  created_at: string;
}

interface ClientProfile {
  id: string;
  userId?: string;
  nom?: string;
  prenom?: string;
  telephone?: string;
  email?: string;
  agenceId?: string;
}

/**
 * Fetch the client profile linked to the authenticated user.
 * Returns { data: client } or { data: null }.
 */
export function useClientProfile() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: queryKeys.accounts.clientProfile(userId ?? ''),
    queryFn: () =>
      api.get<{ data: ClientProfile | null }>(`/api/clients/by-user/${userId}`),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch all accounts for the authenticated user's client profile.
 * Chains: user → client profile → accounts.
 */
export function useAccounts() {
  const { data: profileResp } = useClientProfile();
  const clientId = profileResp?.data?.id;

  return useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: () => api.get<Account[]>(`/api/clients/${clientId}/comptes`),
    enabled: !!clientId,
    staleTime: 60_000,
  });
}

/**
 * Fetch a single account by ID.
 * GET /api/comptes/:id → { ...compte, clients, permissions }
 */
export function useAccountDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () =>
      api.get<
        Account & {
          clients?: {
            id: string;
            nom: string;
            prenom: string;
            telephone: string;
            email: string;
          } | null;
          permissions?: {
            canWithdraw: boolean;
            withdrawalBlockedReason?: string;
            canDeposit: boolean;
            depositBlockedReason?: string;
          };
        }
      >(`/api/comptes/${id}`),
    enabled: !!id,
  });
}

export interface Transaction {
  id: string;
  reference: string;
  montant: number;
  typeTransaction: string;
  description?: string;
  sens: 'IN' | 'OUT';
  statut: string;
  createdAt: string;
  soldeApres?: number;
}

interface TransactionsPage {
  data: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useAccountTransactions(compteId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.accounts.transactions(compteId),
    queryFn: ({ pageParam }) =>
      api.get<TransactionsPage>(
        `/api/comptes/${compteId}/transactions?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!compteId,
  });
}
