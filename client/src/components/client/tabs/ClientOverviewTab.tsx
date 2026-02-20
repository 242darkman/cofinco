import React, { useState, useMemo } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { DollarSign, CreditCard, PiggyBank, Star, ChevronRight, Wallet, BarChart3, AlertTriangle, Info } from 'lucide-react';
import { Card, Modal, Button, Skeleton, ProgressBar } from '../../ui';
import { useQuery } from '@tanstack/react-query';
import ClientTags from '../ClientTags';
import ClientCreditsPanel from '../ClientCreditsPanel';
import { KycHealthIndicator } from '../shared/ClientBadges';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { useClientAlerts } from '../../../hooks/useClientAlerts';

interface ClientOverviewTabProps {
  client: ClientWithIdentity;
  onNavigateToTab?: (tabKey: string) => void;
}

interface AnalyticsData {
  summary: {
    totalSavings: number;
    totalCreditDue: number;
    activeLoansCount: number;
    fidelityPoints: number;
    repaymentRate: number;
  };
  distribution: { label: string; value: number; color: string }[];
  monthlyTrend: {
    savingsGrowth: string;
    creditEvolution: string;
  };
}

export default function ClientOverviewTab({ client, onNavigateToTab }: ClientOverviewTabProps) {
  const { currency } = useCurrency();
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [showCreditsPanel, setShowCreditsPanel] = useState(false);

  // Shared cache with ClientAlerts — no duplicate API call
  const { data: alertsData, isLoading: alertsLoading } = useClientAlerts(client.id);

  const alertSummary = useMemo(() => {
    if (!alertsData) return undefined;
    const active = alertsData.active;
    const critical = active.filter(a => a.alertLevel === 'critical').length;
    const warning = active.filter(a => a.alertLevel === 'warning').length;
    const topCritical = active.find(a => a.alertLevel === 'critical');
    const topWarning = active.find(a => a.alertLevel === 'warning');
    const topInfo = active.find(a => a.alertLevel === 'info');
    return {
      critical,
      warning,
      total: active.length,
      topMessage: topCritical?.message || topWarning?.message || topInfo?.message,
    };
  }, [alertsData]);

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['client-analytics', client.id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${client.id}/analytics`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    staleTime: 30000,
  });

  if (isLoading || !analytics) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const raw = analytics as any;
  const summary = {
    totalSavings: raw.summary?.totalSavings ?? raw.summary?.total_savings ?? 0,
    totalCreditDue: raw.summary?.totalCreditDue ?? raw.summary?.total_credit_due ?? 0,
    activeLoansCount: raw.summary?.activeLoansCount ?? raw.summary?.active_loans_count ?? 0,
    fidelityPoints: raw.summary?.fidelityPoints ?? raw.summary?.fidelity_points ?? 0,
    repaymentRate: raw.summary?.repaymentRate ?? raw.summary?.repayment_rate ?? 0,
  };
  const distribution = raw.distribution ?? [];
  return (
    <>
      {/* Alert banner skeleton while loading */}
      {alertsLoading && (
        <Skeleton className="h-14 w-full rounded-xl mb-4" />
      )}

      {/* Alert banner — visible only when critical/warning alerts exist */}
      {!alertsLoading && alertSummary && alertSummary.total > 0 && (() => {
        const bannerStyle = alertSummary.critical > 0
          ? { bg: 'bg-status-danger-bg border-status-danger/30 hover:border-status-danger/50', icon: 'bg-status-danger/10', text: 'text-status-danger' }
          : alertSummary.warning > 0
          ? { bg: 'bg-status-warning-bg border-status-warning/30 hover:border-status-warning/50', icon: 'bg-status-warning/10', text: 'text-status-warning' }
          : { bg: 'bg-status-info-bg border-status-info/30 hover:border-status-info/50', icon: 'bg-status-info/10', text: 'text-status-info' };

        const bannerLabel = alertSummary.critical > 0
          ? `${alertSummary.critical} alerte(s) critique(s)`
          : alertSummary.warning > 0
          ? `${alertSummary.warning} avertissement(s)`
          : `${alertSummary.total} information(s)`;

        const BannerIcon = alertSummary.critical > 0 || alertSummary.warning > 0 ? AlertTriangle : Info;

        return (
          <button
            type="button"
            onClick={() => onNavigateToTab?.('alertes')}
            className={`w-full mb-4 flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left group cursor-pointer ${bannerStyle.bg}`}
          >
            <div className={`p-2 rounded-lg shrink-0 ${bannerStyle.icon}`}>
              <BannerIcon size={16} className={bannerStyle.text} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-xs font-bold uppercase tracking-wide ${bannerStyle.text}`}>
                  {bannerLabel}
                </span>
                {alertSummary.total > alertSummary.critical && alertSummary.critical > 0 && (
                  <span className="text-[10px] text-content-muted">
                    + {alertSummary.total - alertSummary.critical} autre(s)
                  </span>
                )}
              </div>
              {alertSummary.topMessage && (
                <p className="text-xs text-content-secondary truncate">{alertSummary.topMessage}</p>
              )}
            </div>
            <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors shrink-0" />
          </button>
        );
      })()}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">

        {/* 1. Finances */}
        <Card variant="default" padding="none" className="overflow-hidden col-span-1 lg:col-span-2">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
                <DollarSign size={16} className="text-status-info" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Finances</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Credits en cours */}
              <button
                type="button"
                className={`group w-full text-left rounded-lg p-3 flex items-center justify-between border transition-all duration-200 cursor-pointer hover:shadow-sm ${
                  summary.totalCreditDue > 0
                    ? 'bg-status-info/5 border-status-info/20 hover:border-status-info/40'
                    : 'bg-surface-subtle/30 border-edge-subtle hover:bg-surface-subtle/50'
                }`}
                onClick={() => setShowCreditsPanel(true)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.totalCreditDue > 0 ? 'bg-status-info-bg' : 'bg-surface-elevated/50'}`}>
                    <CreditCard size={14} className={summary.totalCreditDue > 0 ? 'text-status-info' : 'text-content-muted'} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-content-muted mb-0.5 flex items-center gap-1.5">
                      Credits en cours
                      {summary.totalCreditDue > 0 && <span className="w-1.5 h-1.5 rounded-full bg-status-info animate-pulse" />}
                    </p>
                    <p className="text-base font-bold text-content-primary">
                      {summary.totalCreditDue.toLocaleString()} <span className="text-xs font-normal text-content-muted">{currency.symbol}</span>
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors shrink-0" />
              </button>

              {/* Total des comptes */}
              <button
                type="button"
                className="group w-full text-left rounded-lg p-3 flex items-center justify-between border border-edge-subtle bg-surface-subtle/30 hover:bg-surface-subtle/50 transition-all duration-200 cursor-pointer hover:shadow-sm"
                onClick={() => setShowSavingsModal(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-status-success-bg">
                    <PiggyBank size={14} className="text-status-success" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-content-muted mb-0.5">Total des comptes</p>
                    <p className="text-base font-bold text-content-primary">
                      {summary.totalSavings.toLocaleString()} <span className="text-xs font-normal text-content-muted">{currency.symbol}</span>
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors shrink-0" />
              </button>

              {/* Revenu mensuel */}
              {client.revenuMensuel && (
                <div className="rounded-lg p-3 border border-edge-subtle bg-surface-subtle/30">
                  <p className="text-[10px] uppercase text-content-muted mb-0.5">Revenu mensuel</p>
                  <p className="text-base font-bold text-content-primary">
                    {parseFloat(client.revenuMensuel).toLocaleString()} <span className="text-xs font-normal text-content-muted">{currency.symbol}</span>
                  </p>
                </div>
              )}

              {/* Revenu journalier */}
              {client.revenuJournalier && parseFloat(client.revenuJournalier) > 0 && (
                <div className="rounded-lg p-3 border border-edge-subtle bg-surface-subtle/30">
                  <p className="text-[10px] uppercase text-content-muted mb-0.5">Revenu journalier</p>
                  <p className="text-base font-bold text-content-primary">
                    {parseFloat(client.revenuJournalier).toLocaleString()} <span className="text-xs font-normal text-content-muted">{currency.symbol}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 2. KYC Health */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-status-warning/20 to-accent/20 rounded-lg">
                <Star size={16} className="text-status-warning" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Statut KYC</h3>
            </div>
            <KycHealthIndicator status={client.kycStatus} />
          </div>
        </Card>

        {/* 3. Segment & Fidelite */}
        <Card variant="default" padding="none" className="overflow-hidden col-span-1 lg:col-span-3">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-accent/20 to-status-info/20 rounded-lg">
                <Star size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Segment & Fidelite</h3>
            </div>

            <div className="grid sm:grid-cols-4 gap-4">
              {/* Score Global */}
              <div className="p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={13} className="text-accent" />
                  <span className="text-xs text-content-muted uppercase tracking-wide">Score</span>
                </div>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className={`text-2xl font-bold tabular-nums ${
                    (client.score ?? 50) >= 80 ? 'text-status-success' :
                    (client.score ?? 50) >= 65 ? 'text-status-info' :
                    (client.score ?? 50) >= 40 ? 'text-status-warning' :
                    'text-status-danger'
                  }`}>
                    {client.score ?? 50}
                  </span>
                  <span className="text-[10px] text-content-muted pb-0.5">/ 100</span>
                </div>
                <ProgressBar
                  value={client.score ?? 50}
                  max={100}
                  color={
                    (client.score ?? 50) >= 80 ? 'success' :
                    (client.score ?? 50) >= 65 ? 'primary' :
                    (client.score ?? 50) >= 40 ? 'warning' :
                    'danger'
                  }
                  size="sm"
                  animate
                />
              </div>

              {/* Segment */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <span className="text-xs text-content-muted uppercase tracking-wide">Segment</span>
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-accent/10 text-accent border border-accent/20">
                  {client.segment || 'Standard'}
                </span>
              </div>

              {/* Points Fidelite */}
              <div className="p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-content-muted uppercase tracking-wide">Points fidelite</span>
                  <span className="text-lg font-bold text-content-primary">{summary.fidelityPoints.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface-subtle-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-status-success to-accent rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(summary.repaymentRate, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-content-muted shrink-0">{summary.repaymentRate}%</span>
                </div>
                <p className="text-[10px] text-content-muted mt-1">Taux de remboursement</p>
              </div>

              {/* Tags */}
              <div className="flex items-center">
                <ClientTags clientId={client.id} compact={true} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Credits Panel */}
      <ClientCreditsPanel
        clientId={client.id}
        isOpen={showCreditsPanel}
        onClose={() => setShowCreditsPanel(false)}
      />

      {/* Savings Modal */}
      <Modal
        isOpen={showSavingsModal}
        onClose={() => setShowSavingsModal(false)}
        title="Detail de l'epargne"
        size="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="bg-surface/50 rounded-xl p-4 border border-edge-subtle text-center">
            <p className="text-sm text-content-muted mb-1">Total Consolide</p>
            <p className="text-3xl font-bold text-content-primary">
              {summary.totalSavings.toLocaleString()} <span className="text-base font-normal text-content-muted">{currency.symbol}</span>
            </p>
          </div>
          <div className="space-y-2">
            {distribution.map((item: { label: string; value: number; color: string }, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-surface/30 border border-edge-subtle">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-surface text-content-muted">
                    <Wallet size={16} style={{ color: item.color }} />
                  </div>
                  <span className="font-medium text-content-secondary">{item.label}</span>
                </div>
                <span className="font-bold text-content-primary">{item.value.toLocaleString()} {currency.symbol}</span>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <Button variant="outline" className="w-full" onClick={() => setShowSavingsModal(false)}>Fermer</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
