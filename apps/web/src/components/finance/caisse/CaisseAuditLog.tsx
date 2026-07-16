import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { ChevronDown, ChevronUp, RefreshCw, Shield, Lock } from 'lucide-react';
import { Card } from '../../ui';
import { formatDate } from '../../../lib/format';
import { useIsAdmin } from '../../../contexts/AbilityContext';

interface AuditLogEntry {
  id: string;
  sessionId: string;
  action: string;
  statutAvant?: string;
  statutApres?: string;
  details: Record<string, any>;
  userId?: string;
  userName?: string;
  userPrenom?: string;
  ipAddress?: string;
  createdAt: string;
}

interface AuditLogPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  // Session lifecycle
  OPENED: 'bg-status-success-bg text-status-success border-status-success/20',
  OUVERTURE: 'bg-status-success-bg text-status-success border-status-success/20',
  DIRECT_OPEN: 'bg-status-success-bg text-status-success border-status-success/20',
  'OUVERTURE DIRECTE': 'bg-status-success-bg text-status-success border-status-success/20',
  CLOSED: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
  FERMETURE: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
  TIMEOUT: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  ADMIN_CLOSED: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  // Requests
  REQUEST_SUBMITTED: 'bg-status-info-bg text-status-info border-status-info/20',
  REQUEST_APPROVED: 'bg-status-success-bg text-status-success border-status-success/20',
  REQUEST_REJECTED: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  REQUEST_CANCELLED: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  // Operations
  HEARTBEAT: 'bg-status-info-bg text-status-info border-status-info/20',
  CLOSING_COUNT: 'bg-status-info-bg text-status-info border-status-info/20',
  CLOSING_VALIDATION: 'bg-status-info-bg text-status-info border-status-info/20',
  CLOSING_INITIATED: 'bg-accent/10 text-accent border-accent/20',
  CLOSING_CANCELLED: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  COUNT_SUBMITTED: 'bg-accent/10 text-accent border-accent/20',
  SUPERVISOR_TAKEOVER: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  FUNDS_RECEIVED: 'bg-status-success-bg text-status-success border-status-success/20',
  FUNDS_SENT: 'bg-accent/10 text-accent border-accent/20',
};

const ACTION_LABELS: Record<string, string> = {
  // Session lifecycle
  OPENED: 'Ouverture',
  OUVERTURE: 'Ouverture',
  DIRECT_OPEN: 'Ouverture directe',
  'OUVERTURE DIRECTE': 'Ouverture directe',
  CLOSED: 'Fermeture',
  FERMETURE: 'Fermeture',
  TIMEOUT: 'Expiration',
  ADMIN_CLOSED: 'Fermeture admin',
  // Requests
  REQUEST_SUBMITTED: 'Demande soumise',
  REQUEST_APPROVED: 'Demande approuvée',
  REQUEST_REJECTED: 'Demande rejetée',
  REQUEST_CANCELLED: 'Demande annulée',
  REQUESTING_FUNDS: 'Demande de fonds',
  // Operations
  HEARTBEAT: 'Signal activité',
  CLOSING_COUNT: 'Comptage caisse',
  CLOSING_VALIDATION: 'Validation fermeture',
  CLOSING_INITIATED: 'Fermeture initiée',
  CLOSING_CANCELLED: 'Fermeture annulée',
  COUNT_SUBMITTED: 'Comptage soumis',
  SUPERVISOR_TAKEOVER: 'Prise de contrôle',
  FUNDS_RECEIVED: 'Fonds reçus',
  FUNDS_SENT: 'Fonds envoyés',
};

const STATUS_LABELS: Record<string, string> = {
  // Session states
  OPEN: 'Ouverte',
  OPENED: 'Ouverte',
  Ouverte: 'Ouverte',
  CLOSED: 'Fermée',
  Fermée: 'Fermée',
  REQUESTING_FUNDS: 'En attente de fonds',
  // Closing workflow states
  CLOSING_COUNT: 'Comptage en cours',
  CLOSING_VALIDATION: 'En validation',
  CLOSING_INITIATED: 'Fermeture initiée',
  CLOSING_CANCELLED: 'Fermeture annulée',
  // General states
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
  CANCELLED: 'Annulée',
};

