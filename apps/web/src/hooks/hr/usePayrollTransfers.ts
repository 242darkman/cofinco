import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface TransferEntry {
  employeId: string;
  employeNom: string;
  bankName: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountKey: string;
  montantNet: number;
  reference: string;
}

export interface TransferPreview {
  valid: TransferEntry[];
  invalid: Array<{
    employeId: string;
    employeNom: string;
    montantNet: number;
    errors: string[];
  }>;
  totalAmount: number;
  employeeCount: number;
}

export interface TransferFile {
  id: string;
  payrollRunId: number;
  fileName: string;
  format: string;
  employeeCount: number;
  totalAmount: string;
  createdAt: string;
}

export interface GenerateResult {
  fileId: string;
  csvContent: string;
  bordereauContent: string;
  warnings: string[];
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function usePayrollTransfers(runId: number | null) {
  const queryClient = useQueryClient();

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['/api/hr/paie/runs', runId, 'transfer-preview'],
    queryFn: () => fetchJson<TransferPreview>(`/api/hr/paie/runs/${runId}/transfer-preview`),
    enabled: !!runId,
  });

  const { data: files = [] } = useQuery({
    queryKey: ['/api/hr/paie/runs', runId, 'transfer-files'],
    queryFn: () => fetchJson<TransferFile[]>(`/api/hr/paie/runs/${runId}/transfer-files`),
    enabled: !!runId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      fetchJson<GenerateResult>(`/api/hr/paie/runs/${runId}/generate-transfer`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/paie/runs', runId, 'transfer-files'] });
      if (data.warnings.length > 0) {
        toast.warning(data.warnings.join(', '));
      }
      toast.success('Fichier de virement généré');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadCsv = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBordereau = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    preview,
    files,
    loadingPreview,
    generateTransferFile: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    downloadCsv,
    downloadBordereau,
  };
}
