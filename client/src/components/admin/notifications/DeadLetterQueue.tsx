/**
 * Dead Letter Queue Component
 * View and manage failed notifications
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCcw,
  Trash2,
  Eye,
  Download,
  Loader2,
  Clock,
  User,
  MessageSquare,
  Mail,
  Bell,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import { toast, handleApiError } from '../../../lib/toast';
import DateRangeFilter from '../shared/DateRangeFilter';

export interface FailedNotification {
  id: string;
  channel: 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP';
  templateCode: string;
  recipient: string;
  payload: Record<string, any>;
  errorMessage: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string;
  createdAt: string;
  correlationId?: string;
}

export interface DeadLetterQueueProps {
  onRetry?: (ids: string[]) => Promise<{ success: boolean; retried: number }>;
  onDelete?: (ids: string[]) => Promise<{ success: boolean }>;
  onExport?: (ids: string[]) => void;
  fetchFailedNotifications?: (filters: DLQFilters) => Promise<{ data: FailedNotification[]; total: number }>;
}

export interface DLQFilters {
  channel?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  SMS: MessageSquare,
  EMAIL: Mail,
  PUSH: Bell,
  IN_APP: Bell,
};

const CHANNEL_COLORS: Record<string, string> = {
  SMS: 'text-cyan-400 bg-cyan-500/20',
  EMAIL: 'text-blue-400 bg-blue-500/20',
  PUSH: 'text-purple-400 bg-purple-500/20',
  IN_APP: 'text-emerald-400 bg-emerald-500/20',
};

export default function DeadLetterQueue({
  onRetry,
  onDelete,
  onExport,
  fetchFailedNotifications,
}: DeadLetterQueueProps) {
  const [notifications, setNotifications] = useState<FailedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DLQFilters>({
    page: 1,
    limit: 20,
  });
  const [total, setTotal] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!fetchFailedNotifications) return;

    setLoading(true);
    try {
      const result = await fetchFailedNotifications(filters);
      setNotifications(result.data);
      setTotal(result.total);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  }, [fetchFailedNotifications, filters]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map((n) => n.id)));
    }
  };

  const handleRetry = async () => {
    if (!onRetry || selectedIds.size === 0) return;

    setRetrying(true);
    try {
      const result = await onRetry(Array.from(selectedIds));
      if (result.success) {
        toast.success(`${result.retried} notification(s) remise(s) en file d'attente`);
        setSelectedIds(new Set());
        loadNotifications();
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la remise en file'));
    } finally {
      setRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || selectedIds.size === 0) return;

    setDeleting(true);
    try {
      const result = await onDelete(Array.from(selectedIds));
      if (result.success) {
        toast.success('Notifications supprimées');
        setSelectedIds(new Set());
        loadNotifications();
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la suppression'));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (onExport) {
      const idsToExport = selectedIds.size > 0 ? Array.from(selectedIds) : notifications.map((n) => n.id);
      onExport(idsToExport);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="text-red-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white">File d'échecs (Dead Letter Queue)</h3>
              <p className="text-sm text-slate-400">
                {total} notification(s) en échec
              </p>
            </div>
          </div>

          <button
            onClick={loadNotifications}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <DateRangeFilter
            startDate={filters.dateFrom || ''}
            endDate={filters.dateTo || ''}
            onChange={(from, to) => setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }))}
          />

          <select
            value={filters.channel || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, channel: e.target.value }))}
            className="px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 text-sm"
          >
            <option value="">Tous les canaux</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
            <option value="PUSH">Push</option>
          </select>

          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Rechercher..."
            className="flex-1 min-w-[150px] px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 text-sm"
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="p-3 bg-slate-900/50 border-b border-slate-700 flex items-center gap-3">
          <span className="text-sm text-white">{selectedIds.size} sélectionné(s)</span>

          <div className="flex-1" />

          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition disabled:opacity-50"
          >
            {retrying ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
            Réessayer
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition disabled:opacity-50"
          >
            {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
            Supprimer
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm transition"
          >
            <Download size={14} />
            Exporter
          </button>
        </div>
      )}

      {/* List */}
      <div className="max-h-[500px] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400">Aucune notification en échec</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-700/50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                    {selectedIds.size === notifications.length ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Canal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Destinataire</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Erreur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Tentatives</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {notifications.map((notif) => {
                const Icon = CHANNEL_ICONS[notif.channel];
                const isExpanded = expandedId === notif.id;

                return (
                  <React.Fragment key={notif.id}>
                    <tr className="hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelect(notif.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          {selectedIds.has(notif.id) ? (
                            <CheckSquare size={18} className="text-indigo-400" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex p-1.5 rounded ${CHANNEL_COLORS[notif.channel]}`}>
                          <Icon size={14} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white text-sm">{notif.recipient}</span>
                        <p className="text-xs text-slate-500">{notif.templateCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-red-400 text-sm truncate max-w-[200px] block">
                          {notif.errorMessage}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-300 text-sm">
                          {notif.attempts}/{notif.maxAttempts}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-400 text-xs">{formatDate(notif.lastAttemptAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : notif.id)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-slate-900/50">
                          <div className="space-y-3">
                            <div>
                              <h4 className="text-xs text-slate-400 mb-1">Payload</h4>
                              <pre className="text-xs text-slate-300 bg-slate-800 p-3 rounded-lg overflow-auto max-h-32">
                                {JSON.stringify(notif.payload, null, 2)}
                              </pre>
                            </div>
                            {notif.correlationId && (
                              <p className="text-xs text-slate-500">
                                Correlation ID: {notif.correlationId}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > (filters.limit || 20) && (
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Page {filters.page} sur {Math.ceil(total / (filters.limit || 20))}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
              disabled={(filters.page || 1) <= 1}
              className="px-3 py-1.5 bg-slate-700 text-white rounded-lg disabled:opacity-50 text-sm"
            >
              Précédent
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
              disabled={(filters.page || 1) >= Math.ceil(total / (filters.limit || 20))}
              className="px-3 py-1.5 bg-slate-700 text-white rounded-lg disabled:opacity-50 text-sm"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
