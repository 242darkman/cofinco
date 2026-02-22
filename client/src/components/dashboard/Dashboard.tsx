
import React, { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  UserPlus,
  Wallet,
  Banknote,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Activity,
  Database,
  BarChart3,
  ShieldAlert,
  Search,
  Target,
  CreditCard,
  PiggyBank,
} from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Button, Card, Badge, ProgressBar } from '../ui';
import { clientApi } from '../../lib/api-client';
import { scoreKeys } from '../../lib/query-keys';
import { useAgence } from '../../contexts/AgenceContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDashboardStats } from '../../hooks/dashboard/useDashboardStats';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { useEncaisse } from '../../hooks/treasury/useEncaisse';
import { useAbility } from '../../contexts/AbilityContext';
import { Actions, Subjects, type Action, type Subject } from '../../lib/casl';

import AgencySelector from './AgencySelector';
import AnalyticsGrid from './AnalyticsGrid';
import { AlertsDrawer } from './AlertsDrawer';

const ComparativeAnalytics = React.lazy(() => import('./ComparativeAnalytics'));

interface DashboardProps {
  userRole?: string;
  userName?: string;
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
  onQuickAction?: (action: string) => void;
  onLogout?: () => void;
  treasuryThreshold?: number;
}

// Map module.action to CASL action/subject for permission checks
const MODULE_ACTION_TO_CASL: Record<string, { action: Action; subject: Subject }> = {
  'clients.create': { action: Actions.CREATE, subject: Subjects.CLIENT },
  'clients.view': { action: Actions.VIEW, subject: Subjects.CLIENT },
  'caisse.create': { action: Actions.CREATE, subject: Subjects.CAISSE },
  'caisse.view': { action: Actions.VIEW, subject: Subjects.CAISSE },
  'credits.create': { action: Actions.CREATE, subject: Subjects.CREDIT },
  'credits.view': { action: Actions.VIEW, subject: Subjects.CREDIT },
  'tontines.view': { action: Actions.VIEW, subject: Subjects.TONTINE },
  'tontines.create': { action: Actions.CREATE, subject: Subjects.TONTINE },
};

