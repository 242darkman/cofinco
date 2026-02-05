import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, Settings,
  TrendingUp, Users, Activity, Trash2, Loader2, ToggleLeft, ToggleRight,
  Eye, Clock, Archive
} from 'lucide-react';
import { Button, Badge, FormField, Modal } from '../../ui';
import {
  permissionAnalyticsApi,
  PermissionAnalyticsConfig,
  PermissionStats,
  PermissionDenial,
  UnusedPermission
} from '../../../lib/api-client';
import { toast } from '../../../lib/toast';
import { usePermissions } from '../../auth/ProtectedFeature';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('fr-FR') : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function PermissionAnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('admin', 'manage');

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [configForm, setConfigForm] = useState<Partial<PermissionAnalyticsConfig>>({});
  const [purging, setPurging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [purgeDays, setPurgeDays] = useState(30);

  // Fetch config
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['permission-analytics-config'],
    queryFn: permissionAnalyticsApi.getConfig,
  });

  // Fetch stats
  const { data: stats = [], isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['permission-analytics-stats'],
    queryFn: permissionAnalyticsApi.getStats,
  });

  // Fetch denials
  const { data: denials = [], isLoading: loadingDenials } = useQuery({
    queryKey: ['permission-analytics-denials'],
    queryFn: () => permissionAnalyticsApi.getDenials(15),
  });

  // Fetch unused
  const { data: unused = [], isLoading: loadingUnused } = useQuery({
    queryKey: ['permission-analytics-unused'],
    queryFn: permissionAnalyticsApi.getUnused,
  });

  const handleToggleEnabled = useCallback(async () => {
    if (!config) return;
    try {
      await permissionAnalyticsApi.updateConfig({ enabled: !config.enabled });
      queryClient.invalidateQueries({ queryKey: ['permission-analytics-config'] });
      toast.success(config.enabled ? 'Analytics desactivees' : 'Analytics activees');
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    }
  }, [config, queryClient]);

  const handleSaveConfig = useCallback(async () => {
    try {
      await permissionAnalyticsApi.updateConfig(configForm);
      queryClient.invalidateQueries({ queryKey: ['permission-analytics-config'] });
      toast.success('Configuration mise a jour');
      setShowConfigModal(false);
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    }
  }, [configForm, queryClient]);

  const handleRefreshStats = useCallback(async () => {
    setRefreshing(true);
    try {
      await permissionAnalyticsApi.refreshStats();
      await refetchStats();
      toast.success('Statistiques rafraichies');
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    } finally {
      setRefreshing(false);
    }
  }, [refetchStats]);

  const handlePurge = useCallback(async () => {
    setPurging(true);
    try {
      const result = await permissionAnalyticsApi.purgeLogs(purgeDays);
      toast.success(`${result.deleted} log(s) supprime(s)`);
      setShowPurgeModal(false);
      await refetchStats();
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    } finally {
      setPurging(false);
    }
  }, [purgeDays, refetchStats]);

  // Process data for charts
  const topPermissions = stats.slice(0, 10);
  const allowDenyData = stats.slice(0, 8).map(s => ({
    name: s.permissionCode.split('.').pop() || s.permissionCode,
    allowed: s.allowedCount,
    denied: s.deniedCount,
  }));

  const totalChecks = stats.reduce((sum, s) => sum + s.totalChecks, 0);
  const totalAllowed = stats.reduce((sum, s) => sum + s.allowedCount, 0);
  const totalDenied = stats.reduce((sum, s) => sum + s.deniedCount, 0);
  const overallAllowRate = totalChecks > 0 ? ((totalAllowed / totalChecks) * 100).toFixed(1) : '0';

  const isLoading = loadingConfig || loadingStats;

  if (isLoading && !config) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header - Compact */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-purple-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Activity size={14} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Analytics des Permissions</h2>
            <p className="text-[10px] text-slate-500">Analyse de l'utilisation et des refus</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleToggleEnabled}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition ${
                config.enabled
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {config.enabled ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {config.enabled ? 'Actif' : 'Inactif'}
            </button>
          )}
          <button
            onClick={handleRefreshStats}
            disabled={refreshing}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canManage && (
            <>
              <button 
                onClick={() => {
                  setConfigForm(config || {});
                  setShowConfigModal(true);
                }}
                className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
              >
                <Settings size={12} />
              </button>
              <button 
                onClick={() => setShowPurgeModal(true)}
                className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards - Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase font-medium">Total checks</span>
            <Activity size={12} className="text-purple-400" />
          </div>
          <p className="text-lg font-bold text-white">{totalChecks.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase font-medium">Autorises</span>
            <CheckCircle size={12} className="text-green-400" />
          </div>
          <p className="text-lg font-bold text-green-400">{totalAllowed.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase font-medium">Refuses</span>
            <XCircle size={12} className="text-red-400" />
          </div>
          <p className="text-lg font-bold text-red-400">{totalDenied.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase font-medium">Taux</span>
            <TrendingUp size={12} className="text-cyan-400" />
          </div>
          <p className="text-lg font-bold text-cyan-400">{overallAllowRate}%</p>
        </div>
      </div>

      {/* Charts Grid - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 shrink-0">
        {/* Top permissions usage */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <h4 className="text-[10px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
            <Shield size={12} />
            Permissions les plus utilisees
          </h4>
          <div className="h-32">
            {topPermissions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPermissions} layout="vertical" margin={{ left: 60, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="permissionCode"
                    tick={{ fontSize: 8, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                    tickFormatter={(v) => v.split('.').pop() || v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalChecks" name="Verifications" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>

        {/* Allow vs Deny comparison */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <h4 className="text-[10px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
            <Activity size={12} />
            Autorises vs Refuses
          </h4>
          <div className="h-32">
            {allowDenyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allowDenyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="allowed" name="Autorises" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="denied" name="Refuses" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables Grid - Compact - Flex grow to fill space */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0">
        {/* Top denials */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/30">
            <h4 className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-red-400" />
              Permissions les plus refusees
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingDenials ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              </div>
            ) : denials.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-[10px]">
                Aucun refus enregistre
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-900/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-slate-400 font-medium text-[9px]">Permission</th>
                    <th className="text-right px-3 py-1.5 text-slate-400 font-medium text-[9px]">Refus</th>
                    <th className="text-right px-3 py-1.5 text-slate-400 font-medium text-[9px]">Utilisateurs</th>
                  </tr>
                </thead>
                <tbody>
                  {denials.map((d, i) => (
                    <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-3 py-1.5">
                        <span className="text-slate-300 font-mono text-[9px]">{d.permissionCode}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-red-400 font-bold text-[10px]">{d.deniedCount}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-400 text-[10px]">{d.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Unused permissions */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/30">
            <h4 className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Archive size={12} className="text-amber-400" />
              Permissions inutilisees
              {unused.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">
                  {unused.length}
                </span>
              )}
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingUnused ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              </div>
            ) : unused.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-[10px]">
                Toutes les permissions sont utilisees
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-900/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-slate-400 font-medium text-[9px]">Code</th>
                    <th className="text-left px-3 py-1.5 text-slate-400 font-medium text-[9px]">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {unused.map((p) => (
                    <tr key={p.id} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-3 py-1.5">
                        <span className="text-amber-400 font-mono text-[9px]">{p.code}</span>
                        <p className="text-[8px] text-slate-500 truncate max-w-[200px]">{p.name}</p>
                      </td>
                      <td className="px-3 py-1.5 text-slate-400 text-[10px]">{p.moduleName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Configuration Analytics"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
            <Activity size={14} className="inline mr-2 text-purple-400" />
            Configurez les parametres de collecte des analytics de permissions.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Echantillonnage autorises (%)"
              name="samplingRateAllowed"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={(configForm.samplingRateAllowed ?? 0.01) * 100}
              onChange={(e) => setConfigForm({
                ...configForm,
                samplingRateAllowed: parseFloat(e.target.value) / 100
              })}
            />
            <FormField
              label="Echantillonnage refuses (%)"
              name="samplingRateDenied"
              type="number"
              min={0}
              max={100}
              step={1}
              value={(configForm.samplingRateDenied ?? 1) * 100}
              onChange={(e) => setConfigForm({
                ...configForm,
                samplingRateDenied: parseFloat(e.target.value) / 100
              })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Taille batch"
              name="batchSize"
              type="number"
              min={1}
              max={1000}
              value={configForm.batchSize ?? 100}
              onChange={(e) => setConfigForm({
                ...configForm,
                batchSize: parseInt(e.target.value)
              })}
            />
            <FormField
              label="Intervalle flush (ms)"
              name="flushIntervalMs"
              type="number"
              min={1000}
              max={60000}
              step={1000}
              value={configForm.flushIntervalMs ?? 5000}
              onChange={(e) => setConfigForm({
                ...configForm,
                flushIntervalMs: parseInt(e.target.value)
              })}
            />
          </div>

          <FormField
            label="Retention (jours)"
            name="retentionDays"
            type="number"
            min={1}
            max={365}
            value={configForm.retentionDays ?? 30}
            onChange={(e) => setConfigForm({
              ...configForm,
              retentionDays: parseInt(e.target.value)
            })}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button variant="secondary" onClick={() => setShowConfigModal(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSaveConfig}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Purge Modal */}
      <Modal
        isOpen={showPurgeModal}
        onClose={() => setShowPurgeModal(false)}
        title="Purger les logs"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-sm text-amber-400 font-medium mb-1">Attention</p>
            <p className="text-xs text-slate-400">
              Cette action supprimera definitivement les logs de permissions plus anciens que la periode specifiee.
            </p>
          </div>

          <FormField
            label="Conserver les logs des X derniers jours"
            name="purgeDays"
            type="number"
            min={1}
            max={365}
            value={purgeDays}
            onChange={(e) => setPurgeDays(parseInt(e.target.value))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button variant="secondary" onClick={() => setShowPurgeModal(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handlePurge} disabled={purging}>
              {purging ? <Loader2 size={14} className="animate-spin mr-2" /> : <Trash2 size={14} className="mr-2" />}
              Purger
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
