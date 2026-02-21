import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

export interface DocumentRequest {
  id: string;
  employeId: string;
  employeNom: string;
  type: string;
  motif: string | null;
  details: string | null;
  urgence: boolean;
  statut: string;
  traitePar: string | null;
  traiteAt: string | null;
  commentaireRh: string | null;
  motifRejet: string | null;
  documentUrl: string | null;
  documentFileName: string | null;
  createdAt: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function useDocumentRequests(mine?: boolean) {
  const queryClient = useQueryClient();
  const queryParam = mine ? '?mine=true' : '';

  const { data: requests = [], isLoading } = useQuery<DocumentRequest[]>({
    queryKey: ['/api/hr/document-requests', { mine }],
    queryFn: () => fetchJson<DocumentRequest[]>(`/api/hr/document-requests${queryParam}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; motif?: string; details?: string; urgence?: boolean }) =>
      fetchJson<DocumentRequest>('/api/hr/document-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Demande de document envoyee');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/document-requests'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; statut: string; commentaireRh?: string; motifRejet?: string }) =>
      fetchJson<DocumentRequest>(`/api/hr/document-requests/${id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Demande traitee');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/document-requests'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    requests,
    isLoading,
    createRequest: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    processRequest: processMutation.mutateAsync,
    isProcessing: processMutation.isPending,
  };
}
