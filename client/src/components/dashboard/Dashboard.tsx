
import React, { useState, useEffect, Suspense } from 'react';
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
  ArrowUpRight
} from 'lucide-react';

import { Button, Card, Badge, ProgressBar } from '../ui';
import { useAgence } from '../../contexts/AgenceContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDashboardStats } from '../../hooks/dashboard/useDashboardStats';
import { useWebSocketContext } from '../../contexts/WebSocketContext';


import AgencySelector from './AgencySelector';
import AnalyticsGrid from './AnalyticsGrid';

interface DashboardProps {
  userRole?: string;
  userName?: string;
  onModuleChange?: (module: string) => void;
  onQuickAction?: (action: string) => void;
  onLogout?: () => void;
}

export default function Dashboard({ 
  userRole = 'user', 
  userName = 'Utilisateur',
  onModuleChange,
  onQuickAction
}: DashboardProps) {
  const { t } = useLanguage();
  const { selectedAgence, agences, selectAgence, isAdmin } = useAgence();
  const { isConnected } = useWebSocketContext();
  const { stats, loading, refresh } = useDashboardStats(userRole);

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
  
  // Treasury Indicator (KPI #1)
  // Combine safe and cash balances if available, otherwise fallback to stats
  // Combine safe and cash balances if available, otherwise fallback to stats
  const totalTreasury = stats?.global?.tresorerieDispo || 0;
  const isLowTreasury = totalTreasury < 500000; // Example threshold

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
    <div className="flex flex-col h-full space-y-2 pb-0 py-2 overflow-hidden">
      
      {/* 1. Header Intelligent */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none">
              {formatMoney(totalTreasury)}
            </h1>
            <div className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
              totalTreasury > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}>
              {t('encaisseDisponible')}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
             <span className={isConnected ? "text-emerald-500" : "text-slate-500"}>
               {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
             </span>
             <span>{isConnected ? t('enLigne') : t('horsLigne')}</span>
             <span className="w-0.5 h-0.5 bg-slate-700 rounded-full" />
             <span className="capitalize">{userName}</span>
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

      {/* 2. Quick Actions Section (Keep outside as a header-like element) */}
      <section className="grid grid-cols-4 gap-2 shrink-0">
        <Button 
          variant="secondary"
          className="h-auto py-2 flex flex-col gap-1 items-center justify-center bg-blue-600/10 hover:bg-blue-600/20 border-blue-600/20 text-blue-400"
          onClick={() => onQuickAction?.('new-client')}
        >
          <div className="p-1.5 bg-blue-500 rounded-lg text-white shadow-sm">
            <UserPlus size={16} />
          </div>
          <span className="text-[10px] font-semibold">{t('nouveauClient')}</span>
        </Button>

        <Button 
          variant="secondary"
          className="h-auto py-2 flex flex-col gap-1 items-center justify-center bg-emerald-600/10 hover:bg-emerald-600/20 border-emerald-600/20 text-emerald-400"
          onClick={() => onQuickAction?.('new-payment')}
        >
          <div className="p-1.5 bg-emerald-500 rounded-lg text-white shadow-sm">
            <Wallet size={16} />
          </div>
          <span className="text-[10px] font-semibold">{t('operationCaisse')}</span>
        </Button>

        <Button 
          variant="secondary"
          className="h-auto py-2 flex flex-col gap-1 items-center justify-center bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-600/20 text-indigo-400"
          onClick={() => onQuickAction?.('new-credit')}
        >
          <div className="p-1.5 bg-indigo-500 rounded-lg text-white shadow-sm">
            <Banknote size={16} />
          </div>
          <span className="text-[10px] font-semibold">{t('creditRapide')}</span>
        </Button>

        <Button 
          variant="secondary"
          className="h-auto py-2 flex flex-col gap-1 items-center justify-center bg-purple-600/10 hover:bg-purple-600/20 border-purple-600/20 text-purple-400"
          onClick={() => onModuleChange?.('tontines')}
        >
          <div className="p-1.5 bg-purple-500 rounded-lg text-white shadow-sm">
            <Users size={16} />
          </div>
          <span className="text-[10px] font-semibold">{t('collecteTontine')}</span>
        </Button>
      </section>

      {/* 3. Main Content Grid: Analytics (Left) & Pilotage (Right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3 pr-1 overflow-y-auto no-scrollbar pb-2">
        
        {/* LEFT COLUMN: Analytics (66%) */}
        <div className="lg:col-span-2 space-y-2 flex flex-col">
           <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
            <Activity size={12} />
            {t('analytique')}
          </h3>
          <div className="flex-1 min-h-0 bg-slate-900/30 rounded-xl p-2 border border-slate-800/50">
             <AnalyticsGrid stats={stats} />
          </div>
        </div>

        {/* RIGHT COLUMN: Pilotage (33%) */}
        <div className="lg:col-span-1 space-y-3 overflow-y-auto no-scrollbar">
          
          {/* Section: À Traiter */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={12} />
              {t('aTraiter')}
            </h3>

            {pendingCredits > 0 ? (
              <Card variant="default" className="border-l-4 border-l-amber-500 bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
                      <Clock size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">
                        {pendingCredits} {t('demandesAttente')}
                      </h4>
                      <p className="text-[10px] text-slate-400">{t('validationRequise')}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits')} className="h-7 text-xs px-2">
                    {t('voir')}
                  </Button>
                </div>
              </Card>
            ) : null}

            {overdueInstallments > 0 ? (
              <Card variant="default" className="border-l-4 border-l-rose-500 bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/20 rounded-lg text-rose-500">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">
                        {overdueInstallments} {t('echeancesRetard')}
                      </h4>
                      <p className="text-[10px] text-slate-400">{t('aRelancer')}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onModuleChange?.('credits')} className="h-7 text-xs px-2">
                    {t('relancer') || 'Relancer'}
                  </Button>
                </div>
              </Card>
            ) : null}

            {pendingCredits === 0 && overdueInstallments === 0 && (
               <Card variant="default" className="bg-emerald-500/5 border-emerald-500/20 border-dashed py-2">
                 <div className="flex flex-col items-center justify-center text-center">
                   <div className="flex items-center gap-1.5 mb-0.5">
                     <div className="p-1 bg-emerald-500/20 rounded-full">
                       <CheckCircle2 size={10} className="text-emerald-400" />
                     </div>
                     <h4 className="text-emerald-400 font-bold text-xs">{t('aucuneUrgence')}</h4>
                   </div>
                 </div>
               </Card>
            )}
          </div>

          {/* Section: Santé & Risque */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} />
              {t('santeFinanciere')}
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {/* Jauge Risque PAR 30 */}
              <Card variant="default" padding="sm" className="bg-slate-800/40 p-2">
                 <div className="flex items-center justify-between mb-1">
                   <span className="text-[10px] text-slate-400">{t('risquePar30')}</span>
                   <AlertTriangle size={12} className={par30 > 5 ? 'text-rose-500' : 'text-slate-600'} />
                 </div>
                 <div className="text-lg font-bold text-white mb-1.5">{par30.toFixed(1)}%</div>
                 <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                   <div 
                      className={`h-full rounded-full ${par30 > 5 ? 'bg-rose-500' : par30 > 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${Math.min(par30 * 10, 100)}%` }} 
                   />
                 </div>
                 <p className="text-[9px] text-slate-500 mt-1">{t('ciblePar30')}</p>
              </Card>

              {/* Jauge Liquidité */}
              <Card variant="default" padding="sm" className="bg-slate-800/40 p-2">
                 <div className="flex items-center justify-between mb-1">
                   <span className="text-[10px] text-slate-400">{t('liquidite')}</span>
                   <TrendingUp size={12} className="text-blue-500" />
                 </div>
                 <div className="text-lg font-bold text-white mb-1.5">{liquidityRatio}%</div>
                 <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                   <div 
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${liquidityRatio}%` }} 
                   />
                 </div>
                 <p className="text-[9px] text-slate-500 mt-1">{t('ratioLiquidite')}</p>
              </Card>
            </div>
            
             <Card variant="default" className="flex items-center justify-between p-2.5 bg-slate-800/40">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 border-2 border-slate-600">
                   {stats?.global?.agentsActifs || 0}
                 </div>
                 <div>
                   <div className="text-xs font-medium text-white">{t('activiteAgents')}</div>
                   <div className="text-[9px] text-slate-500">
                     {stats?.global?.totalAgents ? `${stats.global.agentsActifs || 0} / ${stats.global.totalAgents} ${t('actifs')}` : '-'}
                   </div>
                 </div>
               </div>
               <div className="h-6 w-[1px] bg-slate-700 mx-2"></div>
               <div>
                 <div className="text-xs font-bold text-white text-right">{stats?.daily.nouveauxClients || 0}</div>
                 <div className="text-[9px] text-slate-500 text-right">{t('nouveauxClients')}</div>
               </div>
             </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
