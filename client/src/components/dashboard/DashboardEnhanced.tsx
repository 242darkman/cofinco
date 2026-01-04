import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, PiggyBank, AlertCircle, CheckCircle, FileText, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend
} from 'recharts';

import { useDashboardStats } from '../../hooks/dashboard/useDashboardStats';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
        <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardEnhanced() {
  const { stats, loading } = useDashboardStats();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'FCFA',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatCompact = (value: number) => {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-56 sm:h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <div className="text-slate-400">Chargement des statistiques...</div>
        </div>
      </div>
    );
  }

  const g = stats.global;
  const wk = stats.weekly || { nouveauxClients: 0, nouveauxCredits: 0 };
  const c = stats.charts;
  const wdg = stats.widgets;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <div className="group relative overflow-hidden bg-gradient-to-br from-blue-600/90 to-cyan-600/90 rounded-2xl p-4 sm:p-6 text-white shadow-xl hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 min-w-0" data-testid="card-stat-clients">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Users size={24} />
              </div>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs font-bold">
                <ArrowUpRight size={14} />
                +{wk.nouveauxClients}
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-bold mb-1">{g.totalClients}</div>
            <div className="text-sm text-blue-100">Clients actifs</div>
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-600/90 to-green-600/90 rounded-2xl p-4 sm:p-6 text-white shadow-xl hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 min-w-0" data-testid="card-stat-credits">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <DollarSign size={24} />
              </div>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs font-bold">
                <Activity size={14} />
                {g.creditsEnCours} actifs
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-bold mb-1">{formatCompact(g.montantCreditsTotal)}</div>
            <div className="text-sm text-emerald-100">Crédits en cours</div>
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-cyan-600/90 to-teal-600/90 rounded-2xl p-4 sm:p-6 text-white shadow-xl hover:shadow-2xl hover:shadow-cyan-500/20 transition-all duration-300 min-w-0" data-testid="card-stat-epargne">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <PiggyBank size={24} />
              </div>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs font-bold">
                <TrendingUp size={14} />
                +{Math.round(g.epargneActive / g.totalEpargnes * 100 || 0)}%
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-bold mb-1">{formatCompact(g.montantEpargneTotal)}</div>
            <div className="text-sm text-cyan-100">Épargne totale</div>
          </div>
        </div>

        <div className="group relative overflow-hidden bg-gradient-to-br from-indigo-600/90 to-purple-600/90 rounded-2xl p-4 sm:p-6 text-white shadow-xl hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 min-w-0" data-testid="card-stat-tontines">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Users size={24} />
              </div>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs font-bold">
                Actives
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-bold mb-1">{g.tontinesActives}</div>
            <div className="text-sm text-indigo-100">Tontines</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="chart-evolution">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-cyan-400" size={20} />
              Évolution Mensuelle
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                <span className="text-slate-400">Clients</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-slate-400">Crédits</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-slate-400">Épargne</span>
              </div>
            </div>
          </div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={c.monthlyGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEpargne" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="clients" stroke="#06b6d4" strokeWidth={2} fill="url(#colorClients)" />
                <Area type="monotone" dataKey="credits" stroke="#10b981" strokeWidth={2} fill="url(#colorCredits)" />
                <Area type="monotone" dataKey="epargne" stroke="#3b82f6" strokeWidth={2} fill="url(#colorEpargne)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="chart-activity">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-emerald-400" size={20} />
              Activité Hebdomadaire
            </h3>
          </div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.weeklyActivity} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="transactions" name="Transactions" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collectes" name="Collectes" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 items-stretch">
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="chart-products">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <PiggyBank className="text-cyan-400" size={20} />
            Répartition Produits
          </h3>
          <div className="h-48 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={c.productSplit}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {c.productSplit.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-4">
            {c.productSplit.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-slate-400">{item.name}</span>
                <span className="text-sm font-bold text-white">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="chart-credit-status">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <DollarSign className="text-emerald-400" size={20} />
            Statut des Crédits
          </h3>
          <div className="h-48 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={c.creditStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {c.creditStatus.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {c.creditStatus.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-slate-400">{item.name}</span>
                <span className="text-xs font-bold text-white">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="section-quick-access">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
            <FileText className="text-cyan-400" size={20} />
            Accès Rapides
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className="group w-full min-w-0 p-3 sm:p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 hover:from-blue-600/30 hover:to-cyan-600/30 border border-blue-500/30 rounded-xl transition-all duration-300 hover:scale-[1.02]" data-testid="button-quick-clients">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                  <Users size={20} className="text-blue-400" />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-semibold text-white">Clients</div>
                  <div className="text-xs text-slate-400">{g.totalClients} inscrits</div>
                </div>
              </div>
            </button>
            <button className="group w-full min-w-0 p-3 sm:p-4 bg-gradient-to-br from-emerald-600/20 to-green-600/20 hover:from-emerald-600/30 hover:to-green-600/30 border border-emerald-500/30 rounded-xl transition-all duration-300 hover:scale-[1.02]" data-testid="button-quick-credits">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                  <DollarSign size={20} className="text-emerald-400" />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-semibold text-white">Crédits</div>
                  <div className="text-xs text-slate-400">{g.creditsEnCours} actifs</div>
                </div>
              </div>
            </button>
            <button className="group w-full min-w-0 p-3 sm:p-4 bg-gradient-to-br from-cyan-600/20 to-teal-600/20 hover:from-cyan-600/30 hover:to-teal-600/30 border border-cyan-500/30 rounded-xl transition-all duration-300 hover:scale-[1.02]" data-testid="button-quick-epargne">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
                  <PiggyBank size={20} className="text-cyan-400" />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-semibold text-white">Épargnes</div>
                  <div className="text-xs text-slate-400">Comptes actifs</div>
                </div>
              </div>
            </button>
            <button className="group w-full min-w-0 p-3 sm:p-4 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 hover:from-indigo-600/30 hover:to-purple-600/30 border border-indigo-500/30 rounded-xl transition-all duration-300 hover:scale-[1.02]" data-testid="button-quick-tontines">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                  <Users size={20} className="text-indigo-400" />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-semibold text-white">Tontines</div>
                  <div className="text-xs text-slate-400">{g.tontinesActives} groupes</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="section-activity">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-emerald-400" size={20} />
            Activité Récente
          </h3>
          <div className="space-y-3">
            {wdg.recentActivity.map((activity: any, index: number) => (
              <div key={index} className={`flex items-center gap-3 p-3 border rounded-xl transition-all ${
                activity.type === 'credit' ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' :
                activity.type === 'client' ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20' :
                activity.type === 'savings' ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' :
                'bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20'
              }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activity.type === 'credit' ? 'bg-emerald-500/20' :
                  activity.type === 'client' ? 'bg-blue-500/20' :
                  activity.type === 'savings' ? 'bg-indigo-500/20' :
                  'bg-cyan-500/20'
                }`}>
                  {activity.type === 'credit' ? <CheckCircle size={18} className="text-emerald-400" /> :
                   activity.type === 'client' ? <Users size={18} className="text-blue-400" /> :
                   activity.type === 'savings' ? <PiggyBank size={18} className="text-indigo-400" /> :
                   <DollarSign size={18} className="text-cyan-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white font-medium">{activity.action}</div>
                    <div className="text-xs text-slate-500">{activity.time}</div>
                  </div>
                  <div className="text-xs text-slate-400 truncate">Par {activity.user}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700/50 shadow-xl" data-testid="section-alerts">
        <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
          <AlertCircle className="text-amber-400" size={20} />
          Alertes et Notifications
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl min-w-0">
            <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{g.creditsEnCours} crédits</div>
              <div className="text-xs text-slate-400">Nécessitent un suivi</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl min-w-0">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{wk.nouveauxClients} nouveaux</div>
              <div className="text-xs text-slate-400">Clients ce mois</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl min-w-0">
            <div className="w-3 h-3 bg-emerald-400 rounded-full" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">Système OK</div>
              <div className="text-xs text-slate-400">Aucun incident</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
