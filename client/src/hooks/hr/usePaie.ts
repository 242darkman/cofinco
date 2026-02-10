import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

// ============================================================================
// TYPES
// ============================================================================

export interface PayrollRun {
  id: number;
  period: string;
  version: number;
  status: 'DRAFT' | 'VALIDATED' | 'PAID' | 'CLOSED' | 'CANCELLED';
  agenceId: string | null;
  rerunOfRunId: number | null;
  rerunReason: string | null;
  generatedBy: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  totalBrut: string;
  totalNet: string;
  totalChargesPatronales: string;
  totalChargesSalariales: string;
  employeeCount: number;
  issueCount: number;
  createdAt: string;
}

export interface BulletinPaie {
  id: number;
  payrollRunId: number | null;
  employeId: string;
  employeNom: string;
  mois: string;
  version: number;
  salaireBrut: string;
  totalChargesSalariales: string;
  totalChargesPatronales: string;
  irpp: string;
  totalRetenues: string;
  salaireNet: string;
  salaireBaseSnapshot: number;
  situationFamilialeSnapshot: string | null;
  nombreEnfantsSnapshot: number;
  coefficientProrataSnapshot: string;
  statut: string;
  datePaiement: string | null;
  cancelled: boolean;
  createdAt: string;
}

export interface PayrollRunIssue {
  id: string;
  payrollRunId: number;
  employeId: string | null;
  field: string | null;
  severity: 'WARNING' | 'BLOCKING';
  message: string;
  resolved: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePaie() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['all-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['my-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    queryClient.invalidateQueries({ queryKey: ['payroll-run'] });
    queryClient.invalidateQueries({ queryKey: ['gl-payroll-661'] });
    queryClient.invalidateQueries({ queryKey: ['gl-payroll-421'] });
  };

  // ---- Fetch My Bulletins ----
  const { data: myBulletins = [], isLoading: loadingMyBulletins } = useQuery({
    queryKey: ['my-bulletins'],
    queryFn: async () => {
      const res = await fetch('/api/hr/paie/my');
      if (!res.ok) throw new Error('Failed to fetch bulletins');
      return res.json();
    },
  });

  // ---- Fetch All Bulletins (RH/Admin) ----
  const { data: allBulletins = [], isLoading: loadingAllBulletins } = useQuery({
    queryKey: ['all-bulletins'],
    queryFn: async () => {
      const res = await fetch('/api/hr/bulletins');
      if (!res.ok) throw new Error('Failed to fetch all bulletins');
      return res.json();
    },
  });

  // ---- Fetch Payroll Runs ----
  const { data: runs = [], isLoading: loadingRuns } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const res = await fetch('/api/hr/paie/runs');
      if (!res.ok) throw new Error('Failed to fetch runs');
      const json = await res.json();
      return json.data || json;
    },
  });

  // ---- Fetch Run Detail ----
  function useRunDetail(runId: number | null) {
    return useQuery({
      queryKey: ['payroll-run', runId],
      queryFn: async () => {
        if (!runId) return null;
        const res = await fetch(`/api/hr/paie/runs/${runId}`);
        if (!res.ok) throw new Error('Failed to fetch run detail');
        const json = await res.json();
        return json.data || json;
      },
      enabled: !!runId,
    });
  }

  // ---- Generate Paie (creates a run) ----
  const generatePaieMutation = useMutation({
    mutationFn: async (mois: string) => {
      const res = await fetch('/api/hr/paie/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mois }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la génération');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data?.data?.message || data?.message || 'Génération de paie réussie';
      toast.success(msg);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la génération de paie');
    },
  });

  // ---- Validate Run (DRAFT → VALIDATED + GL engagement) ----
  const validateRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch('/api/hr/paie/validate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la validation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.validated || 0;
      toast.success(`${count} bulletin(s) validé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la validation');
    },
  });

  // ---- Pay Run (VALIDATED → PAID + GL payment) ----
  const payRunMutation = useMutation({
    mutationFn: async ({ runId, datePaiement }: { runId: number; datePaiement?: string }) => {
      const res = await fetch('/api/hr/paie/pay', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, datePaiement }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors du paiement');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.paid || 0;
      toast.success(`${count} bulletin(s) marqué(s) comme payé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du paiement');
    },
  });

  // ---- Re-run (cancel old + generate new) ----
  const rerunMutation = useMutation({
    mutationFn: async ({ runId, reason }: { runId: number; reason: string }) => {
      const res = await fetch('/api/hr/paie/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors du re-run');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data?.data?.message || data?.message || 'Re-run effectué';
      toast.success(msg);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du re-run');
    },
  });

  return {
    // Bulletins
    myBulletins,
    loadingMyBulletins,
    allBulletins,
    loadingAllBulletins,

    // Runs
    runs,
    loadingRuns,
    useRunDetail,

    // Actions
    generatePaie: generatePaieMutation.mutateAsync,
    isGenerating: generatePaieMutation.isPending,
    validateRun: validateRunMutation.mutateAsync,
    isValidating: validateRunMutation.isPending,
    payRun: payRunMutation.mutateAsync,
    isPaying: payRunMutation.isPending,
    rerun: rerunMutation.mutateAsync,
    isRerunning: rerunMutation.isPending,

    // Legacy compat (deprecated — use run-based operations)
    validateBulletins: async (bulletinIds: number[]) => {
      toast.error('Utilisez la validation par run');
    },
    payBulletins: async ({ bulletinIds, datePaiement }: { bulletinIds: number[]; datePaiement?: string }) => {
      toast.error('Utilisez le paiement par run');
    },
  };
}
