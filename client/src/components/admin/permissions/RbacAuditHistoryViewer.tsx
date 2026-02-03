/**
 * RBAC Audit History Viewer
 * =========================
 *
 * Component to display and filter RBAC audit history.
 * Shows who changed what, when, and why.
 */

import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Clock,
  ArrowRight,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  Loader2,
  AlertCircle,
  Download,
} from 'lucide-react';
import { Button, Badge, SearchInput, SelectField } from '@/components/ui';
import {
  useRbacAuditHistory,
  AUDIT_ACTION_LABELS,
  type RbacAuditEntry,
  type RbacAuditAction,
  type PermissionScope,
} from '@/hooks/admin/useRbacAudit';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface RbacAuditHistoryViewerProps {
  userId?: string; // If provided, filter to this user
  compact?: boolean;
  maxItems?: number;
}

export default function RbacAuditHistoryViewer({
  userId,
  compact = false,
  maxItems,
}: RbacAuditHistoryViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<RbacAuditAction | ''>('');
  const [scopeFilter, setScopeFilter] = useState<PermissionScope | ''>('');

  const {
    history,
    total,
    loading,
    error,
    filters,
    updateFilters,
    refresh,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
    currentPage,
    totalPages,
  } = useRbacAuditHistory(
    userId
      ? { targetUserId: userId, limit: maxItems || 50 }
      : { limit: maxItems || 50 }
  );

  // Filter locally by search term
  const filteredHistory = useMemo(() => {
    let items = history;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      items = items.filter(
        (entry) =>
          entry.actorName?.toLowerCase().includes(lower) ||
          entry.targetName?.toLowerCase().includes(lower) ||
          entry.permissionCode?.toLowerCase().includes(lower) ||
          entry.reason?.toLowerCase().includes(lower)
      );
    }

    if (actionFilter) {
      items = items.filter((entry) => entry.action === actionFilter);
    }

    if (scopeFilter) {
      items = items.filter((entry) => entry.scope === scopeFilter);
    }

    return items;
  }, [history, searchTerm, actionFilter, scopeFilter]);

  // Action options
  const actionOptions = [
    { value: '', label: 'Toutes les actions' },
    ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  // Scope options
  const scopeOptions = [
    { value: '', label: 'Tous les scopes' },
    { value: 'GLOBAL', label: 'Global' },
    { value: 'AGENCE', label: 'Agence' },
  ];

  // Render single audit entry
  const renderEntry = (entry: RbacAuditEntry) => {
    const isGrant = entry.newValue === true;
    const isDeny = entry.newValue === false;
    const isReset = entry.action === 'RESET';
    const isBulk = entry.action === 'BULK_UPDATE';

    return (
      <div
        key={entry.id}
        className={`
          border-b border-slate-800/50 last:border-b-0
          px-3 py-2.5 hover:bg-slate-800/30 transition-colors
        `}
      >
        <div className="flex items-start gap-3">
          {/* Action Icon */}
          <div
            className={`
              w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${isGrant ? 'bg-emerald-500/10 text-emerald-400' : ''}
              ${isDeny ? 'bg-rose-500/10 text-rose-400' : ''}
              ${isReset ? 'bg-amber-500/10 text-amber-400' : ''}
              ${isBulk ? 'bg-indigo-500/10 text-indigo-400' : ''}
              ${!isGrant && !isDeny && !isReset && !isBulk ? 'bg-slate-500/10 text-slate-400' : ''}
            `}
          >
            {isGrant && <CheckCircle size={16} />}
            {isDeny && <XCircle size={16} />}
            {isReset && <RefreshCw size={16} />}
            {isBulk && <Shield size={16} />}
            {!isGrant && !isDeny && !isReset && !isBulk && <History size={16} />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Actor and Action */}
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              <span className="font-medium text-white">
                {entry.actorName || 'Système'}
              </span>
              <span className="text-slate-400">a</span>
              <Badge
                variant={isGrant ? 'success' : isDeny ? 'danger' : 'neutral'}
                size="xs"
              >
                {AUDIT_ACTION_LABELS[entry.action] || entry.action}
              </Badge>
              {entry.targetName && (
                <>
                  <ArrowRight size={10} className="text-slate-600" />
                  <span className="text-indigo-400 font-medium">
                    {entry.targetName}
                  </span>
                </>
              )}
            </div>

            {/* Permission Info */}
            {entry.permissionCode && (
              <div className="mt-1 flex items-center gap-2">
                <code className="text-[10px] text-slate-500 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
                  {entry.permissionCode}
                </code>
                {entry.oldValue !== null && entry.newValue !== null && (
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className={entry.oldValue ? 'text-emerald-400' : 'text-rose-400'}>
                      {entry.oldValue ? 'ON' : 'OFF'}
                    </span>
                    <ArrowRight size={8} className="text-slate-600" />
                    <span className={entry.newValue ? 'text-emerald-400' : 'text-rose-400'}>
                      {entry.newValue ? 'ON' : 'OFF'}
                    </span>
                  </div>
                )}
                {entry.scope !== 'GLOBAL' && (
                  <Badge variant="info" size="xs">
                    {entry.scope}
                  </Badge>
                )}
              </div>
            )}

            {/* Bulk changes info */}
            {isBulk && entry.metadata?.changesCount && (
              <div className="mt-1 text-[10px] text-slate-500">
                {entry.metadata.changesCount as number} permissions modifiées
              </div>
            )}

            {/* Reason */}
            {entry.reason && (
              <div className="mt-1.5 text-[10px] text-slate-400 bg-slate-800/30 rounded px-2 py-1">
                <span className="text-slate-500">Raison:</span> {entry.reason}
              </div>
            )}

            {/* Timestamp */}
            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-600">
              <Clock size={9} />
              <span title={format(new Date(entry.createdAt), 'PPPpp', { locale: fr })}>
                {formatDistanceToNow(new Date(entry.createdAt), {
                  addSuffix: true,
                  locale: fr,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!compact && (
        <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History size={14} className="text-slate-400" />
            <span className="font-semibold text-slate-300 text-sm">
              Historique d'audit RBAC
            </span>
            <Badge variant="neutral" size="xs">
              {total} entrées
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refresh()}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      )}

      {/* Filters */}
      {!compact && (
        <div className="px-3 py-2 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-slate-900 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as RbacAuditAction | '')}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            >
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as PermissionScope | '')}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            >
              {scopeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Loader2 className="animate-spin mb-2" size={24} />
            <span className="text-xs">Chargement...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-rose-400">
            <AlertCircle size={24} className="mb-2" />
            <span className="text-xs">{error}</span>
            <Button variant="ghost" size="sm" onClick={() => refresh()} className="mt-2">
              Réessayer
            </Button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <History size={24} className="mb-2 opacity-50" />
            <span className="text-xs">Aucune entrée d'audit</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filteredHistory.map(renderEntry)}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!compact && totalPages > 1 && (
        <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            Page {currentPage} / {totalPages}
          </span>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevPage}
              disabled={!hasPrevPage || loading}
            >
              <ChevronLeft size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextPage}
              disabled={!hasNextPage || loading}
            >
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
