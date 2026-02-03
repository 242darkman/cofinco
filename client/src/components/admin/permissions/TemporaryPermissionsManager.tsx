/**
 * Temporary Permissions Manager
 * =============================
 *
 * Interface d'administration pour gérer les permissions temporaires:
 * - Voir toutes les permissions temporaires actives
 * - Accorder une nouvelle permission temporaire
 * - Révoquer une permission temporaire
 * - Voir le temps restant avant expiration
 * - Consulter l'historique complet avec statistiques
 */

import React, { useState, useMemo } from 'react';
import {
  Clock, Shield, UserPlus, Trash2, RefreshCw,
  AlertTriangle, Timer, Users, X, Calendar,
  History, ChevronLeft, ChevronRight, Filter,
  CheckCircle2, XCircle, AlertCircle, BarChart3
} from 'lucide-react';
import {
  useTemporaryPermissions,
  useTemporaryPermissionsHistory,
  TemporaryPermission,
  TempPermissionHistoryEntry,
  TempPermissionHistoryStats,
  TEMP_PERMISSION_DURATIONS,
  formatTimeRemaining
} from '../../../hooks/admin/useTemporaryPermissions';
import { usePermissions } from '../../../hooks/admin/usePermissions';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';
import { getRoleBadgeStyle } from '../../../lib/role-utils';

interface TemporaryPermissionsManagerProps {
  users: Array<{
    id: string;
    nom: string;
    prenom?: string;
    username?: string;
    role?: string;
  }>;
}

// Format date for display
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Get user full name
const getUserFullName = (user: any): string => {
  const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return fullName || user.username || 'Utilisateur';
};

