/**
 * ForceCloseModal - Modal pour forcer la fermeture d'une session de caisse
 */

import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ForceCloseModalProps {
  isOpen: boolean;
  caisse: {
    id: string;
    nom: string;
    agent?: {
      nom?: string;
      prenom?: string;
    };
  } | null;
  sessionId: string;
  onConfirm: (motif: string, keepFunds: boolean) => Promise<void>;
  onClose: () => void;
}

export function ForceCloseModal({
  isOpen,
  caisse,
  sessionId,
  onConfirm,
  onClose,
}: ForceCloseModalProps) {
  const [motif, setMotif] = useState('');
  const [keepFunds, setKeepFunds] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !caisse) return null;

  const agentName = caisse.agent
    ? `${caisse.agent.prenom || ''} ${caisse.agent.nom || ''}`.trim()
    : 'Agent inconnu';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (motif.length < 10) {
      setError('Le motif doit contenir au moins 10 caractères');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onConfirm(motif, keepFunds);
      setMotif('');
      setKeepFunds(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la fermeture forcée');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-edge">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-danger-bg rounded-lg">
              <AlertTriangle className="w-6 h-6 text-status-danger" />
            </div>
            <h2 className="text-xl font-semibold text-content-primary">
              Fermeture Forcée
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Warning Message */}
          <div className="p-4 bg-status-warning-bg border border-status-warning/30 rounded-lg">
            <p className="text-sm text-status-warning-text">
              ⚠️ Vous allez fermer la session de <strong>{agentName}</strong> de force.
              Les fonds resteront dans la caisse.
            </p>
          </div>

          {/* Motif Field */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Motif de la fermeture <span className="text-status-danger">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-status-danger focus:border-transparent-elevated"
              rows={4}
              placeholder="Ex: Agent absent - urgence familiale"
              required
              minLength={10}
            />
            <p className="mt-1 text-xs text-content-muted">
              Minimum 10 caractères ({motif.length}/10)
            </p>
          </div>

          {/* Keep Funds Option */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="keepFunds"
              checked={keepFunds}
              onChange={(e) => setKeepFunds(e.target.checked)}
              className="mt-1 w-4 h-4 text-status-danger border-edge rounded focus:ring-status-danger"
            />
            <label htmlFor="keepFunds" className="text-sm text-content-secondary">
              Garder les fonds en caisse (fond de caisse pour la prochaine session)
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-lg">
              <p className="text-sm text-status-danger-text">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-edge-strong text-content-secondary rounded-lg hover:bg-surface-muted-elevated transition-colors"
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-status-danger text-white rounded-lg hover:bg-status-danger transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || motif.length < 10}
            >
              {isSubmitting ? 'Fermeture...' : 'Forcer la Fermeture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
