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
    { key: 'salaireNet', label: 'Net à Payer', format: (val: string) => <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(val)}</span> },
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
    { key: 'version', label: 'V.', format: (val: number) => <span className="font-mono text-xs text-slate-400">v{val}</span> },
    { key: 'status', label: 'Statut', format: (val: string) => {
      const cfg = RUN_STATUS_CONFIG[val] || { variant: 'warning' as const, label: val };
      return <Badge variant={cfg.variant} value={cfg.label} />;
    }},
    { key: 'employeeCount', label: 'Employés', hideOnMobile: true, format: (val: number) => <span className="text-slate-300">{val}</span> },
    { key: 'totalNet', label: 'Net Total', format: (val: string) => <span className="font-bold text-emerald-400">{formatMoney(val)}</span> },
    { key: 'issueCount', label: '', hideOnMobile: true, format: (val: number) => val > 0 ? (
      <span className="flex items-center gap-1 text-amber-400 text-xs"><AlertTriangle size={12} />{val}</span>
    ) : null },
  ];

  const tabs = [
    { key: 'my', label: 'Mes Bulletins', icon: FileText },
    ...(isRH ? [
      { key: 'generate', label: 'Gestion Paie', icon: Calculator },
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
          <Loader2 className="animate-spin text-emerald-500" size={24} />
          <span className="ml-2 text-slate-400 text-sm">Chargement du run...</span>
        </div>
      );
    }

    if (!run) {
      return <div className="text-center py-10 text-slate-500 text-sm">Run introuvable.</div>;
    }

    const statusCfg = RUN_STATUS_CONFIG[run.status] || { variant: 'warning' as const, label: run.status };
    const hasBlockingIssues = issues.some(i => i.severity === 'BLOCKING' && !i.resolved);

    return (
      <div className="space-y-3">
        {/* Back + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button
            onClick={() => setSelectedRunId(null)}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> Retour aux runs
          </button>
          <div className="flex items-center gap-2">
            {run.status === 'DRAFT' && canValidate && !hasBlockingIssues && (
              <Button size="sm" variant="outline" icon={ShieldCheck} onClick={() => handleValidateRun(run.id)} isLoading={isValidating}
                className="h-7 text-[11px] border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                Valider le Run
              </Button>
            )}
            {run.status === 'VALIDATED' && canPay && (
              <Button size="sm" variant="outline" icon={CreditCard} onClick={() => handlePayRun(run.id)} isLoading={isPaying}
                className="h-7 text-[11px] border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10">
                Payer le Run
              </Button>
            )}
            {['DRAFT', 'VALIDATED', 'PAID'].includes(run.status) && canGeneratePaie && (
              <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => handleRerunOpen(run.id)} isLoading={isRerunning}
                className="h-7 text-[11px] border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
                Re-run
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={Download} onClick={() => handleExportRun(bulletins)} className="h-7 text-[11px]">
              CSV
            </Button>
          </div>
        </div>

        {/* Run summary card */}
        <Card padding="sm" className="bg-slate-800/80 border-slate-700">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center">
                <Calculator size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">
                  Run {run.period} <span className="text-slate-400 font-normal text-xs">v{run.version}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {run.employeeCount} employé(s) • Créé le {new Date(run.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={statusCfg.variant} value={statusCfg.label} />
              <div className="text-right">
                <div className="text-xs text-slate-400">Net total</div>
                <div className="font-bold text-emerald-400 font-mono">{formatMoney(run.totalNet)}</div>
              </div>
            </div>
          </div>
          {/* Totals row */}
          <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-700/50">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Brut</div>
              <div className="font-mono text-sm text-white">{formatMoney(run.totalBrut)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Charges Sal.</div>
              <div className="font-mono text-sm text-red-400">{formatMoney(run.totalChargesSalariales)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Charges Pat.</div>
              <div className="font-mono text-sm text-slate-400">{formatMoney(run.totalChargesPatronales)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Net</div>
              <div className="font-mono text-sm text-emerald-400 font-bold">{formatMoney(run.totalNet)}</div>
            </div>
          </div>
          {run.rerunReason && (
            <div className="mt-2 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 flex items-center gap-1">
              <RefreshCw size={12} /> Re-run de v{(run.version || 1) - 1}: {run.rerunReason}
            </div>
          )}
        </Card>

        {/* Issues */}
        {issues.length > 0 && (
          <Card padding="sm" className="bg-amber-900/10 border-amber-900/20">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1 mb-2">
              <AlertTriangle size={14} />
              Alertes ({issues.length})
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {issues.map((issue) => (
                <div key={issue.id} className={`text-xs px-2 py-1 rounded flex items-center gap-2 ${
                  issue.severity === 'BLOCKING'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {issue.severity === 'BLOCKING' ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
                  <span className="flex-1">{issue.message}</span>
                  {issue.resolved && <CheckCircle size={12} className="text-emerald-400" />}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Bulletins table */}
        <Card padding="none" className="bg-slate-900/50 border-slate-800">
          <div className="p-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              Bulletins ({bulletins.length})
            </h4>
          </div>
          {bulletins.length > 0 ? (
            <ResponsiveTable
              data={bulletins}
              columns={[
                { key: 'employeNom', label: 'Employé', primary: true },
                { key: 'salaireBaseSnapshot', label: 'Base', hideOnMobile: true, format: (val: number) => <span className="font-mono text-slate-300">{formatMoney(val)}</span> },
                { key: 'salaireBrut', label: 'Brut', hideOnMobile: true, format: (val: string) => <span className="font-mono text-slate-300">{formatMoney(val)}</span> },
                { key: 'salaireNet', label: 'Net', format: (val: string) => <span className="font-bold text-emerald-400">{formatMoney(val)}</span> },
                { key: 'actions', label: '', format: (_val: any, item: BulletinPaie) => (
                  <Button variant="ghost" size="sm" icon={Eye} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewerBulletinId(item.id); }} />
                )},
              ]}
              emptyMessage="Aucun bulletin."
              density="compact"
              maxHeight="400px"
              className="border-0 rounded-none"
              headerClassName="bg-slate-900 sticky top-0"
              onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
            />
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
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
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-y-auto">
          <PayrollConfigPanel />
        </div>
      ) : activeTab === 'avances' && isRH ? (
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col overflow-hidden">
          <SalaryAdvances />
        </div>
      ) : activeTab === 'generate' && isRH ? (
        <div className="flex-1 overflow-y-auto min-h-0 pl-1 pr-2 pb-2">
          {selectedRunId ? (
            renderRunDetail()
          ) : (
            <div className="space-y-3">
              {/* Generation Card */}
              <Card variant="default" padding="sm" className="relative overflow-hidden bg-slate-800/80 border-slate-700">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <Calculator size={80} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 p-2">
                  <div className="flex-1 space-y-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Play className="text-emerald-400" size={18} />
                      Génération de la Paie
                    </h3>
                    <p className="text-xs text-slate-400">Sélectionnez le mois et lancez un run de paie</p>
                    <input
                      type="month"
                      className="mt-2 w-full max-w-xs px-3 py-2 border rounded text-sm bg-slate-900 border-slate-700 text-white focus:ring-1 focus:ring-emerald-500/50 outline-none font-mono"
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
                      className="shadow-lg shadow-emerald-500/10 h-9"
                      icon={Play}
                      isLoading={isGenerating}
                    >
                      Lancer le Traitement
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Runs table */}
              <Card padding="none" className="bg-slate-900/50 border-slate-800 flex flex-col">
                <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock size={16} className="text-blue-400" />
                    Runs de paie — {selectedMonth}
                  </h4>
                  {runsDuMois.length > 0 && (
                    <span className="text-[10px] text-slate-400">{runsDuMois.length} run(s)</span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  {loadingRuns ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-slate-500" size={20} />
                    </div>
                  ) : runsDuMois.length > 0 ? (
                    <ResponsiveTable
                      data={runsDuMois}
                      columns={runColumns}
                      emptyMessage="Aucun run pour ce mois."
                      density="compact"
                      maxHeight="300px"
                      className="border-0 rounded-none"
                      headerClassName="bg-slate-900 sticky top-0"
                      onRowClick={(item: PayrollRun) => setSelectedRunId(item.id)}
                    />
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      Aucun run généré pour {selectedMonth}. Cliquez sur "Lancer le Traitement".
                    </div>
                  )}
                </div>
              </Card>

              {/* Info cards */}
              <div className="grid lg:grid-cols-2 gap-3">
                <Card variant="glass" className="bg-gradient-to-br from-blue-900/20 to-slate-900/40 border-slate-800" padding="sm">
                  <div className="flex items-center gap-2 font-bold text-blue-400 text-xs uppercase tracking-wide mb-3">
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
                      <div key={n} className="flex gap-2 text-xs text-slate-300">
                        <span className="text-blue-500 font-bold">{n}.</span>
                        <p><span className="text-white font-medium">{title}</span> — {desc}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="bg-emerald-900/10 border-emerald-900/20" padding="sm">
                  <div className="flex items-start gap-2">
                    <Download className="text-emerald-500 mt-0.5" size={16} />
                    <div className="flex-1">
                      <h4 className="font-bold text-white text-xs">Export Comptable</h4>
                      <p className="text-[10px] text-emerald-400/70 mt-0.5 mb-2">Sélectionnez un run pour exporter les bulletins au format CSV.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Mes Bulletins tab */
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
          <div className="shrink-0 p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-white flex items-center gap-2 text-xs">
              <FileText size={14} className="text-cyan-400" />
              Mes Bulletins
            </h3>
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-500" />
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); setMyPage(0); }}
                className="bg-slate-800 border border-slate-700 rounded text-xs text-white px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-500/50"
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
              headerClassName="bg-slate-900 sticky top-0"
              onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
            />
          </div>
          {filteredBulletins.length > MY_PAGE_SIZE && (
            <div className="shrink-0 px-3 py-1.5 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
              <span className="text-[10px] text-slate-500">
                {filteredBulletins.length} bulletin{filteredBulletins.length > 1 ? 's' : ''} en {selectedYear}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMyPage(p => Math.max(0, p - 1))}
                  disabled={myPage === 0}
                  className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[10px] text-slate-400 font-mono px-1">
                  {myPage + 1}/{myTotalPages}
                </span>
                <button
                  onClick={() => setMyPage(p => Math.min(myTotalPages - 1, p + 1))}
                  disabled={myPage >= myTotalPages - 1}
                  className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
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
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <RotateCcw size={16} className="text-amber-400" />
              Re-run de paie
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Le run actuel sera annulé et les écritures GL seront contrepassées. Un nouveau run sera généré avec recalcul complet.
            </p>
            <label className="block text-xs text-slate-300 mb-1 font-medium">Motif du re-run *</label>
            <textarea
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500/50 outline-none resize-none"
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
                className="bg-amber-600 hover:bg-amber-700"
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
    </div>
  );
}
