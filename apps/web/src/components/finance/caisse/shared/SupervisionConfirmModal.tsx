import React, { useState } from 'react';
import { Shield, AlertTriangle, Clock, User, Wallet, X, CheckCircle2 } from 'lucide-react';
import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';

export interface SupervisionSession {
  sessionId: string;
  targetCaissierName: string;
  targetCaisseName: string;
  targetAgenceName?: string;
  currentBalance: number;
  openedAt: string;
  supervisorId: string;
  supervisorName: string;
  reason: string;
  reasonDetail?: string;
  startedAt: Date;
  maxDurationMinutes: number;
}

interface SupervisionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, reasonDetail?: string) => void;
  session: {
    id: string;
    caissierNom?: string;
    caisseNom?: string;
    agenceNom?: string;
    soldeTheorique: number;
    openedAt?: string;
  } | null;
  isLoading?: boolean;
  existingSupervision?: SupervisionSession | null;
}

const SUPERVISION_REASONS = [
  { id: 'assistance', label: 'Assistance technique', icon: '🔧', description: 'Aider le caissier avec une opération' },
  { id: 'verification', label: 'Vérification de conformité', icon: '✅', description: 'Contrôle des opérations effectuées' },
  { id: 'formation', label: 'Formation / Démonstration', icon: '📚', description: 'Former le caissier sur une procédure' },
  { id: 'incident', label: 'Incident en cours', icon: '⚠️', description: 'Résoudre un problème signalé' },
  { id: 'audit', label: 'Audit interne', icon: '📋', description: 'Vérification dans le cadre d\'un audit' },
  { id: 'other', label: 'Autre motif', icon: '📝', description: 'Précisez le motif ci-dessous' },
];

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('fr-FR').format(amount);
};

const formatTimeAgo = (date: string) => {
  if (!date) return '-';
  const diff = (new Date().getTime() - new Date(date).getTime()) / 1000 / 60;
  if (diff < 60) return `${Math.floor(diff)} min`;
  const hours = Math.floor(diff / 60);
  return `${hours}h ${Math.floor(diff % 60)}min`;
};

export default function SupervisionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  session,
  isLoading = false,
  existingSupervision
}: SupervisionConfirmModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [reasonDetail, setReasonDetail] = useState('');

  const handleConfirm = () => {
    if (!selectedReason) return;
    const reason = SUPERVISION_REASONS.find(r => r.id === selectedReason);
    onConfirm(reason?.label || selectedReason, selectedReason === 'other' ? reasonDetail : undefined);
  };

  const handleClose = () => {
    setSelectedReason('');
    setReasonDetail('');
    onClose();
  };

  if (!session) return null;

  // If there's already an active supervision by this user
  if (existingSupervision) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Supervision déjà active"
        variant="warning"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-status-warning-bg border border-status-warning/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-status-warning shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-status-warning">Vous supervisez déjà une caisse</p>
                <p className="text-sm text-status-warning/80 mt-1">
                  Vous ne pouvez superviser qu'une seule caisse à la fois. Veuillez d'abord quitter la supervision en cours.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface/50 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-muted">Caisse supervisée</span>
              <span className="font-medium text-content-primary">{existingSupervision.targetCaisseName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-muted">Caissier</span>
              <span className="font-medium text-content-primary">{existingSupervision.targetCaissierName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-muted">Depuis</span>
              <span className="font-medium text-status-success">
                {new Date(existingSupervision.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-muted">Motif</span>
              <span className="font-medium text-accent">{existingSupervision.reason}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Compris
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Prendre la main"
      subtitle="Confirmation de supervision"
      size="lg"
    >
      <div className="space-y-5 -mx-2 sm:mx-0">
        {/* Target Session Info */}
        <div className="p-4 bg-gradient-to-r from-surface/60 to-surface/30 rounded-xl border border-edge-subtle">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-bold text-lg shrink-0">
              {session.caissierNom?.[0] || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-content-primary text-base">
                {session.caissierNom || 'Caissier inconnu'}
              </h4>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm">
                <span className="text-content-muted flex items-center gap-1">
                  <Wallet size={12} />
                  {session.caisseNom || 'Caisse'}
                </span>
                {session.agenceNom && (
                  <span className="text-content-muted">• {session.agenceNom}</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-lg bg-surface-base/50 border border-edge-subtle">
              <div className="text-[10px] text-content-muted uppercase font-semibold mb-1">Solde actuel</div>
              <div className="text-lg font-bold text-status-success font-mono">
                {formatMoney(Number(session.soldeTheorique))} <span className="text-xs text-content-muted">F</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface-base/50 border border-edge-subtle">
              <div className="text-[10px] text-content-muted uppercase font-semibold mb-1">Session ouverte</div>
              <div className="text-base font-medium text-content-primary flex items-center gap-1.5">
                <Clock size={14} className="text-accent" />
                {formatTimeAgo(session.openedAt || '')}
              </div>
            </div>
          </div>
        </div>

        {/* Reason Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-content-secondary">
            Motif de la supervision <span className="text-status-danger">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUPERVISION_REASONS.map((reason) => (
              <button
                key={reason.id}
                type="button"
                onClick={() => setSelectedReason(reason.id)}
                className={`
                  p-3 rounded-xl border text-left transition-all
                  ${selectedReason === reason.id
                    ? 'border-accent bg-accent/10 ring-1 ring-accent/50'
                    : 'border-edge-subtle bg-surface/30 hover:border-edge-strong hover:bg-surface/50'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{reason.icon}</span>
                  <span className={`text-sm font-medium ${selectedReason === reason.id ? 'text-accent' : 'text-content-primary'}`}>
                    {reason.label}
                  </span>
                  {selectedReason === reason.id && (
                    <CheckCircle2 size={14} className="text-accent ml-auto" />
                  )}
                </div>
                <p className="text-[11px] text-content-muted pl-6">{reason.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Detail field for "Other" reason */}
        {selectedReason === 'other' && (
          <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
            <label className="block text-sm font-semibold text-content-secondary">
              Précisez le motif <span className="text-status-danger">*</span>
            </label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Décrivez la raison de cette supervision..."
              className="w-full px-3 py-2.5 bg-surface/60 border border-edge-subtle rounded-xl text-content-primary text-sm
                       placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50
                       resize-none transition-all"
              rows={3}
            />
          </div>
        )}

        {/* Warning Notice */}
        <div className="p-3 bg-status-warning/5 border border-status-warning/20 rounded-xl">
          <div className="flex items-start gap-2">
            <Shield size={16} className="text-status-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-status-warning font-medium">Traçabilité des actions</p>
              <p className="text-[11px] text-status-warning/70 mt-0.5">
                Cette supervision sera enregistrée dans l'historique avec votre identité, le motif sélectionné,
                et l'horodatage. Toutes les opérations effectuées pendant la supervision seront tracées.
              </p>
            </div>
          </div>
        </div>

        {/* Duration Info */}
        <div className="flex items-center gap-2 text-xs text-content-muted">
          <Clock size={12} />
          <span>Durée par défaut : 30 minutes (prolongeable si nécessaire)</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-edge/50">
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Annuler
          </Button>
          <Button
            variant="primary"
            icon={Shield}
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={!selectedReason || (selectedReason === 'other' && !reasonDetail.trim())}
          >
            Confirmer la supervision
          </Button>
        </div>
      </div>
    </Modal>
  );
}
