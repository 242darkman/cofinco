import React, { useState, useCallback, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePaie, type PayrollRun, type BulletinPaie, type PayrollRunIssue, type SalaryPaymentJob } from '../../hooks/hr/usePaie';
import { Card, Button, ResponsiveTable, Badge, TabGroup } from '../ui';
import { FileText, Play, Download, Calculator, AlertCircle, Banknote, Settings, Eye, ShieldCheck, CreditCard, ArrowLeft, RefreshCw, AlertTriangle, Clock, RotateCcw, CheckCircle, XCircle, RotateCw, Smartphone, CalendarClock } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import SalaryAdvances from './SalaryAdvances';
import PayrollConfigPanel from './PayrollConfigPanel';
import { PayslipViewer } from './PayslipViewer';
import TransferFileModal from './TransferFileModal';
import PaymentBatchManager from './PaymentBatchManager';
import BankReconciliationPanel from './BankReconciliationPanel';
import { formatMoney } from '../../lib/format';
import { useHrRealtime } from '../../hooks/hr/useHrRealtime';

// Status badge config
const RUN_STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  DRAFT: { variant: 'warning', label: 'Brouillon' },
  VALIDATED: { variant: 'info', label: 'Validé' },
  PAID: { variant: 'success', label: 'Payé' },
  CLOSED: { variant: 'success', label: 'Clôturé' },
  CANCELLED: { variant: 'danger', label: 'Annulé' },
};

const BULLETIN_STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  DRAFT: { variant: 'warning', label: 'Brouillon' },
  VALIDATED: { variant: 'info', label: 'Validé' },
  SCHEDULED: { variant: 'info', label: 'Programmé' },
  PENDING_CAISSE: { variant: 'warning', label: 'Attente caisse' },
  PAYOUT_PENDING: { variant: 'warning', label: 'Paiement en attente' },
  PAYOUT_PROCESSING: { variant: 'info', label: 'Paiement en cours' },
  PAID: { variant: 'success', label: 'Payé' },
  PAYMENT_FAILED: { variant: 'danger', label: 'Échec paiement' },
  CANCELLED: { variant: 'danger', label: 'Annulé' },
};

const JOB_STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  CREATED: { variant: 'warning', label: 'Créé' },
  SCHEDULED: { variant: 'info', label: 'Programmé' },
  QUEUED: { variant: 'warning', label: 'En file' },
  PROCESSING: { variant: 'info', label: 'En cours' },
  SUCCEEDED: { variant: 'success', label: 'Réussi' },
  FAILED: { variant: 'danger', label: 'Échoué' },
  CANCELLED: { variant: 'danger', label: 'Annulé' },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  TRANSFER: 'Virement',
  CHECK: 'Chèque',
};

