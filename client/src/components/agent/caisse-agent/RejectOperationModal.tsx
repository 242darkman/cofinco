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
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">
              Cette action est irréversible
            </p>
            <p className="text-xs text-slate-400 mt-1">
              L'agent sera notifié du rejet et aucune écriture comptable ne sera effectuée.
            </p>
          </div>
        </div>

        {/* Operation summary */}
        <div className="p-3 bg-surface-elevated rounded-lg border border-edge">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {operation.type === 'COLLECT_CASH' ? 'Collecte' : 'Remise'}
              </p>
              <p className="text-xs text-slate-400">
                Réf: {operation.reference}
              </p>
            </div>
            <p className={`text-lg font-bold ${
              operation.type === 'COLLECT_CASH' ? 'text-cyan-400' : 'text-emerald-400'
            }`}>
              {formatMoney(operation.montant as unknown as string)} XOF
            </p>
          </div>
        </div>

        {/* Reason selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">
            Motif du rejet <span className="text-red-400">*</span>
          </label>
          <div className="space-y-2">
            {COMMON_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedReason === reason
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-edge hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 focus:ring-cyan-500"
                />
                <span className="text-sm text-slate-300">{reason}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Custom reason textarea */}
        {selectedReason === 'Autre' && (
          <div className="space-y-2 animate-in slide-in-from-top duration-200">
            <label className="text-sm font-medium text-slate-300">
              Précisez le motif <span className="text-red-400">*</span>
            </label>
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Décrivez la raison du rejet..."
              rows={3}
              className="w-full px-3 py-2 bg-surface-elevated border border-edge rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 resize-none"
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
