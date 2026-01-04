import React, { useState, useCallback, useMemo } from 'react';
import { X, DollarSign, FileText, AlertCircle, TrendingUp, TrendingDown, Smartphone, Banknote, FileCheck, Building, Loader2 } from 'lucide-react';
import { transactionEpargneApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import PaymentValidationModal from '../operations/PaymentValidationModal';

interface Compte {
  id: string;
  numero_compte: string;
  type_compte: string;
  solde: number;
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

type ModePaiement = 'Espèces' | 'Mobile Money' | 'Chèque' | 'Virement';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', prefix: '+242 04' }
] as const;

const PAYMENT_MODES: { id: ModePaiement; icon: typeof Banknote; label: string }[] = [
  { id: 'Espèces', icon: Banknote, label: 'Espèces' },
  { id: 'Mobile Money', icon: Smartphone, label: 'Mobile Money' },
  { id: 'Chèque', icon: FileCheck, label: 'Chèque' },
  { id: 'Virement', icon: Building, label: 'Virement' },
];

export default function EpargneTransactionForm({ compte, type, onClose, onSuccess }: EpargneTransactionFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');

  const [formData, setFormData] = useState({
    montant: '',
    reference: '',
    description: '',
    mode_paiement: 'Espèces' as ModePaiement
  });

  const [selectedOperator, setSelectedOperator] = useState('');

  // Memoized calculations
  const montantNum = useMemo(() => parseFloat(formData.montant) || 0, [formData.montant]);
  const nouveauSolde = useMemo(() => {
    return compte.solde + (type === 'Dépôt' ? 1 : -1) * montantNum;
  }, [compte.solde, type, montantNum]);

  // Safe escaped values
  const safeClientName = useMemo(() => escapeHtml(compte.clients.nom), [compte.clients.nom]);
  const safeNumeroCompte = useMemo(() => escapeHtml(compte.numero_compte), [compte.numero_compte]);

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
    if (type === 'Retrait' && montantNum > compte.solde) {
      newErrors.montant = `Solde insuffisant. Maximum disponible: ${formatMoney(compte.solde)}`;
    }

    // Validate operator for mobile money deposits
    if (formData.mode_paiement === 'Mobile Money' && !selectedOperator && type === 'Dépôt') {
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
      if (formData.mode_paiement === 'Mobile Money') {
        setPaymentModalType('mobile_money');
        setShowPaymentModal(true);
        return;
      } else if (formData.mode_paiement === 'Espèces') {
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
      const montantTransaction = type === 'Retrait' ? -montantNum : montantNum;
      const calculatedNouveauSolde = compte.solde + montantTransaction;

      // Sanitize user inputs
      const sanitizedReference = sanitizeInput(paymentRef || formData.reference);
      const sanitizedDescription = sanitizeInput(formData.description) ||
        `${type} de ${montantNum.toLocaleString('fr-FR')} FCFA via ${formData.mode_paiement}`;

      await transactionEpargneApi.create({
        compte_id: compte.id,
        type_transaction: type,
        montant: montantTransaction,
        solde_avant: compte.solde,
        solde_apres: calculatedNouveauSolde,
        reference: sanitizedReference,
        mode_paiement: formData.mode_paiement,
        operateur_mobile: operator || selectedOperator || null,
        description: sanitizedDescription
      });

      await compteEpargneApi.update(compte.id, { solde: calculatedNouveauSolde });

      toast.success(`${type} de ${formatMoney(montantNum)} effectué avec succès`);
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, `Erreur lors du ${type.toLowerCase()}`);
      toast.error(errorMessage);
      setErrors({ general: errorMessage });
    } finally {
      setLoading(false);
      setShowPaymentModal(false);
    }
  }, [compte, type, montantNum, formData, selectedOperator, onSuccess]);

  const handlePaymentValidation = useCallback((paymentRef: string, operator?: string) => {
    processTransaction(paymentRef, operator);
  }, [processTransaction]);

  const handleModeChange = useCallback((mode: ModePaiement) => {
    setFormData(prev => ({ ...prev, mode_paiement: mode }));
    // Reset operator when changing mode
    if (mode !== 'Mobile Money') {
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
  const headerBgClass = isDeposit ? 'bg-green-500/10' : 'bg-blue-500/10';
  const IconComponent = isDeposit ? TrendingUp : TrendingDown;
  const iconColorClass = isDeposit ? 'text-green-400' : 'text-blue-400';
  const buttonColorClass = isDeposit ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700';

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
                <h2 id="transaction-form-title" className="text-2xl font-bold text-white">{type}</h2>
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

            {/* Account Info */}
            <div className="bg-slate-700/50 rounded-lg p-4" role="region" aria-label="Informations du compte">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Client</span>
                <span className="text-white font-semibold">{safeClientName}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Type de compte</span>
                <span className="text-white">{compte.type_compte}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Solde actuel</span>
                <span className="text-2xl font-bold text-green-400">{formatMoney(compte.solde)}</span>
              </div>
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
            {formData.mode_paiement === 'Mobile Money' && type === 'Dépôt' && (
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
                max={type === 'Retrait' ? compte.solde : VALIDATION_LIMITS.MAX_EPARGNE}
                aria-invalid={!!errors.montant}
                aria-describedby={errors.montant ? 'montant-error' : type === 'Retrait' ? 'montant-help' : undefined}
              />
              {errors.montant && (
                <p id="montant-error" className="text-red-400 text-sm mt-1" role="alert">{errors.montant}</p>
              )}
              {type === 'Retrait' && !errors.montant && (
                <p id="montant-help" className="text-xs text-slate-400 mt-1">
                  Maximum disponible: {formatMoney(compte.solde)}
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
            {(formData.mode_paiement === 'Chèque' || formData.mode_paiement === 'Virement') && (
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
