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

export interface SalaryPaymentJob {
  id: string;
  bulletinId: number;
  payrollRunId: number;
  employeId: string;
  paymentMethod: string;
  executionMode: string;
  scheduledAt: string | null;
  amount: string;
  status: string;
  failureReason: string | null;
  failureCode: string | null;
  retryCount: number;
  maxRetries: number;
  operator: string | null;
  correspondent: string | null;
  createdAt: string;
  completedAt: string | null;
  employeNom?: string;
  bulletinStatut?: string;
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
    queryClient.invalidateQueries({ queryKey: ['payment-jobs'] });
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
      const d = data?.data || {};
      const total = d.totalJobs || d.paid || 0;
      toast.success(`${total} paiement(s) lancé(s)`);
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

  // ---- Schedule Payment ----
  const schedulePayMutation = useMutation({
    mutationFn: async ({ runId, scheduledAt, bulletinIds }: { runId: number; scheduledAt: string; bulletinIds?: number[] }) => {
      const res = await fetch('/api/hr/paie/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, scheduledAt, bulletinIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la programmation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.scheduled || 0;
      toast.success(`${count} paiement(s) programmé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la programmation');
    },
  });

  // ---- Confirm Manual Payment (TRANSFER/CHECK) ----
  const confirmPaymentMutation = useMutation({
    mutationFn: async ({ jobIds, reference }: { jobIds: string[]; reference?: string }) => {
      const res = await fetch('/api/hr/paie/confirm-payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds, reference }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur confirmation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.succeeded || 0;
      toast.success(`${count} paiement(s) confirmé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la confirmation');
    },
  });

  // ---- Retry Failed Payments ----
  const retryPaymentMutation = useMutation({
    mutationFn: async ({ jobIds }: { jobIds: string[] }) => {
      const res = await fetch('/api/hr/paie/retry-payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur relance');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.retried || 0;
      toast.success(`${count} paiement(s) relancé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la relance');
    },
  });

  // ---- Cancel Payments ----
  const cancelPaymentMutation = useMutation({
    mutationFn: async ({ jobIds }: { jobIds: string[] }) => {
      const res = await fetch('/api/hr/paie/cancel-payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur annulation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.cancelled || 0;
      toast.success(`${count} paiement(s) annulé(s)`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    },
  });

  // ---- Payment Jobs for a run ----
  function usePaymentJobs(runId: number | null) {
    return useQuery<SalaryPaymentJob[]>({
      queryKey: ['payment-jobs', runId],
      queryFn: async () => {
        if (!runId) return [];
        const res = await fetch(`/api/hr/paie/payment-jobs/${runId}`);
        if (!res.ok) throw new Error('Failed to fetch payment jobs');
        const json = await res.json();
        return json.data?.jobs || json.data || json;
      },
      enabled: !!runId,
    });
  }

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

    // Payment jobs
    schedulePay: schedulePayMutation.mutateAsync,
    isScheduling: schedulePayMutation.isPending,
    confirmPayment: confirmPaymentMutation.mutateAsync,
    isConfirming: confirmPaymentMutation.isPending,
    retryPayment: retryPaymentMutation.mutateAsync,
    isRetrying: retryPaymentMutation.isPending,
    cancelPayment: cancelPaymentMutation.mutateAsync,
    isCancelling: cancelPaymentMutation.isPending,
    usePaymentJobs,

    // Legacy compat (deprecated — use run-based operations)
    validateBulletins: async (bulletinIds: number[]) => {
      toast.error('Utilisez la validation par run');
    },
    payBulletins: async ({ bulletinIds, datePaiement }: { bulletinIds: number[]; datePaiement?: string }) => {
      toast.error('Utilisez le paiement par run');
    },
  };
}