// Permission card component - Compact
function TempPermissionCard({
  permission,
  onRevoke,
  isRevoking
}: {
  permission: TemporaryPermission & { isExpiringSoon?: boolean };
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) {
  const timeRemaining = permission.timeRemaining || 0;
  const isExpired = timeRemaining <= 0;

  return (
    <div className={cn(
      "px-3 py-2.5 border rounded-lg bg-slate-800/50 transition-all",
      permission.isExpiringSoon && !isExpired && "border-amber-500/30 bg-amber-500/5",
      isExpired && "border-red-500/30 bg-red-500/5 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs font-medium text-white truncate">
              {permission.permissionName || permission.permissionCode}
            </span>
          </div>

          <div className="text-[10px] text-slate-400 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Users className="w-2.5 h-2.5" />
              <span>ID: {permission.userId.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UserPlus className="w-2.5 h-2.5" />
              <span>Par: {permission.granterName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-2.5 h-2.5" />
              <span>Expire: {formatDate(permission.expiresAt)}</span>
            </div>
          </div>

          {permission.reason && (
            <p className="mt-1.5 text-[10px] text-slate-300 bg-slate-700/50 px-2 py-1 rounded truncate">
              {permission.reason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Time remaining badge */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium",
            isExpired
              ? "bg-red-500/10 text-red-400"
              : permission.isExpiringSoon
                ? "bg-amber-500/10 text-amber-400"
                : "bg-indigo-500/10 text-indigo-400"
          )}>
            <Timer className="w-3 h-3" />
            {formatTimeRemaining(timeRemaining)}
          </div>

          {/* Revoke button */}
          {!isExpired && (
            <button
              onClick={() => onRevoke(permission.id)}
              disabled={isRevoking}
              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: 'active' | 'expired' | 'revoked' }) {
  const config = {
    active: { icon: CheckCircle2, label: 'Actif', classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
    expired: { icon: AlertCircle, label: 'Expiré', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
    revoked: { icon: XCircle, label: 'Révoqué', classes: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };
  const { icon: Icon, label, classes } = config[status];

  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border", classes)}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// History stats cards
function HistoryStatsCards({ stats, loading }: { stats: TempPermissionHistoryStats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg animate-pulse">
            <div className="h-5 bg-slate-700 rounded w-8 mx-auto mb-1"></div>
            <div className="h-2 bg-slate-700 rounded w-12 mx-auto"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
        <div className="text-base font-bold text-indigo-400">{stats.totalGranted}</div>
        <div className="text-[8px] text-slate-500 uppercase">Total</div>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
        <div className="text-base font-bold text-green-400">{stats.totalActive}</div>
        <div className="text-[8px] text-slate-500 uppercase">Actives</div>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
        <div className="text-base font-bold text-slate-400">{stats.totalExpired}</div>
        <div className="text-[8px] text-slate-500 uppercase">Expirées</div>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
        <div className="text-base font-bold text-red-400">{stats.totalRevoked}</div>
        <div className="text-[8px] text-slate-500 uppercase">Révoquées</div>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
        <div className="text-base font-bold text-amber-400">{stats.avgDurationHours.toFixed(1)}h</div>
        <div className="text-[8px] text-slate-500 uppercase">Durée moy.</div>
      </div>
    </div>
  );
}

// History entry card
function HistoryEntryCard({ entry }: { entry: TempPermissionHistoryEntry }) {
  const durationHours = Math.round(entry.duration / (1000 * 60 * 60));

  return (
    <div className={cn(
      "px-3 py-2.5 border rounded-lg bg-slate-800/50 transition-all",
      entry.status === 'active' && "border-green-500/20",
      entry.status === 'revoked' && "border-red-500/20",
      entry.status === 'expired' && "border-slate-600"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Permission name and status */}
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs font-medium text-white truncate">
              {entry.permissionName || entry.permissionCode}
            </span>
            <StatusBadge status={entry.status} />
          </div>

          {/* User info */}
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-2.5 h-2.5 text-slate-500" />
            <span className="text-[10px] text-slate-300 font-medium">{entry.userName}</span>
            {entry.userEmail && (
              <span className="text-[9px] text-slate-500">({entry.userEmail})</span>
            )}
          </div>

          {/* Grant info */}
          <div className="text-[10px] text-slate-400 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <UserPlus className="w-2.5 h-2.5" />
              <span>Accordé par {entry.granterName} le {formatDate(entry.grantedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5" />
              <span>Durée: {durationHours}h | Expire(é): {formatDate(entry.expiresAt)}</span>
            </div>
            {entry.status === 'revoked' && entry.revokedAt && (
              <div className="flex items-center gap-1.5 text-red-400">
                <XCircle className="w-2.5 h-2.5" />
                <span>Révoqué par {entry.revokerName || 'Système'} le {formatDate(entry.revokedAt)}</span>
              </div>
            )}
          </div>

          {/* Reason */}
          {entry.reason && (
            <p className="mt-1.5 text-[10px] text-slate-300 bg-slate-700/50 px-2 py-1 rounded truncate">
              Raison: {entry.reason}
            </p>
          )}

          {/* Revoke reason if applicable */}
          {entry.revokeReason && (
            <p className="mt-1 text-[10px] text-red-300 bg-red-500/10 px-2 py-1 rounded truncate">
              Motif révocation: {entry.revokeReason}
            </p>
          )}
        </div>

        {/* Module badge */}
        {entry.moduleName && (
          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20 shrink-0">
            {entry.moduleName}
          </span>
        )}
      </div>
    </div>
  );
}

// History filters component
function HistoryFilters({
  filters,
  onFilterChange,
  permissions
}: {
  filters: { status?: string; permissionCode?: string; startDate?: string; endDate?: string };
  onFilterChange: (newFilters: any) => void;
  permissions: any[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-800/30 rounded-lg border border-slate-700">
      <Filter className="w-3.5 h-3.5 text-slate-500" />

      {/* Status filter */}
      <select
        value={filters.status || 'all'}
        onChange={(e) => onFilterChange({ status: e.target.value === 'all' ? undefined : e.target.value })}
        className="h-7 px-2 bg-slate-800 border border-slate-700 rounded text-[10px] text-white focus:outline-none focus:border-indigo-500"
      >
        <option value="all">Tous les statuts</option>
        <option value="active">Actives</option>
        <option value="expired">Expirées</option>
        <option value="revoked">Révoquées</option>
      </select>

      {/* Permission filter */}
      <select
        value={filters.permissionCode || ''}
        onChange={(e) => onFilterChange({ permissionCode: e.target.value || undefined })}
        className="h-7 px-2 bg-slate-800 border border-slate-700 rounded text-[10px] text-white focus:outline-none focus:border-indigo-500 max-w-[150px]"
      >
        <option value="">Toutes permissions</option>
        {permissions.slice(0, 50).map(p => (
          <option key={p.code} value={p.code}>{p.name || p.code}</option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={filters.startDate || ''}
          onChange={(e) => onFilterChange({ startDate: e.target.value || undefined })}
          className="h-7 px-2 bg-slate-800 border border-slate-700 rounded text-[10px] text-white focus:outline-none focus:border-indigo-500"
          placeholder="Du"
        />
        <span className="text-slate-500 text-xs">→</span>
        <input
          type="date"
          value={filters.endDate || ''}
          onChange={(e) => onFilterChange({ endDate: e.target.value || undefined })}
          className="h-7 px-2 bg-slate-800 border border-slate-700 rounded text-[10px] text-white focus:outline-none focus:border-indigo-500"
          placeholder="Au"
        />
      </div>

      {/* Clear filters */}
      {(filters.status || filters.permissionCode || filters.startDate || filters.endDate) && (
        <button
          onClick={() => onFilterChange({ status: 'all', permissionCode: undefined, startDate: undefined, endDate: undefined })}
          className="h-7 px-2 text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        >
          Effacer
        </button>
      )}
    </div>
  );
}

// History view component
function HistoryView({ permissions }: { permissions: any[] }) {
  const {
    history,
    total,
    stats,
    loading,
    filters,
    updateFilters,
    refresh,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
    currentPage,
    totalPages
  } = useTemporaryPermissionsHistory();

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Stats */}
      <HistoryStatsCards stats={stats} loading={loading} />

      {/* Filters */}
      <HistoryFilters
        filters={filters}
        onFilterChange={updateFilters}
        permissions={permissions}
      />

      {/* Results info */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
        <span>{total} enregistrement(s) trouvé(s)</span>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && history.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <History className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">Aucun historique trouvé</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {history.map(entry => (
              <HistoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-800/30 rounded-lg border border-slate-700 shrink-0">
          <button
            onClick={prevPage}
            disabled={!hasPrevPage}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            Précédent
          </button>
          <span className="text-[10px] text-slate-500">
            Page {currentPage} sur {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={!hasNextPage}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Suivant
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// Grant permission modal - Compact
function GrantPermissionModal({
  isOpen,
  onClose,
  onGrant,
  users,
  permissions,
  isGranting
}: {
  isOpen: boolean;
  onClose: () => void;
  onGrant: (data: { userId: string; permissionCode: string; expiresAt: string; reason: string }) => Promise<void>;
  users: any[];
  permissions: any[];
  isGranting: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState('');
  const [durationPreset, setDurationPreset] = useState(TEMP_PERMISSION_DURATIONS[0].value);
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [permSearch, setPermSearch] = useState('');

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!userSearch) return users.slice(0, 20);
    const search = userSearch.toLowerCase();
    return users.filter(u =>
      u.nom?.toLowerCase().includes(search) ||
      u.prenom?.toLowerCase().includes(search) ||
      u.username?.toLowerCase().includes(search)
    ).slice(0, 20);
  }, [users, userSearch]);

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    if (!permSearch) return permissions.slice(0, 30);
    const search = permSearch.toLowerCase();
    return permissions.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.code?.toLowerCase().includes(search) ||
      p.moduleName?.toLowerCase().includes(search)
    ).slice(0, 30);
  }, [permissions, permSearch]);

  // Calculate expiration date
  const expiresAt = useMemo(() => {
    if (durationPreset === -1) {
      return customDate || '';
    }
    return new Date(Date.now() + durationPreset).toISOString();
  }, [durationPreset, customDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedPermission || !expiresAt || !reason) return;

    await onGrant({
      userId: selectedUserId,
      permissionCode: selectedPermission,
      expiresAt,
      reason
    });

    // Reset form
    setSelectedUserId('');
    setSelectedPermission('');
    setReason('');
    setDurationPreset(TEMP_PERMISSION_DURATIONS[0].value);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            Accorder une permission temporaire
          </h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 space-y-3 overflow-y-auto flex-1">
          {/* User selection - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Utilisateur</label>
            <div className="relative mb-1.5">
              <Users className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Rechercher un utilisateur..."
                className="w-full h-7 pl-7 pr-2 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>
            <div className="max-h-24 overflow-y-auto border border-slate-700 rounded-lg bg-slate-800/50">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={cn(
                    "px-2.5 py-1.5 cursor-pointer transition-colors border-b border-slate-700/50 last:border-0",
                    selectedUserId === user.id
                      ? "bg-indigo-500/20 text-white"
                      : "hover:bg-slate-700/50 text-slate-300"
                  )}
                >
                  <span className="text-xs font-medium">{getUserFullName(user)}</span>
                  {user.role && (
                    <span className={cn(
                      "ml-2 text-[9px] px-1.5 py-0.5 rounded border",
                      getRoleBadgeStyle(user.role).classes
                    )}>
                      {getRoleBadgeStyle(user.role).label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permission selection - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Permission</label>
            <div className="relative mb-1.5">
              <Shield className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder="Rechercher une permission..."
                className="w-full h-7 pl-7 pr-2 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>
            <div className="max-h-24 overflow-y-auto border border-slate-700 rounded-lg bg-slate-800/50">
              {filteredPermissions.map(perm => (
                <div
                  key={perm.id}
                  onClick={() => setSelectedPermission(perm.code)}
                  className={cn(
                    "px-2.5 py-1.5 cursor-pointer transition-colors border-b border-slate-700/50 last:border-0",
                    selectedPermission === perm.code
                      ? "bg-indigo-500/20 text-white"
                      : "hover:bg-slate-700/50 text-slate-300"
                  )}
                >
                  <span className="text-xs font-medium">{perm.name}</span>
                  <span className="text-[9px] text-slate-500 ml-1.5 font-mono">{perm.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duration selection - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Durée</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMP_PERMISSION_DURATIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDurationPreset(d.value)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-medium rounded-md border transition-all",
                    durationPreset === d.value
                      ? "bg-indigo-500 text-white border-indigo-500"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-white"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {durationPreset === -1 && (
              <input
                type="datetime-local"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="mt-2 w-full h-8 px-2 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* Reason - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Raison (obligatoire)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Expliquez pourquoi cette permission est nécessaire..."
              className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 min-h-[60px] resize-none"
              required
            />
          </div>

          {/* Preview - Compact */}
          {selectedUserId && selectedPermission && expiresAt && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-lg">
              <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide mb-1">Aperçu</h4>
              <p className="text-[11px] text-slate-300">
                Permission <strong className="text-white">{selectedPermission}</strong> accordée jusqu'au{' '}
                <strong className="text-white">{formatDate(expiresAt)}</strong>
              </p>
            </div>
          )}
        </form>

        {/* Actions - Fixed Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-700 bg-slate-800/30 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs">
            Annuler
          </Button>
          <Button
            type="submit"
            size="sm"
            onClick={handleSubmit}
            disabled={!selectedUserId || !selectedPermission || !expiresAt || !reason || isGranting}
            className="h-8 px-4 text-xs bg-indigo-600 hover:bg-indigo-500"
          >
            {isGranting ? 'Attribution...' : 'Accorder'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Tab type
type TabView = 'active' | 'history';

// Main component
export default function TemporaryPermissionsManager({ users }: TemporaryPermissionsManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('active');

  const { permissions: tempPermissions, loading, refresh, grantPermission, revokePermission } =
    useTemporaryPermissions();
  const { permissions: allPermissions } = usePermissions();

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    if (!searchTerm) return tempPermissions;
    const search = searchTerm.toLowerCase();
    return tempPermissions.filter(p =>
      p.permissionCode.toLowerCase().includes(search) ||
      p.permissionName?.toLowerCase().includes(search) ||
      p.userId.toLowerCase().includes(search)
    );
  }, [tempPermissions, searchTerm]);

  // Handle grant
  const handleGrant = async (data: {
    userId: string;
    permissionCode: string;
    expiresAt: string;
    reason: string;
  }) => {
    setIsGranting(true);
    try {
      await grantPermission({
        ...data,
        expiresAt: new Date(data.expiresAt).toISOString()
      });
    } finally {
      setIsGranting(false);
    }
  };

  // Handle revoke
  const handleRevoke = async (permissionId: string) => {
    if (!confirm('Voulez-vous vraiment révoquer cette permission temporaire ?')) return;

    setRevokingId(permissionId);
    try {
      await revokePermission(permissionId);
    } finally {
      setRevokingId(null);
    }
  };

  // Stats
  const activeCount = tempPermissions.filter(p => (p.timeRemaining || 0) > 0).length;
  const expiringSoonCount = tempPermissions.filter(p =>
    (p.timeRemaining || 0) > 0 && (p.timeRemaining || 0) < 3600000
  ).length;

  // Tab definitions
  const tabs = [
    { id: 'active' as const, label: 'Actives', icon: Clock, count: activeCount },
    { id: 'history' as const, label: 'Historique', icon: History, count: null },
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Header - Compact */}
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Permissions Temporaires</h2>
            <p className="text-[10px] text-slate-500">Élévations de privilèges limitées dans le temps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'active' && (
            <>
              <button
                onClick={refresh}
                className="h-7 px-2 flex items-center gap-1.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Actualiser
              </button>
              <Button size="sm" onClick={() => setShowGrantModal(true)} className="h-7 px-2.5 text-[10px]">
                <UserPlus className="w-3 h-3 mr-1" />
                Nouvelle
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-all",
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {tab.count !== null && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px]",
                activeTab === tab.id
                  ? "bg-indigo-500/50"
                  : "bg-slate-700"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active view content */}
      {activeTab === 'active' && (
        <>
          {/* Stats - Compact */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-indigo-400">{activeCount}</div>
              <div className="text-[9px] text-slate-500 uppercase">Actives</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-amber-400">{expiringSoonCount}</div>
              <div className="text-[9px] text-slate-500 uppercase">Expirent &lt;1h</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-slate-400">{tempPermissions.length}</div>
              <div className="text-[9px] text-slate-500 uppercase">Total</div>
            </div>
          </div>

          {/* Search - Compact */}
          <div className="relative shrink-0">
            <Shield className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par permission ou utilisateur..."
              className="w-full h-8 pl-8 pr-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>

          {/* Warning for expiring soon - Compact */}
          {expiringSoonCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-300">
                {expiringSoonCount} permission(s) expire(nt) dans moins d'une heure
              </span>
            </div>
          )}

          {/* Permissions list - Compact */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            ) : filteredPermissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <Clock className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Aucune permission temporaire</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredPermissions.map(perm => (
                  <TempPermissionCard
                    key={perm.id}
                    permission={perm}
                    onRevoke={handleRevoke}
                    isRevoking={revokingId === perm.id}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* History view content */}
      {activeTab === 'history' && (
        <HistoryView permissions={allPermissions} />
      )}

      {/* Grant modal */}
      <GrantPermissionModal
        isOpen={showGrantModal}
        onClose={() => setShowGrantModal(false)}
        onGrant={handleGrant}
        users={users}
        permissions={allPermissions}
        isGranting={isGranting}
      />
    </div>
  );
}
