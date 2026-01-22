import React, { useState, useCallback } from 'react';
import { Shield, CheckCircle2, AlertTriangle, Eye, EyeOff, Lock, FileCheck, UserCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { formatMoney } from '../../lib/format';

/**
 * Seuil au-delà duquel un mot de passe agent est requis
 */
const PASSWORD_REQUIRED_THRESHOLD = 1_000_000; // 1M FCFA

export interface PhysicalConfirmationData {
  /** Méthode de vérification utilisée */
  verificationMethod: 'piece_identite' | 'reconnaissance_visuelle' | 'signature';
  /** Identité confirmée par l'agent */
  identityConfirmed: boolean;
  /** Acceptation des responsabilités */
  responsibilityAccepted: boolean;
  /** Notes de l'agent (optionnel) */
  agentNotes?: string;
  /** Timestamp de la confirmation */
  confirmedAt: string;
  /** Mot de passe vérifié (pour montants > 1M) */
  passwordVerified?: boolean;
}

interface PhysicalConfirmationStepProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: PhysicalConfirmationData) => void;
  clientName: string;
  clientPhone?: string;
  operationType: string;
  amount: number;
  isLoading?: boolean;
  /** Fonction pour vérifier le mot de passe agent (optionnel) */
  verifyPassword?: (password: string) => Promise<boolean>;
}

/**
 * PhysicalConfirmationStep - Composant de confirmation physique pour opérations sensibles
 *
 * Remplace la validation OTP par une double confirmation manuelle :
 * 1. L'agent confirme avoir vérifié l'identité du client (pièce, reconnaissance, signature)
 * 2. L'agent accepte sa responsabilité pour cette opération
 * 3. Pour les montants > 1M FCFA : mot de passe agent requis
 *
 * Avantages par rapport à l'OTP :
 * - Pas de code hardcodé (faille de sécurité corrigée)
 * - Traçabilité complète de qui a confirmé quoi
 * - Adaptation au contexte terrain (pas de dépendance SMS)
 */
