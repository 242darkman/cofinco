import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

export interface ReconciliationSession {
  id: string;
  period: string;
  bankName: string;
  statut: string;
  totalExpected: string;
  totalMatched: string;
  totalUnmatched: string;
  matchedCount: number;
  unmatchedCount: number;
  importFileName: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ReconciliationLine {
  id: string;
  sessionId: string;
  source: string;
  reference: string | null;
  employeNom: string | null;
  montant: number;
  dateValeur: string | null;
  batchItemId: string | null;
  matchStatus: string;
  matchedWithId: string | null;
  ecart: number;
  notes: string | null;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function useBankReconciliation() {
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery<ReconciliationSession[]>({
    queryKey: ['/api/hr/paie/reconciliation'],
    queryFn: () => fetchJson<ReconciliationSession[]>('/api/hr/paie/reconciliation'),
  });

  const createSessionMutation = useMutation({
    mutationFn: (data: { period: string; bankName: string }) =>
      fetchJson<ReconciliationSession>('/api/hr/paie/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Session créée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/reconciliation'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMutation = useMutation({
    mutationFn: (sessionId: string) =>
      fetchJson(`/api/hr/paie/reconciliation/${sessionId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Session clôturée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/reconciliation'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    sessions,
    isLoading,
    createSession: createSessionMutation.mutateAsync,
    isCreating: createSessionMutation.isPending,
    completeSession: completeMutation.mutateAsync,
  };
}

export function useReconciliationDetail(sessionId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ReconciliationSession & { lines: ReconciliationLine[] }>({
    queryKey: ['/api/hr/paie/reconciliation', sessionId],
    queryFn: () => fetchJson(`/api/hr/paie/reconciliation/${sessionId}`),
    enabled: !!sessionId,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/hr/paie/reconciliation/${sessionId}/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Relevé importé');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/reconciliation', sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoMatchMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ matchCount: number }>(`/api/hr/paie/reconciliation/${sessionId}/auto-match`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(`${data.matchCount} rapprochement(s) automatique(s)`);
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/reconciliation', sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, ...data }: { lineId: string; matchStatus?: string; matchedWithId?: string; notes?: string }) =>
      fetchJson(`/api/hr/paie/reconciliation/${sessionId}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/reconciliation', sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    session: data,
    isLoading,
    importStatement: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    autoMatch: autoMatchMutation.mutateAsync,
    isAutoMatching: autoMatchMutation.isPending,
    updateLine: updateLineMutation.mutateAsync,
  };
}
