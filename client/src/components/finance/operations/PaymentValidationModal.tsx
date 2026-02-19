import React, { useState } from 'react';
import { X, Smartphone, Phone, Hash, CheckCircle, Banknote, Wallet } from 'lucide-react';
import { toast } from '../../../lib/toast';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-status-warning-bg0', textColor: 'text-status-warning', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-status-danger', textColor: 'text-status-danger', prefix: '+242 04' }
];

const BILLETS_FCFA = [10000, 5000, 2000, 1000, 500];

interface PaymentValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: (paymentRef: string, operator?: string) => void;
  montant: number;
  type: 'mobile_money' | 'especes';
  loading?: boolean;
  initialOperator?: string;
}

export default function PaymentValidationModal({
  isOpen,
  onClose,
  onValidate,
  montant,
  type,
  loading = false,
  initialOperator = ''
}: PaymentValidationModalProps) {
  const [selectedOperator, setSelectedOperator] = useState<string>(initialOperator);
  
  React.useEffect(() => {
    if (isOpen && initialOperator) {
      setSelectedOperator(initialOperator);
    }
  }, [isOpen, initialOperator]);
  const [mobileMoneyData, setMobileMoneyData] = useState({
    numero_telephone: '',
    numero_transaction: '',
    code_otp: ''
  });
  const [caisseData, setCaisseData] = useState({
    reference_recu: '',
    billets: {} as Record<string, number>
  });

  const calculateTotalBillets = () => {
    return Object.entries(caisseData.billets).reduce((total, [billet, count]) => {
      return total + (parseInt(billet) * (count || 0));
    }, 0);
  };

  const handleMobileMoneyValidation = () => {
    if (!mobileMoneyData.numero_telephone || !mobileMoneyData.numero_transaction) {
      toast.warning('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (!selectedOperator) {
      toast.warning('Veuillez sélectionner un opérateur');
      return;
    }

    const paymentRef = `MM-${selectedOperator.toUpperCase()}-${mobileMoneyData.numero_transaction}`;
    onValidate(paymentRef, selectedOperator);
  };

  const handleCaisseValidation = () => {
    const totalBillets = calculateTotalBillets();

    if (totalBillets !== montant) {
      toast.warning(`Le total des billets (${totalBillets.toLocaleString()} FCFA) ne correspond pas au montant attendu (${montant.toLocaleString()} FCFA)`);
      return;
    }

    const paymentRef = `CAISSE-${Date.now()}-${caisseData.reference_recu || 'SANS-REF'}`;
    onValidate(paymentRef);
  };

  const resetState = () => {
    setSelectedOperator('');
    setMobileMoneyData({ numero_telephone: '', numero_transaction: '', code_otp: '' });
    setCaisseData({ reference_recu: '', billets: {} });
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  if (type === 'mobile_money') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
        <div className="bg-surface rounded-xl border border-edge w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className={`border-b border-edge p-4 flex justify-between items-center ${
            selectedOperator === 'mtn' ? 'bg-status-warning-bg' : selectedOperator === 'airtel' ? 'bg-status-danger-bg' : 'bg-surface-elevated/50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${
                selectedOperator === 'mtn' ? 'bg-status-warning-bg0' : selectedOperator === 'airtel' ? 'bg-status-danger' : 'bg-surface-subtle'
              } flex items-center justify-center`}>
                <Smartphone className="text-content-primary" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-content-primary">Validation Mobile Money</h3>
                <p className="text-sm text-content-muted">
                  {selectedOperator ? MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.name : 'Sélectionnez un opérateur'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-content-muted hover:text-content-primary p-2 rounded-lg hover:bg-surface-elevated"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-surface-elevated/50 rounded-lg p-3 text-center">
              <p className="text-sm text-content-muted">Montant à recevoir</p>
              <p className="text-2xl font-bold text-status-success">
                {montant.toLocaleString()} FCFA
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <Smartphone size={16} className="inline mr-2" />
                Sélectionner l'opérateur *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_OPERATORS.map(op => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOperator(op.id)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition ${
                      selectedOperator === op.id
                        ? `${op.color} border-white text-content-primary`
                        : 'bg-surface-elevated border-edge-strong text-content-secondary hover:border-edge-strong'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full ${selectedOperator === op.id ? 'bg-white/20' : op.color} flex items-center justify-center`}>
                      <Smartphone size={16} className="text-content-primary" />
                    </div>
                    <div className="text-left text-xs">
                      <p className="font-semibold">{op.name.split(' ')[0]}</p>
                      <p className="opacity-75">{op.prefix}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <Phone size={16} className="inline mr-2" />
                Numéro de téléphone *
              </label>
              <input
                type="tel"
                value={mobileMoneyData.numero_telephone}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_telephone: e.target.value })}
                className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
                placeholder={MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.prefix || '+242 XX XXX XXXX'}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                <Hash size={16} className="inline mr-2" />
                Numéro de transaction *
              </label>
              <input
                type="text"
                value={mobileMoneyData.numero_transaction}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_transaction: e.target.value })}
                className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
                placeholder="Ex: TXN123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                Code OTP (optionnel)
              </label>
              <input
                type="text"
                value={mobileMoneyData.code_otp}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, code_otp: e.target.value })}
                className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary text-center text-xl tracking-widest"
                placeholder="• • • • • •"
                maxLength={6}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleMobileMoneyValidation}
                disabled={loading || !selectedOperator}
                className={`flex-1 px-4 py-3 ${
                  selectedOperator === 'mtn' ? 'bg-status-warning-bg0 hover:bg-status-warning' : 
                  selectedOperator === 'airtel' ? 'bg-status-danger hover:bg-status-danger' :
                  'bg-status-info hover:bg-status-info'
                } text-content-primary rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <CheckCircle size={20} />
                    Valider
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-surface rounded-xl border border-edge w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="border-b border-edge p-4 flex justify-between items-center bg-status-success-bg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-success flex items-center justify-center">
              <Wallet className="text-content-primary" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-content-primary">Validation Caisse</h3>
              <p className="text-sm text-content-muted">Comptage des billets</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-content-muted hover:text-content-primary p-2 rounded-lg hover:bg-surface-elevated"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-surface-elevated/50 rounded-lg p-3 text-center">
            <p className="text-sm text-content-muted">Montant attendu</p>
            <p className="text-2xl font-bold text-status-success">
              {montant.toLocaleString()} FCFA
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              <Banknote size={16} className="inline mr-2" />
              Comptage des billets
            </label>
            <div className="space-y-2">
              {BILLETS_FCFA.map(billet => (
                <div key={billet} className="flex items-center gap-3 bg-surface-elevated/50 rounded-lg p-2">
                  <div className="w-20 text-right">
                    <span className="text-content-primary font-semibold">{billet.toLocaleString()}</span>
                    <span className="text-content-muted text-sm ml-1">FC</span>
                  </div>
                  <span className="text-content-muted">×</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={caisseData.billets[billet] || ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setCaisseData({
                      ...caisseData,
                      billets: { ...caisseData.billets, [billet]: v ? parseInt(v) : 0 }
                    }); }}
                    className="w-20 bg-surface-subtle border border-edge-strong rounded px-3 py-2 text-content-primary text-center"
                    placeholder="0"
                  />
                  <span className="text-content-muted">=</span>
                  <span className="text-status-success font-semibold flex-1 text-right">
                    {((caisseData.billets[billet] || 0) * billet).toLocaleString()} FCFA
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-lg p-3 border-2 ${
            calculateTotalBillets() === montant
              ? 'bg-status-success-bg border-status-success'
              : calculateTotalBillets() > 0
                ? 'bg-status-warning-bg border-status-warning'
                : 'bg-surface-elevated/50 border-edge-strong'
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-content-secondary font-semibold">Total compté</span>
              <span className={`text-2xl font-bold ${
                calculateTotalBillets() === montant
                  ? 'text-status-success'
                  : 'text-status-warning'
              }`}>
                {calculateTotalBillets().toLocaleString()} FCFA
              </span>
            </div>
            {calculateTotalBillets() > 0 && calculateTotalBillets() !== montant && (
              <p className="text-status-warning text-sm mt-1">
                Différence: {(calculateTotalBillets() - montant).toLocaleString()} FCFA
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Numéro de reçu (optionnel)
            </label>
            <input
              type="text"
              value={caisseData.reference_recu}
              onChange={(e) => setCaisseData({ ...caisseData, reference_recu: e.target.value })}
              className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary"
              placeholder="Ex: REC-2024-001"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCaisseValidation}
              disabled={loading || calculateTotalBillets() !== montant}
              className="flex-1 px-4 py-3 bg-status-success hover:bg-status-success text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <CheckCircle size={20} />
                  Valider le paiement
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { MOBILE_OPERATORS, BILLETS_FCFA };
