import React, { useState } from 'react';
import { UserPlus, Ban, Shield, Info } from 'lucide-react';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import GrantPermissionModal from './GrantPermissionModal';
import { CodePermission, User } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface PermissionDelegationManagerProps {
  permissions: CodePermission[];
  users: User[];
  onRefresh: () => void;
  onRevoke: (id: string) => Promise<void>;
  onGrant: (data: any) => Promise<any>;
}

export default function PermissionDelegationManager({ permissions, users, onRefresh, onRevoke, onGrant }: PermissionDelegationManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGrantPermissions = hasPermission('permissions', 'create') || hasPermission('admin', 'manage');
  const canRevokePermissions = hasPermission('permissions', 'delete') || hasPermission('admin', 'manage');

  const [isModalOpen, setIsModalOpen] = useState(false);

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
      year: 'numeric'
    });
  };

  const isExpired = (validUntil: string | null) => validUntil ? new Date(validUntil) < new Date() : false;

  const getStatusBadge = (perm: CodePermission) => {
    if (!perm.isActive) return <Badge value="Révoquée" variant="danger" size="sm" />;
    if (isExpired(perm.validUntil)) return <Badge value="Expirée" variant="warning" size="sm" />;
    return <Badge value="Active" variant="success" size="sm" />;
  };

  return (
    <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white">Délégations</h3>
          <p className="text-[10px] sm:text-xs text-slate-500">
            {permissions?.length || 0} permission{(permissions?.length || 0) !== 1 ? 's' : ''} accordée{(permissions?.length || 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {canGrantPermissions && (
          <Button
            onClick={() => setIsModalOpen(true)}
            variant="success"
            icon={UserPlus}
            size="sm"
          >
            <span className="hidden sm:inline">Nouvelle</span> Délégation
          </Button>
        )}
      </div>

      {/* Info Banner - Compact */}
      <div className="px-3 sm:px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
        <Info size={14} className="text-blue-400 flex-shrink-0" />
        <p className="text-[10px] sm:text-xs text-blue-300">
          Les utilisateurs avec une permission active peuvent générer des codes d'accès caisse.
        </p>
      </div>

      <GrantPermissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        users={users}
        onGrant={async (data) => {
          await onGrant(data);
          onRefresh();
        }}
      />

      {/* Content */}
      {(!permissions || permissions.length === 0) ? (
        <div className="py-8">
          <EmptyState
            icon={Shield}
            title="Aucune permission"
            description="Accordez une délégation pour commencer."
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {permissions.map((perm) => (
            <div 
              key={perm.id} 
              className="px-3 sm:px-4 py-3 hover:bg-slate-800/50 transition-colors"
            >
              {/* Permission Row */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-white text-sm truncate">
                    {getUserName(perm.userId)}
                  </span>
                  {getStatusBadge(perm)}
                </div>
                {perm.isActive && !isExpired(perm.validUntil) && canRevokePermissions && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Révoquer cette permission ?')) {
                        onRevoke(perm.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5"
                  >
                    <Ban size={14} />
                  </Button>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs text-slate-400">
                <span>Par: <span className="text-slate-300">{getUserName(perm.grantedBy)}</span></span>
                <span>Agence: <span className="text-slate-300">{perm.agence || 'Toutes'}</span></span>
                <span>Durée max: <span className="text-slate-300">{perm.maxCodeDurationHours}h</span></span>
                <span>Expire: <span className="text-slate-300">{formatDate(perm.validUntil)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
