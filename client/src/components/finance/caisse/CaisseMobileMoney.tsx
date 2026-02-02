import React, { useState, useEffect, useCallback } from 'react';
import { Search, Smartphone, TrendingUp, TrendingDown, Loader2, X, CheckCircle, ArrowRight, Phone, AlertCircle } from 'lucide-react';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../../auth/AccountHolderPresenceModal';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { PaymentStatusModal, PaymentStatus } from '../payments';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { 
  securityConfigApi, 
  SecurityConfigResponse, 
  clientSearchApi,
  creditApi,
  tontineApi,
  compteEpargneApi 
} from '../../../lib/api-client';
import { toast } from '../../../lib/toast';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { useOperationInfo } from './hooks/useOperationInfo';
import { StatutCredit } from '@shared/enum/status-constants';
import { formatMoney } from '../../../lib/format';

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numero_compte?: string;
  telephone: string;
  email?: string;
  phone?: string;
}

type TypeOperation = 'Dépôt' | 'Retrait';
type Provider = 'MTN' | 'AIRTEL';
type TypeDepot = 'Compte Courant' | 'Compte Épargne' | 'Compte Bloqué' | 'Cotisation Tontine' | 'Remboursement Crédit';
type TypeRetrait = 'Retrait Compte Courant' | 'Retrait Épargne' | 'Décaissement Crédit' | 'Distribution Tontine';

interface PaymentIntent {
  id: string;
  externalRef: string;
  provider: Provider;
  type: 'COLLECTION' | 'PAYOUT';
  status: PaymentStatus;
  amount: string;
  phone: string;
  providerTxnId?: string;
  errorMessage?: string;
  createdAt: string;
  confirmedAt?: string;
}

interface CaisseMobileMoneyProps {
  sessionId: string;
  onTransactionComplete: () => void;
  user?: any;
}

// Map operation sub-types to payment intent types
const getPaymentIntentType = (typeOperation: TypeOperation, subType: string): string => {
  if (typeOperation === 'Dépôt') {
    switch (subType) {
      case 'Remboursement Crédit': return 'CREDIT_REPAYMENT';
      case 'Cotisation Tontine': return 'TONTINE_CONTRIBUTION';
      case 'Compte Courant':
      case 'Compte Épargne':
      case 'Compte Bloqué':
      default: return 'DEPOSIT';
    }
  } else {
    switch (subType) {
      case 'Décaissement Crédit': return 'CREDIT_DISBURSEMENT';
      case 'Distribution Tontine': return 'TONTINE_DISTRIBUTION';
      case 'Retrait Compte Courant':
      case 'Retrait Épargne':
      default: return 'WITHDRAWAL';
    }
  }
};

