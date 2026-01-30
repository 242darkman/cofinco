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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity size={20} className="text-purple-400" />
            Analytics des Permissions
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Analyse de l'utilisation et des refus de permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleToggleEnabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                config.enabled
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {config.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {config.enabled ? 'Actif' : 'Inactif'}
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshStats}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={() => {
                setConfigForm(config || {});
                setShowConfigModal(true);
              }}>
                <Settings size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPurgeModal(true)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-500/10 rounded">
              <Activity size={14} className="text-purple-400" />
            </div>
            <span className="text-[10px] text-slate-400 uppercase">Total checks</span>
          </div>
          <p className="text-xl font-bold text-white">{totalChecks.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-500/10 rounded">
              <CheckCircle size={14} className="text-green-400" />
            </div>
            <span className="text-[10px] text-slate-400 uppercase">Autorises</span>
          </div>
          <p className="text-xl font-bold text-green-400">{totalAllowed.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-red-500/10 rounded">
              <XCircle size={14} className="text-red-400" />
            </div>
            <span className="text-[10px] text-slate-400 uppercase">Refuses</span>
          </div>
          <p className="text-xl font-bold text-red-400">{totalDenied.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-cyan-500/10 rounded">
              <TrendingUp size={14} className="text-cyan-400" />
            </div>
            <span className="text-[10px] text-slate-400 uppercase">Taux autorisation</span>
          </div>
          <p className="text-xl font-bold text-cyan-400">{overallAllowRate}%</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top permissions usage */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <Shield size={14} />
            Permissions les plus utilisees
          </h4>
          <div className="h-56">
            {topPermissions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPermissions} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="permissionCode"
                    tick={{ fontSize: 8, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={75}
                    tickFormatter={(v) => v.split('.').pop() || v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalChecks" name="Verifications" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>

        {/* Allow vs Deny comparison */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <Activity size={14} />
            Autorises vs Refuses
          </h4>
          <div className="h-56">
            {allowDenyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allowDenyData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="allowed" name="Autorises" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="denied" name="Refuses" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top denials */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              Permissions les plus refusees
            </h4>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loadingDenials ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              </div>
            ) : denials.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Aucun refus enregistre
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Permission</th>
                    <th className="text-right px-4 py-2 text-slate-400 font-medium">Refus</th>
                    <th className="text-right px-4 py-2 text-slate-400 font-medium">Utilisateurs</th>
                  </tr>
                </thead>
                <tbody>
                  {denials.map((d, i) => (
                    <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-2">
                        <span className="text-slate-300 font-mono text-[10px]">{d.permissionCode}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-red-400 font-bold">{d.deniedCount}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">{d.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Unused permissions */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-2">
              <Archive size={14} className="text-amber-400" />
              Permissions inutilisees
              {unused.length > 0 && (
                <Badge variant="warning" value={unused.length} size="sm" />
              )}
            </h4>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loadingUnused ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              </div>
            ) : unused.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Toutes les permissions sont utilisees
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Code</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {unused.map((p) => (
                    <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-2">
                        <span className="text-amber-400 font-mono text-[10px]">{p.code}</span>
                        <p className="text-[9px] text-slate-500">{p.name}</p>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{p.moduleName}</td>
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