export function PhysicalConfirmationStep({
  isOpen,
  onClose,
  onConfirm,
  clientName,
  clientPhone,
  operationType,
  amount,
  isLoading = false,
  verifyPassword,
}: PhysicalConfirmationStepProps) {
  // États de confirmation
  const [verificationMethod, setVerificationMethod] = useState<PhysicalConfirmationData['verificationMethod'] | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [agentNotes, setAgentNotes] = useState('');

  // États pour mot de passe (montants élevés)
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const requiresPassword = amount >= PASSWORD_REQUIRED_THRESHOLD;

  const isFormValid = useCallback(() => {
    if (!verificationMethod || !identityConfirmed || !responsibilityAccepted) {
      return false;
    }
    if (requiresPassword && !password.trim()) {
      return false;
    }
    return true;
  }, [verificationMethod, identityConfirmed, responsibilityAccepted, requiresPassword, password]);

  const handleConfirm = useCallback(async () => {
    if (!isFormValid()) return;

    // Vérification du mot de passe si nécessaire
    if (requiresPassword && verifyPassword) {
      setVerifyingPassword(true);
      setPasswordError('');

      try {
        const isValid = await verifyPassword(password);
        if (!isValid) {
          setPasswordError('Mot de passe incorrect');
          setVerifyingPassword(false);
          return;
        }
      } catch {
        setPasswordError('Erreur de vérification');
        setVerifyingPassword(false);
        return;
      }

      setVerifyingPassword(false);
    }

    const confirmationData: PhysicalConfirmationData = {
      verificationMethod: verificationMethod!,
      identityConfirmed,
      responsibilityAccepted,
      agentNotes: agentNotes.trim() || undefined,
      confirmedAt: new Date().toISOString(),
      passwordVerified: requiresPassword ? true : undefined,
    };

    onConfirm(confirmationData);
  }, [isFormValid, requiresPassword, verifyPassword, password, verificationMethod, identityConfirmed, responsibilityAccepted, agentNotes, onConfirm]);

  const handleClose = useCallback(() => {
    // Reset du formulaire
    setVerificationMethod(null);
    setIdentityConfirmed(false);
    setResponsibilityAccepted(false);
    setAgentNotes('');
    setPassword('');
    setPasswordError('');
    onClose();
  }, [onClose]);

  const verificationMethods = [
    {
      id: 'piece_identite' as const,
      label: "Pièce d'identité",
      description: "CNI, passeport ou permis vérifié",
      icon: FileCheck
    },
    {
      id: 'reconnaissance_visuelle' as const,
      label: 'Client connu',
      description: "Client régulier reconnu visuellement",
      icon: UserCheck
    },
    {
      id: 'signature' as const,
      label: 'Signature',
      description: "Signature conforme au spécimen",
      icon: Shield
    },
  ];

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Confirmation de l'opération"
      subtitle="Vérification physique requise"
      size="md"
      variant="default"
      showCloseButton={!isLoading}
      footer={
        <>
          <Button onClick={handleClose} variant="ghost" disabled={isLoading || verifyingPassword}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            variant="primary"
            disabled={!isFormValid() || isLoading || verifyingPassword}
            icon={CheckCircle2}
            isLoading={isLoading || verifyingPassword}
          >
            Confirmer l'opération
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Résumé de l'opération */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Client:</span>
            <span className="font-semibold text-white">{clientName}</span>
          </div>
          {clientPhone && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Téléphone:</span>
              <span className="font-mono text-slate-300">{clientPhone}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Opération:</span>
            <span className="font-medium text-white">{operationType}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <span className="text-slate-400 text-sm">Montant:</span>
            <span className="font-bold text-emerald-400 text-lg">
              {formatMoney(amount)}
            </span>
          </div>
        </div>

        {/* Alerte montant élevé */}
        {requiresPassword && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-300 text-sm">Montant élevé</p>
              <p className="text-amber-200/70 text-xs mt-0.5">
                Cette opération dépasse {formatMoney(PASSWORD_REQUIRED_THRESHOLD)}.
                Votre mot de passe est requis pour validation.
              </p>
            </div>
          </div>
        )}

        {/* Méthode de vérification */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Méthode de vérification d'identité
          </label>
          <div className="grid grid-cols-1 gap-2">
            {verificationMethods.map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  onClick={() => setVerificationMethod(method.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                    verificationMethod === method.id
                      ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200'
                      : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                  }`}
                  type="button"
                >
                  <div className={`p-2 rounded-lg ${
                    verificationMethod === method.id
                      ? 'bg-emerald-500/20'
                      : 'bg-slate-700/50'
                  }`}>
                    <Icon size={18} className={
                      verificationMethod === method.id
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    } />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{method.label}</div>
                    <div className="text-xs opacity-70">{method.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Checkboxes de confirmation */}
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={identityConfirmed}
              onChange={(e) => setIdentityConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
              Je confirme avoir vérifié l'identité du client <strong className="text-white">{clientName}</strong>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={responsibilityAccepted}
              onChange={(e) => setResponsibilityAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
              J'accepte ma responsabilité pour cette opération de <strong className="text-emerald-400">{formatMoney(amount)}</strong>
            </span>
          </label>
        </div>

        {/* Mot de passe (si montant élevé) */}
        {requiresPassword && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Lock size={12} />
              Mot de passe agent
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Entrez votre mot de passe"
                className={`w-full px-4 py-3 pr-12 text-sm bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none text-white transition-all ${
                  passwordError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-slate-700 focus:border-emerald-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} />
                {passwordError}
              </p>
            )}
          </div>
        )}

        {/* Notes optionnelles */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Notes (optionnel)
          </label>
          <textarea
            value={agentNotes}
            onChange={(e) => setAgentNotes(e.target.value)}
            placeholder="Observations ou remarques..."
            rows={2}
            className="w-full px-4 py-3 text-sm bg-slate-800/50 border border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none text-white resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

export default PhysicalConfirmationStep;
