import type { ClientWithIdentity } from '@shared/schema';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle, Info, X, ShieldAlert, BadgeCheck, Clock,
  ChevronDown, ChevronUp, IdCard, Shield, UserX,
  CreditCard, Wallet, FileWarning, Lightbulb, RotateCcw, Users,
  ExternalLink, CheckCheck, Filter, TrendingDown
} from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';

interface ClientAlert {
  id: string;
  clientId: string;
  alertType: string;
  alertLevel: 'info' | 'warning' | 'critical';
  message: string;
  isResolved: boolean;
  resolvedAt?: string;
  createdAt: string;
  action?: string;
  targetTab?: string;
}

interface ResolvedEntry {
  alertType: string;
  resolvedAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

interface AlertsResponse {
  active: ClientAlert[];
  resolved: ResolvedEntry[];
}

interface ClientAlertsProps {
  client: ClientWithIdentity;
  onUpdate?: () => void;
  onCountChange?: (count: number) => void;
  onNavigateToTab?: (tabKey: string) => void;
}

type LevelFilter = 'all' | 'critical' | 'warning' | 'info';

const ALERT_TYPE_LABELS: Record<string, string> = {
  payment_overdue: 'Retard paiement',
  document_missing: 'Documents manquants',
  kyc_pending: 'KYC en attente',
  credit_late: 'Credit en retard',
  low_balance: 'Solde faible',
  id_expiring: 'Piece d\'identite',
  id_expired: 'Piece expiree',
  kyc_expired: 'KYC expire',
  client_inactive: 'Inactivite',
  tontine_late: 'Retard tontine',
  score_drop: 'Score critique',
};

const ALERT_TYPE_ICONS: Record<string, React.ReactElement> = {
  payment_overdue: <CreditCard size={16} />,
  document_missing: <FileWarning size={16} />,
  kyc_pending: <Clock size={16} />,
  credit_late: <CreditCard size={16} />,
  low_balance: <Wallet size={16} />,
  id_expiring: <IdCard size={16} />,
  id_expired: <IdCard size={16} />,
  kyc_expired: <Shield size={16} />,
  client_inactive: <UserX size={16} />,
  tontine_late: <Users size={16} />,
  score_drop: <TrendingDown size={16} />,
};

/** Human-readable "depuis X jours" */
function formatSince(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Depuis 1 jour';
  if (days < 30) return `Depuis ${days} jours`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Depuis 1 mois' : `Depuis ${months} mois`;
}

export default function ClientAlerts({ client, onUpdate, onCountChange, onNavigateToTab }: ClientAlertsProps) {
  const { hasPermission } = usePermissions();
  const canResolve = hasPermission('clients', 'edit') || hasPermission('clients', 'manage');

  const [alerts, setAlerts] = useState<ClientAlert[]>([]);
  const [resolved, setResolved] = useState<ResolvedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [resolvingAll, setResolvingAll] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/clients/${client.id}/alerts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement alertes');
      const data: AlertsResponse = await res.json();

      const sorted = (data.active || []).sort((a, b) => {
        const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (levelOrder[a.alertLevel] ?? 3) - (levelOrder[b.alertLevel] ?? 3);
      });

      setAlerts(sorted);
      setResolved(data.resolved || []);
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Sync count to parent
  useEffect(() => {
    onCountChange?.(alerts.length);
  }, [alerts.length, onCountChange]);

  // Auto-refresh on WebSocket events (client update, score change, account change)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.clientId || detail.clientId === client.id) {
        fetchAlerts();
      }
    };
    window.addEventListener('client-update', handler);
    window.addEventListener('score-updated', handler);
    return () => {
      window.removeEventListener('client-update', handler);
      window.removeEventListener('score-updated', handler);
    };
  }, [client.id, fetchAlerts]);

  const handleResolveAlert = async (alertType: string) => {
    if (!canResolve) return;

    // Save state for rollback
    const prevAlerts = alerts;
    const prevResolved = resolved;

    // Optimistic update
    const dismissed = alerts.find(a => a.alertType === alertType);
    setAlerts(prev => prev.filter(a => a.alertType !== alertType));
    if (dismissed) {
      setResolved(prev => [
        { alertType, resolvedAt: new Date().toISOString() },
        ...prev.filter(r => r.alertType !== alertType),
      ]);
    }

    try {
      const res = await fetch(`/api/clients/${client.id}/alerts/${alertType}/resolve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur resolution alerte');
      onUpdate?.();
    } catch (error) {
      console.error('Erreur resolution alerte:', error);
      // Rollback on failure
      setAlerts(prevAlerts);
      setResolved(prevResolved);
      toast.error('Erreur lors de la resolution');
    }
  };

  const handleResolveAll = async () => {
    if (!canResolve || alerts.length === 0) return;
    setResolvingAll(true);
    try {
      const alertTypes = alerts.map(a => a.alertType);
      const res = await fetch(`/api/clients/${client.id}/alerts/resolve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ alertTypes }),
      });
      if (!res.ok) throw new Error('Erreur resolution');

      const nowIso = new Date().toISOString();
      setResolved(prev => [
        ...alertTypes.map(t => ({ alertType: t, resolvedAt: nowIso })),
        ...prev.filter(r => !alertTypes.includes(r.alertType)),
      ]);
      setAlerts([]);
      onUpdate?.();
      toast.success(`${alertTypes.length} alerte(s) resolue(s)`);
    } catch (error) {
      console.error('Erreur resolution globale:', error);
      toast.error('Erreur lors de la resolution');
    } finally {
      setResolvingAll(false);
    }
  };

  const getAlertIcon = (alert: ClientAlert) => {
    return ALERT_TYPE_ICONS[alert.alertType] || <AlertCircle size={16} />;
  };

  const getLevelVariant = (level: string): string => {
    switch (level) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  const getLevelLabel = (level: string): string => {
    switch (level) {
      case 'critical': return 'Critique';
      case 'warning': return 'Attention';
      default: return 'Information';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return { bg: 'bg-status-danger-bg', text: 'text-status-danger', border: 'border-status-danger/20', ring: 'ring-status-danger/50' };
      case 'warning': return { bg: 'bg-status-warning-bg', text: 'text-status-warning', border: 'border-status-warning/20', ring: '' };
      default: return { bg: 'bg-status-info-bg', text: 'text-status-info', border: 'border-status-info/20', ring: '' };
    }
  };

  const criticalAlerts = alerts.filter(a => a.alertLevel === 'critical');
  const warningAlerts = alerts.filter(a => a.alertLevel === 'warning');
  const infoAlerts = alerts.filter(a => a.alertLevel === 'info');

  const filteredAlerts = useMemo(() => {
    if (levelFilter === 'all') return alerts;
    return alerts.filter(a => a.alertLevel === levelFilter);
  }, [alerts, levelFilter]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* 1. Stats Grid (clickable = filter) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'critical' ? 'all' : 'critical')}
          className="text-left"
        >
          <Card
            variant="default"
            padding="sm"
            className={`transition-all ${
              levelFilter === 'critical' ? 'ring-2 ring-status-danger/60' :
              criticalAlerts.length > 0 ? 'bg-status-danger-bg border-status-danger/20 ring-1 ring-status-danger/50' :
              'bg-status-danger-bg/50 border-status-danger/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 text-status-danger font-semibold text-xs uppercase">
              <ShieldAlert size={14} /> Critiques
            </div>
            <p className={`text-2xl font-bold ${criticalAlerts.length > 0 ? 'text-status-danger' : 'text-status-danger/40'}`}>
              {criticalAlerts.length}
            </p>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'warning' ? 'all' : 'warning')}
          className="text-left"
        >
          <Card
            variant="default"
            padding="sm"
            className={`transition-all ${
              levelFilter === 'warning' ? 'ring-2 ring-status-warning/60' :
              warningAlerts.length > 0 ? 'bg-status-warning-bg border-status-warning/20' :
              'bg-status-warning-bg/50 border-status-warning/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 text-status-warning font-semibold text-xs uppercase">
              <AlertCircle size={14} /> Attention
            </div>
            <p className={`text-2xl font-bold ${warningAlerts.length > 0 ? 'text-status-warning' : 'text-status-warning/40'}`}>
              {warningAlerts.length}
            </p>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'info' ? 'all' : 'info')}
          className="text-left"
        >
          <Card
            variant="default"
            padding="sm"
            className={`transition-all ${
              levelFilter === 'info' ? 'ring-2 ring-status-info/60' :
              infoAlerts.length > 0 ? 'bg-status-info-bg border-status-info/20' :
              'bg-status-info-bg/50 border-status-info/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 text-status-info font-semibold text-xs uppercase">
              <Info size={14} /> Infos
            </div>
            <p className={`text-2xl font-bold ${infoAlerts.length > 0 ? 'text-status-info' : 'text-status-info/40'}`}>
              {infoAlerts.length}
            </p>
          </Card>
        </button>
      </div>

      {/* 2. Active Alerts Feed */}
      <Card variant="default" padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-content-primary flex items-center gap-2">
            Alertes actives
            <Badge value={alerts.length} size="sm" variant={criticalAlerts.length > 0 ? 'danger' : alerts.length > 0 ? 'warning' : 'neutral'} />
            {levelFilter !== 'all' && (
              <button
                onClick={() => setLevelFilter('all')}
                className="ml-1 flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-accent bg-accent/10 rounded-full hover:bg-accent/20 transition-colors"
              >
                <Filter size={10} />
                {levelFilter === 'critical' ? 'Critiques' : levelFilter === 'warning' ? 'Attention' : 'Infos'}
                <X size={10} />
              </button>
            )}
          </h3>
          {canResolve && alerts.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResolveAll}
              disabled={resolvingAll}
              className="text-xs"
            >
              <CheckCheck size={14} />
              {resolvingAll ? 'Resolution...' : 'Tout resoudre'}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-12 border border-dashed border-status-danger/30 rounded-lg bg-status-danger-bg/30">
            <div className="w-16 h-16 bg-status-danger-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-status-danger" />
            </div>
            <p className="text-status-danger font-bold text-lg">Erreur de chargement</p>
            <p className="text-content-muted text-sm mb-3">Impossible de recuperer les alertes du client.</p>
            <Button variant="outline" size="sm" onClick={fetchAlerts}>
              <RotateCcw size={14} />
              Reessayer
            </Button>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-edge rounded-lg bg-surface/20">
            <div className="w-16 h-16 bg-status-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <BadgeCheck size={32} className="text-status-success" />
            </div>
            <p className="text-status-success font-bold text-lg">
              {alerts.length === 0 ? 'Aucune alerte active' : 'Aucune alerte de ce niveau'}
            </p>
            <p className="text-content-muted text-sm">
              {alerts.length === 0
                ? 'Le client est en parfaite regle.'
                : `${alerts.length} alerte(s) active(s) dans d'autres niveaux.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => {
              const colors = getLevelColor(alert.alertLevel);
              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border ${colors.border} bg-surface/30 hover:bg-surface/50 transition-colors`}
                >
                  {/* Alert main row */}
                  <div className="flex items-start gap-3 p-3">
                    <div className={`mt-0.5 p-1.5 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
                      {getAlertIcon(alert)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            value={getLevelLabel(alert.alertLevel)}
                            variant={getLevelVariant(alert.alertLevel) as any}
                            size="sm"
                          />
                          <span className="text-[10px] text-content-muted font-medium uppercase">
                            {ALERT_TYPE_LABELS[alert.alertType] || alert.alertType}
                          </span>
                          <span className="text-[10px] text-content-muted italic">
                            {formatSince(alert.createdAt)}
                          </span>
                        </div>
                        {canResolve && (
                          <button
                            onClick={() => handleResolveAlert(alert.alertType)}
                            className="text-content-muted hover:text-content-primary p-1 hover:bg-surface-elevated/50 rounded transition shrink-0"
                            title="Marquer comme resolu (expire apres 30 jours)"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-content-secondary leading-relaxed font-medium">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  {/* Contextual action + navigation link */}
                  {(alert.action || alert.targetTab) && (
                    <div className="flex items-center justify-between px-3 pb-3 pt-0 ml-[42px] gap-2">
                      {alert.action && (
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Lightbulb size={12} className="text-accent shrink-0 mt-0.5" />
                          <p className="text-xs text-accent/80 truncate">{alert.action}</p>
                        </div>
                      )}
                      {alert.targetTab && onNavigateToTab && (
                        <button
                          onClick={() => onNavigateToTab(alert.targetTab!)}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-accent hover:text-accent/80 bg-accent/5 hover:bg-accent/10 px-2 py-1 rounded transition-colors"
                        >
                          Aller a l'onglet
                          <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 3. Resolved History (Collapsible) */}
      {resolved.length > 0 && (
        <Card variant="default" padding="none" className="overflow-hidden">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="w-full flex items-center justify-between p-4 hover:bg-surface/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-content-muted" />
              <h3 className="text-sm font-semibold text-content-secondary">
                Historique des resolutions
              </h3>
              <Badge value={resolved.length} size="sm" variant="neutral" />
            </div>
            {showResolved ? <ChevronUp size={16} className="text-content-muted" /> : <ChevronDown size={16} className="text-content-muted" />}
          </button>

          {showResolved && (
            <div className="border-t border-edge-subtle">
              <div className="divide-y divide-edge-subtle">
                {resolved.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-surface-subtle text-content-muted">
                        {ALERT_TYPE_ICONS[entry.alertType] || <AlertCircle size={14} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-content-secondary">
                          {ALERT_TYPE_LABELS[entry.alertType] || entry.alertType}
                        </p>
                        <p className="text-[10px] text-content-muted">
                          Resolu le {new Date(entry.resolvedAt).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                          {entry.resolvedByName && (
                            <span className="ml-1">par <span className="font-medium text-content-secondary">{entry.resolvedByName}</span></span>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-content-muted bg-surface-subtle px-2 py-0.5 rounded-full">
                      Expire dans {Math.max(0, 30 - Math.floor((Date.now() - new Date(entry.resolvedAt).getTime()) / (1000 * 60 * 60 * 24)))}j
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 bg-surface-subtle/50 border-t border-edge-subtle">
                <p className="text-[10px] text-content-muted">
                  Les alertes resolues reapparaissent automatiquement apres 30 jours si la condition persiste.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
