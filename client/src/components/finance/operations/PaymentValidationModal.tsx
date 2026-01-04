import React, { useState } from 'react';
import { X, Smartphone, Phone, Hash, CheckCircle, Banknote, Wallet } from 'lucide-react';
import { toast } from '../../../lib/toast';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', textColor: 'text-yellow-500', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', textColor: 'text-red-500', prefix: '+242 04' }
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
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className={`border-b border-slate-700 p-4 flex justify-between items-center ${
            selectedOperator === 'mtn' ? 'bg-yellow-500/20' : selectedOperator === 'airtel' ? 'bg-red-500/20' : 'bg-slate-700/50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${
                selectedOperator === 'mtn' ? 'bg-yellow-500' : selectedOperator === 'airtel' ? 'bg-red-500' : 'bg-slate-600'
              } flex items-center justify-center`}>
                <Smartphone className="text-white" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Validation Mobile Money</h3>
                <p className="text-sm text-slate-400">
                  {selectedOperator ? MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.name : 'Sélectionnez un opérateur'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-sm text-slate-400">Montant à recevoir</p>
              <p className="text-2xl font-bold text-green-400">
                {montant.toLocaleString()} FCFA
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
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
                        ? `${op.color} border-white text-white`
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full ${selectedOperator === op.id ? 'bg-white/20' : op.color} flex items-center justify-center`}>
                      <Smartphone size={16} className="text-white" />
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
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Phone size={16} className="inline mr-2" />
                Numéro de téléphone *
              </label>
              <input
                type="tel"
                value={mobileMoneyData.numero_telephone}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_telephone: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                placeholder={MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.prefix || '+242 XX XXX XXXX'}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Hash size={16} className="inline mr-2" />
                Numéro de transaction *
              </label>
              <input
                type="text"
                value={mobileMoneyData.numero_transaction}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_transaction: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                placeholder="Ex: TXN123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Code OTP (optionnel)
              </label>
              <input
                type="text"
                value={mobileMoneyData.code_otp}
                onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, code_otp: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white text-center text-xl tracking-widest"
                placeholder="• • • • • •"
                maxLength={6}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleMobileMoneyValidation}
                disabled={loading || !selectedOperator}
                className={`flex-1 px-4 py-3 ${
                  selectedOperator === 'mtn' ? 'bg-yellow-500 hover:bg-yellow-600' : 
                  selectedOperator === 'airtel' ? 'bg-red-500 hover:bg-red-600' :
                  'bg-blue-500 hover:bg-blue-600'
                } text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2`}
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
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-700 p-4 flex justify-between items-center bg-green-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
              <Wallet className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Validation Caisse</h3>
              <p className="text-sm text-slate-400">Comptage des billets</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-sm text-slate-400">Montant attendu</p>
            <p className="text-2xl font-bold text-green-400">
              {montant.toLocaleString()} FCFA
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <Banknote size={16} className="inline mr-2" />
              Comptage des billets
            </label>
            <div className="space-y-2">
              {BILLETS_FCFA.map(billet => (
                <div key={billet} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-2">
                  <div className="w-20 text-right">
                    <span className="text-white font-semibold">{billet.toLocaleString()}</span>
                    <span className="text-slate-400 text-sm ml-1">FC</span>
                  </div>
                  <span className="text-slate-400">×</span>
                  <input
                    type="number"
                    min="0"
                    value={caisseData.billets[billet] || ''}
                    onChange={(e) => setCaisseData({
                      ...caisseData,
                      billets: { ...caisseData.billets, [billet]: parseInt(e.target.value) || 0 }
                    })}
                    className="w-20 bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-center"
                    placeholder="0"
                  />
                  <span className="text-slate-400">=</span>
                  <span className="text-green-400 font-semibold flex-1 text-right">
                    {((caisseData.billets[billet] || 0) * billet).toLocaleString()} FCFA
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-lg p-3 border-2 ${
            calculateTotalBillets() === montant
              ? 'bg-green-500/20 border-green-500'
              : calculateTotalBillets() > 0
                ? 'bg-orange-500/20 border-orange-500'
                : 'bg-slate-700/50 border-slate-600'
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Total compté</span>
              <span className={`text-2xl font-bold ${
                calculateTotalBillets() === montant
                  ? 'text-green-400'
                  : 'text-orange-400'
              }`}>
                {calculateTotalBillets().toLocaleString()} FCFA
              </span>
            </div>
            {calculateTotalBillets() > 0 && calculateTotalBillets() !== montant && (
              <p className="text-orange-400 text-sm mt-1">
                Différence: {(calculateTotalBillets() - montant).toLocaleString()} FCFA
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Numéro de reçu (optionnel)
            </label>
            <input
              type="text"
              value={caisseData.reference_recu}
              onChange={(e) => setCaisseData({ ...caisseData, reference_recu: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
              placeholder="Ex: REC-2024-001"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCaisseValidation}
              disabled={loading || calculateTotalBillets() !== montant}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
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
