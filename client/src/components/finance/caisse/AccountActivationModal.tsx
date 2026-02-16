import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X, Wallet, AlertTriangle, Loader2, UserCheck, Banknote, Building2, Phone, XCircle } from 'lucide-react';
import { compteEpargneApi, paymentsApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { getStatusLabel, ACCOUNT_TYPE_LABELS } from '@/lib/status-labels';
import { v4 as uuidv4 } from 'uuid';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';

interface AccountInfo {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoUrl?: string;
  };
}

interface AccountActivationModalProps {
  account: AccountInfo;
  sessionId: string;
  caisseName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FeeEstimate {
  feeAmount: number;
  feeRate: number;
  feeFixed: number;
  montantBrut: number;
  montantNet: number;
  feeOption: string;
}

type ModePaiement = 'CASH' | 'MTN' | 'AIRTEL' | 'TRANSFER';
type MmStep = 'idle' | 'pending' | 'success' | 'failed' | 'expired';

export function AccountActivationModal({
  account,
  sessionId,
  caisseName,
  onClose,
  onSuccess
}: AccountActivationModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [montant, setMontant] = useState(account.montantInitial.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Idempotency key
  const idempotencyKey = useMemo(() => uuidv4(), []);

  // Payment method state
  const [modePaiement, setModePaiement] = useState<ModePaiement>('CASH');
  const [compteSourceId, setCompteSourceId] = useState('');
  const [clientAccounts, setClientAccounts] = useState<Array<{ id: string; numeroCompte: string; soldeCourant: string; typeCompte: string }>>([]);
  const [transferFetchFailed, setTransferFetchFailed] = useState(false);

  // Mobile Money state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [mmStep, setMmStep] = useState<MmStep>('idle');
  const [mmError, setMmError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentIdRef = useRef<string | null>(null);

  // Feature flags
  const { mobileMoneyEnabled } = useFeatureFlags();

  // Fetch client accounts for internal transfer
  useEffect(() => {
    if (account.client.id) {
      setTransferFetchFailed(false);
      fetch(`/api/clients/${account.client.id}/portfolio`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : { comptes: [] })
        .then(data => {
          const comptes = (data.comptes || []).filter((c: any) =>
            c.id !== account.id &&
            c.statut === 'ACTIVE' &&
            parseFloat(c.soldeCourant || '0') > 0
          );
          setClientAccounts(comptes);
        })
        .catch(() => setTransferFetchFailed(true));
    }
  }, [account.client.id, account.id]);

  const eligibleForTransfer = clientAccounts.length > 0;
  const isMM = modePaiement === 'MTN' || modePaiement === 'AIRTEL';

  // Payment mode labels
  const modeLabels: Record<string, string> = {
    'CASH': 'Espèces',
    'MTN': 'MTN Mobile Money',
    'AIRTEL': 'Airtel Money',
    'TRANSFER': 'Virement Interne',
  };

  // Validate amount
  const parsedMontant = parseFloat(montant);
  const isValidAmount = !isNaN(parsedMontant) && parsedMontant > 0;
  const amountDifference = isValidAmount ? parsedMontant - account.montantInitial : 0;
  const isTransferValid = modePaiement !== 'TRANSFER' || !!compteSourceId;
  const isMmValid = !isMM || (phoneNumber.length >= 8);
  const canSubmit = isValidAmount && isTransferValid && isMmValid && mmStep === 'idle';

  // Fetch MM fee estimate when amount or provider changes
  useEffect(() => {
    if (!isMM || !isValidAmount) {
      setFeeEstimate(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const estimate = await paymentsApi.feeEstimate({
          amount: parsedMontant,
          provider: modePaiement as 'MTN' | 'AIRTEL',
          direction: 'COLLECTION',
          feeOption: 'CLIENT_PAYS',
        });
        setFeeEstimate(estimate);
      } catch {
        setFeeEstimate(null);
      } finally {
        setFeeLoading(false);
      }
    }, 400); // debounce

    return () => clearTimeout(timeout);
  }, [isMM, parsedMontant, modePaiement, isValidAmount]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Handle receipt close
  const handleReceiptClose = useCallback(() => {
    setShowReceipt(false);
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading && mmStep === 'idle') {
      onClose();
    }
  }, [loading, mmStep, onClose]);

  // Handle close button click
  const handleCloseClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading && mmStep !== 'pending') {
      onClose();
    }
  }, [loading, mmStep, onClose]);

  // Invalidate queries after successful payment
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['comptes'] });
    queryClient.invalidateQueries({ queryKey: ['comptes', 'pending-activation'] });
    queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
    queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
  }, [queryClient]);

  // Build receipt data
  const buildReceipt = useCallback((reference: string, totalPaid: number, mmFee?: number): ReceiptData => {
    const items = [
      {
        description: `Dépôt initial - Compte ${account.numeroCompte}`,
        montant: parsedMontant,
        quantite: 1,
      },
    ];
    if (mmFee && mmFee > 0) {
      items.push({
        description: `Frais Mobile Money (${modePaiement})`,
        montant: mmFee,
        quantite: 1,
      });
    }
    return {
      title: 'Activation de Compte',
      reference,
      date: new Date(),
      type: 'Dépôt Initial - Activation',
      client: {
        nom: account.client.nom,
        prenom: account.client.prenom,
      },
      items,
      total: totalPaid,
      modePaiement: modeLabels[modePaiement],
      devise: currencySymbol(),
      notes: `Compte ${getStatusLabel(account.typeCompte, ACCOUNT_TYPE_LABELS)} activé`,
    };
  }, [account, parsedMontant, modePaiement, modeLabels]);

  // Poll for MM payment status
  const startPolling = useCallback((intentId: string) => {
    intentIdRef.current = intentId;
    setMmStep('pending');

    pollingRef.current = setInterval(async () => {
      try {
        const intent = await paymentsApi.getIntent(intentId);
        if (intent.status === 'SUCCESS') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('success');
          invalidateQueries();

          const mmFee = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
          const totalPaid = feeEstimate?.montantBrut || parsedMontant;
          const receipt = buildReceipt(
            intent.providerTxnId || intent.externalRef || `MM-${Date.now()}`,
            totalPaid,
            mmFee,
          );
          setReceiptData(receipt);
          setShowReceipt(true);
          toast.success(`Compte ${account.numeroCompte} activé avec succès !`);
        } else if (intent.status === 'FAILED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('failed');
          setMmError(intent.errorMessage || 'Le paiement a échoué. Veuillez réessayer.');
        } else if (intent.status === 'EXPIRED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('expired');
          setMmError('Le paiement a expiré. Le client n\'a pas confirmé à temps.');
        }
        // PENDING/CREATED → continue polling
      } catch {
        // Network error during poll — keep trying
      }
    }, 3000); // Poll every 3 seconds
  }, [invalidateQueries, feeEstimate, parsedMontant, buildReceipt, account.numeroCompte]);

  // Handle CASH / TRANSFER submit (synchronous via depot-initial)
  const handleSyncSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const backendMode = modePaiement;
      const payload: Record<string, any> = {
        montant: parsedMontant,
        sessionCaisseId: sessionId,
        methodePaiement: backendMode,
        idempotencyKey,
      };
      if (modePaiement === 'TRANSFER') {
        payload.compteSourceId = compteSourceId;
      }

      const response = await compteEpargneApi.depotInitial(account.id, payload);
      invalidateQueries();

      const receipt = buildReceipt(
        response?.facture?.numeroFacture || response?.transaction?.id || `ACT-${Date.now()}`,
        parsedMontant,
      );
      setReceiptData(receipt);
      setShowReceipt(true);
      toast.success(`Compte ${account.numeroCompte} activé avec succès !`);
    } catch (err) {
      const errorMessage = handleApiError(err, 'Erreur lors de l\'activation');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [account, sessionId, parsedMontant, idempotencyKey, modePaiement, compteSourceId, invalidateQueries, buildReceipt]);

  // Handle MM submit (async via /api/payments/collect)
  const handleMmSubmit = useCallback(async () => {
    if (!phoneNumber || phoneNumber.length < 8) {
      setError('Numéro de téléphone invalide');
      return;
    }

    setLoading(true);
    setError(null);
    setMmError(null);

    try {
      const intent = await paymentsApi.collect({
        provider: modePaiement as 'MTN' | 'AIRTEL',
        amount: parsedMontant,
        phone: phoneNumber,
        clientId: account.client.id,
        compteId: account.id,
        description: `Activation compte ${account.numeroCompte}`,
        idempotencyKey,
        feeOption: 'CLIENT_PAYS',
        metadata: {
          purpose: 'ACCOUNT_ACTIVATION',
          accountNumber: account.numeroCompte,
          accountType: account.typeCompte,
        },
      });

      // Start polling for payment status
      startPolling(intent.id);
    } catch (err) {
      const errorMessage = handleApiError(err, 'Erreur lors de l\'initiation du paiement');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, modePaiement, parsedMontant, account, idempotencyKey, startPolling]);

  // Main submit handler
  const handleSubmit = useCallback(async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isValidAmount) {
      setError('Le montant doit être supérieur à 0');
      return;
    }

    if (modePaiement !== 'TRANSFER' && !isMM && !sessionId) {
      setError('Aucune session de caisse active');
      return;
    }

    if (modePaiement === 'TRANSFER' && !compteSourceId) {
      setError('Veuillez sélectionner un compte source pour le virement');
      return;
    }

    if (isMM) {
      await handleMmSubmit();
    } else {
      await handleSyncSubmit();
    }
  }, [isValidAmount, modePaiement, isMM, sessionId, compteSourceId, handleMmSubmit, handleSyncSubmit]);

  // Reset MM state when changing payment mode
  const handleModeChange = useCallback((mode: ModePaiement) => {
    setModePaiement(mode);
    setCompteSourceId('');
    setPhoneNumber('');
    setFeeEstimate(null);
    setError(null);
    setMmError(null);
    setMmStep('idle');
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Reset MM error to retry
  const handleRetry = useCallback(() => {
    setMmStep('idle');
    setMmError(null);
    setError(null);
  }, []);

  // Show receipt modal after success
  if (showReceipt && receiptData) {
    return (
      <UniversalPaymentSuccessModal
        isOpen={true}
        onClose={handleReceiptClose}
        data={receiptData}
      />
    );
  }

  // Payment method button renderer
  const renderPaymentButton = (id: ModePaiement, label: string, color: string, content: React.ReactNode) => {
    const isSelected = modePaiement === id;
    const isMmBtn = id === 'MTN' || id === 'AIRTEL';
    const isTransferDisabled = id === 'TRANSFER' && (!eligibleForTransfer || transferFetchFailed);
    const isDisabled = isTransferDisabled || (isMmBtn && !mobileMoneyEnabled) || mmStep === 'pending';
    const colorMap: Record<string, string> = {
      success: 'border-status-success bg-status-success-bg text-status-success',
      warning: 'border-status-warning bg-status-warning-bg text-status-warning',
      danger: 'border-status-danger bg-status-danger-bg text-status-danger',
      info: 'border-status-info bg-status-info-bg text-status-info',
    };
    return (
      <button
        key={id}
        type="button"
        onClick={() => handleModeChange(id)}
        disabled={isDisabled}
        className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all
          ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed border-edge bg-surface' :
            isSelected ? colorMap[color] : 'border-edge bg-surface text-content-muted hover:border-content-muted'
          }`}
      >
        {content}
        <span className="text-[10px] font-bold leading-tight">{label}</span>
        {isMmBtn && !mobileMoneyEnabled && <span className="text-[7px] text-content-muted">Bientôt</span>}
        {id === 'TRANSFER' && transferFetchFailed && <span className="text-[7px] text-content-muted">Erreur</span>}
        {id === 'TRANSFER' && !transferFetchFailed && !eligibleForTransfer && <span className="text-[7px] text-content-muted">Aucun compte</span>}
      </button>
    );
  };

  // Use Portal to render modal at document body level
  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface-base rounded-2xl max-w-md w-full mx-4 border border-edge shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-warning-bg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">Activation de Compte</h2>
              <p className="text-xs text-content-muted">
                {modePaiement === 'TRANSFER' ? 'Virement du dépôt initial' :
                 isMM ? `Paiement via ${modeLabels[modePaiement]}` :
                 'Encaisser le dépôt initial'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseClick}
            disabled={loading || mmStep === 'pending'}
            className="p-2 text-content-muted hover:text-content-primary rounded-full hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Account Info */}
        <div className="p-4 bg-surface/50 border-b border-edge">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium text-content-primary">
                {account.client.nom} {account.client.prenom}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-content-secondary">
                  {getStatusLabel(account.typeCompte, ACCOUNT_TYPE_LABELS)}
                </span>
                <span className="text-xs text-content-muted font-mono">
                  {account.numeroCompte}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-content-muted">Montant attendu</p>
              <p className="text-lg font-bold text-content-secondary">
                {formatMoney(account.montantInitial)}
              </p>
            </div>
          </div>
        </div>

        {/* MM Pending State — Full overlay */}
        {mmStep === 'pending' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-status-info-bg flex items-center justify-center">
                <img
                  src={modePaiement === 'MTN' ? mtnLogo : airtelLogo}
                  alt={modePaiement}
                  className="w-12 h-12 object-contain rounded-lg"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-base border-2 border-status-info flex items-center justify-center">
                <Loader2 size={14} className="animate-spin text-status-info" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-content-primary">Paiement en cours...</h3>
              <p className="text-sm text-content-muted mt-1">
                Une notification a été envoyée sur le téléphone <strong className="text-content-primary">{phoneNumber}</strong>.
              </p>
              <p className="text-xs text-content-muted mt-2">
                Le client doit confirmer le paiement de <strong className="text-status-info">{formatMoney(feeEstimate?.montantBrut || parsedMontant)}</strong> sur son téléphone.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-content-muted animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              En attente de confirmation...
            </div>
          </div>
        )}

        {/* MM Failed / Expired State */}
        {(mmStep === 'failed' || mmStep === 'expired') && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-status-danger-bg flex items-center justify-center">
              <XCircle size={40} className="text-status-danger" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-content-primary">
                {mmStep === 'failed' ? 'Paiement échoué' : 'Paiement expiré'}
              </h3>
              <p className="text-sm text-content-muted mt-1">{mmError}</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-content-secondary bg-surface hover:bg-surface-elevated rounded-lg font-medium transition-colors"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent text-white rounded-lg font-medium transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Normal Form (only when idle) */}
        {mmStep === 'idle' && (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Amount Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-content-secondary">
                <Banknote size={16} className="text-status-success" />
                Montant à encaisser
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="0"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-surface border border-edge rounded-xl text-content-primary text-lg font-bold placeholder:text-content-muted focus:border-status-success focus:ring-1 focus:ring-status-success transition-colors disabled:opacity-50"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted font-medium">
                  {currencySymbol()}
                </span>
              </div>

              {/* Amount difference indicator */}
              {isValidAmount && amountDifference !== 0 && (
                <div className={`flex items-center gap-2 text-xs ${
                  amountDifference > 0 ? 'text-status-success' : 'text-status-warning'
                }`}>
                  <AlertTriangle size={12} />
                  {amountDifference > 0
                    ? `+${formatMoney(amountDifference)} de plus que prévu`
                    : `${formatMoney(Math.abs(amountDifference))} de moins que prévu`
                  }
                </div>
              )}
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-content-muted uppercase">Mode de Paiement</label>
              <div className="grid grid-cols-4 gap-2">
                {renderPaymentButton('CASH', 'Espèces', 'success',
                  <Banknote size={18} />
                )}
                {renderPaymentButton('MTN', 'MTN MoMo', 'warning',
                  <img src={mtnLogo} alt="MTN" className="w-6 h-6 object-contain rounded" />
                )}
                {renderPaymentButton('AIRTEL', 'Airtel', 'danger',
                  <img src={airtelLogo} alt="Airtel" className="w-6 h-6 object-contain rounded" />
                )}
                {renderPaymentButton('TRANSFER', 'Virement', 'info',
                  <Building2 size={18} />
                )}
              </div>

              {/* Transfer: source account dropdown */}
              {modePaiement === 'TRANSFER' && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <select
                    value={compteSourceId}
                    onChange={(e) => setCompteSourceId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface border border-edge rounded-xl text-sm text-content-primary focus:border-status-info focus:ring-1 focus:ring-status-info"
                  >
                    <option value="">Sélectionner le compte source...</option>
                    {clientAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numeroCompte} — {formatMoney(parseFloat(c.soldeCourant || '0'))}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* MM: Phone number input */}
              {isMM && (
                <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-medium text-content-muted">Numéro de téléphone du client</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={modePaiement === 'MTN' ? '+242 05/06 XX XX XX' : '+242 04 XX XX XX'}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface border border-edge rounded-xl text-sm text-content-primary focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  {/* MM Fee estimate display */}
                  {isValidAmount && (
                    <div className="bg-surface-subtle border border-edge-subtle rounded-xl p-3 space-y-2">
                      {feeLoading ? (
                        <div className="flex items-center gap-2 text-xs text-content-muted">
                          <Loader2 size={12} className="animate-spin" />
                          Calcul des frais...
                        </div>
                      ) : feeEstimate ? (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-content-muted">Montant dépôt</span>
                            <span className="text-content-primary font-medium">{formatMoney(parsedMontant)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-content-muted">Frais {modePaiement} ({feeEstimate.feeRate}%)</span>
                            <span className="text-status-warning font-medium">+{formatMoney(feeEstimate.feeAmount)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-t border-edge-subtle pt-2">
                            <span className="text-content-primary font-semibold">Total débité du téléphone</span>
                            <span className="text-status-danger font-bold">{formatMoney(feeEstimate.montantBrut)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-content-muted">
                          Les frais seront calculés automatiquement
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-status-danger-bg border border-status-danger/30 rounded-xl text-status-danger text-sm">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            {/* Summary */}
            <div className="bg-surface/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-content-muted">Client</span>
                <span className="text-content-primary font-medium">{account.client.nom} {account.client.prenom}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-content-muted">Compte</span>
                <span className="text-content-primary font-mono">{account.numeroCompte}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-content-muted">Mode de paiement</span>
                <span className="text-content-primary font-medium flex items-center gap-1.5">
                  {isMM && (
                    <img
                      src={modePaiement === 'MTN' ? mtnLogo : airtelLogo}
                      alt={modePaiement}
                      className="w-4 h-4 object-contain rounded"
                    />
                  )}
                  {modeLabels[modePaiement]}
                </span>
              </div>
              {modePaiement !== 'TRANSFER' && !isMM && caisseName && (
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Caisse de réception</span>
                  <span className="text-accent font-medium">{caisseName}</span>
                </div>
              )}
              {modePaiement === 'TRANSFER' && compteSourceId && (
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Compte source</span>
                  <span className="text-status-info font-mono text-xs">
                    {clientAccounts.find(c => c.id === compteSourceId)?.numeroCompte || '—'}
                  </span>
                </div>
              )}
              {isMM && phoneNumber && (
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Téléphone</span>
                  <span className="text-content-primary font-mono text-xs">{phoneNumber}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-edge pt-2 mt-2">
                <span className="text-content-muted">
                  {isMM ? 'Montant crédité au compte' : modePaiement === 'TRANSFER' ? 'Montant du virement' : 'Total à encaisser'}
                </span>
                <span className="text-status-success font-bold text-lg">
                  {isValidAmount ? formatMoney(parsedMontant) : '—'}
                </span>
              </div>
              {isMM && feeEstimate && feeEstimate.feeAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-content-muted">Total débité (avec frais MM)</span>
                  <span className="text-status-warning font-bold">{formatMoney(feeEstimate.montantBrut)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseClick}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-content-secondary bg-surface hover:bg-surface-elevated rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={loading || !canSubmit}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit(e);
                }}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
                  isMM
                    ? modePaiement === 'MTN'
                      ? 'bg-status-warning hover:bg-status-warning shadow-status-warning/20'
                      : 'bg-status-danger hover:bg-status-danger shadow-status-danger/20'
                    : 'bg-status-success hover:bg-status-success shadow-status-success/20'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {isMM ? 'Envoi...' : 'Activation...'}
                  </>
                ) : (
                  <>
                    {isMM ? (
                      <img
                        src={modePaiement === 'MTN' ? mtnLogo : airtelLogo}
                        alt={modePaiement}
                        className="w-5 h-5 object-contain mr-2 rounded"
                      />
                    ) : (
                      <Wallet className="w-4 h-4 mr-2" />
                    )}
                    {modePaiement === 'TRANSFER' ? 'Virer & Activer' :
                     isMM ? `Payer via ${modePaiement}` :
                     'Encaisser & Activer'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
