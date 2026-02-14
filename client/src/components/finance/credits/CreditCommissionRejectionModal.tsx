import React, { useState } from 'react';
import { XCircle, AlertTriangle, X } from 'lucide-react';
import { Modal, Button } from '../../ui';
import { toast } from 'sonner';
import { STATUT_DEMANDE_LABELS, StatutDemandeType } from '@shared/enum/status-constants';

interface CreditCommissionRejectionModalProps {
  demande: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreditCommissionRejectionModal({
  demande,
  onClose,
  onSuccess
}: CreditCommissionRejectionModalProps) {
  const [motifRejet, setMotifRejet] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = demande.clients 
    ? `${demande.clients.nom || ''} ${demande.clients.prenom || ''}`.trim()
    : 'Client Inconnu';

  const handleReject = async () => {
    // Validation
    if (!motifRejet || motifRejet.trim().length < 10) {
      setError('Le motif de rejet doit contenir au moins 10 caractères');
      return;
    }

    if (motifRejet.length > 500) {
      setError('Le motif de rejet ne peut pas dépasser 500 caractères');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/demandes/${demande.id}/reject-from-commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ motif_rejet: motifRejet.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors du rejet de la demande');
      }

      toast.success(`Demande ${demande.numeroDemande} rejetée. Le client peut demander une réévaluation immédiatement.`);
      onSuccess();
    } catch (err: any) {
      console.error('Erreur rejet commission:', err);
      setError(err.message || 'Une erreur est survenue');
      toast.error('Échec du rejet de la demande');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-status-danger-bg flex items-center justify-center">
            <XCircle className="text-status-danger" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-content-primary">Rejeter la Demande</h2>
            <p className="text-sm text-content-muted mt-0.5">Commission Crédit</p>
          </div>
        </div>
      }
      size="md"
    >
      <div className="space-y-6">
        {/* Warning Banner */}
        <div className="p-4 bg-status-warning-bg border border-status-warning/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="text-status-warning flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-status-warning-text">
            <p className="font-semibold mb-1">Attention</p>
            <p className="text-status-warning/90">
              Cette demande a déjà été approuvée. Le rejet à cette étape annulera l'approbation initiale.
              Le client pourra demander une réévaluation immédiatement.
            </p>
          </div>
        </div>

        {/* Demande Info */}
        <div className="bg-surface-elevated/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Numéro de demande</span>
            <span className="text-content-primary font-mono font-bold">{demande.numeroDemande}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Client</span>
            <span className="text-content-primary font-semibold">{clientName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Montant demandé</span>
            <span className="text-status-success font-bold">
              {(demande.montantDemande || 0).toLocaleString('fr-FR')} FCFA
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Statut actuel</span>
            <span className="px-2 py-0.5 bg-status-success-bg text-status-success rounded text-xs font-semibold">
              {STATUT_DEMANDE_LABELS[demande.statut as StatutDemandeType] || demande.statut}
            </span>
          </div>
        </div>

        {/* Motif de Rejet */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-2">
            Motif du rejet <span className="text-status-danger">*</span>
          </label>
          <textarea
            value={motifRejet}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setMotifRejet(e.target.value);
              setError(null);
            }}
            placeholder="Expliquez les raisons du rejet (minimum 10 caractères)..."
            rows={5}
            className="w-full px-4 py-3 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-status-danger/50 focus:border-status-danger transition resize-none"
            disabled={loading}
          ></textarea>
          <div className="flex justify-between mt-1">
            <span className={`text-xs ${
              motifRejet.length < 10 
                ? 'text-status-danger' 
                : motifRejet.length > 500 
                ? 'text-status-warning' 
                : 'text-status-success'
            }`}>
              {motifRejet.length < 10 
                ? `Minimum 10 caractères (${10 - motifRejet.length} restants)` 
                : motifRejet.length > 500
                ? `Maximum 500 caractères (${motifRejet.length - 500} en trop)`
                : `${motifRejet.length} / 500 caractères`
              }
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-lg">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={handleReject}
            isLoading={loading}
            disabled={loading || motifRejet.trim().length < 10 || motifRejet.length > 500}
            icon={XCircle}
            className="flex-1"
          >
            Confirmer le Rejet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
