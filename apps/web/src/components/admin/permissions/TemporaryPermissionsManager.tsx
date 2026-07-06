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
  CheckCircle2, XCircle, AlertCircle, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { usePagination } from '../../../hooks/usePagination';
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
      "px-3 py-2.5 border rounded-lg bg-surface/50 transition-all",
      permission.isExpiringSoon && !isExpired && "border-status-warning/30 bg-status-warning/5",
      isExpired && "border-status-danger/30 bg-status-danger/5 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-xs font-medium text-content-primary truncate">
              {permission.permissionName || permission.permissionCode}
            </span>
          </div>

          <div className="text-[10px] text-content-muted space-y-0.5">
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
            <p className="mt-1.5 text-[10px] text-content-secondary bg-surface-elevated/50 px-2 py-1 rounded truncate">
              {permission.reason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Time remaining badge */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium",
            isExpired
              ? "bg-status-danger-bg text-status-danger"
              : permission.isExpiringSoon
                ? "bg-status-warning-bg text-status-warning"
                : "bg-accent/10 text-accent"
          )}>
            <Timer className="w-3 h-3" />
            {formatTimeRemaining(timeRemaining)}
          </div>

          {/* Revoke button */}
          {!isExpired && (
            <button
              onClick={() => onRevoke(permission.id)}
              disabled={isRevoking}
              className="p-1 text-status-danger hover:text-status-danger hover:bg-status-danger-bg rounded transition-colors disabled:opacity-50"
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
    active: { icon: CheckCircle2, label: 'Actif', classes: 'bg-status-success-bg text-status-success border-status-success/20' },
    expired: { icon: AlertCircle, label: 'Expiré', classes: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20' },
    revoked: { icon: XCircle, label: 'Révoqué', classes: 'bg-status-danger-bg text-status-danger border-status-danger/20' },
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
          <div key={i} className="bg-surface/50 border border-edge p-2 rounded-lg animate-pulse">
            <div className="h-5 bg-surface-elevated rounded w-8 mx-auto mb-1"></div>
            <div className="h-2 bg-surface-elevated rounded w-12 mx-auto"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
        <div className="text-base font-bold text-accent">{stats.totalGranted}</div>
        <div className="text-[8px] text-content-muted uppercase">Total</div>
      </div>
      <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
        <div className="text-base font-bold text-status-success">{stats.totalActive}</div>
        <div className="text-[8px] text-content-muted uppercase">Actives</div>
      </div>
      <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
        <div className="text-base font-bold text-content-muted">{stats.totalExpired}</div>
        <div className="text-[8px] text-content-muted uppercase">Expirées</div>
      </div>
      <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
        <div className="text-base font-bold text-status-danger">{stats.totalRevoked}</div>
        <div className="text-[8px] text-content-muted uppercase">Révoquées</div>
      </div>
      <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
        <div className="text-base font-bold text-status-warning">{stats.avgDurationHours.toFixed(1)}h</div>
        <div className="text-[8px] text-content-muted uppercase">Durée moy.</div>
      </div>
    </div>
  );
}

// History entry card
function HistoryEntryCard({ entry }: { entry: TempPermissionHistoryEntry }) {
  const durationHours = Math.round(entry.duration / (1000 * 60 * 60));

  return (
    <div className={cn(
      "px-3 py-2.5 border rounded-lg bg-surface/50 transition-all",
      entry.status === 'active' && "border-status-success/20",
      entry.status === 'revoked' && "border-status-danger/20",
      entry.status === 'expired' && "border-edge-strong"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Permission name and status */}
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-xs font-medium text-content-primary truncate">
              {entry.permissionName || entry.permissionCode}
            </span>
            <StatusBadge status={entry.status} />
          </div>

          {/* User info */}
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-2.5 h-2.5 text-content-muted" />
            <span className="text-[10px] text-content-secondary font-medium">{entry.userName}</span>
            {entry.userEmail && (
              <span className="text-[9px] text-content-muted">({entry.userEmail})</span>
            )}
          </div>

          {/* Grant info */}
          <div className="text-[10px] text-content-muted space-y-0.5">
            <div className="flex items-center gap-1.5">
              <UserPlus className="w-2.5 h-2.5" />
              <span>Accordé par {entry.granterName} le {formatDate(entry.grantedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5" />
              <span>Durée: {durationHours}h | Expire(é): {formatDate(entry.expiresAt)}</span>
            </div>
            {entry.status === 'revoked' && entry.revokedAt && (
              <div className="flex items-center gap-1.5 text-status-danger">
                <XCircle className="w-2.5 h-2.5" />
                <span>Révoqué par {entry.revokerName || 'Système'} le {formatDate(entry.revokedAt)}</span>
              </div>
            )}
          </div>

          {/* Reason */}
          {entry.reason && (
            <p className="mt-1.5 text-[10px] text-content-secondary bg-surface-elevated/50 px-2 py-1 rounded truncate">
              Raison: {entry.reason}
            </p>
          )}

          {/* Revoke reason if applicable */}
          {entry.revokeReason && (
            <p className="mt-1 text-[10px] text-status-danger bg-status-danger-bg px-2 py-1 rounded truncate">
              Motif révocation: {entry.revokeReason}
            </p>
          )}
        </div>

        {/* Module badge */}
        {entry.moduleName && (
          <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent rounded border border-accent/20 shrink-0">
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
    <div className="flex flex-wrap items-center gap-2 p-2 bg-surface/30 rounded-lg border border-edge">
      <Filter className="w-3.5 h-3.5 text-content-muted" />

      {/* Status filter */}
      <select
        value={filters.status || 'all'}
        onChange={(e) => onFilterChange({ status: e.target.value === 'all' ? undefined : e.target.value })}
        className="h-7 px-2 bg-surface border border-edge rounded text-[10px] text-content-primary focus:outline-none focus:border-accent"
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
        className="h-7 px-2 bg-surface border border-edge rounded text-[10px] text-content-primary focus:outline-none focus:border-accent max-w-[150px]"
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
          className="h-7 px-2 bg-surface border border-edge rounded text-[10px] text-content-primary focus:outline-none focus:border-accent"
          placeholder="Du"
        />
        <span className="text-content-muted text-xs">→</span>
        <input
          type="date"
          value={filters.endDate || ''}
          onChange={(e) => onFilterChange({ endDate: e.target.value || undefined })}
          className="h-7 px-2 bg-surface border border-edge rounded text-[10px] text-content-primary focus:outline-none focus:border-accent"
          placeholder="Au"
        />
      </div>

      {/* Clear filters */}
      {(filters.status || filters.permissionCode || filters.startDate || filters.endDate) && (
        <button
          onClick={() => onFilterChange({ status: 'all', permissionCode: undefined, startDate: undefined, endDate: undefined })}
          className="h-7 px-2 text-[10px] text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition-colors"
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
      <div className="flex items-center justify-between text-[10px] text-content-muted px-1">
        <span>{total} enregistrement(s) trouvé(s)</span>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-1 hover:text-content-primary transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && history.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-content-muted">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-content-muted">
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
        <div className="flex items-center justify-between px-2 py-1.5 bg-surface/30 rounded-lg border border-edge shrink-0">
          <button
            onClick={prevPage}
            disabled={!hasPrevPage}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-content-muted hover:text-content-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            Précédent
          </button>
          <span className="text-[10px] text-content-muted">
            Page {currentPage} sur {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={!hasNextPage}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-content-muted hover:text-content-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <div className="bg-surface-base border border-edge rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-surface/50 shrink-0">
          <h2 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <div className="w-6 h-6 bg-accent/10 rounded-lg flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-accent" />
            </div>
            Accorder une permission temporaire
          </h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center hover:bg-surface-elevated rounded transition-colors text-content-muted hover:text-content-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 space-y-3 overflow-y-auto flex-1">
          {/* User selection - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-content-muted mb-1">Utilisateur</label>
            <div className="relative mb-1.5">
              <Users className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-content-muted" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Rechercher un utilisateur..."
                className="w-full h-7 pl-7 pr-2 bg-surface border border-edge rounded text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="max-h-24 overflow-y-auto border border-edge rounded-lg bg-surface/50">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={cn(
                    "px-2.5 py-1.5 cursor-pointer transition-colors border-b border-edge-subtle last:border-0",
                    selectedUserId === user.id
                      ? "bg-accent/20 text-content-primary"
                      : "hover:bg-surface-elevated/50 text-content-secondary"
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
            <label className="block text-[11px] font-medium text-content-muted mb-1">Permission</label>
            <div className="relative mb-1.5">
              <Shield className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-content-muted" />
              <input
                type="text"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder="Rechercher une permission..."
                className="w-full h-7 pl-7 pr-2 bg-surface border border-edge rounded text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div className="max-h-24 overflow-y-auto border border-edge rounded-lg bg-surface/50">
              {filteredPermissions.map(perm => (
                <div
                  key={perm.id}
                  onClick={() => setSelectedPermission(perm.code)}
                  className={cn(
                    "px-2.5 py-1.5 cursor-pointer transition-colors border-b border-edge-subtle last:border-0",
                    selectedPermission === perm.code
                      ? "bg-accent/20 text-content-primary"
                      : "hover:bg-surface-elevated/50 text-content-secondary"
                  )}
                >
                  <span className="text-xs font-medium">{perm.name}</span>
                  <span className="text-[9px] text-content-muted ml-1.5 font-mono">{perm.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duration selection - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-content-muted mb-1.5">Durée</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMP_PERMISSION_DURATIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDurationPreset(d.value)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-medium rounded-md border transition-all",
                    durationPreset === d.value
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-content-muted border-edge hover:border-edge-strong hover:text-content-primary"
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
                className="mt-2 w-full h-8 px-2 bg-surface border border-edge rounded text-xs text-content-primary focus:outline-none focus:border-accent"
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* Reason - Compact */}
          <div>
            <label className="block text-[11px] font-medium text-content-muted mb-1">Raison (obligatoire)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Expliquez pourquoi cette permission est nécessaire..."
              className="w-full px-2.5 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 min-h-[60px] resize-none"
              required
            />
          </div>

          {/* Preview - Compact */}
          {selectedUserId && selectedPermission && expiresAt && (
            <div className="bg-accent/10 border border-accent/20 p-2.5 rounded-lg">
              <h4 className="text-[10px] font-bold text-accent uppercase tracking-wide mb-1">Aperçu</h4>
              <p className="text-[11px] text-content-secondary">
                Permission <strong className="text-content-primary">{selectedPermission}</strong> accordée jusqu'au{' '}
                <strong className="text-content-primary">{formatDate(expiresAt)}</strong>
              </p>
            </div>
          )}
        </form>

        {/* Actions - Fixed Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-edge bg-surface/30 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs">
            Annuler
          </Button>
          <Button
            type="submit"
            size="sm"
            onClick={handleSubmit}
            disabled={!selectedUserId || !selectedPermission || !expiresAt || !reason || isGranting}
            className="h-8 px-4 text-xs bg-accent hover:bg-accent-primary-hover"
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

  // Pagination for active permissions
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const { currentPage, totalPages, goToPage, paginateArray } = usePagination({
    totalItems: filteredPermissions.length,
    itemsPerPage,
    initialPage: 1
  });

  const paginatedPermissions = paginateArray(filteredPermissions);

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
      <div className="flex items-center justify-between gap-3 bg-surface-base px-3 py-2 rounded-lg border border-edge shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-content-primary">Permissions Temporaires</h2>
            <p className="text-[10px] text-content-muted">Élévations de privilèges limitées dans le temps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'active' && (
            <>
              <button
                onClick={refresh}
                className="h-7 px-2 flex items-center gap-1.5 text-[10px] bg-surface hover:bg-surface-elevated text-content-secondary rounded border border-edge transition-colors"
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
      <div className="flex items-center gap-1 p-1 bg-surface/50 rounded-lg border border-edge shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-all",
              activeTab === tab.id
                ? "bg-accent text-white shadow-sm"
                : "text-content-muted hover:text-content-primary hover:bg-surface-elevated/50"
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {tab.count !== null && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px]",
                activeTab === tab.id
                  ? "bg-accent/50"
                  : "bg-surface-elevated"
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
            <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-accent">{activeCount}</div>
              <div className="text-[9px] text-content-muted uppercase">Actives</div>
            </div>
            <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-status-warning">{expiringSoonCount}</div>
              <div className="text-[9px] text-content-muted uppercase">Expirent &lt;1h</div>
            </div>
            <div className="bg-surface/50 border border-edge p-2 rounded-lg text-center">
              <div className="text-lg font-bold text-content-muted">{tempPermissions.length}</div>
              <div className="text-[9px] text-content-muted uppercase">Total</div>
            </div>
          </div>

          {/* Search - Compact */}
          <div className="relative shrink-0">
            <Shield className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par permission ou utilisateur..."
              className="w-full h-8 pl-8 pr-3 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
            />
          </div>

          {/* Warning for expiring soon - Compact */}
          {expiringSoonCount > 0 && (
            <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0" />
              <span className="text-[10px] text-status-warning">
                {expiringSoonCount} permission(s) expire(nt) dans moins d'une heure
              </span>
            </div>
          )}

          {/* Permissions list - Compact */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-content-muted">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            ) : filteredPermissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-content-muted">
                <Clock className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Aucune permission temporaire</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedPermissions.map(perm => (
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

          {/* Pagination Controls - Advanced */}
          {totalPages > 1 && (
            <div className="p-3 bg-surface-base border border-edge rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                {/* Page info & size selector */}
                <div className="flex items-center gap-3 text-xs text-content-muted">
                  <span className="hidden sm:inline">
                    {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredPermissions.length)} sur {filteredPermissions.length}
                  </span>
                  <span className="sm:hidden">
                    Page {currentPage}/{totalPages || 1}
                  </span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      goToPage(1);
                    }}
                    className="px-2 py-1 bg-surface-base border border-edge rounded text-xs text-content-secondary focus:border-accent outline-none"
                  >
                    <option value={6}>6 / page</option>
                    <option value={8}>8 / page</option>
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                  </select>
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronsLeft size={16} />
                  </button>
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <div className="flex items-center gap-1 mx-1">
                    {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage === 1) {
                          pageNum = i + 1;
                        } else if (currentPage === totalPages) {
                          pageNum = totalPages - 2 + i;
                        } else {
                          pageNum = currentPage - 1 + i;
                        }
                        if (pageNum < 1 || pageNum > totalPages) return null;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => goToPage(pageNum)}
                            className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-accent text-white'
                                : 'text-content-muted hover:bg-surface hover:text-content-primary'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronsRight size={16} />
                  </button>
                </div>
            </div>
          )}
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
