import React, { useState, useCallback, useMemo } from 'react';
import { X, DollarSign, FileText, AlertCircle, TrendingUp, TrendingDown, Smartphone, Banknote, FileCheck, Building, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import PaymentValidationModal from '../operations/PaymentValidationModal';
import { StatutCompte } from '@shared/enum/status-constants';

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
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', prefix: '+242 04' }
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');

  // Detect if this is a PENDING_ACTIVATION account (initial deposit)
  const isPendingActivation = compte.statut === StatutCompte.PENDING_ACTIVATION;
  const pendingDepositAmount = isPendingActivation ? (compte.solde ?? 0) : 0;
  // For pending accounts, actual balance is 0
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

      // Single atomic call via ledger-backed endpoint
      if (isPendingActivation && type === 'Dépôt') {
        await compteEpargneApi.depotInitial(compte.id, {
          montant: montantNum,
          sessionCaisseId: undefined, // Backend will auto-resolve from user session
        });
        toast.success(`Compte activé ! Dépôt de ${formatMoney(montantNum)} encaissé avec succès`);
      } else if (type === 'Dépôt') {
        await compteEpargneApi.depot(compte.id, {
          montant: montantNum,
          methodePaiement: formData.mode_paiement,
          observations,
        });
        toast.success(`${type} de ${formatMoney(montantNum)} effectué avec succès`);
      } else {
        await compteEpargneApi.retrait(compte.id, {
          montant: montantNum,
          methodePaiement: formData.mode_paiement,
          observations,
        });
        toast.success(`${type} de ${formatMoney(montantNum)} effectué avec succès`);
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
  }, [compte, type, montantNum, isPendingActivation, formData, selectedOperator, onSuccess]);

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
  const headerBgClass = isInitialDeposit ? 'bg-amber-500/10' : (isDeposit ? 'bg-green-500/10' : 'bg-blue-500/10');
  const IconComponent = isInitialDeposit ? Banknote : (isDeposit ? TrendingUp : TrendingDown);
  const iconColorClass = isInitialDeposit ? 'text-amber-400' : (isDeposit ? 'text-green-400' : 'text-blue-400');
  const buttonColorClass = isInitialDeposit ? 'bg-amber-600 hover:bg-amber-700' : (isDeposit ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700');

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
      >
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg my-8">
          {/* Header */}
          <div className={`border-b border-slate-700 p-6 flex justify-between items-center sticky top-0 z-10 rounded-t-xl ${headerBgClass}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDeposit ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>
                <IconComponent className={iconColorClass} size={24} aria-hidden="true" />
              </div>
              <div>
                <h2 id="transaction-form-title" className="text-2xl font-bold text-white">
                  {isInitialDeposit ? 'Encaissement Initial' : type}
                </h2>
                <p className="text-slate-400 text-sm">{safeNumeroCompte}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded-lg p-2"
              type="button"
              aria-label="Fermer"
              disabled={loading}
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* General Error */}
            {errors.general && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-3" role="alert">
                <AlertCircle className="text-red-400 flex-shrink-0" size={20} aria-hidden="true" />
                <span className="text-red-400">{errors.general}</span>
              </div>
            )}

            {/* Pending Activation Alert */}
            {isPendingActivation && type === 'Dépôt' && (
              <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4 flex items-start gap-3" role="alert">
                <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} aria-hidden="true" />
                <div>
                  <p className="text-amber-400 font-semibold">Encaissement du dépôt initial</p>
                  <p className="text-amber-300/80 text-sm mt-1">
                    Ce compte est en attente d'activation. Encaissez le montant prévu ({formatMoney(pendingDepositAmount)}) pour activer le compte.
                  </p>
                </div>
              </div>
            )}

            {/* Account Info */}
            <div className="bg-slate-700/50 rounded-lg p-4" role="region" aria-label="Informations du compte">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Client</span>
                <span className="text-white font-semibold">{safeClientName}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Type de compte</span>
                <span className="text-white">{getTypeCompteLabel((compte.typeCompte || compte.type_compte) as string)}</span>
              </div>
              {isPendingActivation ? (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-400 text-sm">Solde réel actuel</span>
                    <span className="text-xl font-bold text-slate-500">0 FCFA</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-600 pt-2 mt-2">
                    <span className="text-amber-400 text-sm font-medium">Montant à encaisser</span>
                    <span className="text-2xl font-bold text-amber-400">{formatMoney(pendingDepositAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Solde actuel</span>
                  <span className="text-2xl font-bold text-green-400">{formatMoney(actualBalance)}</span>
                </div>
              )}
            </div>

            {/* Payment Mode Selection */}
            <fieldset>
              <legend className="block text-sm font-semibold text-slate-300 mb-2">
                Mode de Paiement <span className="text-red-400">*</span>
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Sélectionner le mode de paiement">
                {PAYMENT_MODES.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={formData.mode_paiement === id}
                    onClick={() => handleModeChange(id)}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formData.mode_paiement === id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
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
                <legend className="block text-sm font-semibold text-slate-300 mb-2">
                  <Smartphone size={16} className="inline mr-2" aria-hidden="true" />
                  Sélectionner l'opérateur <span className="text-red-400">*</span>
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
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selectedOperator === op.id
                          ? `${op.color} border-white text-white`
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className={`w-8 h-8 rounded-full ${selectedOperator === op.id ? 'bg-white/20' : op.color} flex items-center justify-center`}>
                        <Smartphone size={16} className="text-white" aria-hidden="true" />
                      </div>
                      <div className="text-left text-xs">
                        <p className="font-semibold">{op.name.split(' ')[0]}</p>
                        <p className="opacity-75">{op.prefix}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {errors.operateur && (
                  <p className="text-red-400 text-sm mt-1" role="alert">{errors.operateur}</p>
                )}
              </fieldset>
            )}

            {/* Amount Input */}
            <div>
              <label htmlFor="montant" className="block text-sm font-semibold text-slate-300 mb-2">
                <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                Montant (FCFA) <span className="text-red-400">*</span>
              </label>
              <input
                id="montant"
                type="number"
                inputMode="numeric"
                value={formData.montant}
                onChange={(e) => handleInputChange('montant', e.target.value)}
                className={`w-full bg-slate-700 border ${errors.montant ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="0"
                autoFocus
                disabled={loading}
                min="100"
                max={type === 'Retrait' ? actualBalance : (isPendingActivation ? pendingDepositAmount : VALIDATION_LIMITS.MAX_EPARGNE)}
                aria-invalid={!!errors.montant}
                aria-describedby={errors.montant ? 'montant-error' : type === 'Retrait' ? 'montant-help' : undefined}
              />
              {errors.montant && (
                <p id="montant-error" className="text-red-400 text-sm mt-1" role="alert">{errors.montant}</p>
              )}
              {type === 'Retrait' && !errors.montant && (
                <p id="montant-help" className="text-xs text-slate-400 mt-1">
                  Maximum disponible: {formatMoney(actualBalance)}
                </p>
              )}
              {isPendingActivation && type === 'Dépôt' && !errors.montant && (
                <p className="text-xs text-amber-400 mt-1">
                  Montant prévu pour activation: {formatMoney(pendingDepositAmount)}
                </p>
              )}
            </div>

            {/* New Balance Preview */}
            {montantNum > 0 && (
              <div
                className={`p-4 rounded-lg border ${
                  isDeposit ? 'bg-green-500/10 border-green-500/50' : 'bg-blue-500/10 border-blue-500/50'
                }`}
                role="region"
                aria-label="Aperçu du nouveau solde"
                aria-live="polite"
              >
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Nouveau solde</span>
                  <span className={`text-2xl font-bold ${isDeposit ? 'text-green-400' : 'text-emerald-400'}`}>
                    {formatMoney(nouveauSolde)}
                  </span>
                </div>
              </div>
            )}

            {/* Reference Field for Check/Transfer */}
            {(formData.mode_paiement === 'CHECK' || formData.mode_paiement === 'TRANSFER') && (
              <div>
                <label htmlFor="reference" className="block text-sm font-semibold text-slate-300 mb-2">
                  Référence
                </label>
                <input
                  id="reference"
                  type="text"
                  value={formData.reference}
                  onChange={(e) => handleInputChange('reference', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="N° chèque, référence virement..."
                  disabled={loading}
                  maxLength={100}
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-slate-300 mb-2">
                <FileText size={16} className="inline mr-2" aria-hidden="true" />
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || montantNum <= 0}
                className={`flex-1 px-6 py-3 ${buttonColorClass} text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-2`}
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
