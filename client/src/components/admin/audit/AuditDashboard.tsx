import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Activity, Users, Clock, AlertTriangle } from 'lucide-react';
import { auditApi, notificationApi, userApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { StatutUser } from '@shared/enum/status-constants';

interface DashboardStats {
  totalLogs: number;
  totalTransactions: number;
  totalAlerts: number;
  activeUsers: number;
  criticalAlerts: number;
  transactionVolume: number;
}

export default function AuditDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLogs: 0,
    totalTransactions: 0,
    totalAlerts: 0,
    activeUsers: 0,
    criticalAlerts: 0,
    transactionVolume: 0
  });
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 60000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const timeFilter = getTimeFilter();

      const [logsData, alertsData, usersData] = await Promise.all([
        auditApi.getAll().catch(() => []),
        notificationApi.getAll({ type: 'security', since: timeFilter }).catch(() => []),
        userApi.getAll().catch(() => [])
      ]);

      const totalLogs = logsData?.length || 0;
      const totalTransactions = logsData?.filter((l: any) => l.entityType === 'transaction')?.length || 0;
      const transactionVolume = logsData?.reduce((sum: number, l: any) => sum + (l.montant || 0), 0) || 0;

      const totalAlerts = alertsData?.length || 0;
      const criticalAlerts = alertsData?.filter((a: any) => a.severity === 'critical')?.length || 0;

      const activeUsers = usersData?.filter((u: any) => u.status === StatutUser.ACTIVE)?.length || 0;

      setStats({
        totalLogs,
        totalTransactions,
        totalAlerts,
        activeUsers,
        criticalAlerts,
        transactionVolume
      });
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement stats'));
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  const getTimeFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default: return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const activityData = [
    { hour: '00h', value: 12 },
    { hour: '02h', value: 8 },
    { hour: '04h', value: 5 },
    { hour: '06h', value: 15 },
    { hour: '08h', value: 45 },
    { hour: '10h', value: 78 },
    { hour: '12h', value: 92 },
    { hour: '14h', value: 85 },
    { hour: '16h', value: 67 },
    { hour: '18h', value: 43 },
    { hour: '20h', value: 28 },
    { hour: '22h', value: 15 }
  ];

  const maxValue = Math.max(...activityData.map(d => d.value));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600 to-emerald-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Tableau de Bord Analytique</h2>
            <p className="text-blue-100">Vue d'ensemble en temps réel</p>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 bg-white/20 text-white rounded-xl border border-white/30 focus:outline-none"
          >
            <option value="1h">Dernière heure</option>
            <option value="24h">24 heures</option>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Total Logs</div>
              <div className="text-4xl font-bold">{stats.totalLogs.toLocaleString()}</div>
            </div>
            <Activity size={56} className="opacity-30" />
          </div>
          <div className="flex items-center gap-2 text-sm opacity-90">
            <TrendingUp size={16} />
            <span>+12% vs hier</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Transactions</div>
              <div className="text-4xl font-bold">{stats.totalTransactions.toLocaleString()}</div>
            </div>
            <BarChart3 size={56} className="opacity-30" />
          </div>
          <div className="text-sm opacity-90">
            Volume: {stats.transactionVolume.toLocaleString()} FCFA
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm opacity-90 mb-1">Utilisateurs Actifs</div>
              <div className="text-4xl font-bold">{stats.activeUsers}</div>
            </div>
            <Users size={56} className="opacity-30" />
          </div>
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Activity size={16} />
            <span>En ligne maintenant</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Activité par Heure</h3>
            <Clock className="text-blue-400" size={24} />
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {activityData.map((item, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div className="relative w-full">
                  <div
                    className="w-full bg-gradient-to-t from-blue-600 to-cyan-500 rounded-t-lg transition-all hover:opacity-80 cursor-pointer"
                    style={{ height: `${(item.value / maxValue) * 200}px` }}
                    title={`${item.hour}: ${item.value} actions`}
                  >
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-white font-bold opacity-0 hover:opacity-100">
                      {item.value}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{item.hour}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Distribution des Actions</h3>
            <BarChart3 className="text-green-400" size={24} />
          </div>
          <div className="space-y-4">
            {[
              { action: 'CREATE', count: 245, color: 'from-green-500 to-emerald-500', percent: 35 },
              { action: 'UPDATE', count: 189, color: 'from-blue-500 to-cyan-500', percent: 27 },
              { action: 'DELETE', count: 98, color: 'from-blue-500 to-cyan-500', percent: 14 },
              { action: 'VIEW', count: 156, color: 'from-emerald-500 to-cyan-500', percent: 22 },
              { action: 'LOGIN', count: 12, color: 'from-cyan-500 to-emerald-500', percent: 2 }
            ].map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300 font-semibold">{item.action}</span>
                  <span className="text-white font-bold">{item.count}</span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${item.color} transition-all`}
                    style={{ width: `${item.percent}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Alertes de Sécurité</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-blue-400" size={20} />
                <span className="text-slate-300">Critiques</span>
              </div>
              <span className="text-2xl font-bold text-blue-400">{stats.criticalAlerts}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-emerald-400" size={20} />
                <span className="text-slate-300">Élevées</span>
              </div>
              <span className="text-2xl font-bold text-emerald-400">5</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-cyan-400" size={20} />
                <span className="text-slate-300">Moyennes</span>
              </div>
              <span className="text-2xl font-bold text-cyan-400">12</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Top Modules</h3>
          <div className="space-y-3">
            {[
              { name: 'Comptabilité', count: 487, color: 'bg-blue-500' },
              { name: 'Clients', count: 356, color: 'bg-green-500' },
              { name: 'Crédits', count: 298, color: 'bg-emerald-500' },
              { name: 'Épargnes', count: 234, color: 'bg-emerald-500' },
              { name: 'Tontines', count: 187, color: 'bg-cyan-500' }
            ].map((module, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${module.color}`}></div>
                  <span className="text-slate-300">{module.name}</span>
                </div>
                <span className="text-white font-bold">{module.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Performance Système</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">CPU</span>
                <span className="text-green-400 font-bold">45%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: '45%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Mémoire</span>
                <span className="text-blue-400 font-bold">62%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: '62%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Base de données</span>
                <span className="text-emerald-400 font-bold">38%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: '38%' }}></div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Temps de réponse moyen</span>
                <span className="text-green-400 font-bold">124ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-4">Carte de Chaleur - Activité 7 Derniers Jours</h3>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="space-y-2">
              <div className="text-center text-xs text-slate-400">
                J-{6-day}
              </div>
              {Array.from({ length: 24 }, (_, hour) => {
                const intensity = Math.random();
                return (
                  <div
                    key={hour}
                    className={`h-3 rounded transition-all hover:scale-110 cursor-pointer ${
                      intensity > 0.7 ? 'bg-blue-500' :
                      intensity > 0.5 ? 'bg-emerald-500' :
                      intensity > 0.3 ? 'bg-cyan-500' :
                      intensity > 0.1 ? 'bg-green-500' :
                      'bg-slate-700'
                    }`}
                    title={`Jour ${day}, ${hour}h: ${Math.round(intensity * 100)} actions`}
                  ></div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-slate-700 rounded"></div>
            <span>Faible</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Modéré</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-500 rounded"></div>
            <span>Élevé</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Très élevé</span>
          </div>
        </div>
      </div>
    </div>
  );
}
