import React, { useState } from 'react';
import {
  Send, Globe, MapPin, Users, Calculator, CreditCard,
  Clock, CheckCircle2, AlertCircle, ArrowRight, Building2,
  X, Search, Shield, Zap, TrendingDown, Wallet, History,
  FileText, Phone, Mail, User, ChevronRight, RefreshCw,
  Coins, AlertTriangle
} from 'lucide-react';
import { Button, Card, Badge, TabGroup, StatCard, Modal, ResponsiveTable, FormField, SelectField } from '../../ui';
import TransactionFlow from './TransactionFlow';
import { currencyCode } from '@shared/config/currency';
import { useBranding } from '../../../contexts/BrandingContext';

import airtelMoneyLogo from '../../../assets/logos/airtel-logo.png';
import mtnMomoLogo from '../../../assets/logos/mtn-logo.png';

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
  const [fromCurrency, setFromCurrency] = useState(currencyCode());
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
        <div className="bg-surface-base/50 p-1 rounded-lg flex text-xs font-medium">
          <button
            onClick={() => setTransferType('local')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${transferType === 'local' ? 'bg-surface-elevated text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
          >
            <MapPin size={12} /> Local
          </button>
          <button
            onClick={() => setTransferType('international')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${transferType === 'international' ? 'bg-status-info text-white shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
          >
            <Globe size={12} /> International
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-content-muted font-semibold mb-1 block">Montant à envoyer</label>
          <div className="flex bg-surface border border-edge rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-status-success/50 transition-all">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-content-primary font-bold text-lg outline-none placeholder:text-content-muted"
              placeholder="0"
            />
            <div className="bg-surface-elevated px-3 py-2 flex items-center justify-center border-l border-edge-strong">
              <span className="text-xs font-bold text-content-primary">{fromCurrency}</span>
            </div>
          </div>
        </div>

        {/* Destination (Conditional) */}
        {transferType === 'international' && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
             <label className="text-[10px] uppercase tracking-wider text-content-muted font-semibold mb-1 block">Pays de réception</label>
            <div className="relative">
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full bg-surface border border-edge rounded-lg pl-9 pr-8 py-2 text-content-primary text-sm outline-none focus:border-status-info appearance-none transition-colors cursor-pointer hover:bg-surface-elevated/80"
              >
                {countries.map(c => (
                  <option key={c.code} value={c.currency}>{c.name} ({c.currency})</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                 {countries.find(c => c.currency === toCurrency)?.flag}
              </div>
               <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted rotate-90" size={14} />
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-surface-base/80 rounded-xl p-3 border border-edge space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-content-muted">Montant envoyé</span>
            <span className="text-content-primary font-medium">{amountToSend.toLocaleString()} {fromCurrency}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-content-muted">Frais estimés</span>
            <span className="text-status-warning font-medium">- {fees.toLocaleString()} {fromCurrency}</span>
          </div>
          {transferType === 'international' && (
             <div className="flex justify-between items-center text-xs">
              <span className="text-content-muted">Taux</span>
              <span className="text-accent font-medium">1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}</span>
            </div>
          )}
          
          <div className="border-t border-edge/50 pt-2 mt-1">
             <div className="flex justify-between items-end">
              <span className="text-content-muted text-[10px] pb-0.5">Le bénéficiaire reçoit</span>
              <span className="text-status-success text-lg font-bold tracking-tight">
                {receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs font-normal opacity-80">{transferType === 'local' ? fromCurrency : toCurrency}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-status-success/5 border border-status-success/10 rounded-lg p-2 flex items-center gap-2 justify-center">
             <TrendingDown size={12} className="text-status-success" />
             <span className="text-[10px] text-status-success/90">
               Économie estimée: <strong>~{Math.round(fees * 0.4).toLocaleString()} {fromCurrency}</strong>
             </span>
        </div>
      </div>
    </Modal>
  );
}

function NewTransferModal({ onClose, type }: { onClose: () => void; type: 'local' | 'international' }) {
  const { branding } = useBranding();
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
    currency: currencyCode(),
    paymentMethod: 'cash',
    deliveryMethod: 'cash_pickup',
    purpose: 'family_support'
  });
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedCountry = countries.find(c => c.code === formData.recipientCountry);
  const rate = selectedCountry ? exchangeRates[selectedCountry.currency] / exchangeRates[currencyCode()] : 1;
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
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-status-success-bg rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="text-status-success" size={32} />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-content-primary mb-2">Transfert Initié!</h3>
            <p className="text-content-muted mb-6 text-sm">Votre transfert a été enregistré avec succès.</p>
            
            <div className="bg-surface rounded-xl p-4 w-full max-w-xs mx-auto mb-6 border border-edge">
              <p className="text-content-muted text-xs">Code de transaction</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-status-success tracking-wider">{transactionCode}</p>
            </div>

            <div className="w-full space-y-2 text-xs sm:text-sm text-content-muted mb-8 bg-surface-base/50 p-4 rounded-lg">
                <div className="flex justify-between border-b border-edge pb-2">
                    <span>Bénéficiaire</span>
                    <strong className="text-content-primary">{formData.recipientName}</strong>
                </div>
                <div className="flex justify-between border-b border-edge pb-2">
                    <span>Montant Reçu</span>
                    <strong className="text-content-primary">{receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedCountry?.currency || currencyCode()}</strong>
                </div>
                <div className="flex justify-between">
                    <span>Mode</span>
                    <strong className="text-content-primary">{formData.deliveryMethod === 'mobile_money' ? 'Mobile Money' : 'Espèces'}</strong>
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
                <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-status-success' : 'bg-surface'}`} />
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
                    className="bg-surface-base border-edge text-content-primary focus:ring-status-success/50 placeholder:text-content-muted"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                    placeholder="Jean Makaya"
                  />
                  <FormField 
                    name="senderPhone"
                    label="Téléphone" 
                    required
                    type="tel"
                    className="bg-surface-base border-edge text-content-primary focus:ring-status-success/50 placeholder:text-content-muted"
                    value={formData.senderPhone}
                    onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                    placeholder="+242 06..."
                  />
                   <FormField 
                     name="senderIdNumber"
                     label="Numéro de pièce d'identité" 
                     required
                     type="text"
                     className="bg-surface-base border-edge text-content-primary focus:ring-status-success/50 placeholder:text-content-muted"
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
                    className="bg-surface-base border-edge text-content-primary focus:ring-status-success/50 placeholder:text-content-muted"
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
                    className="bg-surface-base border-edge text-content-primary focus:ring-status-success/50 placeholder:text-content-muted"
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
                        <label className="text-content-muted text-xs font-semibold uppercase tracking-wider block mb-2">Montant à envoyer ({currencyCode()})</label>
                        <input 
                            type="number"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            className="w-full bg-surface-base border border-edge rounded-xl px-4 py-4 text-3xl font-bold text-content-primary text-center focus:ring-2 focus:ring-status-success/50 outline-none transition-all placeholder:text-content-primary"
                            placeholder="0"
                            autoFocus
                        />
                    </div>

                    <div className="bg-surface rounded-xl p-4 space-y-3 border border-edge-subtle">
                        <div className="flex justify-between text-xs">
                        <span className="text-content-muted">Frais {branding.appName}</span>
                        <span className="text-status-warning font-bold">- {fees.toLocaleString()} {currencyCode()}</span>
                        </div>
                        {type === 'international' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-content-muted">Taux</span>
                            <span className="text-accent font-bold">1 {currencyCode()} = {rate.toFixed(4)} {selectedCountry?.currency}</span>
                        </div>
                        )}
                        <div className="border-t border-edge pt-3 flex justify-between items-end">
                            <span className="text-content-secondary text-xs font-medium">Bénéficiaire reçoit</span>
                            <span className="text-status-success text-lg font-bold">
                                {receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedCountry?.currency || currencyCode()}
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
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  const recentTransfers = [
    { id: 'TRF001', recipient: 'Marie Ngouabi', country: 'RD Congo', amount: 150000, received: 610.5, currency: 'CDF', status: 'completed', date: '15/12/2024' },
    { id: 'TRF002', recipient: 'Paul Konan', country: 'Côte d\'Ivoire', amount: 250000, received: 250000, currency: 'XOF', status: 'pending', date: '14/12/2024' },
    { id: 'TRF003', recipient: 'Jean Mbemba', country: 'France', amount: 500000, received: 760, currency: 'EUR', status: 'completed', date: '12/12/2024' },
    { id: 'TRF004', recipient: 'Sophie Lekana', country: 'Cameroun', amount: 100000, received: 100000, currency: 'XAF', status: 'completed', date: '10/12/2024' }
  ];

  const partners = [
    { name: 'Airtel Money', logo: airtelMoneyLogo, coverage: 'Afrique Centrale', speed: 'Instantané' },
    { name: 'MTN MoMo', logo: mtnMomoLogo, coverage: 'Afrique de l\'Ouest', speed: 'Instantané' },
  ];

  return (
    <div className="flex flex-col h-full space-y-2 relative" data-testid="module-transfert">
      <div className="shrink-0 flex items-center justify-between p-1">
        <div>
          <h1 className="text-base font-bold text-content-primary flex items-center gap-2">
            <Send className="text-status-success" size={20} />
            Virements
          </h1>
          <p className="text-content-muted text-[10px] mt-0.5">Transferts internes et vers bénéficiaires</p>
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
        onTabChange={(key) => setActiveTab(key as 'send' | 'history')}
        tabs={[
          { key: 'send', label: 'Envoyer', icon: Send },
          { key: 'history', label: 'Historique', icon: History },
        ]}
        variant="pills"
        size="sm"
        className="mb-4"
      />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'send' && <TransactionFlow />}

        {activeTab === 'history' && (
          <Card padding="none" className="flex-1 overflow-hidden bg-transparent sm:bg-surface border-none sm:border border-edge">
             <div className="h-full overflow-y-auto custom-scrollbar">
              <ResponsiveTable
                columns={[
                  { key: 'id', label: 'Code', primary: true, format: (v) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'recipient', label: 'Bénéficiaire', hideOnMobile: true },
                  { key: 'amount', label: 'Envoyé', format: (v) => <span className="font-bold text-content-primary">{v.toLocaleString()} {currencyCode()}</span> },
                  { key: 'status', label: 'Statut', format: (v) => <Badge value={v === 'completed' ? 'Terminé' : 'En cours'} variant={v === 'completed' ? 'success' : 'warning'} /> },
                  { key: 'date', label: 'Date', hideOnMobile: true }
                ]}
                data={recentTransfers}
                density="compact"
              />
            </div>
          </Card>
        )}
      </div>

      {showCalculator && <TransferCalculator onClose={() => setShowCalculator(false)} />}
      {showNewTransfer && <NewTransferModal type={showNewTransfer} onClose={() => setShowNewTransfer(null)} />}
    </div>
  );
}
