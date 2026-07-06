/**
 * Critical Permission Reason Dialog
 * ==================================
 *
 * Dialog shown when modifying a critical permission that requires justification.
 * The user must provide a reason before the permission change is applied.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, Loader2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { useCriticalPermissionCheck } from '@/hooks/admin/useRbacAudit';

interface CriticalPermissionReasonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  permissionCode: string;
  permissionName: string;
  action: 'grant' | 'deny' | 'reset';
  isSubmitting?: boolean;
}

export default function CriticalPermissionReasonDialog({
  isOpen,
  onClose,
  onConfirm,
  permissionCode,
  permissionName,
  action,
  isSubmitting = false,
}: CriticalPermissionReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isCritical, requiresReason, loading } = useCriticalPermissionCheck(permissionCode);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (requiresReason && (!reason || reason.trim().length < 10)) {
      setError('La justification doit contenir au moins 10 caractères.');
      return;
    }
    onConfirm(reason.trim());
  };

  const actionLabels = {
    grant: { verb: 'Accorder', color: 'text-status-success', icon: '✓' },
    deny: { verb: 'Refuser', color: 'text-status-danger', icon: '✗' },
    reset: { verb: 'Réinitialiser', color: 'text-status-warning', icon: '↺' },
  };

  const currentAction = actionLabels[action];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-status-warning" size={20} />
          <span>Permission critique</span>
        </div>
      }
      subtitle={`Modification de "${permissionName}"`}
      size="md"
      variant="warning"
    >
      <div className="space-y-4">
        {/* Warning Banner */}
        <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="text-status-warning shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-status-warning font-semibold text-sm">
                Cette permission est sensible
              </p>
              <p className="text-content-secondary text-sm">
                La modification de <code className="text-status-warning bg-status-warning-bg px-1 rounded">
                  {permissionCode}
                </code> peut avoir un impact important sur la sécurité du système.
              </p>
            </div>
          </div>
        </div>

        {/* Action Summary */}
        <div className="bg-surface/50 rounded-lg p-3 border border-edge">
          <div className="flex items-center gap-2">
            <span className="text-content-muted text-sm">Action:</span>
            <span className={`font-semibold text-sm ${currentAction.color}`}>
              {currentAction.icon} {currentAction.verb}
            </span>
          </div>
        </div>

        {/* Reason Input */}
        {loading ? (
          <div className="flex items-center justify-center py-4 text-content-muted">
            <Loader2 className="animate-spin mr-2" size={16} />
            <span className="text-sm">Vérification...</span>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-content-secondary">
              Justification {requiresReason && <span className="text-status-danger">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder={
                requiresReason
                  ? 'Expliquez la raison de cette modification (obligatoire)...'
                  : 'Justification optionnelle...'
              }
              className={`
                w-full h-24 px-3 py-2
                bg-surface-base border rounded-lg
                text-sm text-content-primary placeholder:text-content-muted
                focus:outline-none focus:ring-2
                resize-none
                ${error
                  ? 'border-status-danger focus:ring-status-danger/20'
                  : 'border-edge focus:ring-accent/20 focus:border-accent'
                }
              `}
            />
            {error && (
              <p className="text-status-danger text-xs">{error}</p>
            )}
            {requiresReason && (
              <p className="text-content-muted text-xs">
                Cette modification sera enregistrée dans l'historique d'audit.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-edge">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            variant={action === 'grant' ? 'primary' : action === 'deny' ? 'danger' : 'secondary'}
            size="sm"
            onClick={handleSubmit}
            disabled={loading || isSubmitting}
          >
            {isSubmitting && <Loader2 className="animate-spin mr-2" size={14} />}
            {currentAction.verb} la permission
          </Button>
        </div>
      </div>
    </Modal>
  );
}
