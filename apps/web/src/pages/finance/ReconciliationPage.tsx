import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, FileText, CheckCircle2, AlertTriangle, Clock, ChevronDown, Eye, Check, XCircle, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

// Safe date format helper
const safeDateFormat = (dateValue: string | Date | null | undefined, formatStr: string): string => {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return format(date, formatStr, { locale: fr });
  } catch {
    return '-';
  }
};

// Provider logos
const ProviderLogo = ({ provider, size = 'sm' }: { provider: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = size === 'sm' ? 'h-5 w-5' : size === 'md' ? 'h-8 w-8' : 'h-10 w-10';
  if (provider === 'MTN') {
    return <img src={mtnLogo} alt="MTN" className={sizeClass} />;
  }
  return <img src={airtelLogo} alt="Airtel" className={sizeClass} />;
};

interface ReconciliationAnomaly {
  intentId: string;
  type: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  montant?: string;
}

interface ReconciliationReport {
  id: string;
  dateRapport: string;
  provider: 'MTN' | 'AIRTEL';
  agenceId?: string;
  totalIntents: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  expiredCount?: number;
  montantAttendu: string;
  montantConfirme: string;
  ecart: string;
  anomalies: ReconciliationAnomaly[];
  anomaliesCount: number;
  statut: 'GENERATED' | 'REVIEWED' | 'RESOLVED';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

// Status badge for reports
const ReportStatusBadge = ({ statut }: { statut: string }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    GENERATED: { bg: 'bg-accent/10', text: 'text-accent', icon: Clock },
    REVIEWED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: Eye },
    RESOLVED: { bg: 'bg-status-success-bg', text: 'text-status-success', icon: CheckCircle2 },
  };

  const { bg, text, icon: Icon } = config[statut] || config.GENERATED;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}>
      <Icon size={12} />
      {ALL_STATUS_LABELS[statut] || statut}
    </span>
  );
};