export default function PaieManager() {
  const { hasPermission } = usePermissions();
  const canGeneratePaie = hasPermission('rh', 'edit') || hasPermission('paie', 'create');
  const canViewAllPaie = hasPermission('rh', 'view') || hasPermission('paie', 'view');
  const canValidate = hasPermission('rh', 'edit') || hasPermission('paie', 'approve');
  const canPay = hasPermission('rh', 'edit') || hasPermission('paie', 'manage');

  const { user } = useUserProfile();
  const {
    runs, loadingRuns,
    useRunDetail,
    generatePaie, isGenerating,
    validateRun, isValidating,
    payRun, isPaying,
    rerun, isRerunning,
    confirmPayment, isConfirming,
    retryPayment, isRetrying,
    cancelPayment, isCancelling,
    schedulePay, isScheduling,
    usePaymentJobs,
  } = usePaie();

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { isAdmin } = usePermissions();
  const isRH = isAdmin || canViewAllPaie || canGeneratePaie;
  const [activeTab, setActiveTab] = useState('generate');

  // Run detail
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const { data: runDetail, isLoading: loadingDetail } = useRunDetail(selectedRunId);

  // PayslipViewer state
  const [viewerBulletinId, setViewerBulletinId] = useState<number | null>(null);

  // Transfer file modal
  const [transferRunId, setTransferRunId] = useState<number | null>(null);

  // Re-run dialog
  const [rerunDialogOpen, setRerunDialogOpen] = useState(false);
  const [rerunTargetId, setRerunTargetId] = useState<number | null>(null);
  const [rerunReason, setRerunReason] = useState('');

  // Schedule dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleTargetId, setScheduleTargetId] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  // Payment jobs
  const { data: paymentJobs = [], isLoading: loadingJobs } = usePaymentJobs(selectedRunId);
  const [showPaymentJobs, setShowPaymentJobs] = useState(false);

  // Confirm payment dialog (for TRANSFER/CHECK reference)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmJobIds, setConfirmJobIds] = useState<string[]>([]);
  const [confirmReference, setConfirmReference] = useState('');

  // Real-time WebSocket subscription
  useHrRealtime({ entities: ['salary_payment'], showToasts: true });

  // Filter runs by selected month, sorted by version desc
  const runsDuMois = useMemo(
    () => (runs as PayrollRun[])
      .filter(r => r.period === selectedMonth)
      .sort((a, b) => b.version - a.version),
    [runs, selectedMonth]
  );

  const handleGenerate = async () => {
    try {
      await generatePaie(selectedMonth);
    } catch (e) {
      // handled in hook
    }
  };

  const handleValidateRun = async (runId: number) => {
    try {
      await validateRun(runId);
    } catch (e) { /* handled */ }
  };

  const handlePayRun = async (runId: number) => {
    try {
      await payRun({ runId });
    } catch (e) { /* handled */ }
  };

  const handleRerunOpen = (runId: number) => {
    setRerunTargetId(runId);
    setRerunReason('');
    setRerunDialogOpen(true);
  };

  const handleRerunSubmit = async () => {
    if (!rerunTargetId || !rerunReason.trim()) {
      toast.warning('Veuillez saisir un motif de re-run');
      return;
    }
    try {
      await rerun({ runId: rerunTargetId, reason: rerunReason.trim() });
      setRerunDialogOpen(false);
      setSelectedRunId(null);
    } catch (e) { /* handled */ }
  };

  const handleScheduleOpen = (runId: number) => {
    setScheduleTargetId(runId);
    setScheduleDate('');
    setScheduleDialogOpen(true);
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleTargetId || !scheduleDate) {
      toast.warning('Veuillez sélectionner une date');
      return;
    }
    try {
      await schedulePay({ runId: scheduleTargetId, scheduledAt: new Date(scheduleDate).toISOString() });
      setScheduleDialogOpen(false);
    } catch (e) { /* handled */ }
  };

  const handleConfirmOpen = (jobIds: string[]) => {
    setConfirmJobIds(jobIds);
    setConfirmReference('');
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    try {
      await confirmPayment({ jobIds: confirmJobIds, reference: confirmReference.trim() || undefined });
      setConfirmDialogOpen(false);
    } catch (e) { /* handled */ }
  };

  const handleRetryJobs = async (jobIds: string[]) => {
    try {
      await retryPayment({ jobIds });
    } catch (e) { /* handled */ }
  };

  const handleCancelJobs = async (jobIds: string[]) => {
    try {
      await cancelPayment({ jobIds });
    } catch (e) { /* handled */ }
  };

  // Export CSV for a run's bulletins
  const handleExportRun = useCallback((bulletins: BulletinPaie[]) => {
    if (!bulletins || bulletins.length === 0) {
      toast.warning('Aucun bulletin à exporter.');
      return;
    }
    const headers = ['Mois', 'Employé', 'Salaire Base', 'Salaire Brut', 'Charges Sal.', 'IRPP', 'Net', 'Statut'];
    const rows = bulletins.map(b => [
      b.mois, `"${b.employeNom}"`, b.salaireBaseSnapshot, b.salaireBrut,
      b.totalChargesSalariales, b.irpp, b.salaireNet, b.statut
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `paie_run_${selectedMonth}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export CSV téléchargé');
  }, [selectedMonth]);

  // Runs list columns
  const runColumns = [
    { key: 'period', label: 'Période', primary: true, format: (val: string) => <span className="font-mono font-medium">{val}</span> },
    { key: 'version', label: 'V.', format: (val: number) => <span className="font-mono text-xs text-content-muted">v{val}</span> },
    { key: 'status', label: 'Statut', format: (val: string) => {
      const cfg = RUN_STATUS_CONFIG[val] || { variant: 'warning' as const, label: val };
      return <Badge variant={cfg.variant} value={cfg.label} />;
    }},
    { key: 'employeeCount', label: 'Employés', hideOnMobile: true, format: (val: number) => <span className="text-content-secondary">{val}</span> },
    { key: 'totalNet', label: 'Net Total', format: (val: string) => <span className="font-bold text-status-success">{formatMoney(val)}</span> },
    { key: 'issueCount', label: '', hideOnMobile: true, format: (val: number) => val > 0 ? (
      <span className="flex items-center gap-1 text-status-warning text-xs"><AlertTriangle size={12} />{val}</span>
    ) : null },
  ];

  // Virements tab state
  const [virementsRunId, setVirementsRunId] = useState<number | null>(null);

  const tabs = [
    { key: 'generate', label: 'Gestion Paie', icon: Calculator },
    { key: 'virements', label: 'Virements', icon: CreditCard },
    { key: 'avances', label: 'Avances', icon: Banknote },
    { key: 'config', label: 'Configuration', icon: Settings },
  ];

  // ---- Run Detail View ----
  const renderRunDetail = () => {
    if (!selectedRunId) return null;
    const detail = runDetail as { run?: PayrollRun; bulletins?: BulletinPaie[]; issues?: PayrollRunIssue[] } | null;
    const run = detail?.run;
    const bulletins = detail?.bulletins || [];
    const issues = detail?.issues || [];

    if (loadingDetail) {
      return (
        <div className="flex items-center justify-center py-20">
          <Spinner size="sm" tone="accent" />
          <span className="ml-2 text-content-muted text-sm">Chargement du run...</span>
        </div>
      );
    }

    if (!run) {
      return <div className="text-center py-10 text-content-muted text-sm">Run introuvable.</div>;
    }

    const statusCfg = RUN_STATUS_CONFIG[run.status] || { variant: 'warning' as const, label: run.status };
    const hasBlockingIssues = issues.some(i => i.severity === 'BLOCKING' && !i.resolved);

    return (
      <div className="space-y-3">
        {/* Back + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button
            onClick={() => setSelectedRunId(null)}
            className="flex items-center gap-1 text-sm text-content-muted hover:text-content-primary transition-colors"
          >
            <ArrowLeft size={16} /> Retour aux runs
          </button>
          <div className="flex items-center gap-2">
            {run.status === 'DRAFT' && canValidate && !hasBlockingIssues && (
              <Button size="sm" variant="outline" icon={ShieldCheck} onClick={() => handleValidateRun(run.id)} isLoading={isValidating}
                className="h-7 text-[11px] border-status-info/50 text-status-info hover:bg-status-info-bg">
                Valider le Run
              </Button>
            )}
            {run.status === 'VALIDATED' && canPay && (
              <>
                <Button size="sm" variant="outline" icon={CreditCard} onClick={() => handlePayRun(run.id)} isLoading={isPaying}
                  className="h-7 text-[11px] border-status-success/50 text-status-success hover:bg-status-success-bg">
                  Payer
                </Button>
                <Button size="sm" variant="outline" icon={CalendarClock} onClick={() => handleScheduleOpen(run.id)} isLoading={isScheduling}
                  className="h-7 text-[11px] border-status-info/50 text-status-info hover:bg-status-info-bg">
                  Programmer
                </Button>
              </>
            )}
            {['DRAFT', 'VALIDATED', 'PAID'].includes(run.status) && canGeneratePaie && (
              <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => handleRerunOpen(run.id)} isLoading={isRerunning}
                className="h-7 text-[11px] border-status-warning/50 text-status-warning hover:bg-status-warning-bg">
                Re-run
              </Button>
            )}
            {['VALIDATED', 'PAID'].includes(run.status) && (
              <Button size="sm" variant="outline" icon={Banknote} onClick={() => setTransferRunId(run.id)}
                className="h-7 text-[11px] border-accent/50 text-accent hover:bg-accent/10">
                Virement
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={Download} onClick={() => handleExportRun(bulletins)} className="h-7 text-[11px]">
              CSV
            </Button>
          </div>
        </div>

        {/* Run summary card */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-status-info to-status-success flex items-center justify-center">
                <Calculator size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-content-primary text-sm">
                  Run {run.period} <span className="text-content-muted font-normal text-xs">v{run.version}</span>
                </h3>
                <p className="text-xs text-content-muted">
                  {run.employeeCount} employé(s) • Créé le {new Date(run.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={statusCfg.variant} value={statusCfg.label} />
              <div className="text-right">
                <div className="text-xs text-content-muted">Net total</div>
                <div className="font-bold text-status-success font-mono">{formatMoney(run.totalNet)}</div>
              </div>
            </div>
          </div>
          {/* Totals row */}
          <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-edge-subtle">
            <div>
              <div className="text-[10px] text-content-muted uppercase">Brut</div>
              <div className="font-mono text-sm text-content-primary">{formatMoney(run.totalBrut)}</div>
            </div>
            <div>
              <div className="text-[10px] text-content-muted uppercase">Charges Sal.</div>
              <div className="font-mono text-sm text-status-danger">{formatMoney(run.totalChargesSalariales)}</div>
            </div>
            <div>
              <div className="text-[10px] text-content-muted uppercase">Charges Pat.</div>
              <div className="font-mono text-sm text-content-muted">{formatMoney(run.totalChargesPatronales)}</div>
            </div>
            <div>
              <div className="text-[10px] text-content-muted uppercase">Net</div>
              <div className="font-mono text-sm text-status-success font-bold">{formatMoney(run.totalNet)}</div>
            </div>
          </div>
          {run.rerunReason && (
            <div className="mt-2 px-2 py-1 bg-status-warning-bg border border-status-warning/20 rounded text-xs text-status-warning flex items-center gap-1">
              <RefreshCw size={12} /> Re-run de v{(run.version || 1) - 1}: {run.rerunReason}
            </div>
          )}
        </Card>

        {/* Issues */}
        {issues.length > 0 && (
          <Card padding="sm" className="bg-status-warning-bg border-status-warning/20">
            <h4 className="text-xs font-bold text-status-warning flex items-center gap-1 mb-2">
              <AlertTriangle size={14} />
              Alertes ({issues.length})
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {issues.map((issue) => (
                <div key={issue.id} className={`text-xs px-2 py-1 rounded flex items-center gap-2 ${
                  issue.severity === 'BLOCKING'
                    ? 'bg-status-danger-bg text-status-danger'
                    : 'bg-status-warning-bg text-status-warning'
                }`}>
                  {issue.severity === 'BLOCKING' ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
                  <span className="flex-1">{issue.message}</span>
                  {issue.resolved && <CheckCircle size={12} className="text-status-success" />}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Bulletins table */}
        <Card padding="none" className="bg-surface-base/50 border-edge">
          <div className="p-3 border-b border-edge flex items-center justify-between">
            <h4 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <FileText size={16} className="text-status-info" />
              Bulletins ({bulletins.length})
            </h4>
            {(paymentJobs as SalaryPaymentJob[]).length > 0 && (
              <button
                onClick={() => setShowPaymentJobs(!showPaymentJobs)}
                className="text-[10px] text-accent hover:underline"
              >
                {showPaymentJobs ? 'Masquer paiements' : `Suivi paiements (${(paymentJobs as SalaryPaymentJob[]).length})`}
              </button>
            )}
          </div>
          {bulletins.length > 0 ? (
            <ResponsiveTable
              data={bulletins}
              columns={[
                { key: 'employeNom', label: 'Employé', primary: true },
                { key: 'salaireBaseSnapshot', label: 'Base', hideOnMobile: true, format: (val: number) => <span className="font-mono text-content-secondary">{formatMoney(val)}</span> },
                { key: 'salaireBrut', label: 'Brut', hideOnMobile: true, format: (val: string) => <span className="font-mono text-content-secondary">{formatMoney(val)}</span> },
                { key: 'salaireNet', label: 'Net', format: (val: string) => <span className="font-bold text-status-success">{formatMoney(val)}</span> },
                { key: 'statut', label: 'Statut', format: (val: string) => {
                  const cfg = BULLETIN_STATUS_CONFIG[val] || { variant: 'warning' as const, label: val };
                  return (
                    <span className={val === 'PAYOUT_PROCESSING' ? 'animate-pulse' : ''}>
                      <Badge variant={cfg.variant} value={cfg.label} size="xs" />
                    </span>
                  );
                }},
                { key: 'actions', label: '', format: (_val: any, item: BulletinPaie) => (
                  <Button variant="ghost" size="sm" icon={Eye} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewerBulletinId(item.id); }} />
                )},
              ]}
              emptyMessage="Aucun bulletin."
              density="compact"
              maxHeight="400px"
              className="border-0 rounded-none"
              headerClassName="bg-surface-base sticky top-0"
              onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
            />
          ) : (
            <div className="text-center py-8 text-content-muted text-xs">
              Aucun bulletin dans ce run.
            </div>
          )}
        </Card>

        {/* Failed Payments Panel */}
        {(() => {
          const failedJobs = (paymentJobs as SalaryPaymentJob[]).filter(j => j.status === 'FAILED');
          if (failedJobs.length === 0) return null;
          return (
            <Card padding="none" className="bg-status-danger-bg border-status-danger/30">
              <div className="p-3 border-b border-status-danger/20 flex items-center justify-between">
                <h4 className="text-sm font-bold text-status-danger flex items-center gap-2">
                  <AlertCircle size={16} />
                  Paiements en échec ({failedJobs.length})
                </h4>
                {canPay && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" icon={RotateCw}
                      onClick={() => handleRetryJobs(failedJobs.map(j => j.id))} isLoading={isRetrying}
                      className="h-6 text-[10px] border-status-warning/50 text-status-warning hover:bg-status-warning-bg">
                      Relancer tout
                    </Button>
                    <Button size="sm" variant="outline" icon={XCircle}
                      onClick={() => handleCancelJobs(failedJobs.map(j => j.id))} isLoading={isCancelling}
                      className="h-6 text-[10px] border-status-danger/50 text-status-danger hover:bg-status-danger-bg">
                      Annuler tout
                    </Button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-status-danger/10 max-h-48 overflow-y-auto">
                {failedJobs.map((job) => (
                  <div key={job.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-content-primary truncate">{job.employeNom || job.employeId}</div>
                      <div className="text-status-danger text-[10px] mt-0.5 truncate" title={job.failureReason || ''}>
                        {job.failureReason || 'Erreur inconnue'}
                        {job.failureCode && <span className="ml-1 opacity-60">({job.failureCode})</span>}
                      </div>
                      <div className="text-content-muted text-[10px]">
                        {PAYMENT_METHOD_LABELS[job.paymentMethod] || job.paymentMethod}
                        {job.operator && ` • ${job.operator}`}
                        {` • Tentative ${job.retryCount}/${job.maxRetries}`}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-content-primary whitespace-nowrap">
                      {formatMoney(job.amount)}
                    </div>
                    {canPay && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" icon={RotateCw}
                          onClick={() => handleRetryJobs([job.id])} isLoading={isRetrying}
                          className="h-6 text-[10px] text-status-warning" title="Relancer">
                        </Button>
                        <Button variant="ghost" size="sm" icon={XCircle}
                          onClick={() => handleCancelJobs([job.id])} isLoading={isCancelling}
                          className="h-6 text-[10px] text-status-danger" title="Annuler">
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* Payment Jobs Panel */}
        {showPaymentJobs && (paymentJobs as SalaryPaymentJob[]).length > 0 && (
          <Card padding="none" className="bg-surface-base/50 border-edge">
            <div className="p-3 border-b border-edge">
              <h4 className="text-sm font-bold text-content-primary flex items-center gap-2">
                <Smartphone size={16} className="text-accent" />
                Suivi des paiements
              </h4>
            </div>
            <div className="divide-y divide-edge-subtle max-h-80 overflow-y-auto">
              {(paymentJobs as SalaryPaymentJob[]).map((job) => {
                const statusCfg = JOB_STATUS_CONFIG[job.status] || { variant: 'warning' as const, label: job.status };
                return (
                  <div key={job.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-content-primary truncate">{job.employeNom || job.employeId}</div>
                      <div className="text-content-muted">
                        {PAYMENT_METHOD_LABELS[job.paymentMethod] || job.paymentMethod}
                        {job.operator && ` • ${job.operator}`}
                        {job.scheduledAt && ` • ${new Date(job.scheduledAt).toLocaleDateString('fr-FR')}`}
                      </div>
                      {job.failureReason && (
                        <div className="text-status-danger text-[10px] mt-0.5 truncate" title={job.failureReason}>
                          {job.failureReason}
                        </div>
                      )}
                      {job.feeAmount && Number(job.feeAmount) > 0 && (
                        <div className="text-content-muted text-[10px] mt-0.5">
                          Frais: {formatMoney(job.feeAmount)} • Net reçu: {formatMoney(job.montantNet || job.amount)}
                          {job.feeOption === 'EMPLOYEE_PAYS' && (
                            <span className="text-status-warning ml-1">(déduit du net)</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="font-mono font-bold text-content-primary whitespace-nowrap">
                      {formatMoney(job.amount)}
                    </div>
                    <span className={job.status === 'PROCESSING' ? 'animate-pulse' : ''}>
                      <Badge variant={statusCfg.variant} value={statusCfg.label} size="xs" />
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {job.status === 'PROCESSING' && ['TRANSFER', 'CHECK'].includes(job.paymentMethod) && canPay && (
                        <Button variant="ghost" size="sm" icon={CheckCircle}
                          onClick={() => handleConfirmOpen([job.id])}
                          className="h-6 text-[10px] text-status-success" title="Confirmer">
                        </Button>
                      )}
                      {job.status === 'FAILED' && canPay && (
                        <Button variant="ghost" size="sm" icon={RotateCw}
                          onClick={() => handleRetryJobs([job.id])} isLoading={isRetrying}
                          className="h-6 text-[10px] text-status-warning" title="Relancer">
                        </Button>
                      )}
                      {['CREATED', 'SCHEDULED', 'QUEUED'].includes(job.status) && canPay && (
                        <Button variant="ghost" size="sm" icon={XCircle}
                          onClick={() => handleCancelJobs([job.id])} isLoading={isCancelling}
                          className="h-6 text-[10px] text-status-danger" title="Annuler">
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Tab Navigation */}
      {isRH && (
        <div className="shrink-0 w-full sm:w-auto mt-0.5">
          <TabGroup
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tab) => { setActiveTab(tab); setSelectedRunId(null); }}
            variant="pills"
            size="sm"
            className="mb-1"
          />
        </div>
      )}

      {activeTab === 'config' && isRH ? (
        <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg overflow-y-auto">
          <PayrollConfigPanel />
        </div>
      ) : activeTab === 'virements' && isRH ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pl-1 pr-2 pb-2">
          {/* Run selector for batch management */}
          <Card padding="sm" className="bg-surface/80 border-edge">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
                  <CreditCard size={16} className="text-accent" />
                  Gestion des Virements
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Suivi des lots de paiement et rapprochement bancaire
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-content-muted">Run de paie:</label>
                <select
                  value={virementsRunId ?? ''}
                  onChange={(e) => setVirementsRunId(e.target.value ? Number(e.target.value) : null)}
                  className="px-3 py-1.5 bg-input border border-input-border rounded-lg text-sm text-content-primary focus:border-input-focus outline-none"
                >
                  <option value="">Sélectionner un run</option>
                  {(runs as PayrollRun[])
                    .filter(r => ['VALIDATED', 'PAID', 'CLOSED'].includes(r.status))
                    .sort((a, b) => b.period.localeCompare(a.period) || b.version - a.version)
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.period} v{r.version} — {formatMoney(r.totalNet)} ({RUN_STATUS_CONFIG[r.status]?.label || r.status})
                      </option>
                    ))
                  }
                </select>
              </div>
            </div>
          </Card>

          {virementsRunId && (
            <PaymentBatchManager runId={virementsRunId} />
          )}

          <BankReconciliationPanel />
        </div>
      ) : activeTab === 'avances' && isRH ? (
        <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col overflow-hidden">
          <SalaryAdvances />
        </div>
      ) : activeTab === 'generate' && isRH ? (
        <div className="flex-1 overflow-y-auto min-h-0 pl-1 pr-2 pb-2">
          {selectedRunId ? (
            renderRunDetail()
          ) : (
            <div className="space-y-3">
              {/* Generation Card */}
              <Card variant="default" padding="sm" className="relative overflow-hidden bg-surface/80 border-edge">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <Calculator size={80} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 p-2">
                  <div className="flex-1 space-y-1">
                    <h3 className="text-base font-bold text-content-primary flex items-center gap-2">
                      <Play className="text-status-success" size={18} />
                      Génération de la Paie
                    </h3>
                    <p className="text-xs text-content-muted">Sélectionnez le mois et lancez un run de paie</p>
                    <input
                      type="month"
                      className="mt-2 w-full max-w-xs px-3 py-2 border rounded text-sm bg-surface-base border-edge text-content-primary focus:ring-1 focus:ring-status-success/50 outline-none font-mono"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    />
                  </div>
                  <div className="shrink-0">
                    <Button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      variant="success"
                      size="sm"
                      className="shadow-lg shadow-status-success/10 h-9"
                      icon={Play}
                      isLoading={isGenerating}
                    >
                      Lancer le Traitement
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Runs table */}
              <Card padding="none" className="bg-surface-base/50 border-edge flex flex-col">
                <div className="p-3 border-b border-edge flex items-center justify-between">
                  <h4 className="text-sm font-bold text-content-primary flex items-center gap-2">
                    <Clock size={16} className="text-status-info" />
                    Runs de paie — {selectedMonth}
                  </h4>
                  {runsDuMois.length > 0 && (
                    <span className="text-[10px] text-content-muted">{runsDuMois.length} run(s)</span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  {loadingRuns ? (
                    <div className="flex items-center justify-center py-10">
                      <Spinner size="sm" tone="current" className="text-content-muted" />
                    </div>
                  ) : runsDuMois.length > 0 ? (
                    <ResponsiveTable
                      data={runsDuMois}
                      columns={runColumns}
                      emptyMessage="Aucun run pour ce mois."
                      density="compact"
                      maxHeight="300px"
                      className="border-0 rounded-none"
                      headerClassName="bg-surface-base sticky top-0"
                      onRowClick={(item: PayrollRun) => setSelectedRunId(item.id)}
                    />
                  ) : (
                    <div className="text-center py-8 text-content-muted text-xs">
                      Aucun run généré pour {selectedMonth}. Cliquez sur "Lancer le Traitement".
                    </div>
                  )}
                </div>
              </Card>

              {/* Info cards */}
              <div className="grid lg:grid-cols-2 gap-3">
                <Card variant="glass" className="bg-gradient-to-br from-status-info/10 to-surface-base/40 border-edge" padding="sm">
                  <div className="flex items-center gap-2 font-bold text-status-info text-xs uppercase tracking-wide mb-3">
                    <AlertCircle size={14} />
                    Cycle de Paie
                  </div>
                  <div className="space-y-2">
                    {[
                      ['1', 'Génération', 'crée un run en Brouillon avec tous les bulletins'],
                      ['2', 'Validation', 'poste les écritures GL d\'engagement (ventilées OHADA)'],
                      ['3', 'Paiement', 'marque comme payé + écriture GL de décaissement'],
                      ['4', 'Re-run', 'contrepasse le GL existant et recalcule (v+1)'],
                    ].map(([n, title, desc]) => (
                      <div key={n} className="flex gap-2 text-xs text-content-secondary">
                        <span className="text-status-info font-bold">{n}.</span>
                        <p><span className="text-content-primary font-medium">{title}</span> — {desc}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="bg-status-success-bg border-status-success/20" padding="sm">
                  <div className="flex items-start gap-2">
                    <Download className="text-status-success mt-0.5" size={16} />
                    <div className="flex-1">
                      <h4 className="font-bold text-content-primary text-xs">Export Comptable</h4>
                      <p className="text-[10px] text-status-success/70 mt-0.5 mb-2">Sélectionnez un run pour exporter les bulletins au format CSV.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Re-run Dialog */}
      {rerunDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-edge rounded-lg p-5 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2 mb-3">
              <RotateCcw size={16} className="text-status-warning" />
              Re-run de paie
            </h3>
            <p className="text-xs text-content-muted mb-3">
              Le run actuel sera annulé et les écritures GL seront contrepassées. Un nouveau run sera généré avec recalcul complet.
            </p>
            <label className="block text-xs text-content-secondary mb-1 font-medium">Motif du re-run *</label>
            <textarea
              className="w-full px-3 py-2 bg-surface-base border border-edge-strong rounded text-sm text-content-primary placeholder-content-muted focus:ring-1 focus:ring-status-warning/50 outline-none resize-none"
              rows={3}
              placeholder="Ex: Correction prime ancienneté employé X..."
              value={rerunReason}
              onChange={(e) => setRerunReason(e.target.value)}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setRerunDialogOpen(false)}>Annuler</Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleRerunSubmit}
                isLoading={isRerunning}
                disabled={!rerunReason.trim() || isRerunning}
                className="bg-status-warning hover:bg-status-warning"
              >
                Confirmer le Re-run
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Dialog */}
      {scheduleDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-edge rounded-lg p-5 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2 mb-3">
              <CalendarClock size={16} className="text-status-info" />
              Programmer le paiement
            </h3>
            <p className="text-xs text-content-muted mb-3">
              Les paiements seront déclenchés automatiquement à la date choisie.
            </p>
            <label className="block text-xs text-content-secondary mb-1 font-medium">Date et heure *</label>
            <input
              type="datetime-local"
              className="w-full px-3 py-2 bg-surface-base border border-edge-strong rounded text-sm text-content-primary focus:ring-1 focus:ring-status-info/50 outline-none"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setScheduleDialogOpen(false)}>Annuler</Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleScheduleSubmit}
                isLoading={isScheduling}
                disabled={!scheduleDate || isScheduling}
                className="bg-status-info hover:bg-status-info"
              >
                Programmer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Payment Dialog (TRANSFER/CHECK reference) */}
      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-edge rounded-lg p-5 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-status-success" />
              Confirmer le paiement
            </h3>
            <p className="text-xs text-content-muted mb-3">
              Confirmez que le virement ou chèque a été effectué pour {confirmJobIds.length} paiement(s).
            </p>
            <label className="block text-xs text-content-secondary mb-1 font-medium">
              Référence bancaire <span className="text-content-muted font-normal">(optionnel)</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-surface-base border border-edge-strong rounded text-sm text-content-primary placeholder-content-muted focus:ring-1 focus:ring-status-success/50 outline-none"
              placeholder="Ex: VIR-2026-02-001, CHQ-4521..."
              value={confirmReference}
              onChange={(e) => setConfirmReference(e.target.value)}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDialogOpen(false)}>Annuler</Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleConfirmSubmit}
                isLoading={isConfirming}
                className="bg-status-success hover:bg-status-success"
              >
                Confirmer le paiement
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PayslipViewer Modal */}
      <PayslipViewer
        isOpen={viewerBulletinId !== null}
        onClose={() => setViewerBulletinId(null)}
        bulletinId={viewerBulletinId}
      />

      {/* Transfer File Modal */}
      <TransferFileModal
        isOpen={transferRunId !== null}
        onClose={() => setTransferRunId(null)}
        runId={transferRunId}
      />
    </div>
  );
}
