import React from 'react';
import { Ban, Shield, Info, User, Clock } from 'lucide-react';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import { CaisseAuthorization, User as UserType } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface PermissionDelegationManagerProps {
  permissions: CaisseAuthorization[];
  users: UserType[];
  onRefresh: () => void;
  onRevoke: (id: string, reason?: string) => Promise<void>;
  onGrant?: (data: any) => Promise<any>;
}

export default function PermissionDelegationManager({ permissions, users, onRefresh, onRevoke }: PermissionDelegationManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canRevokePermissions = hasPermission('permissions', 'delete') || hasPermission('admin', 'manage');

  const getUserName = (userId: string | null) => {
    if (!userId) return '-';
    const user = users.find(u => u.id === userId);
    return user?.nom || 'Inconnu';
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Indéfinie';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const target = new Date(date);
    const diffMs = target.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffMs < 0) return 'Expirée';
    if (diffHours > 24) return `${Math.floor(diffHours / 24)}j ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  };

  const isExpired = (expiresAt: string | null) => expiresAt ? new Date(expiresAt) < new Date() : false;

  const getStatusBadge = (auth: CaisseAuthorization) => {
    if (auth.revokedAt) return <Badge value="Révoquée" variant="danger" size="sm" />;
    if (isExpired(auth.expiresAt)) return <Badge value="Expirée" variant="warning" size="sm" />;
    return <Badge value="Active" variant="success" size="sm" />;
  };

  // Filter to only show active authorizations (not revoked, not expired)
  const activeAuthorizations = permissions?.filter(
    p => !p.revokedAt && !isExpired(p.expiresAt)
  ) || [];

  const expiredAuthorizations = permissions?.filter(
    p => !p.revokedAt && isExpired(p.expiresAt)
  ) || [];

  return (
    <Card className="bg-surface-base border-edge p-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-edge flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-content-primary">Autorisations Actives</h3>
          <p className="text-[10px] sm:text-xs text-content-muted">
            {activeAuthorizations.length} utilisateur{activeAuthorizations.length !== 1 ? 's' : ''} autorisé{activeAuthorizations.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Info Banner - Compact */}
      <div className="px-3 sm:px-4 py-2 bg-status-info-bg border-b border-status-info/20 flex items-center gap-2">
        <Info size={14} className="text-status-info flex-shrink-0" />
        <p className="text-[10px] sm:text-xs text-status-info">
          Les utilisateurs ci-dessous ont validé un code d'accès et peuvent accéder aux caisses jusqu'à expiration.
        </p>
      </div>

      {/* Content */}
      {(!permissions || permissions.length === 0) ? (
        <div className="py-8">
          <EmptyState
            icon={Shield}
            title="Aucune autorisation"
            description="Aucun utilisateur n'a validé de code d'accès récemment."
          />
        </div>
      ) : (
        <div className="divide-y divide-edge">
          {/* Active Authorizations */}
          {activeAuthorizations.map((auth) => (
            <div
              key={auth.id}
              className="px-3 sm:px-4 py-3 hover:bg-surface/50 transition-colors"
            >
              {/* Authorization Row */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-status-success-bg rounded">
                    <User size={14} className="text-status-success" />
                  </div>
                  <span className="font-semibold text-content-primary text-sm truncate">
                    {getUserName(auth.userId)}
                  </span>
                  {getStatusBadge(auth)}
                </div>
                {!auth.revokedAt && !isExpired(auth.expiresAt) && canRevokePermissions && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const reason = prompt('Raison de la révocation (optionnel):');
                      if (confirm('Révoquer cette autorisation ?')) {
                        onRevoke(auth.id, reason || undefined);
                      }
                    }}
                    className="text-status-danger hover:text-status-danger hover:bg-status-danger-bg p-1.5"
                  >
                    <Ban size={14} />
                  </Button>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs text-content-muted">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  Expire dans: <span className="text-status-success font-medium">{formatRelativeTime(auth.expiresAt)}</span>
                </span>
                <span>Accordée: <span className="text-content-secondary">{formatDate(auth.grantedAt)}</span></span>
                {auth.ipAddress && (
                  <span>IP: <span className="text-content-secondary">{auth.ipAddress}</span></span>
                )}
              </div>
              {auth.reason && (
                <p className="text-[10px] sm:text-xs text-content-muted mt-1">
                  {auth.reason}
                </p>
              )}
            </div>
          ))}

          {/* Expired Authorizations (collapsed) */}
          {expiredAuthorizations.length > 0 && (
            <details className="group">
              <summary className="px-3 sm:px-4 py-2 bg-surface/50 text-content-muted text-xs cursor-pointer hover:bg-surface list-none flex items-center gap-2">
                <span className="text-content-muted">▸</span>
                <span>{expiredAuthorizations.length} autorisation{expiredAuthorizations.length !== 1 ? 's' : ''} expirée{expiredAuthorizations.length !== 1 ? 's' : ''}</span>
              </summary>
              {expiredAuthorizations.map((auth) => (
                <div
                  key={auth.id}
                  className="px-3 sm:px-4 py-2 bg-surface/30 border-t border-edge/50"
                >
                  <div className="flex items-center gap-2 text-sm text-content-muted">
                    <User size={12} />
                    <span>{getUserName(auth.userId)}</span>
                    <Badge value="Expirée" variant="warning" size="sm" />
                  </div>
                  <div className="text-[10px] text-content-muted mt-1">
                    Expirée le {formatDate(auth.expiresAt)}
                  </div>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