export default function Dashboard({
  userRole = 'user',
  userName = 'Utilisateur',
  onModuleChange,
  onQuickAction,
  treasuryThreshold = 500_000
}: DashboardProps) {
  const { t } = useLanguage();
  const { selectedAgence, agences, selectAgence, isAdmin } = useAgence();
  const { isConnected } = useWebSocketContext();
  const { stats, loading, refresh } = useDashboardStats(userRole);
  const ability = useAbility();

  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);

  // Treasury v2: Single Source of Truth depuis le Grand Livre (GL)
  const { data: encaisse, isLoading: encaisseLoading } = useEncaisse(selectedAgence?.id);

  // Scoring stats for selected agency
  const { data: scoreStats } = useQuery({
    queryKey: scoreKeys.agencyStats(selectedAgence?.id),
    queryFn: () => clientApi.getAgencyScoreStats(selectedAgence?.id),
    staleTime: 120_000,
  });

  // Cross-client alerts summary
  const { data: alertsSummary } = useQuery<{
    totalAtRisk: number;
    breakdown: Record<string, number>;
    topClients: { id: string; nom: string; prenom: string; codeClient: string; flags: string[]; score: number }[];
  }>({
    queryKey: ['alerts-summary', selectedAgence?.id],
    queryFn: async () => {
      const res = await fetch('/api/alerts/summary', { credentials: 'include' });
      if (!res.ok) return { totalAtRisk: 0, breakdown: {}, topClients: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  // Scroll container refs and state for fade indicators
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLElement>(null);
  const [mainScrollState, setMainScrollState] = useState({ top: false, bottom: true });
  const [sidebarScrollState, setSidebarScrollState] = useState({ top: false, bottom: true });

  // Handle scroll position detection for fade indicators
  const updateScrollState = useCallback((
    element: HTMLElement | null,
    setState: React.Dispatch<React.SetStateAction<{ top: boolean; bottom: boolean }>>
  ) => {
    if (!element) return;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const threshold = 10;
    setState({
      top: scrollTop > threshold,
      bottom: scrollTop + clientHeight < scrollHeight - threshold
    });
  }, []);

  useEffect(() => {
    const mainEl = mainScrollRef.current;
    const sidebarEl = sidebarScrollRef.current;

    const handleMainScroll = () => updateScrollState(mainEl, setMainScrollState);
    const handleSidebarScroll = () => updateScrollState(sidebarEl, setSidebarScrollState);

    // Initial check
    handleMainScroll();
    handleSidebarScroll();

    mainEl?.addEventListener('scroll', handleMainScroll, { passive: true });
    sidebarEl?.addEventListener('scroll', handleSidebarScroll, { passive: true });

    return () => {
      mainEl?.removeEventListener('scroll', handleMainScroll);
      sidebarEl?.removeEventListener('scroll', handleSidebarScroll);
    };
  }, [updateScrollState]);

  // Real-time update trigger
  useEffect(() => {
    const handleRefresh = () => {
      refresh();
    };

    // Listen for any activity to refresh stats
    window.addEventListener('live-activity', handleRefresh);
    window.addEventListener('transaction-created', handleRefresh);
    window.addEventListener('refresh-dashboard', handleRefresh);
    window.addEventListener('balance-updated', handleRefresh);

    return () => {
      window.removeEventListener('live-activity', handleRefresh);
      window.removeEventListener('transaction-created', handleRefresh);
      window.removeEventListener('refresh-dashboard', handleRefresh);
      window.removeEventListener('balance-updated', handleRefresh);
    };
  }, [refresh]);


  // -- Derived State and Data --

  // Treasury Indicator (KPI #1) — SINGLE SOURCE OF TRUTH depuis GL
  // Utilise encaisse v2 (Grand Livre) avec fallback sur stats legacy
  const totalTreasury = encaisse?.totalDisponible ?? stats?.global?.tresorerieDispo ?? 0;
  const isLowTreasury = totalTreasury < treasuryThreshold;
  const treasurySource = encaisse ? 'GL' : 'legacy';
  const treasuryUpdatedAt = encaisse?.meta?.computedAt;

  // Smart Feeds Data
  // Smart Feeds Data
  const pendingCredits = stats?.global?.creditsEnAttente || 0;
  const overdueInstallments = stats?.global?.creditsRetard || 0;
  
  // CORRECTION: Use backend calculated KPIs (Value-based PAR30)
  const par30 = stats?.global?.par30 ?? 0;
  const liquidityRatio = stats?.global?.liquidityRatio ?? 100;
  const tauxRecouvrement = stats?.global?.tauxRecouvrement ?? 0;

  // Total actionable items for "A Traiter" section
  const upcomingPaymentsCount = stats?.widgets?.upcomingPayments?.length || 0;
  const enquetesEnCours = stats?.enquetes?.enCours || 0;
  const alertsTotal = pendingCredits + overdueInstallments
    + (alertsSummary?.totalAtRisk || 0)
    + upcomingPaymentsCount
    + enquetesEnCours;

  // -- Render Helpers --

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  return (
    <main
      className="flex flex-col h-full space-y-2 pb-0 py-2 overflow-y-auto overflow-x-hidden smooth-scroll"
      role="main"
      aria-label={t('tableauDeBord') || 'Tableau de bord'}
    >

      {/* 1. Header Intelligent */}
      <header
        className="flex shrink-0 items-center justify-between gap-2 px-1"
        aria-label={t('resumeTresorerie') || 'Résumé trésorerie'}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-content-primary leading-none">
              {encaisseLoading ? '...' : formatMoney(totalTreasury)}
            </h1>
            <div className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
              totalTreasury > 0 ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
            }`}>
              {t('encaisseDisponible')}
            </div>
            {/* Badge Source GL */}
            {treasurySource === 'GL' && (
              <div
                className="group relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-status-info-bg text-status-info text-[8px] font-medium cursor-help"
                title="Source: Grand Livre comptable"
              >
                <Database size={8} />
                <span className="hidden sm:inline">GL</span>
                {/* Tooltip breakdown */}
                <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-48 p-2 bg-surface border border-edge rounded-lg shadow-xl text-[10px]">
                  <div className="font-semibold text-content-secondary mb-1">Décomposition</div>
                  <div className="space-y-0.5 text-content-muted">
                    <div className="flex justify-between">
                      <span>Coffre-Fort</span>
                      <span className="text-content-primary">{formatMoney(encaisse?.breakdown?.coffreCentral || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Caisse Guichet</span>
                      <span className="text-content-primary">{formatMoney(encaisse?.breakdown?.caisseGuichet || 0)}</span>
                    </div>
                    {(encaisse?.breakdown?.mobileMoney || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Mobile Money</span>
                        <span className="text-content-primary">{formatMoney(encaisse?.breakdown?.mobileMoney || 0)}</span>
                      </div>
                    )}
                    {(encaisse?.breakdown?.banque || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Banque</span>
                        <span className="text-content-primary">{formatMoney(encaisse?.breakdown?.banque || 0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 pt-1 border-t border-edge text-content-muted text-[9px]">
                    Source: Grand Livre OHADA
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-content-muted" role="status" aria-live="polite">
            <span className={isConnected ? "text-status-success" : "text-content-muted"} aria-hidden="true">
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
            </span>
            <span>{isConnected ? t('enLigne') : t('horsLigne')}</span>
            <span className="w-0.5 h-0.5 bg-surface-elevated rounded-full" aria-hidden="true" />
            <span className="capitalize">{userName}</span>
            {/* Timestamp mise à jour */}
            {treasuryUpdatedAt && (
              <>
                <span className="w-0.5 h-0.5 bg-surface-elevated rounded-full" aria-hidden="true" />
                <span className="text-content-muted">
                  {new Date(treasuryUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AgencySelector 
            agences={agences}
            selectedAgence={selectedAgence}
            onSelect={selectAgence}
            isAdmin={isAdmin}
          />
        </div>
      </header>

      {/* 2. Quick Actions Section (permission-gated) */}
      {(() => {
        const actions = [
          { key: 'new-client', module: 'clients', action: 'create', icon: UserPlus, label: t('nouveauClient'),
            btnClass: 'bg-status-info-bg hover:bg-status-info-bg border-status-info/20 text-status-info',
            iconClass: 'bg-status-info', handler: () => onQuickAction?.('new-client') },
          { key: 'new-payment', module: 'caisse', action: 'create', icon: Wallet, label: t('operationCaisse'),
            btnClass: 'bg-status-success-bg hover:bg-status-success-bg border-status-success/20 text-status-success',
            iconClass: 'bg-status-success', handler: () => onQuickAction?.('new-payment') },
          { key: 'new-credit', module: 'credits', action: 'create', icon: Banknote, label: t('creditRapide'),
            btnClass: 'bg-accent/10 hover:bg-accent/10 border-accent/20 text-accent',
            iconClass: 'bg-accent', handler: () => onQuickAction?.('new-credit') },
          { key: 'new-tontine', module: 'tontines', action: 'create', icon: Users, label: t('nouvelleTontine'),
            btnClass: 'bg-status-info-bg hover:bg-status-info-bg border-status-info/20 text-status-info',
            iconClass: 'bg-status-info', handler: () => onQuickAction?.('new-tontine') },
        ].filter(a => {
          const mapping = MODULE_ACTION_TO_CASL[`${a.module}.${a.action}`];
          if (!mapping) return false;
          return ability.can(mapping.action, mapping.subject);
        });

        if (actions.length === 0) return null;

        const gridCols = actions.length >= 4 ? 'grid-cols-4' : actions.length === 3 ? 'grid-cols-3' : actions.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

        return (
          <section
            className={`grid ${gridCols} gap-2 shrink-0`}
            aria-label={t('actionsRapides') || 'Actions rapides'}
            role="toolbar"
          >
            {actions.map(({ key, icon: Icon, label, btnClass, iconClass, handler }) => (
              <Button
                key={key}
                variant="secondary"
                className={`h-auto py-2 flex flex-col gap-1 items-center justify-center ${btnClass}`}
                onClick={handler}
                aria-label={label}
              >
                <div className={`p-1.5 ${iconClass} rounded-lg text-white shadow-sm`} aria-hidden="true">
                  <Icon size={16} />
                </div>
                <span className="text-[10px] font-semibold">{label}</span>
              </Button>
            ))}
          </section>
        );
      })()}

      {/* 3. Main Content Grid: Analytics (Left) & Pilotage (Right) */}
      <div
        ref={mainScrollRef}
        className={`flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3 pr-1 overflow-y-auto pro-scrollbar pb-4 scroll-fade-container ${
          mainScrollState.top ? 'has-scroll-top' : ''
        } ${mainScrollState.bottom ? 'has-scroll-bottom' : ''}`}
      >
        
        {/* LEFT COLUMN: Analytics (66%) */}
        <div className="lg:col-span-2 space-y-2 flex flex-col">
           <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest flex items-center gap-1.5 shrink-0">
            <Activity size={12} />
            {t('analytique')}
          </h3>
          <div className="flex-1 min-h-0 bg-surface-base/30 rounded-xl p-2 border border-edge/50">
             <AnalyticsGrid stats={stats} />
          </div>

          {/* Comparative Analytics & Forecast */}
          <Suspense fallback={<div className="py-4 text-center text-content-muted text-xs">{t('chargementAnalytique')}</div>}>
            <ComparativeAnalytics />
          </Suspense>
        </div>

        {/* RIGHT COLUMN: Pilotage (33%) */}
        <aside
          ref={sidebarScrollRef}
          className={`lg:col-span-1 space-y-3 overflow-y-auto pro-scrollbar scroll-fade-container ${
            sidebarScrollState.top ? 'has-scroll-top' : ''
          } ${sidebarScrollState.bottom ? 'has-scroll-bottom' : ''}`}
          aria-label={t('panneauPilotage') || 'Panneau de pilotage'}
        >

          {/* Section: À Traiter */}
          <section className="space-y-1.5" aria-labelledby="tasks-section-title">
            <div className="flex items-center justify-between">
              <h3 id="tasks-section-title" className="text-xs font-semibold text-content-muted uppercase tracking-widest flex items-center gap-1.5">
                <Clock size={12} aria-hidden="true" />
                {t('aTraiter')}
                {alertsTotal > 0 && (
                  <Badge value={alertsTotal} size="sm" variant="danger" />
                )}
              </h3>
              {(alertsSummary?.totalAtRisk || 0) > 0 && (
                <button
                  onClick={() => setAlertsDrawerOpen(true)}
                  className="text-[10px] text-accent font-medium hover:underline"
                >
                  {t('voirTout') || 'Voir tout'}
                </button>
              )}
            </div>

            {pendingCredits > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border-l-4 border-l-status-warning border border-edge/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-warning-bg rounded-lg text-status-warning shrink-0">
                    <Clock size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-content-primary text-xs truncate">{pendingCredits} {t('demandesAttente')}</h4>
                    <p className="text-[10px] text-content-muted">{t('validationRequise')}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits', 'demandes')} className="h-6 text-[10px] px-2 shrink-0 ml-2">
                  {t('voir')}
                </Button>
              </div>
            )}

            {overdueInstallments > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border-l-4 border-l-status-danger border border-edge/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-danger-bg rounded-lg text-status-danger shrink-0">
                    <AlertTriangle size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-content-primary text-xs truncate">{overdueInstallments} {t('echeancesRetard')}</h4>
                    <p className="text-[10px] text-content-muted">{t('aRelancer')}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits', 'echeancier')} className="h-6 text-[10px] px-2 shrink-0 ml-2">
                  {t('relancer') || 'Relancer'}
                </Button>
              </div>
            )}

            {alertsSummary && alertsSummary.totalAtRisk > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border-l-4 border-l-status-danger border border-edge/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-danger-bg rounded-lg text-status-danger shrink-0">
                    <ShieldAlert size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-content-primary text-xs truncate">
                      {alertsSummary.totalAtRisk} {t('clientsARisque') || 'clients a risque'}
                    </h4>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {alertsSummary.breakdown.blacklisted > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-danger-bg text-status-danger font-medium">{alertsSummary.breakdown.blacklisted} liste noire</span>
                      )}
                      {alertsSummary.breakdown.highRisk > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-danger-bg text-status-danger font-medium">{alertsSummary.breakdown.highRisk} risque</span>
                      )}
                      {alertsSummary.breakdown.kycExpired > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-warning-bg text-status-warning font-medium">{alertsSummary.breakdown.kycExpired} KYC</span>
                      )}
                      {alertsSummary.breakdown.idExpired > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-warning-bg text-status-warning font-medium">{alertsSummary.breakdown.idExpired} ID</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAlertsDrawerOpen(true)} className="h-6 text-[10px] px-2 shrink-0 ml-2">
                  {t('details') || 'Details'}
                </Button>
              </div>
            )}

            {upcomingPaymentsCount > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border-l-4 border-l-status-info border border-edge/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-info-bg rounded-lg text-status-info shrink-0">
                    <Banknote size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-content-primary text-xs truncate">
                      {upcomingPaymentsCount} {t('paiementsAVenir') || 'paiements a venir'}
                    </h4>
                    <p className="text-[10px] text-content-muted">Dans les 7 prochains jours</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits', 'echeancier')} className="h-6 text-[10px] px-2 shrink-0 ml-2">
                  {t('voir')}
                </Button>
              </div>
            )}

            {enquetesEnCours > 0 && ability.can(Actions.VIEW, Subjects.CREDIT) && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border-l-4 border-l-status-info border border-edge/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-info-bg rounded-lg text-status-info shrink-0">
                    <Search size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-content-primary text-xs truncate">
                      {enquetesEnCours} {t('enquetesEnCours') || 'enquetes en cours'}
                    </h4>
                    {(stats?.enquetes?.soumises || 0) > 0 && (
                      <p className="text-[10px] text-content-muted">{stats!.enquetes!.soumises} soumise(s)</p>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits', 'enquetes')} className="h-6 text-[10px] px-2 shrink-0 ml-2">
                  {t('voir')}
                </Button>
              </div>
            )}

            {alertsTotal === 0 && (
              <Card variant="default" className="bg-status-success/5 border-status-success/20 border-dashed py-2" role="status">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="p-1 bg-status-success-bg rounded-full" aria-hidden="true">
                      <CheckCircle2 size={10} className="text-status-success" />
                    </div>
                    <h4 className="text-status-success font-bold text-xs">{t('aucuneUrgence')}</h4>
                  </div>
                </div>
              </Card>
            )}
          </section>

          {/* Section: Santé 360 */}
          <section className="space-y-2" aria-labelledby="health-section-title">
            <h3 id="health-section-title" className="text-xs font-semibold text-content-muted uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} aria-hidden="true" />
              {t('santeFinanciere')}
            </h3>

            {/* Row 1: 3 KPI gauges */}
            <div className="grid grid-cols-3 gap-1.5">
              {([
                {
                  label: 'PAR 30',
                  value: par30,
                  format: (v: number) => `${v.toFixed(1)}%`,
                  target: '< 3%',
                  icon: AlertTriangle,
                  color: par30 > 5 ? 'text-status-danger' : par30 > 3 ? 'text-status-warning' : 'text-status-success',
                  barColor: par30 > 5 ? 'bg-status-danger' : par30 > 3 ? 'bg-status-warning' : 'bg-status-success',
                  barPct: Math.min(par30 * 10, 100),
                },
                {
                  label: 'Liquidité',
                  value: liquidityRatio,
                  format: (v: number) => `${v}%`,
                  target: 'L/D',
                  icon: TrendingUp,
                  color: liquidityRatio >= 100 ? 'text-status-success' : liquidityRatio >= 50 ? 'text-status-warning' : 'text-status-danger',
                  barColor: liquidityRatio >= 100 ? 'bg-status-info' : liquidityRatio >= 50 ? 'bg-status-warning' : 'bg-status-danger',
                  barPct: Math.min(liquidityRatio, 100),
                },
                {
                  label: 'Recouv.',
                  value: tauxRecouvrement,
                  format: (v: number) => `${v.toFixed(0)}%`,
                  target: '> 95%',
                  icon: Target,
                  color: tauxRecouvrement >= 95 ? 'text-status-success' : tauxRecouvrement >= 80 ? 'text-status-warning' : 'text-status-danger',
                  barColor: tauxRecouvrement >= 95 ? 'bg-status-success' : tauxRecouvrement >= 80 ? 'bg-status-warning' : 'bg-status-danger',
                  barPct: Math.min(tauxRecouvrement, 100),
                },
              ] as const).map(kpi => (
                <div key={kpi.label} className="bg-surface/50 border border-edge/40 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] text-content-muted font-medium">{kpi.label}</span>
                    <kpi.icon size={10} className={kpi.color} />
                  </div>
                  <div className={`text-sm font-bold leading-tight ${kpi.color}`}>{kpi.format(kpi.value)}</div>
                  <div className="w-full h-0.5 bg-surface-elevated rounded-full overflow-hidden mt-1">
                    <div className={`h-full rounded-full ${kpi.barColor}`} style={{ width: `${kpi.barPct}%` }} />
                  </div>
                  <p className="text-[8px] text-content-muted mt-0.5">{kpi.target}</p>
                </div>
              ))}
            </div>

            {/* Row 2: Portfolio + Activity compact */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-surface/50 border border-edge/40 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard size={10} className="text-accent" />
                  <span className="text-[9px] text-content-muted font-medium">Portefeuille</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Crédits actifs</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.creditsEnCours || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">En retard</span>
                    <span className={`text-[10px] font-bold ${overdueInstallments > 0 ? 'text-status-danger' : 'text-content-primary'}`}>{overdueInstallments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Épargnes</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.epargneActive || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Tontines</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.tontinesActives || 0}</span>
                  </div>
                </div>
              </div>
              <div className="bg-surface/50 border border-edge/40 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users size={10} className="text-status-info" />
                  <span className="text-[9px] text-content-muted font-medium">Activité</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Agents</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.agentsActifs || 0}/{stats?.global?.totalAgents || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Clients actifs</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.clientsActifs || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Nouv. clients</span>
                    <span className="text-[10px] font-bold text-accent">{stats?.daily?.nouveauxClients || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-content-muted">Caisses ouv.</span>
                    <span className="text-[10px] font-bold text-content-primary">{stats?.global?.sessionsOuvertes || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Scoring compact */}
            {scoreStats && scoreStats.length > 0 && (() => {
              const agg = scoreStats.reduce((acc, s) => ({
                totalClients: acc.totalClients + s.totalClients,
                sumScore: acc.sumScore + s.avgScore * s.totalClients,
                VIP: acc.VIP + s.segments.VIP,
                Premium: acc.Premium + s.segments.Premium,
                Standard: acc.Standard + s.segments.Standard,
                Risque: acc.Risque + s.segments.Risque,
              }), { totalClients: 0, sumScore: 0, VIP: 0, Premium: 0, Standard: 0, Risque: 0 });
              const avgScore = agg.totalClients > 0 ? Math.round(agg.sumScore / agg.totalClients) : 0;
              const scoreColor = avgScore >= 80 ? 'text-status-success' : avgScore >= 65 ? 'text-status-info' : avgScore >= 40 ? 'text-status-warning' : 'text-status-danger';
              const segments = [
                { label: 'VIP', count: agg.VIP, color: 'bg-status-success' },
                { label: 'Prem.', count: agg.Premium, color: 'bg-status-info' },
                { label: 'Std', count: agg.Standard, color: 'bg-status-warning' },
                { label: 'Risq.', count: agg.Risque, color: 'bg-status-danger' },
              ];
              return (
                <div className="bg-surface/50 border border-edge/40 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 size={10} className="text-content-muted" />
                      <span className="text-[9px] text-content-muted font-medium">Scoring</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-sm font-bold ${scoreColor}`}>{avgScore}</span>
                      <span className="text-[8px] text-content-muted">/ 100</span>
                    </div>
                  </div>
                  {/* Stacked bar */}
                  <div className="flex h-2 rounded-full overflow-hidden bg-surface-elevated mb-1.5">
                    {segments.map(seg => {
                      const pct = agg.totalClients > 0 ? (seg.count / agg.totalClients) * 100 : 0;
                      return pct > 0 ? <div key={seg.label} className={`${seg.color}`} style={{ width: `${pct}%` }} /> : null;
                    })}
                  </div>
                  {/* Legend row */}
                  <div className="flex justify-between">
                    {segments.map(seg => (
                      <div key={seg.label} className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${seg.color}`} />
                        <span className="text-[9px] text-content-muted">{seg.label}</span>
                        <span className="text-[9px] font-semibold text-content-secondary">{seg.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

        </aside>

      </div>

      <AlertsDrawer open={alertsDrawerOpen} onClose={() => setAlertsDrawerOpen(false)} />
    </main>
  );
}
