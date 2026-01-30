import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp, RefreshCw, Shield, Lock } from 'lucide-react';
import { Card, Button, SelectField, FormField } from '../../ui';
import { formatDate } from '../../../lib/format';
import { authService } from '../../../lib/auth';

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
  OPENED: 'bg-green-500/10 text-green-400 border-green-500/20',
  OUVERTURE: 'bg-green-500/10 text-green-400 border-green-500/20',
  DIRECT_OPEN: 'bg-green-500/10 text-green-400 border-green-500/20',
  CLOSED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  FERMETURE: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  TIMEOUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ADMIN_CLOSED: 'bg-red-500/10 text-red-400 border-red-500/20',
  // Requests
  REQUEST_SUBMITTED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  REQUEST_APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  REQUEST_REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
  REQUEST_CANCELLED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  // Operations
  HEARTBEAT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  CLOSING_COUNT: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CLOSING_VALIDATION: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  SUPERVISOR_TAKEOVER: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  FUNDS_RECEIVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FUNDS_SENT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const ACTION_LABELS: Record<string, string> = {
  // Session lifecycle
  OPENED: 'Ouverture',
  OUVERTURE: 'Ouverture',
  DIRECT_OPEN: 'Ouverture directe',
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
  CLOSING_COUNT: 'Comptage',
  CLOSING_VALIDATION: 'Validation',
  SUPERVISOR_TAKEOVER: 'Prise de contrôle',
  FUNDS_RECEIVED: 'Fonds reçus',
  FUNDS_SENT: 'Fonds envoyés',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouverte',
  OPENED: 'Ouverte',
  CLOSED: 'Fermée',
  REQUESTING_FUNDS: 'En attente de fonds',
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
  CANCELLED: 'Annulée',
};

export default function CaisseAuditLog() {
  const isAdmin = authService.isAdmin();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({ page: 1, perPage: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Restrict access to admins only
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-slate-500">
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
      params.append('perPage', '20');
      if (filterAction) params.append('action', filterAction);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);

      const res = await fetch(`/api/caisses/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur chargement audit logs');
      const data = await res.json();
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, perPage: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('Erreur fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionStyle = (action: string) => ACTION_COLORS[action] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const getActionLabel = (action: string) => ACTION_LABELS[action] || action;
  const getStatusLabel = (status: string) => STATUS_LABELS[status] || status;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Filters */}
      <Card className="p-3 bg-slate-800/50 border-slate-700/50">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <SelectField
              label="Action"
              name="action"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              options={[
                { value: '', label: 'Sélectionner...' },
                { value: 'OPENED', label: 'Ouverture' },
                { value: 'OUVERTURE', label: 'Ouverture' },
                { value: 'DIRECT_OPEN', label: 'Ouverture directe' },
                { value: 'CLOSED', label: 'Fermeture' },
                { value: 'TIMEOUT', label: 'Expiration' },
                { value: 'ADMIN_CLOSED', label: 'Fermeture admin' },
                { value: 'REQUEST_SUBMITTED', label: 'Demande soumise' },
                { value: 'REQUEST_APPROVED', label: 'Demande approuvée' },
                { value: 'REQUEST_REJECTED', label: 'Demande rejetée' },
                { value: 'REQUEST_CANCELLED', label: 'Demande annulée' },
                { value: 'CLOSING_COUNT', label: 'Comptage' },
                { value: 'CLOSING_VALIDATION', label: 'Validation' },
                { value: 'SUPERVISOR_TAKEOVER', label: 'Prise de contrôle' },
                { value: 'FUNDS_RECEIVED', label: 'Fonds reçus' },
                { value: 'FUNDS_SENT', label: 'Fonds envoyés' },
              ]}
            />
          </div>
          <div className="min-w-[130px]">
            <FormField
              label="Du"
              name="dateFrom"
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="min-w-[130px]">
            <FormField
              label="Au"
              name="dateTo"
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchLogs()}
            className="h-9"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </Card>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            <Shield size={32} className="mx-auto mb-2 opacity-30" />
            Aucun log d'audit trouvé
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800/70 transition"
            >
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full p-3 flex items-center gap-3 text-left"
              >
                {/* Action badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getActionStyle(log.action)}`}>
                  {getActionLabel(log.action)}
                </span>

                {/* User */}
                <span className="text-xs text-slate-300 truncate flex-1">
                  {log.userName ? `${log.userName} ${log.userPrenom || ''}`.trim() : 'Système'}
                </span>

                {/* Status transition */}
                {log.statutAvant && log.statutApres && (
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    {getStatusLabel(log.statutAvant)} → {getStatusLabel(log.statutApres)}
                  </span>
                )}

                {/* Date */}
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  {formatDate(log.createdAt, { format: 'datetime' })}
                </span>

                {/* Expand icon */}
                {expandedId === log.id ? (
                  <ChevronUp size={14} className="text-slate-500 flex-shrink-0" />
                ) : (
                  <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                )}
              </button>

              {/* Expanded Details */}
              {expandedId === log.id && (
                <div className="px-3 pb-3 border-t border-slate-700/50">
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Session ID</span>
                      <div className="text-slate-300 font-mono text-[10px] truncate">{log.sessionId}</div>
                    </div>
                    {log.ipAddress && (
                      <div>
                        <span className="text-slate-500">Adresse IP</span>
                        <div className="text-slate-300 font-mono text-[10px]">{log.ipAddress}</div>
                      </div>
                    )}
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="mt-2">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Détails</span>
                      <pre className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 overflow-x-auto max-h-32 font-mono">
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

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between py-2 text-xs text-slate-400">
          <span>{pagination.total} entrée(s)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-2 py-1 bg-slate-800 rounded disabled:opacity-30 hover:bg-slate-700 transition"
            >
              Préc.
            </button>
            <span>{pagination.page} / {pagination.totalPages}</span>
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-2 py-1 bg-slate-800 rounded disabled:opacity-30 hover:bg-slate-700 transition"
            >
              Suiv.
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
