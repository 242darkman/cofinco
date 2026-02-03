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
    grant: { verb: 'Accorder', color: 'text-emerald-400', icon: '✓' },
    deny: { verb: 'Refuser', color: 'text-rose-400', icon: '✗' },
    reset: { verb: 'Réinitialiser', color: 'text-amber-400', icon: '↺' },
  };

  const currentAction = actionLabels[action];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-amber-400" size={20} />
          <span>Permission critique</span>
        </div>
      }
      subtitle={`Modification de "${permissionName}"`}
      size="md"
      variant="warning"
    >
      <div className="space-y-4">
        {/* Warning Banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-amber-400 font-semibold text-sm">
                Cette permission est sensible
              </p>
              <p className="text-slate-300 text-sm">
                La modification de <code className="text-amber-300 bg-amber-500/10 px-1 rounded">
                  {permissionCode}
                </code> peut avoir un impact important sur la sécurité du système.
              </p>
            </div>
          </div>
        </div>

        {/* Action Summary */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Action:</span>
            <span className={`font-semibold text-sm ${currentAction.color}`}>
              {currentAction.icon} {currentAction.verb}
            </span>
          </div>
        </div>

        {/* Reason Input */}
        {loading ? (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={16} />
            <span className="text-sm">Vérification...</span>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Justification {requiresReason && <span className="text-rose-400">*</span>}
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
                bg-slate-900 border rounded-lg
                text-sm text-white placeholder:text-slate-500
                focus:outline-none focus:ring-2
                resize-none
                ${error
                  ? 'border-rose-500 focus:ring-rose-500/20'
                  : 'border-slate-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                }
              `}
            />
            {error && (
              <p className="text-rose-400 text-xs">{error}</p>
            )}
            {requiresReason && (
              <p className="text-slate-500 text-xs">
                Cette modification sera enregistrée dans l'historique d'audit.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
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