export default function CaisseMobileMoney({ sessionId, onTransactionComplete, user }: CaisseMobileMoneyProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [typeOperation, setTypeOperation] = useState<TypeOperation | null>(null);
  const [typeDepot, setTypeDepot] = useState<TypeDepot | null>(null);
  const [typeRetrait, setTypeRetrait] = useState<TypeRetrait | null>(null);
  const [provider, setProvider] = useState<Provider>('MTN');
  const [montant, setMontant] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Payment Intent State
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('CREATED');
  const [showPaymentStatusModal, setShowPaymentStatusModal] = useState(false);

  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);

  // Security configuration
  const [securityConfig, setSecurityConfig] = useState<SecurityConfigResponse | null>(null);
  const [showPresenceModal, setShowPresenceModal] = useState(false);

  // Sandbox configuration
  const [sandboxInfo, setSandboxInfo] = useState<{
    isSandbox: boolean;
    testNumbers?: Record<string, string>;
    helpMessage?: string;
  } | null>(null);
  const [phoneValidation, setPhoneValidation] = useState<{
    warning?: string;
    suggestion?: string;
    behavior?: { expectedStatus: string; expectedDelay?: number };
  } | null>(null);

  // Data caching for dynamic info
  const [creditsActifs, setCreditsActifs] = useState<any[]>([]);
  const [tontinesActives, setTontinesActives] = useState<any[]>([]);
  const [comptesClient, setComptesClient] = useState<any[]>([]);

  // Hook for dynamic info
  const { infoCardData, suggestedAmount, loading: infoLoading } = useOperationInfo({
    clientId: selectedClient?.id,
    typeOperation,
    subType: typeOperation === 'Dépôt' ? typeDepot : typeRetrait,
    selectedClient,
    tontinesActives,
    creditsActifs,
    comptesClient
  });

  // Auto-fill amount logic:
  // 1. If a suggestion exists, use it.
  // 2. If valid operation but NO suggestion (suggestedAmount is null), reset input 
  //    (only if we are not in the middle of typing? No, purely on suggestion change implies type switch)
  useEffect(() => {
    if (suggestedAmount) {
      setMontant(suggestedAmount);
    } else if (suggestedAmount === null && (typeDepot || typeRetrait)) {
       // If we have a subtype selected but no suggestion comes back (e.g. switching from Credit to Current Account)
       // We should clear the amount to avoid sticking with the previous pre-filled value.
       // However, this might conflict if user types fast? 
       // But suggestedAmount changes only on fetch complete.
       // To be safe and respect "react accordingly", we accept that switching types clears the amount.
       // The onClick handler already clears it, but this reinforces it if the hook updates late.
       // We only clear if it matches the 'cleared' expectation.
       // Actually, relying on onClick is safer for "user typing". 
       // Leaving this simple: if there is a suggestion, take it.
    }
  }, [suggestedAmount, typeDepot, typeRetrait]);

  const providers = [
    { id: 'MTN' as Provider, name: 'MTN MoMo', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/50', logo: mtnLogo },
    { id: 'AIRTEL' as Provider, name: 'Airtel Money', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/50', logo: airtelLogo }
  ];

  // Load security config on mount
  useEffect(() => {
    const loadSecurityConfig = async () => {
      try {
        const config = await securityConfigApi.getConfig();
        setSecurityConfig(config);
      } catch (error) {
        console.error('Erreur chargement config sécurité:', error);
        setSecurityConfig({
          otpEnabled: false,
          requireAccountHolderPresence: true,
          operationsRequiringPresence: ['Retrait', 'Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine'],
          presenceVerificationThreshold: 0
        });
      }
    };
    loadSecurityConfig();
  }, []);

  // Load sandbox info on mount
  useEffect(() => {
    const loadSandboxInfo = async () => {
      try {
        const res = await fetch('/api/payments/sandbox-info', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setSandboxInfo(data);
        }
      } catch (error) {
        console.error('Erreur chargement info sandbox:', error);
      }
    };
    loadSandboxInfo();
  }, []);

  // Polling for payment status
  useEffect(() => {
    if (!paymentIntent || !showPaymentStatusModal) return;

    // Don't poll if already in a terminal state
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'REVERSED'].includes(paymentStatus)) return;

    const pollInterval = setInterval(async () => {
      try {
        console.log(`[Polling] Checking status for ${paymentIntent.id}...`); 
        const res = await fetch(`/api/payments/${paymentIntent.id}`, { credentials: 'include' });
        
        if (res.ok) {
          const intent: PaymentIntent = await res.json();
          console.log(`[Polling] Status received: ${intent.status}`, intent);
          setPaymentStatus(intent.status);
          setPaymentIntent(intent);

          if (intent.status === 'SUCCESS') {
            clearInterval(pollInterval);
            handlePaymentSuccess(intent);
          } else if (['FAILED', 'EXPIRED', 'REVERSED'].includes(intent.status)) {
            clearInterval(pollInterval);
            toast.error(`Paiement ${intent.status === 'FAILED' ? 'échoué' : intent.status === 'EXPIRED' ? 'expiré' : 'annulé'}`);
          }
        }
      } catch (error) {
        console.error('Erreur polling paiement:', error);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [paymentIntent?.id, paymentStatus, showPaymentStatusModal]);

  // Auto-fill phone from selected client
  useEffect(() => {
    if (selectedClient) {
      const clientPhone = selectedClient.telephone || selectedClient.phone || '';
      setPhoneNumber(clientPhone);
    }
  }, [selectedClient]);

  // Validate phone number in sandbox
  useEffect(() => {
    const validatePhone = async () => {
      if (!phoneNumber || !sandboxInfo?.isSandbox || provider !== 'MTN') {
        setPhoneValidation(null);
        return;
      }

      try {
        const res = await fetch('/api/payments/validate-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone: phoneNumber, provider })
        });

        if (res.ok) {
          const data = await res.json();
          setPhoneValidation(data);
        }
      } catch (error) {
        console.error('Erreur validation téléphone:', error);
      }
    };

    // Debounce validation
    const timeout = setTimeout(validatePhone, 500);
    return () => clearTimeout(timeout);
  }, [phoneNumber, sandboxInfo, provider]);

  // Check if operation requires presence verification
  const requiresPresenceVerification = useCallback((opType: string, subType?: string): boolean => {
    if (!securityConfig?.requireAccountHolderPresence) return false;
    const typeToCheck = subType || opType;
    return securityConfig.operationsRequiringPresence.some(
      op => op.toLowerCase() === typeToCheck.toLowerCase() || opType.toLowerCase() === 'retrait'
    );
  }, [securityConfig]);

  const rechercherClient = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const response = await clientSearchApi.search(searchTerm, { page: 1, perPage: 1 });
      const clients = response.data || [];
      if (clients.length > 0) {
        const client = clients[0];
        setSelectedClient(client);
        
        // Fetch related data in parallel
        try {
            const [credits, tontines, comptes] = await Promise.all([
                creditApi.getAll({ clientId: client.id, statut: StatutCredit.ACTIVE }).catch(() => []),
                tontineApi.getByClient(client.id).catch(() => []),
                compteEpargneApi.getByClient(client.id).catch(() => [])
            ]);
            setCreditsActifs(credits || []);
            setTontinesActives(tontines || []);
            setComptesClient(comptes || []);
        } catch (err) {
            console.error("Error loading client details", err);
        }

      } else {
        toast.warning('Aucun client trouvé');
      }
    } catch (error: any) {
      console.error('Erreur recherche client:', error);
      toast.error('Erreur lors de la recherche');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (intent: PaymentIntent) => {
    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;

    // Prepare Receipt Data
    const rData: ReceiptData = {
      title: `Reçu ${typeOperation} Mobile Money`,
      reference: intent.externalRef,
      date: new Date(intent.confirmedAt || intent.createdAt),
      type: typeOperation || '',
      client: {
        nom: selectedClient?.nom || '',
        prenom: selectedClient?.prenom || '',
        telephone: intent.phone,
        numeroCompte: selectedClient?.numero_compte
      },
      items: [{
        description: `${typeOperation} - ${subType}`,
        details: `Via ${provider} Mobile Money`,
        montant: parseFloat(intent.amount),
        quantite: 1
      }],
      total: parseFloat(intent.amount),
      modePaiement: `${provider} Mobile Money`,
      notes: intent.providerTxnId ? `ID Transaction: ${intent.providerTxnId}` : undefined,
      agent: {
        nom: user?.nom || 'Caissier',
        prenom: user?.prenom || ''
      }
    };

    setReceiptData(rData);
    setShowPaymentStatusModal(false);
    setShowSuccessModal(true);
    onTransactionComplete();
  };

  const initiatePayment = async (presenceData?: PresenceConfirmationData) => {
    if (!selectedClient || !typeOperation || !montant || parseFloat(montant) <= 0 || !phoneNumber) {
      toast.warning('Veuillez remplir tous les champs requis');
      return;
    }

    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    if (!subType) {
      toast.warning(`Veuillez sélectionner le type de ${typeOperation.toLowerCase()}`);
      return;
    }

    setLoading(true);
    try {
      const isCollection = typeOperation === 'Dépôt';
      const endpoint = isCollection ? '/api/payments/collect' : '/api/payments/payout';
      const paymentType = getPaymentIntentType(typeOperation, subType);

      // Generate idempotency key to prevent duplicate payments
      const idempotencyKey = crypto.randomUUID();

      const payload: any = {
        provider,
        amount: parseFloat(montant),
        phone: phoneNumber,
        clientId: selectedClient.id,
        agenceId: user?.agenceId,
        idempotencyKey,
        type: paymentType,
        metadata: {
          sessionId,
          subType,
          presenceVerification: presenceData
        }
      };

      // Add specific IDs based on operation type
      if (subType === 'Remboursement Crédit' && creditsActifs.length > 0) {
        payload.creditId = creditsActifs[0].id;
      }

      if (subType === 'Décaissement Crédit' && creditsActifs.length > 0) {
        payload.creditId = creditsActifs[0].id;
      }

      if (subType === 'Cotisation Tontine' && tontinesActives.length > 0) {
        payload.tontineId = tontinesActives[0].id;
      }

      if (subType === 'Distribution Tontine' && tontinesActives.length > 0) {
        payload.tontineId = tontinesActives[0].id;
      }

      if (comptesClient.length > 0 && !payload.creditId && !payload.tontineId) {
        // For compte operations (Courant, Épargne, Bloqué), use the first compte
        // Only add compteId if we haven't already set creditId or tontineId
        payload.compteId = comptesClient[0].id;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur lors du paiement');
      }

      const intent: PaymentIntent = await res.json();
      setPaymentIntent(intent);
      setPaymentStatus(intent.status);
      setShowPaymentStatusModal(true);

      toast.info(isCollection
        ? 'Demande envoyée. Le client doit valider sur son téléphone.'
        : 'Décaissement en cours...');

    } catch (error: any) {
      console.error('Erreur paiement MM:', error);
      toast.error(error.message || 'Erreur lors de l\'initiation du paiement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    const isWithdrawal = requiresPresenceVerification(typeOperation!, subType || undefined);

    if (isWithdrawal) {
      setShowPresenceModal(true);
    } else {
      await initiatePayment();
    }
  };

  const handlePresenceConfirm = async (presenceData: PresenceConfirmationData) => {
    setShowPresenceModal(false);
    await initiatePayment(presenceData);
  };

  const reinitialiserFormulaire = () => {
    setSelectedClient(null);
    setTypeOperation(null);
    setTypeDepot(null);
    setTypeRetrait(null);
    setMontant('');
    setPhoneNumber('');
    setSearchTerm('');
    setPaymentIntent(null);
    setPaymentStatus('CREATED');
    setReceiptData(undefined);
    setShowSuccessModal(false);
    setShowPaymentStatusModal(false);
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    reinitialiserFormulaire();
  };

  const handleCancelPayment = () => {
    setShowPaymentStatusModal(false);
    if (paymentStatus === 'PENDING' || paymentStatus === 'CREATED') {
      toast.info('Le paiement est toujours en attente de confirmation');
    }
  };

  const handleRetryPayment = () => {
    setShowPaymentStatusModal(false);
    setPaymentIntent(null);
    setPaymentStatus('CREATED');
    // User can retry with same data
  };

  return (
    <div className="flex flex-col h-full font-sans selection:bg-emerald-500/30">
      {/* Sandbox Banner */}
      {sandboxInfo?.isSandbox && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} className="text-yellow-400" />
          <div className="flex-1">
            <p className="text-xs text-yellow-400 font-bold">Mode Sandbox MTN MoMo</p>
            <p className="text-[10px] text-yellow-400/70">
              Utilisez les numéros de test : {sandboxInfo.testNumbers?.SUCCESS_IMMEDIATE} (succès immédiat) ou {sandboxInfo.testNumbers?.SUCCESS_DELAYED} (succès après 30s)
            </p>
          </div>
        </div>
      )}

      {/* Success Modal */}
      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={handleCloseSuccess}
        term="Terminer"
        data={receiptData}
      />

      {/* Payment Status Modal */}
      <PaymentStatusModal
        isOpen={showPaymentStatusModal}
        onClose={handleCancelPayment}
        status={paymentStatus}
        provider={provider}
        amount={parseFloat(montant) || 0}
        phone={phoneNumber}
        reference={paymentIntent?.externalRef}
        providerTxnId={paymentIntent?.providerTxnId}
        errorMessage={paymentIntent?.errorMessage}
        onRetry={handleRetryPayment}
        onViewDetails={() => {
          setShowPaymentStatusModal(false);
          // Could open detail modal here
        }}
      />

      <div className="w-full h-full p-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
          
          {/* LEFT COL: Search & Client Summary */}
          <div className="lg:col-span-4 flex flex-col gap-3 h-full">
             {/* Search Section */}
             <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                    placeholder="Rechercher client..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                     <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">ENTER</span>
                  </div>
                </div>
             </Card>

             {/* Client Result / Empty State */}
             <div className="flex-1 min-h-0">
               {selectedClient ? (
                 <Card className="bg-slate-800/50 border border-slate-700/50 h-full p-6 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold text-2xl mb-4 shadow-xl">
                      {selectedClient.nom.charAt(0)}{selectedClient.prenom.charAt(0)}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">
                      {selectedClient.nom} {selectedClient.prenom}
                    </h3>
                    <p className="text-slate-400 font-mono mb-6">{selectedClient.telephone || selectedClient.phone}</p>
                    
                    <div className="w-full mt-auto space-y-2">
                        {infoCardData ? (
                            <div className={`p-3 rounded-lg border text-center transition-all duration-300 ${
                                infoCardData.amount !== null && infoCardData.amount > 0 
                                ? 'bg-purple-900/20 border-purple-500/30' 
                                : 'bg-slate-900/50 border-slate-800'
                            }`}>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 line-clamp-1">
                                    {infoCardData.title}
                                </p>
                                {infoLoading ? (
                                    <Loader2 className="w-3 h-3 animate-spin mx-auto text-emerald-400" />
                                ) : (
                                    <>
                                        <p className={`font-mono text-base font-bold ${
                                            infoCardData.amount !== null ? 'text-white' : 'text-slate-600'
                                        }`}>
                                            {infoCardData.amount !== null ? formatMoney(infoCardData.amount) : '-'}
                                        </p>
                                        {infoCardData.subtitle && (
                                            <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-1">{infoCardData.subtitle}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                             <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                                   <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Dernier Dépôt</p>
                                   <p className="font-mono text-emerald-400 font-bold">-</p>
                                </div>
                                 <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                                   <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Dernier Retrait</p>
                                   <p className="font-mono text-rose-400 font-bold">-</p>
                                </div>
                             </div>
                        )}
                    </div>
                 </Card>
               ) : (
                 <div className="h-full rounded-2xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-600 space-y-4 p-8">
                    <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                        <Search size={24} className="opacity-50" />
                    </div>
                    <p className="text-sm font-medium">Recherchez un client pour commencer</p>
                 </div>
               )}
             </div>
          </div>

          {/* RIGHT COL: Operation Cockpit */}
          <div className="lg:col-span-8 h-full flex flex-col">
             <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 h-full p-0 flex flex-col overflow-hidden relative">
                {!selectedClient && (
                    <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                        <p className="text-slate-500 font-medium bg-slate-900 px-4 py-2 rounded-full border border-slate-800 shadow-xl">
                            Sélectionnez un client à gauche
                        </p>
                    </div>
                )}
                
                {/* 1. Header & Provider Selector */}
                <div className="p-6 border-b border-slate-800 bg-slate-950/30">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                Transaction Mobile
                            </h2>
                            <p className="text-xs text-slate-500">Sélectionnez le réseau et le type</p>
                        </div>
                        {/* Provider Toggle */}
                        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                            {providers.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setProvider(p.id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                                        provider === p.id 
                                        ? `bg-white text-slate-900 shadow-sm` 
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <img src={p.logo} className="w-4 h-4 object-contain" alt="" />
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                     {/* Type Selector (Segmented) */}
                     <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                         {(['Dépôt', 'Retrait'] as TypeOperation[]).map(type => (
                             <button
                                 key={type}
                                 onClick={() => {
                                      setTypeOperation(type);
                                      setTypeDepot(null);
                                      setTypeRetrait(null);
                                 }}
                                 className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
                                     typeOperation === type
                                     ? type === 'Dépôt' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20' : 'bg-rose-500 text-white shadow-lg shadow-rose-900/20'
                                     : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                 }`}
                             >
                                 {type === 'Dépôt' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                 {type}
                             </button>
                         ))}
                     </div>
                </div>

                {/* 2. Main Form Area */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                    {/* SubType Pills */}
                    {typeOperation && (
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-1">Destination / Source</label>
                            <div className="flex flex-wrap gap-2">
                                {(typeOperation === 'Dépôt'
                                    ? ['Compte Courant', 'Compte Épargne', 'Compte Bloqué', 'Cotisation Tontine', 'Remboursement Crédit']
                                    : ['Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine']
                                ).map((subType: any) => (
                                    <button
                                        key={subType}
                                        onClick={() => {
                                            if (typeOperation === 'Dépôt') {
                                                setTypeDepot(subType);
                                            } else {
                                                setTypeRetrait(subType);
                                            }
                                            // Reset amount when switching types to ensure clean state
                                            // or to allow auto-fill to take over if applicable
                                            setMontant('');
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                            (typeOperation === 'Dépôt' ? typeDepot : typeRetrait) === subType
                                            ? 'bg-slate-800 text-white border-slate-600 shadow-sm'
                                            : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
                                        }`}
                                    >
                                        {subType.replace('Retrait ', '')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Inputs Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-slate-500 font-medium">Numéro Mobile</label>
                            <div className="relative">
                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className={`w-full bg-slate-950 border rounded-xl py-3 pl-9 pr-3 text-sm text-white focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none font-mono ${
                                      phoneValidation?.warning ? 'border-yellow-500/50' : 'border-slate-800'
                                    }`}
                                    placeholder="06..."
                                />
                            </div>
                            {phoneValidation?.warning && (
                              <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400 space-y-1">
                                <p className="font-bold flex items-center gap-1">
                                  <AlertCircle size={10} />
                                  Mode Sandbox
                                </p>
                                <p className="text-yellow-400/80">{phoneValidation.warning}</p>
                                {phoneValidation.suggestion && (
                                  <p className="text-yellow-300 font-mono">{phoneValidation.suggestion}</p>
                                )}
                                {phoneValidation.behavior && (
                                  <p className="text-emerald-400 font-mono text-[9px]">
                                    ✓ Test: {phoneValidation.behavior.expectedStatus}
                                    {phoneValidation.behavior.expectedDelay && ` après ${phoneValidation.behavior.expectedDelay / 1000}s`}
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                         <div className="space-y-1.5">
                            <label className="text-xs text-slate-500 font-medium">Montant (FCFA)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={montant}
                                    onChange={(e) => setMontant(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-4 pr-12 text-sm text-white font-bold focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none font-mono"
                                    placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">FCFA</span>
                            </div>
                        </div>
                    </div>

                    {/* Info Box */}
                    {typeOperation && (
                        <div className={`p-4 rounded-xl border flex gap-3 ${
                             typeOperation === 'Dépôt' 
                             ? 'bg-emerald-500/5 border-emerald-500/10' 
                             : 'bg-rose-500/5 border-rose-500/10'
                        }`}>
                           <AlertCircle size={16} className={typeOperation === 'Dépôt' ? 'text-emerald-500' : 'text-rose-500'} />
                           <div className="space-y-1">
                               <p className={`text-xs font-bold ${typeOperation === 'Dépôt' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                   Confirmation Requise
                               </p>
                               <p className="text-[10px] text-slate-400 leading-relaxed">
                                  {typeOperation === 'Dépôt'
                                    ? `Une demande de paiement de ${montant || '0'} FCFA sera envoyée au ${phoneNumber || '...'}. Le client devra valider avec son code PIN ${provider}.`
                                    : `Vous allez initier un transfert de ${montant || '0'} FCFA vers le ${phoneNumber || '...'}. Assurez-vous d'avoir vérifié l'identité du bénéficiaire.`}
                               </p>
                           </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/50 mt-auto">
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || !montant || parseFloat(montant) <= 0 || !phoneNumber || !(typeOperation === 'Dépôt' ? typeDepot : typeRetrait)}
                      className={`w-full h-12 rounded-xl font-bold shadow-lg transition-all ${
                        typeOperation === 'Dépôt'
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                          : 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loading ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                           <span className="uppercase tracking-wide">{typeOperation === 'Dépôt' ? 'Lancer la Collecte' : 'Confirmer l\'Envoi'}</span>
                           <ArrowRight size={16} />
                        </div>
                      )}
                    </Button>
                </div>
             </Card>
          </div>
        </div>
      </div>

      {/* Account Holder Presence Modal (for withdrawals) */}
      {showPresenceModal && selectedClient && (
        <AccountHolderPresenceModal
          isOpen={showPresenceModal}
          onClose={() => setShowPresenceModal(false)}
          onConfirm={handlePresenceConfirm}
          clientName={`${selectedClient.nom} ${selectedClient.prenom}`}
          clientPhone={selectedClient.telephone || selectedClient.phone}
          operationType={typeOperation || 'Retrait'}
          amount={parseFloat(montant)}
          isLoading={loading}
        />
      )}
    </div>
  );
}
