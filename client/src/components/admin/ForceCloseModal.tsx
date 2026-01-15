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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Fermeture Forcée
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Warning Message */}
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              ⚠️ Vous allez fermer la session de <strong>{agentName}</strong> de force.
              Les fonds resteront dans la caisse.
            </p>
          </div>

          {/* Motif Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Motif de la fermeture <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              rows={4}
              placeholder="Ex: Agent absent - urgence familiale"
              required
              minLength={10}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
              className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <label htmlFor="keepFunds" className="text-sm text-gray-700 dark:text-gray-300">
              Garder les fonds en caisse (fond de caisse pour la prochaine session)
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
