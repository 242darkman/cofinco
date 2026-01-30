/**
 * Temporary Permissions Manager
 * =============================
 *
 * Interface d'administration pour gérer les permissions temporaires:
 * - Voir toutes les permissions temporaires actives
 * - Accorder une nouvelle permission temporaire
 * - Révoquer une permission temporaire
 * - Voir le temps restant avant expiration
 */

import React, { useState, useMemo } from 'react';
import {
  Clock, Shield, UserPlus, Trash2, RefreshCw,
  AlertTriangle, Timer, Users, X, Calendar
} from 'lucide-react';
import {
  useTemporaryPermissions,
  TemporaryPermission,
  TEMP_PERMISSION_DURATIONS,
  formatTimeRemaining
} from '../../../hooks/admin/useTemporaryPermissions';
import { usePermissions } from '../../../hooks/admin/usePermissions';
import { SearchInput, Button, Badge } from '../../ui';
import { FeatureHeader } from '../../ui/FeatureHeader';
import { cn } from '../../../lib/utils';

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

// Permission card component
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
      "p-4 border rounded-lg bg-white dark:bg-slate-800",
      permission.isExpiringSoon && !isExpired && "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
      isExpired && "border-red-400 bg-red-50 dark:bg-red-900/20 opacity-75"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span className="font-medium text-slate-900 dark:text-white truncate">
              {permission.permissionName || permission.permissionCode}
            </span>
          </div>

          <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
            <div className="flex items-center gap-2">
              <Users className="w-3 h-3" />
              <span>Utilisateur ID: {permission.userId.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center gap-2">
              <UserPlus className="w-3 h-3" />
              <span>Accordé par: {permission.granterName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              <span>Expire: {formatDate(permission.expiresAt)}</span>
            </div>
          </div>

          {permission.reason && (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              Raison: {permission.reason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Time remaining badge */}
          <Badge
            variant={isExpired ? 'danger' : permission.isExpiringSoon ? 'warning' : 'info'}
            className="flex items-center gap-1"
            icon={<Timer className="w-3 h-3" />}
            value={formatTimeRemaining(timeRemaining)}
          />

          {/* Revoke button */}
          {!isExpired && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRevoke(permission.id)}
              disabled={isRevoking}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Grant permission modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Accorder une permission temporaire
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* User selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Utilisateur</label>
            <SearchInput
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="mb-2"
            />
            <div className="max-h-32 overflow-y-auto border rounded">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={cn(
                    "px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700",
                    selectedUserId === user.id && "bg-indigo-100 dark:bg-indigo-900"
                  )}
                >
                  <span className="font-medium">{getUserFullName(user)}</span>
                  {user.role && <Badge variant="neutral" className="ml-2" size="sm" value={user.role} />}
                </div>
              ))}
            </div>
          </div>

          {/* Permission selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Permission</label>
            <SearchInput
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
              placeholder="Rechercher une permission..."
              className="mb-2"
            />
            <div className="max-h-32 overflow-y-auto border rounded">
              {filteredPermissions.map(perm => (
                <div
                  key={perm.id}
                  onClick={() => setSelectedPermission(perm.code)}
                  className={cn(
                    "px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700",
                    selectedPermission === perm.code && "bg-indigo-100 dark:bg-indigo-900"
                  )}
                >
                  <span className="font-medium">{perm.name}</span>
                  <span className="text-xs text-slate-500 ml-2">{perm.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duration selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Durée</label>
            <div className="flex flex-wrap gap-2">
              {TEMP_PERMISSION_DURATIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDurationPreset(d.value)}
                  className={cn(
                    "px-3 py-1 text-sm rounded border",
                    durationPreset === d.value
                      ? "bg-indigo-500 text-white border-indigo-500"
                      : "bg-white dark:bg-slate-700 border-slate-300"
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
                className="mt-2 w-full px-3 py-2 border rounded"
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium mb-1">Raison (obligatoire)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Expliquez pourquoi cette permission est nécessaire..."
              className="w-full px-3 py-2 border rounded min-h-[80px]"
              required
            />
          </div>

          {/* Preview */}
          {selectedUserId && selectedPermission && expiresAt && (
            <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded">
              <h4 className="text-sm font-medium mb-1">Aperçu</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Permission <strong>{selectedPermission}</strong> accordée jusqu'au{' '}
                <strong>{formatDate(expiresAt)}</strong>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!selectedUserId || !selectedPermission || !expiresAt || !reason || isGranting}
            >
              {isGranting ? 'Attribution...' : 'Accorder'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main component
export default function TemporaryPermissionsManager({ users }: TemporaryPermissionsManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header with FeatureHeader */}
      <FeatureHeader
        featureKey="admin.temp-permissions"
        title="Permissions Temporaires"
        subtitle="Gérez les élévations de privilèges temporaires"
        helpText="Accordez des permissions limitées dans le temps à vos utilisateurs. Les permissions expirent automatiquement à la date définie. Utilisez cette fonction pour des accès ponctuels (remplacement, mission spéciale, etc.) sans modifier les rôles permanents."
        icon={<Clock className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Actualiser
            </Button>
            <Button onClick={() => setShowGrantModal(true)}>
              <UserPlus className="w-4 h-4 mr-1" />
              Nouvelle permission
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
          <div className="text-2xl font-bold text-indigo-600">{activeCount}</div>
          <div className="text-sm text-slate-500">Permissions actives</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
          <div className="text-2xl font-bold text-amber-600">{expiringSoonCount}</div>
          <div className="text-sm text-slate-500">Expirent bientôt (&lt;1h)</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
          <div className="text-2xl font-bold text-slate-600">{tempPermissions.length}</div>
          <div className="text-sm text-slate-500">Total</div>
        </div>
      </div>

      {/* Search */}
      <SearchInput
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Rechercher par permission ou utilisateur..."
      />

      {/* Warning for expiring soon */}
      {expiringSoonCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {expiringSoonCount} permission(s) expire(nt) dans moins d'une heure
          </span>
        </div>
      )}

      {/* Permissions list */}
      {loading ? (
        <div className="text-center py-8 text-slate-500">Chargement...</div>
      ) : filteredPermissions.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Aucune permission temporaire</p>
        </div>
      ) : (
        <div className="space-y-3">
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
