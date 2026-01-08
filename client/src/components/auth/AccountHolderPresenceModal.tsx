import React, { useState, useCallback } from 'react';
import { UserCheck, AlertTriangle, ShieldCheck, Fingerprint, IdCard } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * AccountHolderPresenceModal - Confirmation de présence du titulaire
 *
 * Remplace la validation OTP pour les retraits quand l'OTP n'est pas disponible.
 * Exige une confirmation explicite que le titulaire du compte est physiquement présent.
 */

export interface AccountHolderPresenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmationData: PresenceConfirmationData) => void;
  clientName: string;
  clientPhone?: string;
  operationType: string;
  amount: number;
  isLoading?: boolean;
}

export interface PresenceConfirmationData {
  presenceConfirmed: boolean;
  identityVerified: boolean;
  verificationMethod: 'piece_identite' | 'reconnaissance_visuelle' | 'signature';
  agentNotes?: string;
  timestamp: string;
}

const AccountHolderPresenceModal: React.FC<AccountHolderPresenceModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clientName,
  clientPhone,
  operationType,
  amount,
  isLoading = false,
}) => {
  const [presenceConfirmed, setPresenceConfirmed] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<'piece_identite' | 'reconnaissance_visuelle' | 'signature'>('piece_identite');
  const [agentNotes, setAgentNotes] = useState('');

  const canConfirm = presenceConfirmed && identityVerified;

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;

    const confirmationData: PresenceConfirmationData = {
      presenceConfirmed: true,
      identityVerified: true,
      verificationMethod,
      agentNotes: agentNotes.trim() || undefined,
      timestamp: new Date().toISOString(),
    };

    onConfirm(confirmationData);
  }, [canConfirm, verificationMethod, agentNotes, onConfirm]);

  const handleClose = useCallback(() => {
    // Reset state on close
    setPresenceConfirmed(false);
    setIdentityVerified(false);
    setVerificationMethod('piece_identite');
    setAgentNotes('');
    onClose();
  }, [onClose]);

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Confirmation de Retrait"
      size="md"
      variant="warning"
      closeOnBackdrop={!isLoading}
      closeOnEsc={!isLoading}
      showCloseButton={!isLoading}
    >
      <div className="space-y-5">
        {/* Header warning */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-semibold mb-1">Verification obligatoire</p>
              <p className="text-amber-200/80">
                Pour tout retrait, la presence physique du titulaire du compte est requise.
                Vous devez verifier son identite avant de proceder.
              </p>
            </div>
          </div>
        </div>

        {/* Operation details */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Details de l'operation
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Type:</span>
              <span className="text-white font-medium">{operationType}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Client:</span>
              <span className="text-white font-medium">{clientName}</span>
            </div>
            {clientPhone && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Telephone:</span>
                <span className="text-slate-300">{clientPhone}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-slate-700/50">
              <span className="text-slate-400">Montant:</span>
              <span className="text-rose-400 font-bold text-lg">{formatMoney(amount)}</span>
            </div>
          </div>
        </div>

        {/* Checkboxes for confirmation */}
        <div className="space-y-3">
          {/* Presence confirmation */}
          <label className="flex items-start gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800/50 transition-colors">
            <input
              type="checkbox"
              checked={presenceConfirmed}
              onChange={(e) => setPresenceConfirmed(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Presence du titulaire confirmee
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Je certifie que le titulaire du compte ({clientName}) est physiquement present devant moi.
              </p>
            </div>
          </label>

          {/* Identity verification */}
          <label className="flex items-start gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800/50 transition-colors">
            <input
              type="checkbox"
              checked={identityVerified}
              onChange={(e) => setIdentityVerified(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                Identite verifiee
              </div>
              <p className="text-xs text-slate-400 mt-1">
                J'ai verifie l'identite du client par l'une des methodes ci-dessous.
              </p>
            </div>
          </label>
        </div>

        {/* Verification method selection */}
        {identityVerified && (
          <div className="space-y-2 animate-in slide-in-from-top-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Methode de verification utilisee
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVerificationMethod('piece_identite')}
                className={`p-3 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                  verificationMethod === 'piece_identite'
                    ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-300'
                    : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <IdCard className="w-5 h-5" />
                <span>Piece d'identite</span>
              </button>
              <button
                type="button"
                onClick={() => setVerificationMethod('reconnaissance_visuelle')}
                className={`p-3 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                  verificationMethod === 'reconnaissance_visuelle'
                    ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-300'
                    : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <UserCheck className="w-5 h-5" />
                <span>Client connu</span>
              </button>
              <button
                type="button"
                onClick={() => setVerificationMethod('signature')}
                className={`p-3 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                  verificationMethod === 'signature'
                    ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-300'
                    : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <Fingerprint className="w-5 h-5" />
                <span>Signature</span>
              </button>
            </div>
          </div>
        )}

        {/* Optional notes */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Notes (optionnel)
          </label>
          <textarea
            value={agentNotes}
            onChange={(e) => setAgentNotes(e.target.value)}
            placeholder="Observations supplementaires..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none text-white placeholder:text-slate-500 resize-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="secondary"
            size="md"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 min-h-[44px]"
          >
            Annuler
          </Button>
          <Button
            variant={canConfirm ? 'success' : 'secondary'}
            size="md"
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            isLoading={isLoading}
            className="flex-1 min-h-[44px]"
          >
            {canConfirm ? 'Valider le retrait' : 'Completez les verifications'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AccountHolderPresenceModal;
