import React, { useState, useEffect } from 'react';
import {
  Users, CreditCard, PiggyBank, DollarSign, UserCheck, Briefcase,
  AlertTriangle, Clock, PieChart as PieChartIcon, BarChart3, Award,
  Activity, Banknote, Wallet
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Button, Card, StatCard } from '../ui';
import AnimatedBalance from '../finance/accounting/AnimatedBalance';
import BalanceHistoryChart from '../finance/accounting/BalanceHistoryChart';
import TransactionSearch from '../finance/operations/TransactionSearch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDashboardStats } from '../../hooks/dashboard/useDashboardStats';
import DashboardQuickActions from './DashboardQuickActions';
import DashboardHeader from './DashboardHeader';
import AdminStatsGrid from './AdminStatsGrid';
import PerformanceIndicators from './PerformanceIndicators';
import { SystemRole, getRoleLabel as getSystemRoleLabel, normalizeRole } from '@shared/types/roles';
import {
  AlertsWidget,
  PerformanceGauge,
  QuickStats,
  UpcomingPayments,
  ObjectivesWidget,
  LiveActivityFeed,
  TopClientsWidget
} from './DashboardGadgets';

interface DashboardProps {
  userRole?: SystemRole | string;
  userName?: string;
  onModuleChange?: (module: string) => void;
  onLogout?: () => void;
  onQuickAction?: (action: string) => void;
}

