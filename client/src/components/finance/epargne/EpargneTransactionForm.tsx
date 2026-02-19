import React, { useState, useCallback, useMemo } from 'react';
import { X, DollarSign, FileText, AlertCircle, TrendingUp, TrendingDown, Smartphone, Banknote, FileCheck, Building, Loader2, AlertTriangle, CheckCircle, WifiOff } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import PaymentValidationModal from '../operations/PaymentValidationModal';
import { StatutCompte } from '@shared/enum/status-constants';
import { useNetworkStatus } from '../../../contexts/NetworkContext';
import { executeOfflineOperation } from '../../../lib/offline-treasury';
import { useUserProfile } from '../../../hooks/useUserProfile';

// Mapping EN -> FR pour les types de compte
const TYPE_COMPTE_LABELS: Record<string, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
};

const getTypeCompteLabel = (type: string): string => {
  return TYPE_COMPTE_LABELS[type] || type;
};

interface Compte {
  id: string;
  numeroCompte?: string;
  numero_compte?: string;
  typeCompte?: string;
  type_compte?: string;
  solde: number;
  statut?: string;
  clients: {
    nom: string;
    id: string;
  };
}

interface EpargneTransactionFormProps {
  compte: Compte;
  type: 'Dépôt' | 'Retrait';
  onClose: () => void;
  onSuccess: () => void;
}

type ModePaiement = 'CASH' | 'MOBILE_MONEY' | 'CHECK' | 'TRANSFER';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-status-warning-bg0', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-status-danger', prefix: '+242 04' }
] as const;

const PAYMENT_MODES: { id: ModePaiement; icon: typeof Banknote; label: string }[] = [
  { id: 'CASH', icon: Banknote, label: 'Espèces' },
  { id: 'MOBILE_MONEY', icon: Smartphone, label: 'Mobile Money' },
  { id: 'CHECK', icon: FileCheck, label: 'Chèque' },
  { id: 'TRANSFER', icon: Building, label: 'Virement' },
];

