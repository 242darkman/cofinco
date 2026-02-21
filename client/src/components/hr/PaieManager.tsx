import React, { useState, useCallback, useMemo } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePaie, type PayrollRun, type BulletinPaie, type PayrollRunIssue } from '../../hooks/hr/usePaie';
import { Card, Button, ResponsiveTable, Badge, TabGroup } from '../ui';
import {
  FileText, Play, Download, Calculator, AlertCircle, Banknote, Settings, Eye,
  ShieldCheck, CreditCard, ArrowLeft, RefreshCw, AlertTriangle, Clock, RotateCcw,
  CheckCircle, Loader2, ChevronLeft, ChevronRight, Calendar
} from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { isAdminRole } from '@shared/types/roles';
import SalaryAdvances from './SalaryAdvances';
import PayrollConfigPanel from './PayrollConfigPanel';
import { PayslipViewer } from './PayslipViewer';
import TransferFileModal from './TransferFileModal';
import PaymentBatchManager from './PaymentBatchManager';
import BankReconciliationPanel from './BankReconciliationPanel';
import { formatMoney } from '../../lib/format';

// Status badge config
const RUN_STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  DRAFT: { variant: 'warning', label: 'Brouillon' },
  VALIDATED: { variant: 'info', label: 'Validé' },
  PAID: { variant: 'success', label: 'Payé' },
  CLOSED: { variant: 'success', label: 'Clôturé' },
  CANCELLED: { variant: 'danger', label: 'Annulé' },
};