export default function Dashboard({ 
  userRole = 'agent', 
  userName = 'Utilisateur', 
  onModuleChange, 
  onLogout,
  onQuickAction
}: DashboardProps) {
  const { t, language } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const normalizedRole = normalizeRole(userRole) || SystemRole.CLIENT;
  const { stats, loading, error, refresh } = useDashboardStats(normalizedRole);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'fr-FR').format(amount) + ' FCFA';
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return t('bonjour');
    if (hour < 18) return t('bonApresMidi');
    return t('bonsoir');
  };

  const getRoleLabel = (role: string) => {
    const normalized = normalizeRole(role);
    if (!normalized) return getSystemRoleLabel(role);

    const roleLabels: Record<SystemRole, string> = {
      [SystemRole.ADMIN]: t('administrateur'),
      [SystemRole.CHEF_AGENCE]: t('chefAgence'),
      [SystemRole.SUPERVISEUR]: t('superviseur'),
      [SystemRole.COMPTABLE]: t('comptable'),
      [SystemRole.CAISSIER]: t('agentCaisse'),
      [SystemRole.GESTIONNAIRE_CREDIT]: t('gestionnaireCredit'),
      [SystemRole.AGENT_TERRAIN]: t('agent'),
      [SystemRole.CLIENT]: t('client')
    };

    return roleLabels[normalized] || getSystemRoleLabel(normalized);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card variant="default" padding="lg">
        <div className="text-center" data-testid="dashboard-error">
          <AlertTriangle className="mx-auto text-amber-400 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-white mb-2">{t('tableauBordIndisponible')}</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <Button variant="success" size="md" onClick={refresh} data-testid="button-retry">
            {t('reessayer')}
          </Button>
        </div>
      </Card>
    );
  }

  const g = stats.global;
  const d = stats.daily || { nouveauxClients: 0, nouveauxCredits: 0 };  // Today's data
  const w = stats.weekly || { nouveauxClients: 0, nouveauxCredits: 0 }; // Last 7 days data
  const isAdmin = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="dashboard-container">
      {/* Quick Actions Bar */}
      <Card variant="default" padding="md">
        <DashboardQuickActions onModuleChange={onModuleChange} onQuickAction={onQuickAction} t={t} />
      </Card>

      {/* Header with Greeting */}
      <DashboardHeader
        userName={userName}
        userRole={userRole}
        currentTime={currentTime}
        language={language}
        onRefresh={refresh}
        isRefreshing={loading}
        getGreeting={getGreeting}
        getRoleLabel={getRoleLabel}
        t={t}
      />

      {/* Admin View */}
      {isAdmin && (
        <>
          <AdminStatsGrid stats={g} recent={w} t={t} />

          {/* Financial Cards - Compact Mobile-First */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {/* Volume des Crédits */}
            <Card variant="default" padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                  <DollarSign className="text-emerald-400" size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-white truncate">{t('volumeCredits')}</h3>
                  <p className="text-slate-500 text-[9px] sm:text-[10px]">{t('totalMontantsOctroyes')}</p>
                </div>
              </div>
              <AnimatedBalance
                value={g.montantCreditsTotal || 0}
                previousValue={(g.montantCreditsTotal || 0) * 0.95}
                size="md"
                colorScheme="success"
              />
            </Card>

            {/* Agents Terrain */}
            <Card variant="default" padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                  <Briefcase className="text-cyan-400" size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-white truncate">{t('agentsTerrain')}</h3>
                  <p className="text-slate-500 text-[9px] sm:text-[10px]">{t('performanceEquipe')}</p>
                </div>
              </div>
              <p className="text-lg sm:text-xl font-bold text-cyan-400" data-testid="text-agents-actifs">
                {g.agentsActifs || 0} <span className="text-sm text-slate-500">/ {g.totalAgents || 0}</span>
              </p>
              <p className="text-[9px] sm:text-[10px] text-slate-500">{t('agentsActifs')}</p>
            </Card>

            {/* Alertes */}
            <Card variant="default" padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-amber-500/20 rounded-lg">
                  <AlertTriangle className="text-amber-400" size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-white truncate">{t('alertes')}</h3>
                  <p className="text-slate-500 text-[9px] sm:text-[10px]">{t('situationsASurveiller')}</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[10px] sm:text-xs">{t('creditsEnRetard')}</span>
                  <span className="text-amber-400 font-bold text-sm" data-testid="text-credits-retard">
                    {g.creditsRetard || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[10px] sm:text-xs">{t('sessionsOuvertes')}</span>
                  <span className="text-cyan-400 font-bold text-sm">{g.sessionsOuvertes || 0}</span>
                </div>
              </div>
            </Card>
          </div>

          <BalanceHistoryChart title={t('evolutionSoldes')} />

          {/* Charts Grid - Mobile First */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Product Distribution Chart */}
            <Card variant="default" padding="md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                    <PieChartIcon className="text-emerald-400" size={16} />
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-white">{t('repartitionProduits')}</h3>
                </div>
              </div>
              <div className="h-40 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.charts.productSplit}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {stats.charts.productSplit.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, '']}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Inline Stats */}
              <div className="flex justify-around pt-3 border-t border-slate-700/50">
                {stats.charts.productSplit.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] sm:text-xs text-slate-400">{item.name}</span>
                    <span className="text-[10px] sm:text-xs font-bold" style={{ color: item.color }}>{item.value}%</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Credit Status Chart */}
            <Card variant="default" padding="md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                    <BarChart3 className="text-cyan-400" size={16} />
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-white">{t('statutCredits')}</h3>
                </div>
              </div>
              <div className="h-40 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.charts.creditStatus}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      stroke="#64748b" 
                      width={60} 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, '']}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                      {stats.charts.creditStatus.map((entry, index) => (
                        <Cell key={`bar-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Inline Stats */}
              <div className="flex justify-around pt-3 border-t border-slate-700/50">
                {stats.charts.creditStatus.map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-400">{item.name}</span>
                    <span className="text-xs font-bold" style={{ color: item.color }}>{item.value}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <PerformanceIndicators stats={g} t={t} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
            <AlertsWidget alerts={stats.widgets.alerts} />
            <UpcomingPayments payments={stats.widgets.upcomingPayments} />
            <LiveActivityFeed activities={stats.widgets.recentActivity} />
            <TopClientsWidget clients={stats.widgets.topClients} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            <PerformanceGauge
              value={g.tauxRecouvrement ?? 0}
              label="Taux de Recouvrement"
            />
            <ObjectivesWidget 
              objectif={stats.objectives?.monthlyGoal || 30} 
              actuel={stats.objectives?.monthlyCredits || 0} 
            />
            <QuickStats stats={[
              { icon: Users, label: t('activeClients') || 'Clients actifs', value: g.clientsActifs?.toString() || '0', trend: `+${w.nouveauxClients || 0}`, up: true },
              { icon: CreditCard, label: t('creditsActifs') || 'Crédits actifs', value: g.creditsEnCours?.toString() || '0', trend: `+${w.nouveauxCredits || 0}`, up: true },
              { icon: Wallet, label: t('epargnes') || 'Épargnes', value: (g.montantEpargneTotal ? (g.montantEpargneTotal / 1000000).toFixed(1) + 'M' : '0'), trend: '+0%', up: true },
              { icon: Activity, label: t('transactions') || 'Tontines', value: g.tontinesActives?.toString() || '0', trend: '+0%', up: true }
            ]} />
          </div>

          {/* Résumé Journalier - Compact Mobile-First */}
          <Card variant="default" padding="sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-1.5">
                <div className="p-1 bg-emerald-500/20 rounded">
                  <Activity className="text-emerald-400" size={12} />
                </div>
                <span className="text-slate-300 text-xs font-medium">Aujourd'hui</span>
              </div>
              <span className="text-[10px] text-slate-500">
                {currentTime.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' })}
              </span>
            </div>
            <div className="flex flex-row justify-around gap-1">
              <div className="flex flex-col items-center p-2 rounded bg-emerald-500/10 flex-1">
                <div className="text-base sm:text-lg font-bold text-emerald-400">{d.nouveauxClients || 0}</div>
                <div className="text-[9px] sm:text-[10px] text-slate-400">Clients</div>
              </div>
              <div className="flex flex-col items-center p-2 rounded bg-cyan-500/10 flex-1">
                <div className="text-base sm:text-lg font-bold text-cyan-400">{d.nouveauxCredits || 0}</div>
                <div className="text-[9px] sm:text-[10px] text-slate-400">Crédits</div>
              </div>
              <div className="flex flex-col items-center p-2 rounded bg-purple-500/10 flex-1">
                <div className="text-base sm:text-lg font-bold text-purple-400">{g.sessionsOuvertes || 0}</div>
                <div className="text-[9px] sm:text-[10px] text-slate-400">Sessions</div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Comptable View */}
      {normalizedRole === SystemRole.COMPTABLE && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard title={t('volumeCredits')} value={formatMoney(g.montantCreditsTotal || 0)} subtitle={`${g.creditsEnCours || 0} ${t('creditsActifs')}`} icon={DollarSign} color="success" />
            <StatCard title={t('volumeEpargnes')} value={formatMoney(g.montantEpargneTotal || 0)} subtitle={`${g.totalEpargnes || 0} ${t('comptes')}`} icon={PiggyBank} color="warning" />
            <StatCard title={t('creditsEnRetard')} value={g.creditsRetard || 0} subtitle={t('aRecouvrer')} icon={AlertTriangle} color="warning" />
          </div>
          <BalanceHistoryChart title={t('evolutionFinanciere')} />
          <TransactionSearch />
        </>
      )}

      {/* Other roles views - simplified */}
      {(normalizedRole === SystemRole.CAISSIER || normalizedRole === SystemRole.AGENT_TERRAIN) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard title={t('clients')} value={g.totalClients || 0} subtitle={`${g.clientsActifs || 0} ${t('activeClients')}`} icon={Users} color="primary" />
            <StatCard title={t('credits')} value={g.creditsEnCours || 0} subtitle={`${g.creditsEnAttente || 0} ${t('enAttente')}`} icon={CreditCard} color="success" />
            <StatCard        title={t('epargnes')}
        value={g.totalEpargnes || 0} subtitle={t('comptesActifs')} icon={PiggyBank} color="warning" />
          </div>
          <Card variant="default" padding="md">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="text-emerald-400" size={24} />
              {t('accesRapide')}
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Button variant="secondary" size="md" icon={Users} iconPosition="left" className="justify-start">{t('nouveauClient')}</Button>
              <Button variant="secondary" size="md" icon={PiggyBank} iconPosition="left" className="justify-start">{t('nouvelleEpargne')}</Button>
              <Button variant="secondary" size="md" icon={CreditCard} iconPosition="left" className="justify-start">{t('nouveauCredit')}</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
