import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, TrendingDown, Award, DollarSign, Activity, Calendar, Target, PieChart, BarChart3 } from 'lucide-react';
import { clientApi, type ClientStatsResponse } from '../../lib/api-client';

export default function ClientStatsDashboard() {
  const [stats, setStats] = useState<ClientStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await clientApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    } finally {
      setLoading(false);
    }
  };

  // Computed values for display
  const total = stats?.totalClients || 0;
  const actifs = stats?.activeClients || 0;
  const suspendus = stats?.suspendedClients || 0;
  const inactifs = stats?.inactiveClients || 0;
  const nouveauxCeMois = stats?.newClientsThisMonth || 0;
  const vip = stats?.segmentDistribution.vip || 0;
  const premium = stats?.segmentDistribution.premium || 0;
  const standard = stats?.segmentDistribution.standard || 0;
  const creditTotal = stats?.financialSummary.totalCredit || 0;
  const epargneTotal = stats?.financialSummary.totalEpargne || 0;
  const tauxRemboursementMoyen = stats?.financialSummary.avgRepaymentRate || 0;
  const pointsFideliteTotal = stats?.financialSummary.totalLoyaltyPoints || 0;

  const segmentDistribution = [
    { name: 'VIP', value: vip, color: '#fbbf24', percentage: total > 0 ? ((vip / total) * 100).toFixed(1) : '0' },
    { name: 'Premium', value: premium, color: '#8b5cf6', percentage: total > 0 ? ((premium / total) * 100).toFixed(1) : '0' },
    { name: 'Standard', value: standard, color: '#3b82f6', percentage: total > 0 ? ((standard / total) * 100).toFixed(1) : '0' }
  ];

  const statusDistribution = [
    { name: 'Actifs', value: actifs, color: '#10b981', percentage: total > 0 ? ((actifs / total) * 100).toFixed(1) : '0' },
    { name: 'Suspendus', value: suspendus, color: '#f59e0b', percentage: total > 0 ? ((suspendus / total) * 100).toFixed(1) : '0' },
    { name: 'Inactifs', value: inactifs, color: '#ef4444', percentage: total > 0 ? ((inactifs / total) * 100).toFixed(1) : '0' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Chargement des statistiques...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-0">

      {/* Stats Grid - Fully Responsive No Scroll */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-700/50 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Users size={18} className="text-blue-400" />
            </div>
            <TrendingUp className="text-emerald-400" size={16} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Total Clients</p>
            <p className="text-2xl sm:text-3xl font-bold text-white">{total}</p>
            <p className="text-xs text-blue-400/80 mt-1 font-medium flex items-center gap-1">
              <span className="bg-blue-500/10 px-1.5 py-0.5 rounded">+{nouveauxCeMois}</span>
              <span className="text-slate-500">ce mois</span>
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-700/50 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Activity size={18} className="text-emerald-400" />
            </div>
            <TrendingUp className="text-emerald-400" size={16} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Clients Actifs</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{actifs}</p>
            <p className="text-xs text-emerald-400/80 mt-1 font-medium">
              {total > 0 ? ((actifs / total) * 100).toFixed(1) : 0}% du total
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-700/50 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Target size={18} className="text-purple-400" />
            </div>
            <TrendingUp className="text-emerald-400" size={16} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Remboursement</p>
            <p className="text-2xl sm:text-3xl font-bold text-purple-400">{tauxRemboursementMoyen}%</p>
            <p className="text-xs text-purple-400/80 mt-1 font-medium">
              Moyen global
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-white flex items-center gap-2">
            <PieChart size={18} className="text-cyan-400" />
            Répartition par Segment
          </h3>

          <div className="space-y-4">
            {segmentDistribution.map((segment) => (
              <div key={segment.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-300">{segment.name}</span>
                  <span className="text-xs font-bold" style={{ color: segment.color }}>
                    {segment.value} ({segment.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all shadow-[0_0_10px_rgba(0,0,0,0.2)]"
                    style={{
                      width: `${segment.percentage}%`,
                      backgroundColor: segment.color,
                      boxShadow: `0 0 8px ${segment.color}40`
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

        </div>

        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-cyan-400" />
            Répartition par Statut
          </h3>

          <div className="space-y-4">
            {statusDistribution.map((status) => (
              <div key={status.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-300">{status.name}</span>
                  <span className="text-xs font-bold" style={{ color: status.color }}>
                    {status.value} ({status.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all shadow-[0_0_10px_rgba(0,0,0,0.2)]"
                    style={{
                      width: `${status.percentage}%`,
                      backgroundColor: status.color,
                      boxShadow: `0 0 8px ${status.color}40`
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-white flex items-center gap-2">
            <DollarSign size={18} className="text-cyan-400" />
            Finances
          </h3>

          <div className="space-y-4">
            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Crédits Total</p>
              <p className="text-xl font-bold text-blue-400">{creditTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Épargnes Total</p>
              <p className="text-xl font-bold text-green-400">{epargneTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs">
               <span className="text-slate-400">Total Actifs:</span>
               <span className="font-bold text-cyan-400">{(creditTotal + epargneTotal).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-white flex items-center gap-2">
            <Award size={18} className="text-cyan-400" />
            Fidélité
          </h3>

          <div className="space-y-4">
             <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Points Total</p>
              <p className="text-xl font-bold text-cyan-400">{pointsFideliteTotal.toLocaleString()}</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Moyenne / Client</p>
              <p className="text-xl font-bold text-cyan-400">
                {total > 0 ? Math.round(pointsFideliteTotal / total) : 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-white flex items-center gap-2">
            <Calendar size={18} className="text-cyan-400" />
            Croissance
          </h3>

           <div className="space-y-4">
            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Nouveaux (Mois)</p>
              <p className="text-xl font-bold text-green-400">+{nouveauxCeMois}</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Clients Suspendus</p>
              <p className="text-xl font-bold text-amber-400">{suspendus}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-6 shadow-lg">
        <h3 className="text-base font-bold mb-4 text-white">Résumé Exécutif</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-green-400 text-sm flex items-center gap-2">
              <TrendingUp size={16} /> Points Forts
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
              <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-green-400 mt-0.5">•</span>
                <span>{actifs} clients actifs ({total > 0 ? ((actifs / total) * 100).toFixed(1) : 0}%)</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Taux de remboursement: <span className="text-white font-bold">{tauxRemboursementMoyen}%</span></span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-amber-400 text-sm flex items-center gap-2">
              <TrendingDown size={16} /> Points d'Attention
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
               <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>{suspendus} clients suspendus à vérifier</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>{inactifs} clients inactifs</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
