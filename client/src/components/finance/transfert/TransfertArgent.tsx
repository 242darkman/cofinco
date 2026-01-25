import React, { useState } from 'react';
import { 
  Send, Globe, MapPin, Users, Calculator, CreditCard, Banknote, 
  Clock, CheckCircle2, AlertCircle, ArrowRight, Building2, Smartphone,
  X, Search, Star, Shield, Zap, TrendingDown, Wallet, History,
  FileText, Phone, Mail, User, ChevronRight, RefreshCw, Landmark, 
  DollarSign, Euro, Coins, Earth, AlertTriangle
} from 'lucide-react';
import { Button, Card, Badge, TabGroup, StatCard, Modal, ResponsiveTable, FormField, SelectField } from '../../ui';
import TransactionFlow from './TransactionFlow';

import airtelMoneyLogo from '../../../assets/logos/airtel-money.png';
import mtnMomoLogo from '../../../assets/logos/mtn-momo.png';
import orangeMoneyLogo from '../../../assets/logos/orange-money.png';
import mpesaLogo from '../../../assets/logos/mpesa.png';
import waveLogo from '../../../assets/logos/wave.png';

interface TransferFormData {
  type: 'local' | 'international';
  senderName: string;
  senderPhone: string;
  senderIdNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientCountry: string;
  recipientCity: string;
  amount: string;
  currency: string;
  paymentMethod: 'cash' | 'mobile_money' | 'bank';
  deliveryMethod: 'cash_pickup' | 'mobile_money' | 'bank_deposit';
  purpose: string;
}

