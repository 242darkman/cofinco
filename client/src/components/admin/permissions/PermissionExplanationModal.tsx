/**
 * Permission Explanation Modal
 * ============================
 *
 * Modal that explains "Why does this user have (or not have) this permission?"
 * Uses the usePermissionExplanation hook to fetch the explanation from the server.
 */

import React from 'react';
import { HelpCircle, Shield, Clock, Globe, Building2, AlertCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Modal, Button, Badge } from '@/components/ui';
import { usePermissionExplanation } from '@/hooks/admin/useRbacAudit';
import PermissionSourceBadge, { type PermissionSource } from './PermissionSourceBadge';

interface PermissionExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  permissionCode: string;
  permissionName: string;
  agenceId?: string;
}

export default function PermissionExplanationModal({
  isOpen,
  onClose,
  userId,
  userName,
  permissionCode,
  permissionName,
  agenceId,
}: PermissionExplanationModalProps) {
  const { explanation, loading, error } = usePermissionExplanation(
    isOpen ? userId : '', // Only fetch when modal is open
    permissionCode,
    agenceId
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <HelpCircle className="text-accent" size={20} />
          <span>Pourquoi cette permission ?</span>
        </div>
      }
      subtitle={`Explication détaillée pour "${permissionName}"`}
      size="md"
    >
      <div className="space-y-4">
        {/* User & Permission Info */}
        <div className="bg-surface/50 rounded-lg p-3 border border-edge">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-content-muted text-xs">Utilisateur</span>
              <p className="text-content-primary font-medium truncate">{userName}</p>
            </div>
            <div>
              <span className="text-content-muted text-xs">Permission</span>
              <p className="text-content-primary font-mono text-xs truncate">{permissionCode}</p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 text-content-muted">
            <Loader2 className="animate-spin mb-2" size={24} />
            <span className="text-sm">Analyse en cours...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-status-danger/10 border border-status-danger/20 rounded-lg p-4 text-status-danger text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Erreur: {error}</span>
            </div>
          </div>
        )}

        {/* Explanation Content */}
        {explanation && !loading && (
          <div className="space-y-4">
            {/* Status Banner */}
            <div
              className={`
                rounded-lg p-4 border flex items-start gap-3
                ${explanation.hasPermission
                  ? 'bg-status-success-bg border-status-success/20'
                  : 'bg-status-danger/10 border-status-danger/20'
                }
              `}
            >
              {explanation.hasPermission ? (
                <CheckCircle className="text-status-success shrink-0 mt-0.5" size={20} />
              ) : (
                <XCircle className="text-status-danger shrink-0 mt-0.5" size={20} />
              )}
              <div>
                <p
                  className={`font-semibold ${
                    explanation.hasPermission ? 'text-status-success' : 'text-status-danger'
                  }`}
                >
                  {explanation.hasPermission ? 'Permission accordée' : 'Permission non accordée'}
                </p>
                <p className="text-content-secondary text-sm mt-1">{explanation.explanation}</p>
              </div>
            </div>

            {/* Source Badge */}
            <div className="flex items-center gap-2">
              <span className="text-content-muted text-sm">Source:</span>
              <PermissionSourceBadge
                source={explanation.source as PermissionSource}
                granted={explanation.hasPermission}
                sourceRole={explanation.details?.sourceRole as string | undefined}
                sourceAgenceId={explanation.details?.sourceAgenceId as string | undefined}
              />
            </div>

            {/* Details Section */}
            {explanation.details && Object.keys(explanation.details).length > 0 && (
              <div className="bg-surface-base rounded-lg border border-edge overflow-hidden">
                <div className="px-3 py-2 bg-surface/50 border-b border-edge">
                  <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wide">
                    Détails techniques
                  </h4>
                </div>
                <div className="p-3 space-y-2 text-sm">
                  {Object.entries(explanation.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start gap-4">
                      <span className="text-content-muted text-xs">{formatDetailKey(key)}</span>
                      <span className="text-content-secondary text-xs font-mono text-right truncate max-w-[200px]">
                        {formatDetailValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-2 border-t border-edge">
          <Button variant="outline" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Helper functions
function formatDetailKey(key: string): string {
  const labels: Record<string, string> = {
    permissionId: 'ID Permission',
    permissionCode: 'Code',
    granted: 'Accordée',
    source: 'Source',
    sourceRole: 'Rôle source',
    sourceAgenceId: 'Agence source',
    conditions: 'Conditions',
    checked: 'Vérifié',
  };
  return labels[key] || key.replace(/([A-Z])/g, ' $1').trim();
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