export default function CaisseAuditLog() {
  const isAdmin = useIsAdmin();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({ page: 1, perPage: 8, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Restrict access to admins only
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-content-muted">
        <Lock size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium">Accès restreint</p>
        <p className="text-sm mt-1">Seuls les administrateurs peuvent consulter le journal d'audit.</p>
      </div>
    );
  }

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('perPage', '8');
      if (filterAction) params.append('action', filterAction);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);

      const res = await fetch(`/api/caisses/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur chargement audit logs');
      const data = await res.json();
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, perPage: 10, total: 0, totalPages: 0 });
    } catch {
      // fetch error handled silently
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionStyle = (action: string) => ACTION_COLORS[action] || 'bg-surface-subtle/30 text-content-muted border-edge-strong/20';
  const getActionLabel = (action: string) => ACTION_LABELS[action] || action;
  const getStatusLabel = (status: string) => STATUS_LABELS[status] || status;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Filters */}
      <Card className="p-4 bg-surface/50 border-edge-subtle">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1.5">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full h-10 px-3 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">Toutes les actions</option>
              <option value="OUVERTURE DIRECTE">Ouverture directe</option>
              <option value="FERMETURE">Fermeture</option>
              <option value="CLOSING_INITIATED">Fermeture initiée</option>
              <option value="CLOSING_CANCELLED">Fermeture annulée</option>
              <option value="COUNT_SUBMITTED">Comptage soumis</option>
              <option value="CLOSING_COUNT">Comptage caisse</option>
              <option value="CLOSING_VALIDATION">Validation fermeture</option>
              <option value="REQUEST_SUBMITTED">Demande soumise</option>
              <option value="REQUEST_APPROVED">Demande approuvée</option>
              <option value="REQUEST_REJECTED">Demande rejetée</option>
              <option value="REQUEST_CANCELLED">Demande annulée</option>
              <option value="SUPERVISOR_TAKEOVER">Prise de contrôle</option>
              <option value="FUNDS_RECEIVED">Fonds reçus</option>
              <option value="FUNDS_SENT">Fonds envoyés</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1.5">Du</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-10 px-3 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1.5">Au</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-10 px-3 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <button
            onClick={() => fetchLogs()}
            className="h-10 w-10 flex items-center justify-center bg-accent-secondary hover:bg-accent-secondary text-content-primary rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </Card>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-content-muted text-sm">
            <Shield size={32} className="mx-auto mb-2 opacity-30" />
            Aucun log d'audit trouvé
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="bg-surface/50 border border-edge-subtle rounded-lg hover:bg-surface/70 transition"
            >
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full p-3 flex items-center gap-3 text-left"
              >
                {/* Action badge */}
                <span className={`inline-flex items-center justify-center w-40 shrink-0 h-6 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getActionStyle(log.action)} whitespace-nowrap`}>
                  {getActionLabel(log.action)}
                </span>

                {/* User */}
                <span className="text-xs text-content-secondary truncate flex-1">
                  {log.userName ? `${log.userName} ${log.userPrenom || ''}`.trim() : 'Système'}
                </span>

                {/* Status transition */}
                {log.statutAvant && log.statutApres && (
                  <span className="text-[10px] text-content-muted hidden sm:inline">
                    {getStatusLabel(log.statutAvant)} → {getStatusLabel(log.statutApres)}
                  </span>
                )}

                {/* Date */}
                <span className="text-[10px] text-content-muted whitespace-nowrap">
                  {formatDate(log.createdAt, { format: 'datetime' })}
                </span>

                {/* Expand icon */}
                {expandedId === log.id ? (
                  <ChevronUp size={14} className="text-content-muted flex-shrink-0" />
                ) : (
                  <ChevronDown size={14} className="text-content-muted flex-shrink-0" />
                )}
              </button>

              {/* Expanded Details */}
              {expandedId === log.id && (
                <div className="px-3 pb-3 border-t border-edge-subtle">
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-content-muted">Session ID</span>
                      <div className="text-content-secondary font-mono text-[10px] truncate">{log.sessionId}</div>
                    </div>
                    {log.ipAddress && (
                      <div>
                        <span className="text-content-muted">Adresse IP</span>
                        <div className="text-content-secondary font-mono text-[10px]">{log.ipAddress}</div>
                      </div>
                    )}
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="mt-2">
                      <span className="text-[10px] text-content-muted uppercase tracking-wider font-bold">Détails</span>
                      <pre className="mt-1 p-2 bg-surface-base rounded text-[10px] text-content-muted overflow-x-auto max-h-32 font-mono">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination - Always visible */}
      <div className="shrink-0 flex items-center justify-between py-3 px-1 border-t border-edge-subtle mt-2">
        <span className="text-xs text-content-muted">
          {pagination.total} entrée{pagination.total > 1 ? 's' : ''} au total
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchLogs(1)}
            disabled={pagination.page <= 1}
            className="px-2 py-1.5 text-xs bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Première page"
          >
            «
          </button>
          <button
            onClick={() => fetchLogs(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 text-xs bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Préc.
          </button>
          <span className="px-3 py-1.5 text-xs text-content-secondary bg-surface-base rounded-lg min-w-[80px] text-center">
            {pagination.page} / {pagination.totalPages || 1}
          </span>
          <button
            onClick={() => fetchLogs(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 text-xs bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Suiv.
          </button>
          <button
            onClick={() => fetchLogs(pagination.totalPages)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-2 py-1.5 text-xs bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Dernière page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
