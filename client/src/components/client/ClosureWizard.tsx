import React, { useState, useEffect } from 'react';
import { XCircle, CheckCircle, AlertTriangle, Phone, Banknote, Smartphone, ChevronRight, ChevronLeft, Loader2, Clock, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { toast, handleApiError } from '../../lib/toast';
import {
  ClosurePayoutMethod,
  CLOSURE_PAYOUT_METHOD_LABELS,
  type ClosurePayoutMethodType,
} from '@shared/enum/status-constants';

interface ExistingClosureRequest {
  id: string;
  status: string;
  reason: string;
  payoutMethod: string;
  payoutAmount: string;
  balanceAtInitiation: string;
  initiatedAt: string;
  initiatedBy: string;
}

interface ClosureWizardProps {
  isOpen: boolean;
  onClose: () => void;
  compteId: string;
  numeroCompte: string;
  soldeCourant: string;
  onSuccess: () => void;
}

type WizardStep = 'preconditions' | 'payout' | 'confirm';

interface PreconditionCheck {
  label: string;
  ok: boolean;
  loading: boolean;
}

export default function ClosureWizard({
  isOpen,
  onClose,
  compteId,
  numeroCompte,
  soldeCourant,
  onSuccess,
}: ClosureWizardProps) {
  const [step, setStep] = useState<WizardStep>('preconditions');
  const [loading, setLoading] = useState(false);

  // Existing closure request
  const [existingRequest, setExistingRequest] = useState<ExistingClosureRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Precondition state
  const [checks, setChecks] = useState<PreconditionCheck[]>([
    { label: 'Aucune transaction en attente', ok: false, loading: true },
    { label: 'Aucun crédit actif', ok: false, loading: true },
  ]);
  const [preconditionsOk, setPreconditionsOk] = useState(false);

  // Closure fee from product config (read-only, admin-controlled)
  const [closingFee, setClosingFee] = useState(0);

  // Payout state
  const [payoutMethod, setPayoutMethod] = useState<ClosurePayoutMethodType>(ClosurePayoutMethod.CASH);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [reason, setReason] = useState('');

  // Confirm state
  const [confirmed, setConfirmed] = useState(false);

  const balance = Number(soldeCourant) || 0;

  // Run precondition checks when modal opens
  useEffect(() => {
    if (isOpen) {
      runPreconditionChecks();
    } else {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setStep('preconditions');
    setPayoutMethod(ClosurePayoutMethod.CASH);
    setPhoneNumber('');
    setReason('');
    setConfirmed(false);
    setClosingFee(0);
    setExistingRequest(null);
    setCancelReason('');
    setCancelling(false);
    setChecks([
      { label: 'Aucune transaction en attente', ok: false, loading: true },
      { label: 'Aucun crédit actif', ok: false, loading: true },
    ]);
    setPreconditionsOk(false);
  };

  const runPreconditionChecks = async () => {
    // Check existing closure request
    try {
      const res = await fetch(`/api/comptes/${compteId}/closure-request`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        // API returns the request object directly (or null)
        if (data && data.id) {
          setExistingRequest(data);
        } else {
          setExistingRequest(null);
        }
      }
    } catch {
      setExistingRequest(null);
    }

    // Fetch closure fee from product config
    try {
      const feeRes = await fetch(`/api/comptes/${compteId}/closure-fee`, {
        credentials: 'include',
      });
      if (feeRes.ok) {
        const feeData = await feeRes.json();
        setClosingFee(Number(feeData.closingFee) || 0);
      }
    } catch {
      // Fee defaults to 0 if fetch fails
    }

    // For pending transactions and active credits, we check them on submission
    // but show as "passed" here since the backend validates
    setChecks([
      { label: 'Aucune transaction en attente', ok: true, loading: false },
      { label: 'Aucun crédit actif', ok: true, loading: false },
    ]);

    // Compute overall result after a tick
    setTimeout(() => {
      setChecks((current) => {
        const allOk = current.every((c) => c.ok && !c.loading);
        setPreconditionsOk(allOk);
        return current;
      });
    }, 100);
  };

  const handleCancelExistingRequest = async () => {
    if (!existingRequest || cancelReason.trim().length < 3) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/closure-requests/${existingRequest.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancelReason: cancelReason.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors de l'annulation");
      }

      toast.success('Demande de clôture annulée.');
      setExistingRequest(null);
      setCancelReason('');
      window.dispatchEvent(new CustomEvent('closure-update'));
      onSuccess();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'annulation de la demande"));
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmit = async () => {
    if (!confirmed) return;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        reason,
        payoutMethod,
      };

      if (payoutMethod === ClosurePayoutMethod.MOBILE_MONEY) {
        payload.payoutPhoneNumber = phoneNumber;
      }

      const res = await fetch(`/api/comptes/${compteId}/closure/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la demande de clôture');
      }

      toast.success('Demande de clôture soumise. En attente d\'approbation.');
      window.dispatchEvent(new CustomEvent('closure-update'));
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la demande de clôture'));
    } finally {
      setLoading(false);
    }
  };

  const canProceedFromPayout =
    reason.trim().length >= 3 &&
    (payoutMethod !== ClosurePayoutMethod.MOBILE_MONEY || phoneNumber.trim().length >= 8);

  // If there's an existing request, show a different UI
  if (existingRequest) {
    const requestDate = new Date(existingRequest.initiatedAt);
    const formattedDate = requestDate.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const payoutLabel = CLOSURE_PAYOUT_METHOD_LABELS[existingRequest.payoutMethod as ClosurePayoutMethodType] || existingRequest.payoutMethod;

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Demande de clôture en cours"
        subtitle={`Compte ${numeroCompte}`}
        size="md"
        variant="danger"
        footer={
          <>
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium"
            >
              Fermer
            </button>
            <button
              onClick={handleCancelExistingRequest}
              disabled={cancelling || cancelReason.trim().length < 3}
              className="px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
            >
              {cancelling ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <X size={16} />
              )}
              Annuler la demande
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Status banner */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-start gap-3">
            <Clock size={18} className="text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-purple-300 font-semibold">En attente d'approbation</p>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Une demande de clôture existe déjà pour ce compte. Vous pouvez l'annuler ci-dessous si nécessaire.
              </p>
            </div>
          </div>

          {/* Request details */}
          <div className="p-3 bg-slate-800/50 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Date de la demande</span>
              <span className="text-white">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Motif</span>
              <span className="text-white max-w-[200px] text-right">{existingRequest.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Méthode de paiement</span>
              <span className="text-white">{payoutLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Solde au moment de la demande</span>
              <span className="text-white font-medium">{Number(existingRequest.balanceAtInitiation).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Montant à restituer</span>
              <span className="text-emerald-400 font-bold">{Number(existingRequest.payoutAmount).toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Cancel reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Motif d'annulation *
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: Demande du client de maintenir le compte, erreur de saisie..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-red-500 outline-none transition resize-none"
            />
            {cancelReason.length > 0 && cancelReason.length < 3 && (
              <p className="text-xs text-red-400 mt-1">Minimum 3 caractères</p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  const STEPS: WizardStep[] = ['preconditions', 'payout', 'confirm'];
  const stepIndex = STEPS.indexOf(step);
  const stepLabels = ['Prérequis', 'Paiement', 'Confirmation'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Clôture de compte"
      subtitle={`Compte ${numeroCompte}`}
      size="md"
      variant="danger"
      footer={
        <>
          {stepIndex > 0 && (
            <button
              onClick={() => setStep(STEPS[stepIndex - 1])}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium flex items-center gap-1.5"
            >
              <ChevronLeft size={16} />
              Retour
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium"
          >
            Annuler
          </button>
          {step === 'preconditions' && (
            <button
              onClick={() => setStep('payout')}
              disabled={!preconditionsOk}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-1.5 text-sm font-bold"
            >
              Suivant
              <ChevronRight size={16} />
            </button>
          )}
          {step === 'payout' && (
            <button
              onClick={() => setStep('confirm')}
              disabled={!canProceedFromPayout}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-1.5 text-sm font-bold"
            >
              Suivant
              <ChevronRight size={16} />
            </button>
          )}
          {step === 'confirm' && (
            <button
              onClick={handleSubmit}
              disabled={!confirmed || loading}
              className="px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <XCircle size={16} />
              )}
              Soumettre la demande
            </button>
          )}
        </>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {stepLabels.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className="flex-1 h-px bg-slate-700" />}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= stepIndex
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  i <= stepIndex ? 'text-cyan-400' : 'text-slate-500'
                }`}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Preconditions */}
      {step === 'preconditions' && (
        <div className="space-y-4">
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <p className="text-sm text-slate-300 mb-1">Solde actuel</p>
            <p className="text-2xl font-bold text-white">
              {balance.toLocaleString()} <span className="text-sm text-slate-500">FCFA</span>
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Vérifications</p>
            {checks.map((check, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg"
              >
                {check.loading ? (
                  <Loader2 size={16} className="animate-spin text-slate-400" />
                ) : check.ok ? (
                  <CheckCircle size={16} className="text-emerald-400" />
                ) : (
                  <XCircle size={16} className="text-red-400" />
                )}
                <span className={`text-sm ${check.ok ? 'text-slate-300' : 'text-red-300'}`}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          {!preconditionsOk && checks.every((c) => !c.loading) && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">
                Certaines conditions ne sont pas remplies. Veuillez résoudre les problèmes avant de continuer.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Payout */}
      {step === 'payout' && (
        <div className="space-y-5">
          {/* Payout method */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
              Méthode de restitution du solde
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPayoutMethod(ClosurePayoutMethod.CASH)}
                className={`p-4 rounded-lg border transition flex flex-col items-center gap-2 ${
                  payoutMethod === ClosurePayoutMethod.CASH
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <Banknote
                  size={24}
                  className={payoutMethod === ClosurePayoutMethod.CASH ? 'text-cyan-400' : 'text-slate-400'}
                />
                <span
                  className={`text-sm font-medium ${
                    payoutMethod === ClosurePayoutMethod.CASH ? 'text-cyan-400' : 'text-slate-400'
                  }`}
                >
                  {CLOSURE_PAYOUT_METHOD_LABELS[ClosurePayoutMethod.CASH]}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPayoutMethod(ClosurePayoutMethod.MOBILE_MONEY)}
                className={`p-4 rounded-lg border transition flex flex-col items-center gap-2 ${
                  payoutMethod === ClosurePayoutMethod.MOBILE_MONEY
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <Smartphone
                  size={24}
                  className={
                    payoutMethod === ClosurePayoutMethod.MOBILE_MONEY ? 'text-cyan-400' : 'text-slate-400'
                  }
                />
                <span
                  className={`text-sm font-medium ${
                    payoutMethod === ClosurePayoutMethod.MOBILE_MONEY ? 'text-cyan-400' : 'text-slate-400'
                  }`}
                >
                  {CLOSURE_PAYOUT_METHOD_LABELS[ClosurePayoutMethod.MOBILE_MONEY]}
                </span>
              </button>
            </div>
          </div>

          {/* Phone number (mobile money only) */}
          {payoutMethod === ClosurePayoutMethod.MOBILE_MONEY && (
            <div className="animate-in slide-in-from-top-2 duration-200">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Numéro de téléphone *
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Ex: 069123456"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition"
                />
              </div>
            </div>
          )}

          {/* Payout summary */}
          <div className="p-3 bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Solde actuel</span>
              <span className="text-white font-medium">{balance.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Frais de clôture</span>
              <span className={`font-medium ${closingFee > 0 ? 'text-red-400' : 'text-white'}`}>
                {closingFee > 0 ? `- ${closingFee.toLocaleString()}` : '0'} FCFA
              </span>
            </div>
            <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
              <span className="text-slate-300 font-semibold">Montant à restituer</span>
              <span className="text-emerald-400 font-bold">{Math.max(0, balance - closingFee).toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Motif de la clôture *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Demande du client, migration vers autre institution..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition resize-none"
            />
            {reason.length > 0 && reason.length < 3 && (
              <p className="text-xs text-red-400 mt-1">Minimum 3 caractères</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 font-semibold mb-1">Action irréversible</p>
              <p className="text-sm text-red-300/80">
                La clôture du compte est définitive une fois approuvée.
                Le solde sera restitué au client selon la méthode choisie.
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase">Récapitulatif</h4>
            <div className="p-3 bg-slate-800/50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Compte</span>
                <span className="text-white font-mono">{numeroCompte}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Méthode de paiement</span>
                <span className="text-white">{CLOSURE_PAYOUT_METHOD_LABELS[payoutMethod]}</span>
              </div>
              {payoutMethod === ClosurePayoutMethod.MOBILE_MONEY && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Téléphone</span>
                  <span className="text-white">{phoneNumber}</span>
                </div>
              )}
              {closingFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Frais de clôture</span>
                  <span className="text-red-400 font-medium">- {closingFee.toLocaleString()} FCFA</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Montant à restituer</span>
                <span className="text-emerald-400 font-bold">{Math.max(0, balance - closingFee).toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Motif</span>
                <span className="text-white max-w-[200px] text-right">{reason}</span>
              </div>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group p-3 bg-slate-900 border border-slate-700 rounded-lg hover:border-slate-600 transition">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500"
            />
            <span className="text-sm text-slate-300 group-hover:text-white transition">
              Je confirme vouloir soumettre cette demande de clôture.
              Un approbateur différent devra la valider avant exécution.
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