export default function EpargneTransactionForm({ compte, type, onClose, onSuccess }: EpargneTransactionFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const networkStatus = useNetworkStatus();
  const { user } = useUserProfile();
  const isOffline = networkStatus === 'offline' || networkStatus === 'api_down';
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');

  // Detect if this is a pending-payment account (initial deposit)
  const isPendingActivation = [
    StatutCompte.PENDING_ACTIVATION,
    StatutCompte.PENDING_PAYMENT,
    StatutCompte.PENDING_PAYMENT_AND_APPROVAL,
  ].includes(compte.statut as any);
  const pendingDepositAmount = isPendingActivation ? (compte.solde ?? 0) : 0;
  // For pending-payment accounts, actual balance is 0
  const actualBalance = isPendingActivation ? 0 : (compte.solde ?? 0);

  const [formData, setFormData] = useState({
    // Pre-fill amount for pending activation deposits
    montant: isPendingActivation && type === 'Dépôt' ? String(pendingDepositAmount) : '',
    reference: '',
    description: isPendingActivation ? 'Encaissement du dépôt initial' : '',
    mode_paiement: 'CASH' as ModePaiement
  });

  const [selectedOperator, setSelectedOperator] = useState('');

  // Memoized calculations
  const montantNum = useMemo(() => parseFloat(formData.montant) || 0, [formData.montant]);
  const nouveauSolde = useMemo(() => {
    // For pending activation, start from 0
    return actualBalance + (type === 'Dépôt' ? 1 : -1) * montantNum;
  }, [actualBalance, type, montantNum]);

  // Safe escaped values
  const safeClientName = useMemo(() => escapeHtml(compte.clients.nom), [compte.clients.nom]);
  const safeNumeroCompte = useMemo(() => escapeHtml(compte.numeroCompte), [compte.numeroCompte]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    // Validate amount
    const amountValidation = validateAmount(montantNum, {
      min: 100,
      max: VALIDATION_LIMITS.MAX_EPARGNE,
    });

    if (!amountValidation.isValid) {
      newErrors.montant = amountValidation.error || 'Montant invalide';
    }

    // Check balance for withdrawal
    if (type === 'Retrait' && montantNum > actualBalance) {
      newErrors.montant = `Solde insuffisant. Maximum disponible: ${formatMoney(actualBalance)}`;
    }

    // For pending activation, amount must match or be less than pending deposit
    if (isPendingActivation && type === 'Dépôt' && montantNum !== pendingDepositAmount) {
      // Allow partial deposit or exact amount
      if (montantNum > pendingDepositAmount) {
        newErrors.montant = `Le montant ne peut pas dépasser le dépôt initial prévu: ${formatMoney(pendingDepositAmount)}`;
      }
    }

    // Validate operator for mobile money deposits
    if (formData.mode_paiement === 'MOBILE_MONEY' && !selectedOperator && type === 'Dépôt') {
      newErrors.operateur = 'Veuillez sélectionner un opérateur';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [montantNum, type, compte.solde, formData.mode_paiement, selectedOperator]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.warning('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    // Show payment validation modal for deposits with cash or mobile money
    if (type === 'Dépôt' && montantNum > 0) {
      if (formData.mode_paiement === 'MOBILE_MONEY') {
        setPaymentModalType('mobile_money');
        setShowPaymentModal(true);
        return;
      } else if (formData.mode_paiement === 'CASH') {
        setPaymentModalType('especes');
        setShowPaymentModal(true);
        return;
      }
    }

    await processTransaction();
  }, [validate, type, montantNum, formData.mode_paiement]);

  const processTransaction = useCallback(async (paymentRef?: string, operator?: string) => {
    setLoading(true);

    try {
      // Sanitize user inputs for observations
      const sanitizedReference = sanitizeInput(paymentRef || formData.reference);
      const sanitizedDescription = sanitizeInput(formData.description) ||
        (isPendingActivation
          ? `Encaissement dépôt initial: ${montantNum.toLocaleString('fr-FR')} FCFA`
          : `${type} de ${montantNum.toLocaleString('fr-FR')} FCFA via ${formData.mode_paiement}`);

      const operatorInfo = (operator || selectedOperator) ? `Opérateur: ${operator || selectedOperator}` : '';
      const observations = [sanitizedDescription, sanitizedReference, operatorInfo].filter(Boolean).join(' - ');

      // === OFFLINE FALLBACK (cash operations only, non-activation) ===
      if (isOffline && formData.mode_paiement === 'CASH' && !isPendingActivation && user?.id) {
        const journalType = type === 'Dépôt' ? 'DEPOSIT' : 'WITHDRAWAL';
        const result = await executeOfflineOperation({
          type: journalType as any,
          amount: montantNum,
          agentId: parseInt(user.id, 10),
          agenceId: user.agenceId || '',
          payload: {
            compteId: compte.id,
            clientId: compte.clients.id,
            montant: montantNum,
            methodePaiement: 'CASH',
            observations,
          },
        });

        toast.success(
          `${type} de ${formatMoney(montantNum)} enregistré hors ligne (réf: ${result.operationRef})`
        );
        onSuccess();
        return;
      }

      // === ONLINE PATH (standard behavior) ===
      if (isPendingActivation && type === 'Dépôt') {
        await compteEpargneApi.depotInitial(compte.id, {
          montant: montantNum,
          sessionCaisseId: undefined, // Backend will auto-resolve from user session
        });
        toast.success(`Compte activé — dépôt de ${formatMoney(montantNum)} encaissé`);
      } else if (type === 'Dépôt') {
        await compteEpargneApi.depot(compte.id, {
          montant: montantNum,
          methodePaiement: formData.mode_paiement,
          observations,
        });
        toast.success(`${type} de ${formatMoney(montantNum)} effectué`);
      } else {
        await compteEpargneApi.retrait(compte.id, {
          montant: montantNum,
          methodePaiement: formData.mode_paiement,
          observations,
        });
        toast.success(`${type} de ${formatMoney(montantNum)} effectué`);
      }

      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, `Erreur lors du ${type.toLowerCase()}`);
      toast.error(errorMessage);
      setErrors({ general: errorMessage });
    } finally {
      setLoading(false);
      setShowPaymentModal(false);
    }
  }, [compte, type, montantNum, isPendingActivation, formData, selectedOperator, onSuccess, isOffline, user]);

  const handlePaymentValidation = useCallback((paymentRef: string, operator?: string) => {
    processTransaction(paymentRef, operator);
  }, [processTransaction]);

  const handleModeChange = useCallback((mode: ModePaiement) => {
    setFormData(prev => ({ ...prev, mode_paiement: mode }));
    // Reset operator when changing mode
    if (mode !== 'MOBILE_MONEY') {
      setSelectedOperator('');
    }
  }, []);

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const isDeposit = type === 'Dépôt';
  const isInitialDeposit = isPendingActivation && isDeposit;
  const headerBgClass = isInitialDeposit ? 'bg-status-warning-bg' : (isDeposit ? 'bg-status-success-bg' : 'bg-status-info-bg');
  const IconComponent = isInitialDeposit ? Banknote : (isDeposit ? TrendingUp : TrendingDown);
  const iconColorClass = isInitialDeposit ? 'text-status-warning' : (isDeposit ? 'text-status-success' : 'text-status-info');
  const buttonColorClass = isInitialDeposit ? 'bg-status-warning hover:bg-status-warning' : (isDeposit ? 'bg-status-success hover:bg-status-success' : 'bg-status-info hover:bg-status-info');

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
      >
        <div className="bg-surface rounded-xl border border-edge w-full max-w-lg my-8">
          {/* Header */}
          <div className={`border-b border-edge p-6 flex justify-between items-center sticky top-0 z-10 rounded-t-xl ${headerBgClass}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDeposit ? 'bg-status-success-bg' : 'bg-status-info-bg'}`}>
                <IconComponent className={iconColorClass} size={24} aria-hidden="true" />
              </div>
              <div>
                <h2 id="transaction-form-title" className="text-2xl font-bold text-content-primary">
                  {isInitialDeposit ? 'Encaissement Initial' : type}
                </h2>
                <p className="text-content-muted text-sm">{safeNumeroCompte}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-content-muted hover:text-content-primary transition-colors hover:bg-surface-elevated rounded-lg p-2"
              type="button"
              aria-label="Fermer"
              disabled={loading}
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Offline Indicator */}
            {isOffline && (
              <div className="bg-status-warning-bg border border-status-warning/50 rounded-lg p-3 flex items-center gap-3" role="status">
                <WifiOff className="text-status-warning flex-shrink-0" size={18} aria-hidden="true" />
                <span className="text-status-warning text-sm">
                  Mode hors ligne — {formData.mode_paiement === 'CASH'
                    ? 'Les opérations en espèces seront synchronisées automatiquement.'
                    : 'Seules les opérations en espèces sont disponibles hors ligne.'}
                </span>
              </div>
            )}

            {/* General Error */}
            {errors.general && (
              <div className="bg-status-danger-bg border border-status-danger rounded-lg p-4 flex items-center gap-3" role="alert">
                <AlertCircle className="text-status-danger flex-shrink-0" size={20} aria-hidden="true" />
                <span className="text-status-danger">{errors.general}</span>
              </div>
            )}

            {/* Pending Activation Alert */}
            {isPendingActivation && type === 'Dépôt' && (
              <div className="bg-status-warning-bg border border-status-warning/50 rounded-lg p-4 flex items-start gap-3" role="alert">
                <AlertTriangle className="text-status-warning flex-shrink-0 mt-0.5" size={20} aria-hidden="true" />
                <div>
                  <p className="text-status-warning font-semibold">Encaissement du dépôt initial</p>
                  <p className="text-status-warning/80 text-sm mt-1">
                    Ce compte est en attente d'activation. Encaissez le montant prévu ({formatMoney(pendingDepositAmount)}) pour activer le compte.
                  </p>
                </div>
              </div>
            )}

            {/* Account Info */}
            <div className="bg-surface-elevated/50 rounded-lg p-4" role="region" aria-label="Informations du compte">
              <div className="flex justify-between items-center mb-2">
                <span className="text-content-muted text-sm">Client</span>
                <span className="text-content-primary font-semibold">{safeClientName}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-content-muted text-sm">Type de compte</span>
                <span className="text-content-primary">{getTypeCompteLabel((compte.typeCompte || compte.type_compte) as string)}</span>
              </div>
              {isPendingActivation ? (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-content-muted text-sm">Solde réel actuel</span>
                    <span className="text-xl font-bold text-content-muted">0 FCFA</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-edge-strong pt-2 mt-2">
                    <span className="text-status-warning text-sm font-medium">Montant à encaisser</span>
                    <span className="text-2xl font-bold text-status-warning">{formatMoney(pendingDepositAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-content-muted text-sm">Solde actuel</span>
                  <span className="text-2xl font-bold text-status-success">{formatMoney(actualBalance)}</span>
                </div>
              )}
            </div>

            {/* Payment Mode Selection */}
            <fieldset>
              <legend className="block text-sm font-semibold text-content-secondary mb-2">
                Mode de Paiement <span className="text-status-danger">*</span>
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Sélectionner le mode de paiement">
                {PAYMENT_MODES.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={formData.mode_paiement === id}
                    onClick={() => handleModeChange(id)}
                    disabled={loading || (isOffline && id !== 'CASH')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-status-info ${
                      formData.mode_paiement === id
                        ? 'bg-status-info border-status-info text-white'
                        : 'bg-surface-elevated border-edge-strong text-content-secondary hover:bg-surface-subtle'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Icon size={20} className="mb-1" aria-hidden="true" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Mobile Operator Selection */}
            {formData.mode_paiement === 'MOBILE_MONEY' && type === 'Dépôt' && (
              <fieldset>
                <legend className="block text-sm font-semibold text-content-secondary mb-2">
                  <Smartphone size={16} className="inline mr-2" aria-hidden="true" />
                  Sélectionner l'opérateur <span className="text-status-danger">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sélectionner l'opérateur mobile">
                  {MOBILE_OPERATORS.map(op => (
                    <button
                      key={op.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedOperator === op.id}
                      onClick={() => setSelectedOperator(op.id)}
                      disabled={loading}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-status-info ${
                        selectedOperator === op.id
                          ? `${op.color} border-white text-content-primary`
                          : 'bg-surface-elevated border-edge-strong text-content-secondary hover:border-edge-strong'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className={`w-8 h-8 rounded-full ${selectedOperator === op.id ? 'bg-white/20' : op.color} flex items-center justify-center`}>
                        <Smartphone size={16} className="text-content-primary" aria-hidden="true" />
                      </div>
                      <div className="text-left text-xs">
                        <p className="font-semibold">{op.name.split(' ')[0]}</p>
                        <p className="opacity-75">{op.prefix}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {errors.operateur && (
                  <p className="text-status-danger text-sm mt-1" role="alert">{errors.operateur}</p>
                )}
              </fieldset>
            )}

            {/* Amount Input */}
            <div>
              <label htmlFor="montant" className="block text-sm font-semibold text-content-secondary mb-2">
                <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                Montant (FCFA) <span className="text-status-danger">*</span>
              </label>
              <input
                id="montant"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.montant}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleInputChange('montant', v); }}
                className={`w-full bg-surface-elevated border ${errors.montant ? 'border-status-danger' : 'border-edge-strong'} rounded-lg px-4 py-3 text-content-primary text-lg focus:outline-none focus:ring-2 focus:ring-status-info`}
                placeholder="0"
                autoFocus
                disabled={loading}
                aria-invalid={!!errors.montant}
                aria-describedby={errors.montant ? 'montant-error' : type === 'Retrait' ? 'montant-help' : undefined}
              />
              {errors.montant && (
                <p id="montant-error" className="text-status-danger text-sm mt-1" role="alert">{errors.montant}</p>
              )}
              {type === 'Retrait' && !errors.montant && (
                <p id="montant-help" className="text-xs text-content-muted mt-1">
                  Maximum disponible: {formatMoney(actualBalance)}
                </p>
              )}
              {isPendingActivation && type === 'Dépôt' && !errors.montant && (
                <p className="text-xs text-status-warning mt-1">
                  Montant prévu pour activation: {formatMoney(pendingDepositAmount)}
                </p>
              )}
            </div>

            {/* New Balance Preview */}
            {montantNum > 0 && (
              <div
                className={`p-4 rounded-lg border ${
                  isDeposit ? 'bg-status-success-bg border-status-success/50' : 'bg-status-info-bg border-status-info/50'
                }`}
                role="region"
                aria-label="Aperçu du nouveau solde"
                aria-live="polite"
              >
                <div className="flex justify-between items-center">
                  <span className="text-content-secondary">Nouveau solde</span>
                  <span className={`text-2xl font-bold ${isDeposit ? 'text-status-success' : 'text-status-success'}`}>
                    {formatMoney(nouveauSolde)}
                  </span>
                </div>
              </div>
            )}

            {/* Reference Field for Check/Transfer */}
            {(formData.mode_paiement === 'CHECK' || formData.mode_paiement === 'TRANSFER') && (
              <div>
                <label htmlFor="reference" className="block text-sm font-semibold text-content-secondary mb-2">
                  Référence
                </label>
                <input
                  id="reference"
                  type="text"
                  value={formData.reference}
                  onChange={(e) => handleInputChange('reference', e.target.value)}
                  className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:ring-2 focus:ring-status-info"
                  placeholder="N° chèque, référence virement..."
                  disabled={loading}
                  maxLength={100}
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-content-secondary mb-2">
                <FileText size={16} className="inline mr-2" aria-hidden="true" />
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:ring-2 focus:ring-status-info"
                rows={2}
                placeholder="Notes additionnelles..."
                disabled={loading}
                maxLength={500}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-edge-strong"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || montantNum <= 0 || (isOffline && formData.mode_paiement !== 'CASH')}
                className={`flex-1 px-6 py-3 ${buttonColorClass} text-content-primary rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-status-info flex items-center justify-center gap-2`}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    Traitement...
                  </>
                ) : isPendingActivation && type === 'Dépôt' ? (
                  <>
                    <CheckCircle size={18} aria-hidden="true" />
                    Encaisser et Activer le compte
                  </>
                ) : (
                  `Confirmer ${type}`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Payment Validation Modal */}
      <PaymentValidationModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onValidate={handlePaymentValidation}
        montant={montantNum}
        type={paymentModalType}
        loading={loading}
        initialOperator={selectedOperator}
      />
    </>
  );
}