const countries = [
  { code: 'CG', name: 'Congo (Brazzaville)', currency: 'XAF', flag: '🇨🇬' },
  { code: 'CD', name: 'RD Congo', currency: 'CDF', flag: '🇨🇩' },
  { code: 'CM', name: 'Cameroun', currency: 'XAF', flag: '🇨🇲' },
  { code: 'GA', name: 'Gabon', currency: 'XAF', flag: '🇬🇦' },
  { code: 'CF', name: 'Centrafrique', currency: 'XAF', flag: '🇨🇫' },
  { code: 'TD', name: 'Tchad', currency: 'XAF', flag: '🇹🇩' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF', flag: '🇸🇳' },
  { code: 'CI', name: 'Côte d\'Ivoire', currency: 'XOF', flag: '🇨🇮' },
  { code: 'ML', name: 'Mali', currency: 'XOF', flag: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', currency: 'XOF', flag: '🇧🇫' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', currency: 'KES', flag: '🇰🇪' },
  { code: 'ZA', name: 'Afrique du Sud', currency: 'ZAR', flag: '🇿🇦' },
  { code: 'MA', name: 'Maroc', currency: 'MAD', flag: '🇲🇦' },
  { code: 'FR', name: 'France', currency: 'EUR', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', currency: 'EUR', flag: '🇧🇪' },
  { code: 'US', name: 'États-Unis', currency: 'USD', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', currency: 'CAD', flag: '🇨🇦' },
  { code: 'GB', name: 'Royaume-Uni', currency: 'GBP', flag: '🇬🇧' },
  { code: 'CN', name: 'Chine', currency: 'CNY', flag: '🇨🇳' },
  { code: 'AE', name: 'Émirats Arabes Unis', currency: 'AED', flag: '🇦🇪' }
];

const exchangeRates: Record<string, number> = {
  'XAF': 1,
  'XOF': 1,
  'EUR': 0.00152,
  'USD': 0.00167,
  'GBP': 0.00131,
  'CDF': 4.15,
  'NGN': 2.68,
  'GHS': 0.021,
  'KES': 0.23,
  'ZAR': 0.031,
  'MAD': 0.017,
  'CAD': 0.0023,
  'CNY': 0.0121,
  'AED': 0.0061
};

const feeStructure = {
  local: {
    cash: { fixed: 500, percentage: 0.5 },
    mobile_money: { fixed: 200, percentage: 0.3 },
    bank: { fixed: 1000, percentage: 0.8 }
  },
  international: {
    africa: { fixed: 2500, percentage: 1.5 },
    europe: { fixed: 5000, percentage: 2.0 },
    america: { fixed: 6000, percentage: 2.5 },
    asia: { fixed: 7000, percentage: 3.0 }
  }
};

function TransferCalculator({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('100000');
  const [fromCurrency, setFromCurrency] = useState('XAF');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [transferType, setTransferType] = useState<'local' | 'international'>('international');

  const calculateFees = () => {
    const amt = parseFloat(amount) || 0;
    if (transferType === 'local') {
      const fee = feeStructure.local.mobile_money; // Assuming best rate for calculator
      return fee.fixed + (amt * fee.percentage / 100);
    } else {
      const region = ['EUR', 'GBP'].includes(toCurrency) ? 'europe' : 
                     ['USD', 'CAD'].includes(toCurrency) ? 'america' :
                     ['CNY', 'AED'].includes(toCurrency) ? 'asia' : 'africa';
      const fee = feeStructure.international[region];
      return fee.fixed + (amt * fee.percentage / 100);
    }
  };

  const fees = calculateFees();
  const rate = exchangeRates[toCurrency] / exchangeRates[fromCurrency];
  const amountToSend = parseFloat(amount) || 0;
  const receivedAmount = (amountToSend - fees) * rate;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Calculateur"
      size="sm"
    >
      <div className="space-y-4 pt-1">
        {/* Toggle Type */}
        <div className="bg-slate-900/50 p-1 rounded-lg flex text-xs font-medium">
          <button
            onClick={() => setTransferType('local')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${transferType === 'local' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <MapPin size={12} /> Local
          </button>
          <button
            onClick={() => setTransferType('international')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${transferType === 'international' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Globe size={12} /> International
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Montant à envoyer</label>
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-white font-bold text-lg outline-none placeholder:text-slate-600"
              placeholder="0"
            />
            <div className="bg-slate-700 px-3 py-2 flex items-center justify-center border-l border-slate-600">
              <span className="text-xs font-bold text-white">{fromCurrency}</span>
            </div>
          </div>
        </div>

        {/* Destination (Conditional) */}
        {transferType === 'international' && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
             <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Pays de réception</label>
            <div className="relative">
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-white text-sm outline-none focus:border-blue-500 appearance-none transition-colors cursor-pointer hover:bg-slate-700/80"
              >
                {countries.map(c => (
                  <option key={c.code} value={c.currency}>{c.name} ({c.currency})</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                 {countries.find(c => c.currency === toCurrency)?.flag}
              </div>
               <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90" size={14} />
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Montant envoyé</span>
            <span className="text-white font-medium">{amountToSend.toLocaleString()} {fromCurrency}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Frais estimés</span>
            <span className="text-amber-400 font-medium">- {fees.toLocaleString()} {fromCurrency}</span>
          </div>
          {transferType === 'international' && (
             <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Taux</span>
              <span className="text-cyan-400 font-medium">1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}</span>
            </div>
          )}
          
          <div className="border-t border-slate-800/50 pt-2 mt-1">
             <div className="flex justify-between items-end">
              <span className="text-slate-400 text-[10px] pb-0.5">Le bénéficiaire reçoit</span>
              <span className="text-emerald-400 text-lg font-bold tracking-tight">
                {receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs font-normal opacity-80">{transferType === 'local' ? fromCurrency : toCurrency}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2 flex items-center gap-2 justify-center">
             <TrendingDown size={12} className="text-emerald-500" />
             <span className="text-[10px] text-emerald-400/90">
               Économie estimée: <strong>~{Math.round(fees * 0.4).toLocaleString()} {fromCurrency}</strong>
             </span>
        </div>
      </div>
    </Modal>
  );
}

function NewTransferModal({ onClose, type }: { onClose: () => void; type: 'local' | 'international' }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<TransferFormData>({
    type,
    senderName: '',
    senderPhone: '',
    senderIdNumber: '',
    recipientName: '',
    recipientPhone: '',
    recipientCountry: 'CD',
    recipientCity: '',
    amount: '',
    currency: 'XAF',
    paymentMethod: 'cash',
    deliveryMethod: 'cash_pickup',
    purpose: 'family_support'
  });
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedCountry = countries.find(c => c.code === formData.recipientCountry);
  const rate = selectedCountry ? exchangeRates[selectedCountry.currency] / exchangeRates['XAF'] : 1;
  const amount = parseFloat(formData.amount) || 0;
  
  const calculateFees = () => {
    if (type === 'local') {
      const feeType = formData.paymentMethod as keyof typeof feeStructure.local;
      const fee = feeStructure.local[feeType];
      return fee.fixed + (amount * fee.percentage / 100);
    } else {
      const region = ['FR', 'BE', 'GB'].includes(formData.recipientCountry) ? 'europe' :
                     ['US', 'CA'].includes(formData.recipientCountry) ? 'america' :
                     ['CN', 'AE'].includes(formData.recipientCountry) ? 'asia' : 'africa';
      const fee = feeStructure.international[region];
      return fee.fixed + (amount * fee.percentage / 100);
    }
  };

  const fees = calculateFees();
  const receivedAmount = (amount - fees) * rate;

  const handleSubmit = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setSuccess(true);
    }, 2000);
  };

  const transactionCode = `TRF${Date.now().toString(36).toUpperCase()}`;

  const renderContent = () => {
    if (success) {
      return (
        <div className="p-4 sm:p-8 text-center flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="text-emerald-400" size={32} />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Transfert Initié!</h3>
            <p className="text-slate-400 mb-6 text-sm">Votre transfert a été enregistré avec succès.</p>
            
            <div className="bg-slate-800 rounded-xl p-4 w-full max-w-xs mx-auto mb-6 border border-slate-700">
              <p className="text-slate-500 text-xs">Code de transaction</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-emerald-400 tracking-wider">{transactionCode}</p>
            </div>

            <div className="w-full space-y-2 text-xs sm:text-sm text-slate-400 mb-8 bg-slate-900/50 p-4 rounded-lg">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span>Bénéficiaire</span>
                    <strong className="text-white">{formData.recipientName}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span>Montant Reçu</span>
                    <strong className="text-white">{receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedCountry?.currency || 'XAF'}</strong>
                </div>
                <div className="flex justify-between">
                    <span>Mode</span>
                    <strong className="text-white">{formData.deliveryMethod === 'mobile_money' ? 'Mobile Money' : 'Espèces'}</strong>
                </div>
            </div>
        </div>
      );
    }

    return (
        <div className="space-y-6">
            {/* Stepper */}
            <div className="flex items-center gap-2 mb-4">
              {[1, 2, 3].map(s => (
                <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-emerald-500' : 'bg-slate-800'}`} />
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 gap-4">
                  <FormField 
                    name="senderName"
                    label="Nom complet de l'expéditeur" 
                    required
                    type="text"
                    className="bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50 placeholder:text-slate-600"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                    placeholder="Jean Makaya"
                  />
                  <FormField 
                    name="senderPhone"
                    label="Téléphone" 
                    required
                    type="tel"
                    className="bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50 placeholder:text-slate-600"
                    value={formData.senderPhone}
                    onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                    placeholder="+242 06..."
                  />
                   <FormField 
                     name="senderIdNumber"
                     label="Numéro de pièce d'identité" 
                     required
                     type="text"
                     className="bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50 placeholder:text-slate-600"
                     value={formData.senderIdNumber}
                     onChange={(e) => setFormData({ ...formData, senderIdNumber: e.target.value })}
                     placeholder="CNI..."
                   />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="grid grid-cols-1 gap-4">
                  <FormField 
                    name="recipientName"
                    label="Nom complet du bénéficiaire" 
                    required
                    type="text"
                    className="bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50 placeholder:text-slate-600"
                    value={formData.recipientName}
                    onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                    placeholder="Marie Ngouabi"
                  />
                  
                  {type === 'international' && (
                     <SelectField
                        name="recipientCountry"
                        label="Pays de destination"
                        value={formData.recipientCountry}
                        onChange={(e) => setFormData({ ...formData, recipientCountry: e.target.value })}
                        options={countries.filter(c => c.code !== 'CG').map(c => ({ value: c.code, label: `${c.flag} ${c.name}` }))}
                     />
                  )}

                  <FormField 
                    name="recipientPhone"
                    label="Téléphone du bénéficiaire" 
                    required
                    type="tel"
                    className="bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50 placeholder:text-slate-600"
                    value={formData.recipientPhone}
                    onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                    placeholder="+243..."
                  />

                   <SelectField
                        name="deliveryMethod"
                        label="Mode de réception"
                        value={formData.deliveryMethod}
                        onChange={(e) => setFormData({ ...formData, deliveryMethod: e.target.value as any })}
                        options={[
                            { value: 'cash_pickup', label: 'Retrait en espèces' },
                            { value: 'mobile_money', label: 'Mobile Money' },
                            { value: 'bank_deposit', label: 'Virement Bancaire' }
                        ]}
                   />
                </div>
              </div>
            )}

            {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Montant à envoyer (XAF)</label>
                        <input 
                            type="number"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-3xl font-bold text-white text-center focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-800"
                            placeholder="0"
                            autoFocus
                        />
                    </div>

                    <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-slate-700/50">
                        <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Frais COFIN</span>
                        <span className="text-amber-400 font-bold">- {fees.toLocaleString()} XAF</span>
                        </div>
                        {type === 'international' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Taux</span>
                            <span className="text-cyan-400 font-bold">1 XAF = {rate.toFixed(4)} {selectedCountry?.currency}</span>
                        </div>
                        )}
                        <div className="border-t border-slate-700 pt-3 flex justify-between items-end">
                            <span className="text-slate-300 text-xs font-medium">Bénéficiaire reçoit</span>
                            <span className="text-emerald-400 text-lg font-bold">
                                {receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedCountry?.currency || 'XAF'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  };

  const footer = success ? (
      <Button variant="success" className="w-full" onClick={onClose} size="lg">Fermer</Button>
  ) : (
      <>
        {step > 1 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>Retour</Button>
        )}
        {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)} icon={ChevronRight} className="flex-1">Continuer</Button>
        ) : (
            <Button 
                variant="success" 
                onClick={handleSubmit} 
                className="flex-1" 
                isLoading={processing}
                disabled={!formData.amount}
                icon={Send}
            >
                Confirmer
            </Button>
        )}
      </>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={type === 'local' ? 'Transfert Local' : 'Transfert International'}
      subtitle={step === 1 ? "Expéditeur" : step === 2 ? "Bénéficiaire" : "Montant"}
      size="full" // Full screen on mobile
      variant="default"
      footer={footer}
    >
        {renderContent()}
    </Modal>
  );
}

export default function TransfertArgent() {
  const [showCalculator, setShowCalculator] = useState(false);
  const [showNewTransfer, setShowNewTransfer] = useState<'local' | 'international' | null>(null);
  const [activeTab, setActiveTab] = useState<'send' | 'history' | 'rates'>('send');

  const recentTransfers = [
    { id: 'TRF001', recipient: 'Marie Ngouabi', country: 'RD Congo', amount: 150000, received: 610.5, currency: 'CDF', status: 'completed', date: '15/12/2024' },
    { id: 'TRF002', recipient: 'Paul Konan', country: 'Côte d\'Ivoire', amount: 250000, received: 250000, currency: 'XOF', status: 'pending', date: '14/12/2024' },
    { id: 'TRF003', recipient: 'Jean Mbemba', country: 'France', amount: 500000, received: 760, currency: 'EUR', status: 'completed', date: '12/12/2024' },
    { id: 'TRF004', recipient: 'Sophie Lekana', country: 'Cameroun', amount: 100000, received: 100000, currency: 'XAF', status: 'completed', date: '10/12/2024' }
  ];

  const partners = [
    { name: 'Airtel Money', logo: airtelMoneyLogo, coverage: 'Afrique Centrale', speed: 'Instantané' },
    { name: 'MTN MoMo', logo: mtnMomoLogo, coverage: 'Afrique de l\'Ouest', speed: 'Instantané' },
    { name: 'Orange Money', logo: orangeMoneyLogo, coverage: 'Multi-pays', speed: 'Instantané' },
    { name: 'M-Pesa', logo: mpesaLogo, coverage: 'Afrique de l\'Est', speed: '< 1 minute' },
    { name: 'Wave', logo: waveLogo, coverage: 'Sénégal, Côte d\'Ivoire', speed: 'Instantané' }
  ];

  return (
    <div className="flex flex-col h-full space-y-2 relative" data-testid="module-transfert">
      <div className="shrink-0 flex items-center justify-between p-1">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <Send className="text-emerald-400" size={20} />
            Virements
          </h1>
          <p className="text-slate-400 text-[10px] mt-0.5">Transferts internes et vers bénéficiaires</p>
        </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Calculator}
            onClick={() => setShowCalculator(true)}
            data-testid="button-calculator"
            className="h-8 text-xs"
          >
            Calculateur
          </Button>
      </div>

      <TabGroup
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as 'send' | 'history' | 'rates')}
        tabs={[
          { key: 'send', label: 'Envoyer', icon: Send },
          { key: 'history', label: 'Historique', icon: History },
          { key: 'rates', label: 'Tarifs', icon: TrendingDown },
        ]}
        variant="pills"
        size="sm"
        className="mb-4"
      />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'send' && <TransactionFlow />}

        {activeTab === 'history' && (
          <Card padding="none" className="flex-1 overflow-hidden bg-transparent sm:bg-slate-800 border-none sm:border border-slate-700">
             <div className="h-full overflow-y-auto custom-scrollbar">
              <ResponsiveTable
                columns={[
                  { key: 'id', label: 'Code', primary: true, format: (v) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'recipient', label: 'Bénéficiaire', hideOnMobile: true },
                  { key: 'amount', label: 'Envoyé', format: (v) => <span className="font-bold text-white">{v.toLocaleString()} XAF</span> },
                  { key: 'status', label: 'Statut', format: (v) => <Badge value={v === 'completed' ? 'Terminé' : 'En cours'} variant={v === 'completed' ? 'success' : 'warning'} /> },
                  { key: 'date', label: 'Date', hideOnMobile: true }
                ]}
                data={recentTransfers}
                density="compact"
              />
            </div>
          </Card>
        )}

        {activeTab === 'rates' && (
          <div className="h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
              <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <TrendingDown className="text-emerald-400" size={18} />
                Grille Tarifaire Transferts Locaux
              </h3>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Banknote className="text-emerald-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Espèces</h4>
                  <p className="text-slate-400 text-xs mt-0.5">500 XAF fixe + 0.5%</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Smartphone className="text-emerald-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Mobile Money</h4>
                  <p className="text-emerald-400 text-xs mt-0.5 font-bold">200 XAF fixe + 0.3%</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Landmark className="text-blue-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Virement bancaire</h4>
                  <p className="text-slate-400 text-xs mt-0.5">1,000 XAF fixe + 0.8%</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
              <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <Globe className="text-blue-400" size={18} />
                Grille Tarifaire Transferts Internationaux
              </h3>
              <div className="grid md:grid-cols-4 gap-3">
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Globe className="text-amber-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Afrique</h4>
                  <p className="text-slate-400 text-xs mt-0.5">2,500 XAF + 1.5%</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Euro className="text-blue-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Europe</h4>
                  <p className="text-slate-400 text-xs mt-0.5">5,000 XAF + 2.0%</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-1">
                    <DollarSign className="text-emerald-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Amérique</h4>
                  <p className="text-slate-400 text-xs mt-0.5">6,000 XAF + 2.5%</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center mb-1">
                    <Earth className="text-purple-400" size={18} />
                  </div>
                  <h4 className="text-white text-sm font-bold">Asie & MO</h4>
                  <p className="text-slate-400 text-xs mt-0.5">7,000 XAF + 3.0%</p>
                </div>
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
              <h3 className="text-base font-bold text-emerald-400 mb-3 flex items-center gap-2">
                <Star size={18} />
                Comparaison marché
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-emerald-500/30">
                      <th className="px-2 py-2 text-left text-emerald-300">Service</th>
                      <th className="px-2 py-2 text-center text-emerald-300">Frais</th>
                      <th className="px-2 py-2 text-center text-emerald-300">Délai</th>
                      <th className="px-2 py-2 text-center text-emerald-300">Momo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-emerald-500/10">
                      <td className="px-2 py-2 text-white font-bold">COFIN</td>
                      <td className="px-2 py-2 text-center text-emerald-400 font-bold">1.5% - 3%</td>
                      <td className="px-2 py-2 text-center text-white">Direct</td>
                      <td className="px-2 py-2 text-center"><CheckCircle2 className="text-emerald-400 mx-auto" size={14} /></td>
                    </tr>
                    <tr className="border-t border-slate-700">
                      <td className="px-2 py-2 text-slate-400">Western Union</td>
                      <td className="px-2 py-2 text-center text-red-400">5% - 10%</td>
                      <td className="px-2 py-2 text-center text-slate-400">1-3j</td>
                      <td className="px-2 py-2 text-center text-slate-500">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCalculator && <TransferCalculator onClose={() => setShowCalculator(false)} />}
      {showNewTransfer && <NewTransferModal type={showNewTransfer} onClose={() => setShowNewTransfer(null)} />}
    </div>
  );
}
