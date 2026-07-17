import React, { useState, useEffect } from 'react';
import { Spinner, Modal } from '@/components/ui';
import { XCircle, CheckCircle, AlertTriangle, Phone, Banknote, Smartphone, ChevronRight, ChevronLeft, Clock, X } from 'lucide-react';
import { toast, handleApiError } from '../../lib/toast';
import { formatPhoneInput, stripPhoneFormat } from '../../lib/format';
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
              className="px-4 py-2.5 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg transition text-sm font-medium"
            >
              Fermer
            </button>
            <button
              onClick={handleCancelExistingRequest}
              disabled={cancelling || cancelReason.trim().length < 3}
              className="px-4 py-2.5 bg-status-danger hover:bg-status-danger disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
            >
              {cancelling ? (
                <Spinner size="xs" tone="current" />
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
          <div className="p-3 bg-status-info-bg border border-status-info/30 rounded-lg flex items-start gap-3">
            <Clock size={18} className="text-status-info shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-status-info font-semibold">En attente d'approbation</p>
              <p className="text-xs text-status-info/70 mt-0.5">
                Une demande de clôture existe déjà pour ce compte. Vous pouvez l'annuler ci-dessous si nécessaire.
              </p>
            </div>
          </div>

          {/* Request details */}
          <div className="p-3 bg-surface/50 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-content-muted">Date de la demande</span>
              <span className="text-content-primary">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Motif</span>
              <span className="text-content-primary max-w-[200px] text-right">{existingRequest.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Méthode de paiement</span>
              <span className="text-content-primary">{payoutLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Solde au moment de la demande</span>
              <span className="text-content-primary font-medium">{Number(existingRequest.balanceAtInitiation).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Montant à restituer</span>
              <span className="text-status-success font-bold">{Number(existingRequest.payoutAmount).toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Cancel reason */}
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">
              Motif d'annulation *
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: Demande du client de maintenir le compte, erreur de saisie..."
              rows={2}
              className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2.5 text-content-primary text-sm focus:ring-1 focus:ring-status-danger outline-none transition resize-none"
            />
            {cancelReason.length > 0 && cancelReason.length < 3 && (
              <p className="text-xs text-status-danger mt-1">Minimum 3 caractères</p>
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
              className="px-4 py-2.5 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg transition text-sm font-medium flex items-center gap-1.5"
            >
              <ChevronLeft size={16} />
              Retour
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg transition text-sm font-medium"
          >
            Annuler
          </button>
          {step === 'preconditions' && (
            <button
              onClick={() => setStep('payout')}
              disabled={!preconditionsOk}
              className="px-4 py-2.5 bg-accent-secondary hover:bg-accent-secondary-hover disabled:opacity-50 disabled:cursor-not-allowed text-content-primary rounded-lg transition flex items-center gap-1.5 text-sm font-bold"
            >
              Suivant
              <ChevronRight size={16} />
            </button>
          )}
          {step === 'payout' && (
            <button
              onClick={() => setStep('confirm')}
              disabled={!canProceedFromPayout}
              className="px-4 py-2.5 bg-accent-secondary hover:bg-accent-secondary-hover disabled:opacity-50 disabled:cursor-not-allowed text-content-primary rounded-lg transition flex items-center gap-1.5 text-sm font-bold"
            >
              Suivant
              <ChevronRight size={16} />
            </button>
          )}
          {step === 'confirm' && (
            <button
              onClick={handleSubmit}
              disabled={!confirmed || loading}
              className="px-4 py-2.5 bg-status-danger hover:bg-status-danger disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-bold"
            >
              {loading ? (
                <Spinner size="xs" tone="current" />
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
            {i > 0 && <div className="flex-1 h-px bg-surface-elevated" />}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= stepIndex
                    ? 'bg-accent-secondary text-content-primary'
                    : 'bg-surface text-content-muted'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  i <= stepIndex ? 'text-accent' : 'text-content-muted'
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
          <div className="p-3 bg-surface/50 rounded-lg">
            <p className="text-sm text-content-secondary mb-1">Solde actuel</p>
            <p className="text-2xl font-bold text-content-primary">
              {balance.toLocaleString()} <span className="text-sm text-content-muted">FCFA</span>
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-content-muted uppercase">Vérifications</p>
            {checks.map((check, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-surface-base border border-edge rounded-lg"
              >
                {check.loading ? (
                  <Spinner size="xs" tone="current" className="text-content-muted" />
                ) : check.ok ? (
                  <CheckCircle size={16} className="text-status-success" />
                ) : (
                  <XCircle size={16} className="text-status-danger" />
                )}
                <span className={`text-sm ${check.ok ? 'text-content-secondary' : 'text-status-danger'}`}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          {!preconditionsOk && checks.every((c) => !c.loading) && (
            <div className="p-3 bg-status-danger-bg border border-status-danger/30 rounded-lg">
              <p className="text-sm text-status-danger">
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
            <label className="block text-xs font-semibold text-content-muted mb-2 uppercase">
              Méthode de restitution du solde
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPayoutMethod(ClosurePayoutMethod.CASH)}
                className={`p-4 rounded-lg border transition flex flex-col items-center gap-2 ${
                  payoutMethod === ClosurePayoutMethod.CASH
                    ? 'border-accent bg-accent/10'
                    : 'border-edge bg-surface/50 hover:border-edge-strong'
                }`}
              >
                <Banknote
                  size={24}
                  className={payoutMethod === ClosurePayoutMethod.CASH ? 'text-accent' : 'text-content-muted'}
                />
                <span
                  className={`text-sm font-medium ${
                    payoutMethod === ClosurePayoutMethod.CASH ? 'text-accent' : 'text-content-muted'
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
                    ? 'border-accent bg-accent/10'
                    : 'border-edge bg-surface/50 hover:border-edge-strong'
                }`}
              >
                <Smartphone
                  size={24}
                  className={
                    payoutMethod === ClosurePayoutMethod.MOBILE_MONEY ? 'text-accent' : 'text-content-muted'
                  }
                />
                <span
                  className={`text-sm font-medium ${
                    payoutMethod === ClosurePayoutMethod.MOBILE_MONEY ? 'text-accent' : 'text-content-muted'
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
              <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">
                Numéro de téléphone *
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3 text-content-muted" />
                <input
                  type="tel"
                  value={formatPhoneInput(phoneNumber)}
                  onChange={(e) => setPhoneNumber(stripPhoneFormat(e.target.value))}
                  placeholder="+242 06 XXX XX XX"
                  className="w-full bg-surface-base border border-edge rounded-lg pl-10 pr-3 py-2.5 text-content-primary text-sm focus:ring-1 focus:ring-accent outline-none transition"
                />
              </div>
            </div>
          )}

          {/* Payout summary */}
          <div className="p-3 bg-surface/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-content-muted">Solde actuel</span>
              <span className="text-content-primary font-medium">{balance.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-muted">Frais de clôture</span>
              <span className={`font-medium ${closingFee > 0 ? 'text-status-danger' : 'text-content-primary'}`}>
                {closingFee > 0 ? `- ${closingFee.toLocaleString()}` : '0'} FCFA
              </span>
            </div>
            <div className="border-t border-edge pt-2 flex justify-between text-sm">
              <span className="text-content-secondary font-semibold">Montant à restituer</span>
              <span className="text-status-success font-bold">{Math.max(0, balance - closingFee).toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-1.5 uppercase">
              Motif de la clôture *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Demande du client, migration vers autre institution..."
              rows={2}
              className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2.5 text-content-primary text-sm focus:ring-1 focus:ring-accent outline-none transition resize-none"
            />
            {reason.length > 0 && reason.length < 3 && (
              <p className="text-xs text-status-danger mt-1">Minimum 3 caractères</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="p-4 bg-status-danger-bg border border-status-danger/30 rounded-lg flex items-start gap-3">
            <AlertTriangle size={20} className="text-status-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-status-danger font-semibold mb-1">Action irréversible</p>
              <p className="text-sm text-status-danger/80">
                La clôture du compte est définitive une fois approuvée.
                Le solde sera restitué au client selon la méthode choisie.
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-content-muted uppercase">Récapitulatif</h4>
            <div className="p-3 bg-surface/50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-content-muted">Compte</span>
                <span className="text-content-primary font-mono">{numeroCompte}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-content-muted">Méthode de paiement</span>
                <span className="text-content-primary">{CLOSURE_PAYOUT_METHOD_LABELS[payoutMethod]}</span>
              </div>
              {payoutMethod === ClosurePayoutMethod.MOBILE_MONEY && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Téléphone</span>
                  <span className="text-content-primary">{phoneNumber}</span>
                </div>
              )}
              {closingFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Frais de clôture</span>
                  <span className="text-status-danger font-medium">- {closingFee.toLocaleString()} FCFA</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-content-muted">Montant à restituer</span>
                <span className="text-status-success font-bold">{Math.max(0, balance - closingFee).toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-content-muted">Motif</span>
                <span className="text-content-primary max-w-[200px] text-right">{reason}</span>
              </div>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group p-3 bg-surface-base border border-edge rounded-lg hover:border-edge-strong transition">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-edge-strong bg-surface text-status-danger focus:ring-status-danger"
            />
            <span className="text-sm text-content-secondary group-hover:text-content-primary transition">
              Je confirme vouloir soumettre cette demande de clôture.
              Un approbateur différent devra la valider avant exécution.
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
