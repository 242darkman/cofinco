
import React, { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import {
  Building2,
  Wifi,
  WifiOff,
  UserPlus,
  Wallet,
  Banknote,
  Users,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Database
} from 'lucide-react';

import { Button, Card, Badge, ProgressBar } from '../ui';
import { useAgence } from '../../contexts/AgenceContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDashboardStats } from '../../hooks/dashboard/useDashboardStats';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { useEncaisse } from '../../hooks/treasury/useEncaisse';
import { useAbility } from '../../contexts/AbilityContext';
import { Actions, Subjects, type Action, type Subject } from '../../lib/casl';

import AgencySelector from './AgencySelector';
import AnalyticsGrid from './AnalyticsGrid';

const ComparativeAnalytics = React.lazy(() => import('./ComparativeAnalytics'));

interface DashboardProps {
  userRole?: string;
  userName?: string;
  onModuleChange?: (module: string) => void;
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

  // Treasury v2: Single Source of Truth depuis le Grand Livre (GL)
  const { data: encaisse, isLoading: encaisseLoading } = useEncaisse(selectedAgence?.id);

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
          { key: 'tontines', module: 'tontines', action: 'view', icon: Users, label: t('collecteTontine'),
            btnClass: 'bg-status-info-bg hover:bg-status-info-bg border-status-info/20 text-status-info',
            iconClass: 'bg-status-info', handler: () => onModuleChange?.('tontines') },
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
          <section className="space-y-2" aria-labelledby="tasks-section-title">
            <h3 id="tasks-section-title" className="text-xs font-semibold text-content-muted uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={12} aria-hidden="true" />
              {t('aTraiter')}
            </h3>

            {pendingCredits > 0 ? (
              <Card variant="default" className="border-l-4 border-l-status-warning bg-surface/50" role="alert" aria-live="polite">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-status-warning-bg rounded-lg text-status-warning" aria-hidden="true">
                      <Clock size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-content-primary text-xs">
                        {pendingCredits} {t('demandesAttente')}
                      </h4>
                      <p className="text-[10px] text-content-muted">{t('validationRequise')}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onModuleChange?.('credits')}
                    className="h-7 text-xs px-2"
                    aria-label={`${t('voir')} ${pendingCredits} ${t('demandesAttente')}`}
                  >
                    {t('voir')}
                  </Button>
                </div>
              </Card>
            ) : null}

            {overdueInstallments > 0 ? (
              <Card variant="default" className="border-l-4 border-l-status-danger bg-surface/50" role="alert" aria-live="polite">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-status-danger-bg rounded-lg text-status-danger" aria-hidden="true">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-content-primary text-xs">
                        {overdueInstallments} {t('echeancesRetard')}
                      </h4>
                      <p className="text-[10px] text-content-muted">{t('aRelancer')}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onModuleChange?.('credits')}
                    className="h-7 text-xs px-2"
                    aria-label={`${t('relancer') || 'Relancer'} ${overdueInstallments} ${t('echeancesRetard')}`}
                  >
                    {t('relancer') || 'Relancer'}
                  </Button>
                </div>
              </Card>
            ) : null}

            {pendingCredits === 0 && overdueInstallments === 0 && (
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

          {/* Section: Santé & Risque */}
          <section className="space-y-2" aria-labelledby="health-section-title">
            <h3 id="health-section-title" className="text-xs font-semibold text-content-muted uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} aria-hidden="true" />
              {t('santeFinanciere')}
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {/* Jauge Risque PAR 30 */}
              <Card variant="default" padding="sm" className="bg-surface/40 p-2">
                 <div className="flex items-center justify-between mb-1">
                   <span id="par30-label" className="text-[10px] text-content-muted">{t('risquePar30')}</span>
                   <AlertTriangle size={12} className={par30 > 5 ? 'text-status-danger' : 'text-content-muted'} aria-hidden="true" />
                 </div>
                 <div className="text-lg font-bold text-content-primary mb-1.5" aria-live="polite">{par30.toFixed(1)}%</div>
                 <div
                   className="w-full h-1 bg-surface-elevated rounded-full overflow-hidden"
                   role="progressbar"
                   aria-labelledby="par30-label"
                   aria-valuenow={par30}
                   aria-valuemin={0}
                   aria-valuemax={10}
                 >
                   <div
                      className={`h-full rounded-full ${par30 > 5 ? 'bg-status-danger' : par30 > 3 ? 'bg-status-warning' : 'bg-status-success'}`}
                      style={{ width: `${Math.min(par30 * 10, 100)}%` }}
                   />
                 </div>
                 <p className="text-[9px] text-content-muted mt-1">{t('ciblePar30')}</p>
              </Card>

              {/* Jauge Liquidité */}
              <Card variant="default" padding="sm" className="bg-surface/40 p-2">
                 <div className="flex items-center justify-between mb-1">
                   <span id="liquidity-label" className="text-[10px] text-content-muted">{t('liquidite')}</span>
                   <TrendingUp size={12} className="text-status-info" aria-hidden="true" />
                 </div>
                 <div className="text-lg font-bold text-content-primary mb-1.5" aria-live="polite">{liquidityRatio}%</div>
                 <div
                   className="w-full h-1 bg-surface-elevated rounded-full overflow-hidden"
                   role="progressbar"
                   aria-labelledby="liquidity-label"
                   aria-valuenow={liquidityRatio}
                   aria-valuemin={0}
                   aria-valuemax={100}
                 >
                   <div
                      className="h-full rounded-full bg-status-info"
                      style={{ width: `${liquidityRatio}%` }}
                   />
                 </div>
                 <p className="text-[9px] text-content-muted mt-1">{t('ratioLiquidite')}</p>
              </Card>
            </div>

             <Card variant="default" className="flex items-center justify-between p-2.5 bg-surface/40">
               <div className="flex items-center gap-2">
                 <div
                   className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center font-bold text-xs text-content-secondary border-2 border-edge-strong"
                   aria-label={`${stats?.global?.agentsActifs || 0} ${t('agentsActifs') || 'agents actifs'}`}
                 >
                   {stats?.global?.agentsActifs || 0}
                 </div>
                 <div>
                   <div className="text-xs font-medium text-content-primary">{t('activiteAgents')}</div>
                   <div className="text-[9px] text-content-muted">
                     {stats?.global?.totalAgents ? `${stats.global.agentsActifs || 0} / ${stats.global.totalAgents} ${t('actifs')}` : '-'}
                   </div>
                 </div>
               </div>
               <div className="h-6 w-[1px] bg-surface-elevated mx-2" aria-hidden="true"></div>
               <div>
                 <div className="text-xs font-bold text-content-primary text-right" aria-live="polite">{stats?.daily.nouveauxClients || 0}</div>
                 <div className="text-[9px] text-content-muted text-right">{t('nouveauxClients')}</div>
               </div>
             </Card>
          </section>
        </aside>

      </div>
    </main>
  );
}
