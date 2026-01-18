import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../lib/api-client';

export interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  segment?: string;
  latitude?: number;
  longitude?: number;
  creditTotal?: number;
  epargneTotal?: number;
  createdAt: string;
}

export function useClients(pagination?: { page?: number; perPage?: number }) {
  const page = pagination?.page ?? 1;
  const perPage = pagination?.perPage ?? 25;

  const { data: response, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['clients', page, perPage],
    queryFn: async () => {
      return clientApi.getAll({ page, perPage });
    }
  });

  return {
    clients: response?.data || [],
    meta: response?.meta,
    loading,
    error: error ? (error as Error).message : null,
    refresh: refetch
  };
}
