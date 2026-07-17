import React, { useState, useCallback } from 'react';
import { SkeletonDashboard } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, Settings, TrendingUp, Users, Activity, Trash2, ToggleLeft, ToggleRight, Eye, Clock, Archive } from 'lucide-react';
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
    <div className="bg-surface border border-edge rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-content-muted mb-1">{label}</p>
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
      <SkeletonDashboard />
    );
  }

  return (
    <div className="space-y-2">
      {/* Header - Compact */}
      <div className="flex items-center justify-between bg-surface-base border border-edge rounded-lg px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-status-info-bg rounded-lg flex items-center justify-center shrink-0">
            <Activity size={14} className="text-status-info" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-content-primary">Analytics des Permissions</h2>
            <p className="text-[10px] text-content-muted">Analyse de l'utilisation et des refus</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleToggleEnabled}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition ${
                config.enabled
                  ? 'bg-status-success-bg text-status-success border border-status-success/30'
                  : 'bg-surface text-content-muted border border-edge'
              }`}
            >
              {config.enabled ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {config.enabled ? 'Actif' : 'Inactif'}
            </button>
          )}
          <button
            onClick={handleRefreshStats}
            disabled={refreshing}
            className="w-7 h-7 flex items-center justify-center rounded bg-surface hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors border border-edge"
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
                className="w-7 h-7 flex items-center justify-center rounded bg-surface hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors border border-edge"
              >
                <Settings size={12} />
              </button>
              <button 
                onClick={() => setShowPurgeModal(true)}
                className="w-7 h-7 flex items-center justify-center rounded bg-surface hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors border border-edge"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards - Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        <div className="bg-surface/60 border border-edge-subtle rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-content-muted uppercase font-medium">Total checks</span>
            <Activity size={12} className="text-status-info" />
          </div>
          <p className="text-lg font-bold text-content-primary">{totalChecks.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-surface/60 border border-edge-subtle rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-content-muted uppercase font-medium">Autorises</span>
            <CheckCircle size={12} className="text-status-success" />
          </div>
          <p className="text-lg font-bold text-status-success">{totalAllowed.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-surface/60 border border-edge-subtle rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-content-muted uppercase font-medium">Refuses</span>
            <XCircle size={12} className="text-status-danger" />
          </div>
          <p className="text-lg font-bold text-status-danger">{totalDenied.toLocaleString('fr-FR')}</p>
        </div>
        <div className="bg-surface/60 border border-edge-subtle rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-content-muted uppercase font-medium">Taux</span>
            <TrendingUp size={12} className="text-accent" />
          </div>
          <p className="text-lg font-bold text-accent">{overallAllowRate}%</p>
        </div>
      </div>

      {/* Charts Grid - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 shrink-0">
        {/* Top permissions usage */}
        <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3">
          <h4 className="text-[10px] font-semibold text-content-muted mb-2 flex items-center gap-1.5">
            <Shield size={12} />
            Permissions les plus utilisees
          </h4>
          <div className="h-32">
            {topPermissions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPermissions} layout="vertical" margin={{ left: 60, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="permissionCode"
                    tick={{ fontSize: 8, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                    tickFormatter={(v) => v.split('.').pop() || v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalChecks" name="Verifications" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-content-muted text-xs">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>

        {/* Allow vs Deny comparison */}
        <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3">
          <h4 className="text-[10px] font-semibold text-content-muted mb-2 flex items-center gap-1.5">
            <Activity size={12} />
            Autorises vs Refuses
          </h4>
          <div className="h-32">
            {allowDenyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allowDenyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="allowed" name="Autorises" fill="var(--color-success)" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="denied" name="Refuses" fill="var(--color-danger)" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-content-muted text-xs">
                Aucune donnee disponible
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables Grid - Compact - Flex grow to fill space */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0">
        {/* Top denials */}
        <div className="bg-surface/40 border border-edge-subtle rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-edge bg-surface/30">
            <h4 className="text-[10px] font-semibold text-content-muted flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-status-danger" />
              Permissions les plus refusees
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingDenials ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="xs" tone="current" className="text-content-muted" />
              </div>
            ) : denials.length === 0 ? (
              <div className="text-center py-4 text-content-muted text-[10px]">
                Aucun refus enregistre
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-surface-base/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-content-muted font-medium text-[9px]">Permission</th>
                    <th className="text-right px-3 py-1.5 text-content-muted font-medium text-[9px]">Refus</th>
                    <th className="text-right px-3 py-1.5 text-content-muted font-medium text-[9px]">Utilisateurs</th>
                  </tr>
                </thead>
                <tbody>
                  {denials.map((d, i) => (
                    <tr key={i} className="border-t border-edge-subtle hover:bg-surface/30">
                      <td className="px-3 py-1.5">
                        <span className="text-content-secondary font-mono text-[9px]">{d.permissionCode}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-status-danger font-bold text-[10px]">{d.deniedCount}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-content-muted text-[10px]">{d.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Unused permissions */}
        <div className="bg-surface/40 border border-edge-subtle rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-edge bg-surface/30">
            <h4 className="text-[10px] font-semibold text-content-muted flex items-center gap-1.5">
              <Archive size={12} className="text-status-warning" />
              Permissions inutilisees
              {unused.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-status-warning-bg text-status-warning text-[9px] font-bold">
                  {unused.length}
                </span>
              )}
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingUnused ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="xs" tone="current" className="text-content-muted" />
              </div>
            ) : unused.length === 0 ? (
              <div className="text-center py-4 text-content-muted text-[10px]">
                Toutes les permissions sont utilisees
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-surface-base/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-content-muted font-medium text-[9px]">Code</th>
                    <th className="text-left px-3 py-1.5 text-content-muted font-medium text-[9px]">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {unused.map((p) => (
                    <tr key={p.id} className="border-t border-edge-subtle hover:bg-surface/30">
                      <td className="px-3 py-1.5">
                        <span className="text-status-warning font-mono text-[9px]">{p.code}</span>
                        <p className="text-[8px] text-content-muted truncate max-w-[200px]">{p.name}</p>
                      </td>
                      <td className="px-3 py-1.5 text-content-muted text-[10px]">{p.moduleName}</td>
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
          <div className="bg-surface/50 rounded-lg p-3 text-xs text-content-muted">
            <Activity size={14} className="inline mr-2 text-status-info" />
            Configurez les parametres de collecte des analytics de permissions.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Echantillonnage autorises (%)"
              name="samplingRateAllowed"
              inputMode="decimal"
              value={(configForm.samplingRateAllowed ?? 0.01) * 100}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setConfigForm({
                ...configForm,
                samplingRateAllowed: v === '' ? 0 : parseFloat(v) / 100
              }); }}
            />
            <FormField
              label="Echantillonnage refuses (%)"
              name="samplingRateDenied"
              inputMode="decimal"
              value={(configForm.samplingRateDenied ?? 1) * 100}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setConfigForm({
                ...configForm,
                samplingRateDenied: v === '' ? 0 : parseFloat(v) / 100
              }); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Taille batch"
              name="batchSize"
              inputMode="numeric"
              pattern="[0-9]*"
              value={configForm.batchSize ?? 100}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setConfigForm({
                ...configForm,
                batchSize: v ? parseInt(v) : 0
              }); }}
            />
            <FormField
              label="Intervalle flush (ms)"
              name="flushIntervalMs"
              inputMode="numeric"
              pattern="[0-9]*"
              value={configForm.flushIntervalMs ?? 5000}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setConfigForm({
                ...configForm,
                flushIntervalMs: v ? parseInt(v) : 0
              }); }}
            />
          </div>

          <FormField
            label="Retention (jours)"
            name="retentionDays"
            inputMode="numeric"
            pattern="[0-9]*"
            value={configForm.retentionDays ?? 30}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setConfigForm({
              ...configForm,
              retentionDays: v ? parseInt(v) : 0
            }); }}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
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
          <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3">
            <p className="text-sm text-status-warning font-medium mb-1">Attention</p>
            <p className="text-xs text-content-muted">
              Cette action supprimera definitivement les logs de permissions plus anciens que la periode specifiee.
            </p>
          </div>

          <FormField
            label="Conserver les logs des X derniers jours"
            name="purgeDays"
            inputMode="numeric"
            pattern="[0-9]*"
            value={purgeDays}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setPurgeDays(v ? parseInt(v) : 0); }}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => setShowPurgeModal(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handlePurge} disabled={purging}>
              {purging ? <Spinner size="xs" tone="current" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
              Purger
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
