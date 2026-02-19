/**
 * Create Alert Modal Component
 * Form for creating new system alerts
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  Calendar,
  Users,
  Send,
} from 'lucide-react';
import { alertsApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

export interface CreateAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type AlertType = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
type TargetAudience = 'ALL' | 'ADMINS' | 'AGENTS' | 'SPECIFIC_USERS';

const ALERT_TYPES: { value: AlertType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'INFO', label: 'Information', icon: Info, color: 'text-status-info bg-status-info-bg' },
  { value: 'WARNING', label: 'Avertissement', icon: AlertTriangle, color: 'text-status-warning bg-status-warning-bg' },
  { value: 'CRITICAL', label: 'Critique', icon: AlertCircle, color: 'text-status-danger bg-status-danger-bg' },
  { value: 'SUCCESS', label: 'Succès', icon: CheckCircle, color: 'text-status-success bg-status-success-bg' },
];

const TARGET_OPTIONS: { value: TargetAudience; label: string; description: string }[] = [
  { value: 'ALL', label: 'Tous les utilisateurs', description: 'Visible par tous' },
  { value: 'ADMINS', label: 'Administrateurs', description: 'Uniquement les admins' },
  { value: 'AGENTS', label: 'Agents', description: 'Agents terrain et caissiers' },
  { value: 'SPECIFIC_USERS', label: 'Utilisateurs spécifiques', description: 'Sélectionner les utilisateurs' },
];

export default function CreateAlertModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateAlertModalProps) {
  const [type, setType] = useState<AlertType>('INFO');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('ALL');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Le titre est requis');
      return;
    }

    if (!message.trim()) {
      toast.error('Le message est requis');
      return;
    }

    setSaving(true);
    try {
      await alertsApi.create({
        type,
        title: title.trim(),
        message: message.trim(),
        targetAudience,
        expiresAt: expiresAt || undefined,
      });

      toast.success('Alerte créée et diffusée');
      onSuccess?.();
      handleClose();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création de l\'alerte'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setType('INFO');
    setTitle('');
    setMessage('');
    setTargetAudience('ALL');
    setExpiresAt('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl border border-edge w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-warning-bg rounded-lg">
              <AlertTriangle className="text-status-warning" size={20} />
            </div>
            <h2 className="text-lg font-semibold text-content-primary">Nouvelle alerte</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Alert Type */}
          <div>
            <label className="block text-sm text-content-muted mb-2">Type d'alerte</label>
            <div className="grid grid-cols-4 gap-2">
              {ALERT_TYPES.map((alertType) => {
                const Icon = alertType.icon;
                return (
                  <button
                    key={alertType.value}
                    type="button"
                    onClick={() => setType(alertType.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition ${
                      type === alertType.value
                        ? `border-transparent ${alertType.color}`
                        : 'border-edge-strong bg-surface-elevated/50 hover:border-edge-strong'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-xs">{alertType.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm text-content-muted mb-1">Titre *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-status-warning"
              placeholder="Titre de l'alerte"
              maxLength={100}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm text-content-muted mb-1">Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-status-warning resize-none"
              placeholder="Contenu détaillé de l'alerte..."
            />
            <p className="mt-1 text-xs text-content-muted text-right">
              {message.length} / 500 caractères
            </p>
          </div>

          {/* Target Audience */}
          <div>
            <label className="block text-sm text-content-muted mb-2">
              <Users size={14} className="inline mr-1" />
              Audience cible
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTargetAudience(option.value)}
                  className={`p-3 rounded-lg border text-left transition ${
                    targetAudience === option.value
                      ? 'border-status-warning/50 bg-status-warning-bg'
                      : 'border-edge-strong bg-surface-elevated/50 hover:border-edge-strong'
                  }`}
                >
                  <span className="block text-sm text-content-primary">{option.label}</span>
                  <span className="block text-xs text-content-muted">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Expiration */}
          <div>
            <label className="block text-sm text-content-muted mb-1">
              <Calendar size={14} className="inline mr-1" />
              Date d'expiration (optionnel)
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-status-warning"
            />
            <p className="mt-1 text-xs text-content-muted">
              L'alerte sera automatiquement masquée après cette date
            </p>
          </div>

          {/* Preview */}
          {title && (
            <div className="p-4 bg-surface-base/50 rounded-lg border border-edge">
              <p className="text-xs text-content-muted mb-2">Aperçu</p>
              <div
                className={`p-3 rounded-lg ${
                  ALERT_TYPES.find((t) => t.value === type)?.color || 'bg-surface-elevated'
                }`}
              >
                <div className="flex items-start gap-2">
                  {(() => {
                    const AlertIcon = ALERT_TYPES.find((t) => t.value === type)?.icon || Info;
                    return <AlertIcon size={18} className="mt-0.5" />;
                  })()}
                  <div>
                    <h4 className="font-medium text-content-primary">{title}</h4>
                    {message && <p className="text-sm opacity-90 mt-1">{message}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-content-muted hover:text-content-primary transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !title || !message}
              className="flex items-center gap-2 px-4 py-2 bg-status-warning hover:bg-status-warning text-white rounded-lg transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
              Diffuser l'alerte
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
