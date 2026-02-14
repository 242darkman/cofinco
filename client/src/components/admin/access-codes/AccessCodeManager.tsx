import React, { useState } from 'react';
import { Plus, Ban, Key, Clock, Hash, Shield, User as UserIcon } from 'lucide-react';
import { Card, Button, Badge, EmptyState, ConfirmDialog } from '@/components/ui';
import GenerateCodeModal from './GenerateCodeModal';
import { SecurityCode, User, GeneratedCodeResult } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface AccessCodeManagerProps {
  codes: SecurityCode[];
  users: User[];
  onRefresh: () => void;
  onRevoke: (id: string) => Promise<void>;
  onGenerate: (data: any) => Promise<GeneratedCodeResult>;
}

export default function AccessCodeManager({ codes, users, onRefresh, onRevoke, onGenerate }: AccessCodeManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGenerateCodes = hasPermission('access_codes', 'create') || hasPermission('admin', 'manage');
  const canRevokeCodes = hasPermission('access_codes', 'delete') || hasPermission('admin', 'manage');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeToRevoke, setCodeToRevoke] = useState<string | null>(null);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const getStatusBadge = (code: SecurityCode) => {
    if (!code.active) return <Badge value="Révoqué" variant="danger" size="sm" />;
    if (isExpired(code.expiresAt)) return <Badge value="Expiré" variant="warning" size="sm" />;
    if (code.maxUsages !== null && code.usageCount >= code.maxUsages) {
      return <Badge value="Épuisé" variant="warning" size="sm" />;
    }
    return <Badge value="Actif" variant="success" size="sm" />;
  };

  const getCodeTypeBadge = (codeType: string) => {
    switch (codeType) {
      case 'EMERGENCY':
        return <Badge value="Urgence" variant="danger" size="sm" />;
      case 'DAILY':
        return <Badge value="Journalier" variant="info" size="sm" />;
      case 'PERMANENT':
        return <Badge value="Permanent" variant="primary" size="sm" />;
      default:
        return <Badge value={codeType} variant="default" size="sm" />;
    }
  };

  const handleGenerateCode = async (data: any) => {
    const result = await onGenerate(data);
    if (result.success && result.code) {
      setGeneratedCode(result.code);
    }
    return result;
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setGeneratedCode(null);
    onRefresh();
  };

  return (
    <Card className="bg-surface-base border-edge p-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-edge flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-content-primary">Codes d'Accès</h3>
          <p className="text-[10px] sm:text-xs text-content-muted">
            {codes?.length || 0} code{(codes?.length || 0) !== 1 ? 's' : ''} actif{(codes?.length || 0) !== 1 ? 's' : ''}
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
        onClose={handleCloseModal}
        onGenerate={handleGenerateCode}
        generatedCode={generatedCode}
      />

      <ConfirmDialog
        isOpen={!!codeToRevoke}
        onClose={() => setCodeToRevoke(null)}
        onConfirm={() => {
          if (codeToRevoke) {
            onRevoke(codeToRevoke);
            setCodeToRevoke(null);
          }
        }}
        title="Révoquer le code"
        message="Êtes-vous sûr de vouloir révoquer ce code d'accès ? Cette action est irréversible."
        variant="danger"
        confirmText="Révoquer"
        cancelText="Annuler"
      />

      {/* Generated Code Display */}
      {generatedCode && !isModalOpen && (
        <div className="px-3 sm:px-4 py-3 bg-status-success-bg border-b border-status-success/20">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-status-success" />
            <span className="text-sm font-medium text-status-success">Code généré avec succès</span>
          </div>
          <div className="flex items-center gap-3">
            <code className="font-mono font-bold text-xl text-status-success bg-status-success-bg px-4 py-2 rounded-lg tracking-wider">
              {generatedCode}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(generatedCode);
              }}
              className="text-status-success hover:text-status-success"
            >
              Copier
            </Button>
          </div>
          <p className="text-[10px] sm:text-xs text-status-success/70 mt-2">
            Ce code ne sera plus affiché. Notez-le maintenant.
          </p>
        </div>
      )}

      {/* Content */}
      {(!codes || codes.length === 0) ? (
        <div className="py-8">
          <EmptyState
            icon={Key}
            title="Aucun code actif"
            description="Créez un nouveau code d'accès pour commencer."
          />
        </div>
      ) : (
        <div className="divide-y divide-edge">
          {codes.map((code) => (
            <div
              key={code.id}
              className="px-3 sm:px-4 py-3 hover:bg-surface/50 transition-colors"
            >
              {/* Code Row Header */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-surface px-2 py-1 rounded">
                    <Hash size={12} className="text-content-muted" />
                    <span className="font-mono text-xs text-content-secondary">{code.id.slice(0, 8)}...</span>
                  </div>
                  {getCodeTypeBadge(code.codeType)}
                  {getStatusBadge(code)}
                </div>
                {code.active && !isExpired(code.expiresAt) && canRevokeCodes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCodeToRevoke(code.id)}
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
                  Expire: <span className="text-content-secondary">{formatDate(code.expiresAt)}</span>
                </span>
                <span>
                  Utilisations: <span className="text-content-secondary">{code.usageCount}/{code.maxUsages || '∞'}</span>
                </span>
                <span>
                  Durée auth: <span className="text-content-secondary">{code.authorizationDurationHours}h</span>
                </span>
                {code.assignedUserName && (
                  <span className="flex items-center gap-1">
                    <UserIcon size={10} />
                    Assigné à: <span className="text-status-success">{code.assignedUserName}</span>
                  </span>
                )}
                {code.description && (
                  <span className="w-full mt-1">
                    Note: <span className="text-content-secondary">{code.description}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