// Anomaly severity badge
const SeverityBadge = ({ severity }: { severity: string }) => {
  const config: Record<string, { bg: string; text: string }> = {
    LOW: { bg: 'bg-surface-subtle/40', text: 'text-content-muted' },
    MEDIUM: { bg: 'bg-status-warning-bg', text: 'text-status-warning' },
    HIGH: { bg: 'bg-status-danger-bg', text: 'text-status-danger' },
  };

  const { bg, text } = config[severity] || config.MEDIUM;

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bg} ${text}`}>
      {ALL_STATUS_LABELS[severity] || severity}
    </span>
  );
};

export default function ReconciliationPage() {
  const queryClient = useQueryClient();

  // Filters
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState<string>('');

  // Detail view
  const [selectedReport, setSelectedReport] = useState<ReconciliationReport | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Build query params
  const queryParams = new URLSearchParams();
  if (filterProvider) queryParams.set('provider', filterProvider);
  if (filterStatut) queryParams.set('statut', filterStatut);
  queryParams.set('limit', '30');

  // Fetch reports
  const { data, isLoading, refetch, isFetching } = useQuery<{ reports: ReconciliationReport[] }>({
    queryKey: ['reconciliation-reports', filterProvider, filterStatut],
    queryFn: async () => {
      const res = await fetch(`/api/payments/reconciliation/reports?${queryParams.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json();
    },
  });

  const reports = data?.reports || [];

  // Calculate summary stats
  const todayReports = reports.filter(r => {
    const reportDate = new Date(r.dateRapport);
    const today = new Date();
    return reportDate.toDateString() === today.toDateString();
  });

  const totalEcart = reports.reduce((sum, r) => sum + Number(r.ecart || 0), 0);
  const totalAnomalies = reports.reduce((sum, r) => sum + (r.anomaliesCount || 0), 0);
  const unresolvedCount = reports.filter(r => r.statut !== 'RESOLVED').length;

  // Mark as reviewed
  const handleMarkReviewed = async () => {
    if (!selectedReport) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/payments/reconciliation/reports/${selectedReport.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: 'Reviewed' }),
      });
      if (!res.ok) throw new Error('Failed to mark as reviewed');
      toast.success('Rapport marqué comme reviewé');
      refetch();
      setShowDetailModal(false);
    } catch (error) {
      toast.error('Erreur lors du marquage');
    } finally {
      setActionLoading(false);
    }
  };

  // Mark as resolved
  const handleMarkResolved = async () => {
    if (!selectedReport) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/payments/reconciliation/reports/${selectedReport.id}/resolve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to resolve');
      toast.success('Rapport marqué comme résolu');
      refetch();
      setShowDetailModal(false);
    } catch (error) {
      toast.error('Erreur lors de la résolution');
    } finally {
      setActionLoading(false);
    }
  };

  // Generate report manually
  const handleGenerateReport = async (provider: 'MTN' | 'AIRTEL') => {
    try {
      const res = await fetch('/api/payments/reconciliation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error('Failed to generate');
      const result = await res.json();
      toast.success(`Rapport ${provider} généré: ${result.report.stats.totalIntents} transactions`);
      refetch();
    } catch (error) {
      toast.error('Erreur lors de la génération');
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-base sm:text-xl font-bold text-content-primary">Réconciliation Mobile Money</h1>
          <p className="text-[10px] sm:text-xs text-content-muted">
            Rapports quotidiens et détection des anomalies
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => handleGenerateReport('MTN')}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-status-warning-bg border border-status-warning/30 text-status-warning hover:bg-status-warning-bg transition-colors text-[10px] sm:text-xs font-medium"
          >
            <ProviderLogo provider="MTN" size="sm" />
            <span className="hidden xs:inline">Générer</span> MTN
          </button>
          <button
            onClick={() => handleGenerateReport('AIRTEL')}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-status-danger-bg border border-status-danger/30 text-status-danger hover:bg-status-danger-bg transition-colors text-[10px] sm:text-xs font-medium"
          >
            <ProviderLogo provider="AIRTEL" size="sm" />
            <span className="hidden xs:inline">Générer</span> Airtel
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 sm:p-2 rounded-lg bg-surface hover:bg-surface-elevated text-content-muted transition-colors disabled:opacity-50 border border-edge"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-surface-base/50 border border-edge rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-accent/10 shrink-0"><FileText size={16} className="text-accent" /></div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] text-content-muted uppercase font-bold tracking-wider truncate">Rapports</p>
            <p className="text-sm sm:text-lg font-bold text-content-primary leading-none">{reports.length}</p>
          </div>
        </div>
        <div className="bg-surface-base/50 border border-edge rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-status-warning-bg shrink-0"><AlertTriangle size={16} className="text-status-warning" /></div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] text-content-muted uppercase font-bold tracking-wider truncate">Anomalies</p>
            <p className="text-sm sm:text-lg font-bold text-status-warning leading-none">{totalAnomalies}</p>
          </div>
        </div>
        <div className="bg-surface-base/50 border border-edge rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-status-danger-bg shrink-0"><TrendingUp size={16} className="text-status-danger" /></div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] text-content-muted uppercase font-bold tracking-wider truncate">Écart Total</p>
            <p className="text-sm sm:text-lg font-bold text-status-danger leading-none">{totalEcart.toLocaleString()} <span className="text-[10px]">F</span></p>
          </div>
        </div>
        <div className="bg-surface-base/50 border border-edge rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5">
          <div className="p-1.5 sm:p-2 rounded-lg bg-status-success-bg shrink-0"><Clock size={16} className="text-status-success" /></div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] text-content-muted uppercase font-bold tracking-wider truncate">Non résolus</p>
            <p className="text-sm sm:text-lg font-bold text-status-success leading-none">{unresolvedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="flex-1 min-h-0 bg-surface-base/50 border border-edge rounded-xl flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 p-2 border-b border-edge flex items-center gap-2">
          <div className="relative">
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="h-8 pl-2 pr-7 rounded-lg bg-input-bg border border-input-border text-xs text-content-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
            >
              <option value="">Tous providers</option>
              <option value="MTN">MTN</option>
              <option value="AIRTEL">Airtel</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="h-8 pl-2 pr-7 rounded-lg bg-input-bg border border-input-border text-xs text-content-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
            >
              <option value="">Tous statuts</option>
              <option value="GENERATED">Généré</option>
              <option value="REVIEWED">Reviewé</option>
              <option value="RESOLVED">Résolu</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          </div>

          <span className="ml-auto text-[10px] text-content-muted hidden sm:inline">
            {reports.length} rapport{reports.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <Spinner size="sm" tone="accent" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-content-muted gap-2">
              <FileText size={32} className="opacity-20" />
              <p className="text-sm">Aucun rapport de réconciliation</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full relative border-collapse">
                  <thead className="bg-surface-base/95 sticky top-0 z-10 backdrop-blur-sm">
                    <tr className="border-b border-edge">
                      <th className="text-left text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Date</th>
                      <th className="text-left text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Provider</th>
                      <th className="text-center text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Transactions</th>
                      <th className="text-right text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Confirmé</th>
                      <th className="text-right text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Écart</th>
                      <th className="text-center text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Anomalies</th>
                      <th className="text-center text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Statut</th>
                      <th className="text-center text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge/50">
                    {reports.map((report) => (
                      <tr key={report.id} className="hover:bg-surface/40 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-content-muted" />
                            <span className="text-xs font-medium text-content-primary">
                              {safeDateFormat(report.dateRapport, 'dd/MM/yyyy')}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <ProviderLogo provider={report.provider} size="sm" />
                            <span className="text-xs font-semibold text-content-secondary">{report.provider}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-surface border border-edge text-xs">
                            <span className="text-status-success font-bold">{report.successCount}</span>
                            <span className="text-content-muted mx-1">/</span>
                            <span className="text-content-muted">{report.totalIntents}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-mono font-bold text-content-primary">
                            {Number(report.montantConfirme).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-mono font-bold ${Number(report.ecart) > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                            {Number(report.ecart).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {report.anomaliesCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-warning-bg text-status-warning border border-status-warning/20">
                              <AlertTriangle size={10} />
                              {report.anomaliesCount}
                            </span>
                          ) : (
                            <span className="text-status-success/50 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <ReportStatusBadge statut={report.statut} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => { setSelectedReport(report); setShowDetailModal(true); }}
                            className="p-1.5 rounded-md bg-surface text-content-muted hover:text-content-primary hover:bg-surface-elevated transition-colors border border-transparent hover:border-edge-strong"
                            title="Voir détails"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-edge/50">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => { setSelectedReport(report); setShowDetailModal(true); }}
                    className="w-full text-left p-3 hover:bg-surface/40 transition-colors space-y-2"
                  >
                    {/* Row 1: Provider + Date + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ProviderLogo provider={report.provider} size="sm" />
                        <span className="text-xs font-semibold text-content-primary">{report.provider}</span>
                        <span className="text-[10px] text-content-muted">{safeDateFormat(report.dateRapport, 'dd/MM/yy')}</span>
                      </div>
                      <ReportStatusBadge statut={report.statut} />
                    </div>

                    {/* Row 2: Stats */}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-edge">
                        <span className="text-status-success font-bold">{report.successCount}</span>
                        <span className="text-content-muted">/</span>
                        <span className="text-content-muted">{report.totalIntents}</span>
                      </div>
                      <span className="font-mono font-bold text-content-primary">{Number(report.montantConfirme).toLocaleString()} F</span>
                      <span className={`font-mono font-bold ${Number(report.ecart) > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {Number(report.ecart) > 0 ? '+' : ''}{Number(report.ecart).toLocaleString()}
                      </span>
                      {report.anomaliesCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-status-warning">
                          <AlertTriangle size={10} />
                          {report.anomaliesCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDetailModal(false)} />
          <div className="relative bg-surface-base rounded-2xl border border-edge-subtle max-w-2xl w-full mx-3 sm:mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-edge">
              <div className="flex items-center gap-3">
                <ProviderLogo provider={selectedReport.provider} size="md" />
                <div>
                  <h3 className="font-bold text-content-primary">
                    Rapport {selectedReport.provider}
                  </h3>
                  <p className="text-xs text-content-muted">
                    {safeDateFormat(selectedReport.dateRapport, 'dd MMMM yyyy')}
                  </p>
                </div>
              </div>
              <ReportStatusBadge statut={selectedReport.statut} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface/50 rounded-xl p-4">
                  <p className="text-xs text-content-muted mb-1">Transactions</p>
                  <p className="text-lg font-bold text-content-primary">
                    <span className="text-status-success">{selectedReport.successCount}</span>
                    <span className="text-content-muted"> / </span>
                    {selectedReport.totalIntents}
                  </p>
                  <p className="text-[10px] text-content-muted mt-1">
                    {selectedReport.pendingCount} en attente, {selectedReport.failedCount} échoués
                  </p>
                </div>
                <div className="bg-surface/50 rounded-xl p-4">
                  <p className="text-xs text-content-muted mb-1">Montants</p>
                  <p className="text-lg font-bold text-status-success">
                    {Number(selectedReport.montantConfirme).toLocaleString()} F
                  </p>
                  <p className={`text-xs mt-1 ${Number(selectedReport.ecart) > 0 ? 'text-status-danger' : 'text-content-muted'}`}>
                    Écart: {Number(selectedReport.ecart).toLocaleString()} F
                  </p>
                </div>
              </div>

              {/* Anomalies */}
              {selectedReport.anomalies && selectedReport.anomalies.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-status-warning mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Anomalies détectées ({selectedReport.anomalies.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedReport.anomalies.map((anomaly, idx) => (
                      <div
                        key={idx}
                        className="bg-surface/30 border border-edge-subtle rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-content-primary">
                                {anomaly.type.replace(/_/g, ' ')}
                              </span>
                              <SeverityBadge severity={anomaly.severity} />
                            </div>
                            <p className="text-xs text-content-muted">{anomaly.description}</p>
                            {anomaly.montant && (
                              <p className="text-xs text-content-muted mt-1">
                                Montant: {Number(anomaly.montant).toLocaleString()} F
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-content-muted font-mono">
                            {anomaly.intentId.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review info */}
              {selectedReport.reviewedAt && (
                <div className="bg-status-success-bg border border-status-success/20 rounded-xl p-4">
                  <p className="text-xs text-status-success mb-1">Reviewé le</p>
                  <p className="text-sm text-content-primary">
                    {safeDateFormat(selectedReport.reviewedAt, 'dd/MM/yyyy à HH:mm')}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="border-t border-edge p-4 flex items-center gap-3">
              {selectedReport.statut === 'GENERATED' && (
                <button
                  onClick={handleMarkReviewed}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-status-warning bg-status-warning-bg hover:bg-status-warning-bg border border-status-warning/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Spinner size="xs" tone="current" /> : <Eye size={16} />}
                  Marquer reviewé
                </button>
              )}
              {selectedReport.statut === 'REVIEWED' && (
                <button
                  onClick={handleMarkResolved}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-status-success bg-status-success-bg hover:bg-status-success-bg border border-status-success/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Spinner size="xs" tone="current" /> : <Check size={16} />}
                  Marquer résolu
                </button>
              )}
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2.5 rounded-xl font-semibold text-content-muted bg-surface hover:bg-surface-elevated transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
