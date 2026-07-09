/**
 * RejectOperationModal - Modal pour rejeter une opération avec motif
 */

import React, { useState } from 'react';
import { XCircle, AlertTriangle } from 'lucide-react';
import { Modal, Button } from '../../ui';
import type { OperationTerrainWithRelations } from '@shared/schema';

interface RejectOperationModalProps {
  operation: OperationTerrainWithRelations;
  onClose: () => void;
  onReject: (reason: string) => void;
  loading?: boolean;
}

const COMMON_REASONS = [
  'Montant incorrect',
  'Client non identifié',
  'Reçu manquant ou invalide',
  'Suspicion de fraude',
  'Information incomplète',
  'Erreur de saisie',
  'Autre'
];

export default function RejectOperationModal({
  operation,
  onClose,
  onReject,
  loading = false
}: RejectOperationModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const reason = selectedReason === 'Autre' ? customReason : selectedReason;
    if (!reason.trim()) return;
    onReject(reason);
  };

  const formatMoney = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('fr-FR').format(num || 0);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Rejeter l'opération"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning */}
        <div className="p-4 bg-status-danger-bg border border-status-danger/20 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-status-danger">
              Cette action est irréversible
            </p>
            <p className="text-xs text-content-muted mt-1">
              L'agent sera notifié du rejet et aucune écriture comptable ne sera effectuée.
            </p>
          </div>
        </div>

        {/* Operation summary */}
        <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-content-primary">
                {operation.type === 'COLLECT_CASH' ? 'Collecte' : 'Remise'}
              </p>
              <p className="text-xs text-content-muted">
                Réf: {operation.reference}
              </p>
            </div>
            <p className={`text-lg font-bold ${
              operation.type === 'COLLECT_CASH' ? 'text-accent' : 'text-status-success'
            }`}>
              {formatMoney(operation.montant as unknown as string)} XOF
            </p>
          </div>
        </div>

        {/* Reason selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-content-secondary">
            Motif du rejet <span className="text-status-danger">*</span>
          </label>
          <div className="space-y-2">
            {COMMON_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedReason === reason
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-edge hover:border-edge-strong'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-4 h-4 text-accent bg-surface-elevated border-edge-strong focus:ring-accent"
                />
                <span className="text-sm text-content-secondary">{reason}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Custom reason textarea */}
        {selectedReason === 'Autre' && (
          <div className="space-y-2 animate-in slide-in-from-top duration-200">
            <label className="text-sm font-medium text-content-secondary">
              Précisez le motif <span className="text-status-danger">*</span>
            </label>
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Décrivez la raison du rejet..."
              rows={3}
              className="w-full px-3 py-2 bg-surface-elevated border border-edge rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
              required={selectedReason === 'Autre'}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-edge">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="danger"
            icon={XCircle}
            isLoading={loading}
            disabled={!selectedReason || (selectedReason === 'Autre' && !customReason.trim())}
          >
            Confirmer le rejet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