export default function PaieManager() {
  const { hasPermission } = usePermissions();
  const canGeneratePaie = hasPermission('rh', 'edit') || hasPermission('paie', 'create');
  const canViewAllPaie = hasPermission('rh', 'view') || hasPermission('paie', 'view');
  const canValidate = hasPermission('rh', 'edit') || hasPermission('paie', 'approve');
  const canPay = hasPermission('rh', 'edit') || hasPermission('paie', 'manage');

  const { user } = useUserProfile();
  const {
    myBulletins, loadingMyBulletins,
    runs, loadingRuns,
    useRunDetail,
    generatePaie, isGenerating,
    validateRun, isValidating,
    payRun, isPaying,
    rerun, isRerunning,
  } = usePaie();

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const isRH = isAdminRole(user?.role) || canViewAllPaie || canGeneratePaie;
  const [activeTab, setActiveTab] = useState('my');

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

  // My bulletins: year filter + pagination
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [myPage, setMyPage] = useState(0);
  const MY_PAGE_SIZE = 12;

  // Available years from bulletins
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    for (const b of (myBulletins || []) as BulletinPaie[]) {
      const y = parseInt(b.mois?.split('-')[0]);
      if (!isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [myBulletins, currentYear]);

  // Filtered + sorted bulletins
  const filteredBulletins = useMemo(() => {
    return ((myBulletins || []) as BulletinPaie[])
      .filter(b => b.mois?.startsWith(String(selectedYear)))
      .sort((a, b) => b.mois.localeCompare(a.mois));
  }, [myBulletins, selectedYear]);

  const myTotalPages = Math.max(1, Math.ceil(filteredBulletins.length / MY_PAGE_SIZE));
  const paginatedBulletins = useMemo(
    () => filteredBulletins.slice(myPage * MY_PAGE_SIZE, (myPage + 1) * MY_PAGE_SIZE),
    [filteredBulletins, myPage]
  );

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

  // My bulletins columns
  const formatMoisLabel = (mois: string) => {
    const [year, month] = mois.split('-');
    const d = new Date(Number(year), Number(month) - 1);
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const myColumns = [
    { key: 'mois', label: 'Mois', primary: true, format: (val: string) => <span className="font-medium">{formatMoisLabel(val)}</span> },
    { key: 'salaireNet', label: 'Net à Payer', format: (val: string) => <span className="font-bold text-status-success">{formatMoney(val)}</span> },
    { key: 'statut', label: 'Statut', format: (val: string) => {
      const cfg = RUN_STATUS_CONFIG[val] || { variant: 'warning' as const, label: val };
      return <Badge variant={cfg.variant} value={cfg.label} />;
    }},
    { key: 'actions', label: '', format: (_val: any, item: BulletinPaie) => (
      <Button variant="ghost" size="sm" icon={Eye} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewerBulletinId(item.id); }}>
        Voir
      </Button>
    )},
  ];

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
    { key: 'my', label: 'Mes Bulletins', icon: FileText },
    ...(isRH ? [
      { key: 'generate', label: 'Gestion Paie', icon: Calculator },
      { key: 'virements', label: 'Virements', icon: CreditCard },
      { key: 'avances', label: 'Avances', icon: Banknote },
      { key: 'config', label: 'Configuration', icon: Settings },
    ] : [])
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
          <Loader2 className="animate-spin text-status-success" size={24} />
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
              <Button size="sm" variant="outline" icon={CreditCard} onClick={() => handlePayRun(run.id)} isLoading={isPaying}
                className="h-7 text-[11px] border-status-success/50 text-status-success hover:bg-status-success-bg">
                Payer le Run
              </Button>
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
          <div className="p-3 border-b border-edge">
            <h4 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <FileText size={16} className="text-status-info" />
              Bulletins ({bulletins.length})
            </h4>
          </div>
          {bulletins.length > 0 ? (
            <ResponsiveTable
              data={bulletins}
              columns={[
                { key: 'employeNom', label: 'Employé', primary: true },
                { key: 'salaireBaseSnapshot', label: 'Base', hideOnMobile: true, format: (val: number) => <span className="font-mono text-content-secondary">{formatMoney(val)}</span> },
                { key: 'salaireBrut', label: 'Brut', hideOnMobile: true, format: (val: string) => <span className="font-mono text-content-secondary">{formatMoney(val)}</span> },
                { key: 'salaireNet', label: 'Net', format: (val: string) => <span className="font-bold text-status-success">{formatMoney(val)}</span> },
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
                      <Loader2 className="animate-spin text-content-muted" size={20} />
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
      ) : (
        /* Mes Bulletins tab */
        <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col">
          <div className="shrink-0 p-2 border-b border-edge flex justify-between items-center bg-surface-base/50">
            <h3 className="font-bold text-content-primary flex items-center gap-2 text-xs">
              <FileText size={14} className="text-accent" />
              Mes Bulletins
            </h3>
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-content-muted" />
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); setMyPage(0); }}
                className="bg-surface border border-edge rounded text-xs text-content-primary px-2 py-1 outline-none focus:ring-1 focus:ring-accent/50"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ResponsiveTable
              data={paginatedBulletins}
              columns={myColumns}
              emptyMessage={`Aucun bulletin pour ${selectedYear}.`}
              loading={loadingMyBulletins}
              maxHeight="100%"
              density="compact"
              className="border-0 rounded-none h-full"
              headerClassName="bg-surface-base sticky top-0"
              onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
            />
          </div>
          {filteredBulletins.length > MY_PAGE_SIZE && (
            <div className="shrink-0 px-3 py-1.5 border-t border-edge flex items-center justify-between bg-surface-base/50">
              <span className="text-[10px] text-content-muted">
                {filteredBulletins.length} bulletin{filteredBulletins.length > 1 ? 's' : ''} en {selectedYear}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMyPage(p => Math.max(0, p - 1))}
                  disabled={myPage === 0}
                  className="p-0.5 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[10px] text-content-muted font-mono px-1">
                  {myPage + 1}/{myTotalPages}
                </span>
                <button
                  onClick={() => setMyPage(p => Math.min(myTotalPages - 1, p + 1))}
                  disabled={myPage >= myTotalPages - 1}
                  className="p-0.5 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
