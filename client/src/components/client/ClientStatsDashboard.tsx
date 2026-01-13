import React, { useState, useEffect } from 'react';
import type { Client } from '@shared/schema';
import { Users, TrendingUp, TrendingDown, Award, DollarSign, Activity, Calendar, Target, PieChart, BarChart3 } from 'lucide-react';

export default function ClientStatsDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data || []);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: clients.length,
    actifs: clients.filter(c => c.status === 'Actif').length,
    suspendus: clients.filter(c => c.status === 'Suspendu').length,
    inactifs: clients.filter(c => c.status === 'Inactif').length,
    vip: clients.filter(c => c.segment === 'VIP').length,
    standard: clients.filter(c => c.segment === 'Standard').length,
    nouveaux: clients.filter(c => c.segment === 'Nouveau').length,
    creditTotal: clients.reduce((sum, c) => sum + (parseFloat(c.creditTotal as any) || 0), 0),
    epargneTotal: clients.reduce((sum, c) => sum + (parseFloat(c.epargneTotal as any) || 0), 0),
    tauxRemboursementMoyen: clients.length > 0 ? Math.round(clients.reduce((sum, c) => sum + (parseFloat(c.tauxRemboursement as any) || 0), 0) / clients.length) : 0,
    pointsFideliteTotal: clients.reduce((sum, c) => sum + (c.pointsFidelite || 0), 0),
    nouveauxCeMois: clients.filter(c => {
      const inscriptionDate = new Date(c.dateInscription!);
      const now = new Date();
      return inscriptionDate.getMonth() === now.getMonth() && inscriptionDate.getFullYear() === now.getFullYear();
    }).length
  };

  const segmentDistribution = [
    { name: 'VIP', value: stats.vip, color: '#fbbf24', percentage: ((stats.vip / stats.total) * 100).toFixed(1) },
    { name: 'Standard', value: stats.standard, color: '#3b82f6', percentage: ((stats.standard / stats.total) * 100).toFixed(1) },
    { name: 'Nouveau', value: stats.nouveaux, color: '#10b981', percentage: ((stats.nouveaux / stats.total) * 100).toFixed(1) }
  ];

  const statusDistribution = [
    { name: 'Actifs', value: stats.actifs, color: '#10b981', percentage: ((stats.actifs / stats.total) * 100).toFixed(1) },
    { name: 'Suspendus', value: stats.suspendus, color: '#f59e0b', percentage: ((stats.suspendus / stats.total) * 100).toFixed(1) },
    { name: 'Inactifs', value: stats.inactifs, color: '#ef4444', percentage: ((stats.inactifs / stats.total) * 100).toFixed(1) }
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
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-blue-400/80 mt-1 font-medium flex items-center gap-1">
              <span className="bg-blue-500/10 px-1.5 py-0.5 rounded">+{stats.nouveauxCeMois}</span> 
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
            <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats.actifs}</p>
            <p className="text-xs text-emerald-400/80 mt-1 font-medium">
              {stats.total > 0 ? ((stats.actifs / stats.total) * 100).toFixed(1) : 0}% du total
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
            <p className="text-2xl sm:text-3xl font-bold text-purple-400">{stats.tauxRemboursementMoyen}%</p>
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
              <p className="text-xl font-bold text-blue-400">{stats.creditTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Épargnes Total</p>
              <p className="text-xl font-bold text-green-400">{stats.epargneTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs">
               <span className="text-slate-400">Total Actifs:</span>
               <span className="font-bold text-cyan-400">{(stats.creditTotal + stats.epargneTotal).toLocaleString()} FCFA</span>
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
              <p className="text-xl font-bold text-cyan-400">{stats.pointsFideliteTotal.toLocaleString()}</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Moyenne / Client</p>
              <p className="text-xl font-bold text-cyan-400">
                {stats.total > 0 ? Math.round(stats.pointsFideliteTotal / stats.total) : 0}
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
              <p className="text-xl font-bold text-green-400">+{stats.nouveauxCeMois}</p>
            </div>

            <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Clients Suspendus</p>
              <p className="text-xl font-bold text-amber-400">{stats.suspendus}</p>
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
                <span>{stats.actifs} clients actifs ({((stats.actifs / stats.total) * 100).toFixed(1)}%)</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Taux de remboursement: <span className="text-white font-bold">{stats.tauxRemboursementMoyen}%</span></span>
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
                <span>{stats.suspendus} clients suspendus à vérifier</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-700/30 p-2 rounded">
                <span className="text-amber-400 mt-0.5">•</span>
                <span>{stats.inactifs} clients inactifs</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
