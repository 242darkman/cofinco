import React, { useState } from 'react';
import { Plus, Ban, Key, Clock, Hash, Shield } from 'lucide-react';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
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
    <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white">Codes d'Accès</h3>
          <p className="text-[10px] sm:text-xs text-slate-500">
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
        users={users}
        onGenerate={handleGenerateCode}
        generatedCode={generatedCode}
      />

      {/* Generated Code Display */}
      {generatedCode && !isModalOpen && (
        <div className="px-3 sm:px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Code généré avec succès</span>
          </div>
          <div className="flex items-center gap-3">
            <code className="font-mono font-bold text-xl text-emerald-400 bg-emerald-500/20 px-4 py-2 rounded-lg tracking-wider">
              {generatedCode}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(generatedCode);
              }}
              className="text-emerald-400 hover:text-emerald-300"
            >
              Copier
            </Button>
          </div>
          <p className="text-[10px] sm:text-xs text-emerald-300/70 mt-2">
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
        <div className="divide-y divide-slate-800">
          {codes.map((code) => (
            <div
              key={code.id}
              className="px-3 sm:px-4 py-3 hover:bg-slate-800/50 transition-colors"
            >
              {/* Code Row Header */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded">
                    <Hash size={12} className="text-slate-400" />
                    <span className="font-mono text-xs text-slate-300">{code.id.slice(0, 8)}...</span>
                  </div>
                  {getCodeTypeBadge(code.codeType)}
                  {getStatusBadge(code)}
                </div>
                {code.active && !isExpired(code.expiresAt) && canRevokeCodes && (
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
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  Expire: <span className="text-slate-300">{formatDate(code.expiresAt)}</span>
                </span>
                <span>
                  Utilisations: <span className="text-slate-300">{code.usageCount}/{code.maxUsages || '∞'}</span>
                </span>
                <span>
                  Durée auth: <span className="text-slate-300">{code.authorizationDurationHours}h</span>
                </span>
                {code.description && (
                  <span className="w-full mt-1">
                    Note: <span className="text-slate-300">{code.description}</span>
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
