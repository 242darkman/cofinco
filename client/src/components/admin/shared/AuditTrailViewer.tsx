/**
 * Reusable Audit Trail Viewer Component
 * Displays audit history for any entity with rollback capability
 */

import React, { useState, useEffect } from 'react';
import {
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  MapPin,
  Monitor,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield,
  Loader2,
} from 'lucide-react';
import { useAuditTrail, AuditLogEntry } from '../../../hooks/admin/useAuditTrail';
import DateRangeFilter from './DateRangeFilter';

export interface AuditTrailViewerProps {
  resource?: string;
  resourceId?: string;
  userId?: string;
  showRollback?: boolean;
  showFilters?: boolean;
  maxHeight?: string;
  title?: string;
  onRollbackSuccess?: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-500/20 text-emerald-400',
  UPDATE: 'bg-amber-500/20 text-amber-400',
  DELETE: 'bg-red-500/20 text-red-400',
  ROLLBACK: 'bg-purple-500/20 text-purple-400',
  LOGIN: 'bg-blue-500/20 text-blue-400',
  LOGOUT: 'bg-slate-500/20 text-slate-400',
  EXPORT: 'bg-cyan-500/20 text-cyan-400',
  IMPORT: 'bg-indigo-500/20 text-indigo-400',
  GRANT: 'bg-emerald-500/20 text-emerald-400',
  REVOKE: 'bg-red-500/20 text-red-400',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="text-emerald-400" size={16} />,
  failure: <XCircle className="text-red-400" size={16} />,
  blocked: <Shield className="text-amber-400" size={16} />,
};

export default function AuditTrailViewer({
  resource,
  resourceId,
  userId,
  showRollback = true,
  showFilters = true,
  maxHeight = '500px',
  title = 'Historique des modifications',
  onRollbackSuccess,
}: AuditTrailViewerProps) {
  const { logs, loading, total, page, totalPages, fetchLogs, rollback } = useAuditTrail();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    action: '',
    search: '',
  });

  useEffect(() => {
    fetchLogs({
      resource,
      resourceId,
      userId,
      ...filters,
      page,
      limit: 20,
    });
  }, [fetchLogs, resource, resourceId, userId, page, filters]);

  const handleRollback = async (logId: string) => {
    setRollingBack(logId);
    const success = await rollback(logId);
    if (success) {
      onRollbackSuccess?.();
      fetchLogs({ resource, resourceId, userId, ...filters, page, limit: 20 });
    }
    setRollingBack(null);
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderChanges = (log: AuditLogEntry) => {
    const details = log.details || {};
    const before = log.beforeState || details?.snapshot?.before;
    const after = log.afterState || details?.snapshot?.after;

    if (!before && !after) {
      return (
        <div className="text-sm text-slate-400">
          {details ? (
            <pre className="whitespace-pre-wrap text-xs bg-slate-900/50 p-3 rounded-lg overflow-auto max-h-48">
              {JSON.stringify(details, null, 2)}
            </pre>
          ) : (
            'Aucun détail disponible'
          )}
        </div>
      );
    }

    const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

    return (
      <div className="space-y-2">
        {Array.from(allKeys).map((key) => {
          const beforeVal = before?.[key];
          const afterVal = after?.[key];
          const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);

          if (!changed) return null;

          return (
            <div key={key} className="flex items-start gap-3 text-sm">
              <span className="font-medium text-slate-300 min-w-[120px]">{key}:</span>
              <div className="flex-1 space-y-1">
                {beforeVal !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-xs">Avant:</span>
                    <span className="text-slate-400 bg-red-500/10 px-2 py-0.5 rounded">
                      {typeof beforeVal === 'object' ? JSON.stringify(beforeVal) : String(beforeVal)}
                    </span>
                  </div>
                )}
                {afterVal !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-xs">Après:</span>
                    <span className="text-slate-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                      {typeof afterVal === 'object' ? JSON.stringify(afterVal) : String(afterVal)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <History className="text-indigo-400" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">{total} entrée(s)</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
          <DateRangeFilter
            startDate={filters.dateFrom}
            endDate={filters.dateTo}
            onChange={handleDateRangeChange}
          />

          <select
            value={filters.action}
            onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
            className="px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="">Toutes actions</option>
            <option value="CREATE">Création</option>
            <option value="UPDATE">Modification</option>
            <option value="DELETE">Suppression</option>
            <option value="ROLLBACK">Annulation</option>
          </select>

          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Rechercher..."
            className="flex-1 min-w-[150px] px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
      )}

      {/* Content */}
      <div className="overflow-auto" style={{ maxHeight }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <History size={48} className="mx-auto mb-4 opacity-50" />
            <p>Aucun historique disponible</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-700/30 transition">
                {/* Main Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Action Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          ACTION_COLORS[log.action] || 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {log.action}
                      </span>

                      {/* Status Icon */}
                      {STATUS_ICONS[log.statut]}

                      {/* Risk Level */}
                      {log.riskLevel !== 'low' && (
                        <span className={`text-xs ${RISK_COLORS[log.riskLevel]}`}>
                          <AlertTriangle size={14} className="inline mr-1" />
                          {log.riskLevel}
                        </span>
                      )}

                      {/* Rolled Back Badge */}
                      {log.rolledBackAt && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                          Annulé
                        </span>
                      )}
                    </div>

                    {/* Resource Info */}
                    <p className="text-sm text-white mb-1">
                      <span className="text-slate-400">Ressource:</span>{' '}
                      <span className="font-medium">{log.resource}</span>
                      {log.resourceId && (
                        <span className="text-slate-500 ml-1">#{log.resourceId.slice(0, 8)}</span>
                      )}
                    </p>

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(log.createdAt)}
                      </span>

                      {(log.userNom || log.userEmail) && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {log.userPrenom} {log.userNom || log.userEmail}
                        </span>
                      )}

                      {log.ipAddress && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {log.ipAddress}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Rollback Button */}
                    {showRollback && log.isRollbackable && !log.rolledBackAt && (
                      <button
                        onClick={() => handleRollback(log.id)}
                        disabled={rollingBack === log.id}
                        className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition disabled:opacity-50"
                        title="Annuler cette action"
                      >
                        {rollingBack === log.id ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <RotateCcw size={18} />
                        )}
                      </button>
                    )}

                    {/* Expand/Collapse */}
                    <button
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition"
                    >
                      {expandedId === log.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === log.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <h4 className="text-sm font-medium text-white mb-3">Détails des modifications</h4>
                    {renderChanges(log)}

                    {/* Technical Details */}
                    {log.userAgent && (
                      <div className="mt-4 pt-3 border-t border-slate-700/50">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Monitor size={12} />
                          <span className="truncate">{log.userAgent}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <span className="text-sm text-slate-400">
            Page {page} sur {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchLogs({ resource, resourceId, userId, ...filters, page: page - 1, limit: 20 })}
              disabled={page <= 1}
              className="px-3 py-1.5 bg-slate-700 text-white rounded-lg disabled:opacity-50 text-sm"
            >
              Précédent
            </button>
            <button
              onClick={() => fetchLogs({ resource, resourceId, userId, ...filters, page: page + 1, limit: 20 })}
              disabled={page >= totalPages}
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
