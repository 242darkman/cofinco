import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Shield, Lock } from 'lucide-react';
import { Card } from '../../ui';
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
  'OUVERTURE DIRECTE': 'bg-green-500/10 text-green-400 border-green-500/20',
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
  CLOSING_INITIATED: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  CLOSING_CANCELLED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  COUNT_SUBMITTED: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  SUPERVISOR_TAKEOVER: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  FUNDS_RECEIVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FUNDS_SENT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
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
  const isAdmin = authService.isAdmin();

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
      params.append('perPage', '8');
      if (filterAction) params.append('action', filterAction);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);

      const res = await fetch(`/api/caisses/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur chargement audit logs');
      const data = await res.json();
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, perPage: 10, total: 0, totalPages: 0 });
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
      <Card className="p-4 bg-slate-800/50 border-slate-700/50">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Du</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Au</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <button
            onClick={() => fetchLogs()}
            className="h-10 w-10 flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
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

      {/* Pagination - Always visible */}
      <div className="shrink-0 flex items-center justify-between py-3 px-1 border-t border-slate-700/50 mt-2">
        <span className="text-xs text-slate-400">
          {pagination.total} entrée{pagination.total > 1 ? 's' : ''} au total
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchLogs(1)}
            disabled={pagination.page <= 1}
            className="px-2 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Première page"
          >
            «
          </button>
          <button
            onClick={() => fetchLogs(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Préc.
          </button>
          <span className="px-3 py-1.5 text-xs text-slate-300 bg-slate-900 rounded-lg min-w-[80px] text-center">
            {pagination.page} / {pagination.totalPages || 1}
          </span>
          <button
            onClick={() => fetchLogs(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Suiv.
          </button>
          <button
            onClick={() => fetchLogs(pagination.totalPages)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-2 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Dernière page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
