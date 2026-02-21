import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

export interface PaymentBatch {
  id: string;
  payrollRunId: number;
  bankName: string;
  statut: string;
  employeeCount: number;
  totalAmount: string;
  sentAt: string | null;
  confirmedAt: string | null;
  referenceExterne: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BatchItem {
  id: string;
  batchId: string;
  employeId: string;
  employeNom: string;
  bankCode: string | null;
  branchCode: string | null;
  accountNumber: string | null;
  accountKey: string | null;
  montantNet: number;
  statut: string;
  paidAt: string | null;
  failureReason: string | null;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function usePaymentBatches(runId: number | null) {
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery<PaymentBatch[]>({
    queryKey: ['/api/hr/paie/batches', runId],
    queryFn: () => fetchJson<PaymentBatch[]>(`/api/hr/paie/runs/${runId}/batches`),
    enabled: !!runId,
  });

  const createBatchesMutation = useMutation({
    mutationFn: ({ runId, transferFileId }: { runId: number; transferFileId?: string }) =>
      fetchJson<{ batchCount: number; totalAmount: number }>(`/api/hr/paie/runs/${runId}/create-batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferFileId }),
      }),
    onSuccess: (data) => {
      toast.success(`${data.batchCount} batch(es) créé(s)`);
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/batches'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ batchId, statut, referenceExterne, notes }: {
      batchId: string; statut: string; referenceExterne?: string; notes?: string;
    }) =>
      fetchJson<PaymentBatch>(`/api/hr/paie/batches/${batchId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut, referenceExterne, notes }),
      }),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/batches'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ batchId, itemId, statut, failureReason }: {
      batchId: string; itemId: string; statut: string; failureReason?: string;
    }) =>
      fetchJson<BatchItem>(`/api/hr/paie/batches/${batchId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut, failureReason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/batches'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    batches,
    isLoading,
    createBatches: createBatchesMutation.mutateAsync,
    isCreatingBatches: createBatchesMutation.isPending,
    updateBatchStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    updateItem: updateItemMutation.mutateAsync,
  };
}

export function usePaymentBatchDetail(batchId: string | null) {
  const { data, isLoading } = useQuery<PaymentBatch & { items: BatchItem[] }>({
    queryKey: ['/api/hr/paie/batches', batchId],
    queryFn: () => fetchJson(`/api/hr/paie/batches/${batchId}`),
    enabled: !!batchId,
  });

  return { batch: data, isLoading };
}
