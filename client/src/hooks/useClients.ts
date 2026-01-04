import { useQuery } from '@tanstack/react-query';

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

export function useClients() {
  const { data: clients = [], isLoading: loading, error, refetch } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const response = await fetch('/api/clients');
      if (!response.ok) throw new Error('Erreur serveur');
      return response.json();
    }
  });

  return {
    clients,
    loading,
    error: error ? (error as Error).message : null,
    refresh: refetch
  };
}
