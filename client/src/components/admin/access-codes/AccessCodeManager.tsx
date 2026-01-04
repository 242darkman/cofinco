import React, { useState } from 'react';
import { Plus, Ban, Key } from 'lucide-react';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import GenerateCodeModal from './GenerateCodeModal';
import { SecurityCode, User } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface AccessCodeManagerProps {
  codes: SecurityCode[];
  users: User[];
  onRefresh: () => void;
  onRevoke: (id: string) => Promise<void>;
  onGenerate: (data: any) => Promise<any>;
}

export default function AccessCodeManager({ codes, users, onRefresh, onRevoke, onGenerate }: AccessCodeManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGenerateCodes = hasPermission('access_codes', 'create') || hasPermission('admin', 'manage');
  const canRevokeCodes = hasPermission('access_codes', 'delete') || hasPermission('admin', 'manage');

  const [isModalOpen, setIsModalOpen] = useState(false);

  const getUserName = (userId: string | null) => {
    if (!userId) return '-';
    const user = users.find(u => u.id === userId);
    return user?.nom || 'Inconnu';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (validUntil: string) => new Date(validUntil) < new Date();

  const getStatusBadge = (code: SecurityCode) => {
    if (!code.isActive) return <Badge value="Révoqué" variant="danger" size="sm" />;
    if (isExpired(code.validUntil)) return <Badge value="Expiré" variant="warning" size="sm" />;
    return <Badge value="Actif" variant="success" size="sm" />;
  };

  return (
    <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white">Codes d'Accès</h3>
          <p className="text-[10px] sm:text-xs text-slate-500">
            {codes?.length || 0} code{(codes?.length || 0) !== 1 ? 's' : ''} généré{(codes?.length || 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {canGenerateCodes && (
          <Button
            onClick={() => setIsModalOpen(true)}
            variant="success"
            icon={Plus}
            size="sm"
          >
            <span className="hidden sm:inline">Nouveau</span> Code
          </Button>
        )}
      </div>

      <GenerateCodeModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          onRefresh();
        }}
        users={users}
        onGenerate={onGenerate}
      />

      {/* Content */}
      {(!codes || codes.length === 0) ? (
        <div className="py-8">
          <EmptyState
            icon={Key}
            title="Aucun code généré"
            description="Créez un nouveau code d'accès pour commencer."
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {codes.map((code) => (
            <div 
              key={code.id} 
              className="px-3 sm:px-4 py-3 hover:bg-slate-800/50 transition-colors"
            >
              {/* Code Row */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-xs sm:text-sm">
                    {code.code}
                  </code>
                  {getStatusBadge(code)}
                </div>
                {code.isActive && !isExpired(code.validUntil) && canRevokeCodes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Révoquer ce code ?')) {
                        onRevoke(code.id);
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
                <span>Généré: <span className="text-slate-300">{getUserName(code.generatedBy)}</span></span>
                <span>Assigné: <span className="text-slate-300">{getUserName(code.assignedTo)}</span></span>
                <span>Expire: <span className="text-slate-300">{formatDate(code.validUntil)}</span></span>
                <span>Utilisations: <span className="text-slate-300">{code.usageCount}/{code.maxUses || '∞'}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
