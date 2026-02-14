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
  numeroCompte?: string;
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
    { id: 'MTN' as Provider, name: 'MTN MoMo', color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/50', logo: mtnLogo },
    { id: 'AIRTEL' as Provider, name: 'Airtel Money', color: 'text-status-danger', bg: 'bg-status-danger-bg', border: 'border-status-danger/50', logo: airtelLogo }
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
        numeroCompte: selectedClient?.numeroCompte
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
    <div className="flex flex-col h-full font-sans selection:bg-status-success/30 overflow-hidden">
      {/* Modals */}
      <UniversalPaymentSuccessModal isOpen={showSuccessModal} onClose={handleCloseSuccess} term="Terminer" data={receiptData} />
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
        onViewDetails={() => setShowPaymentStatusModal(false)}
      />
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

      {/* Sandbox Banner - Compact */}
      {sandboxInfo?.isSandbox && (
        <div className="bg-status-warning-bg border-b border-status-warning/20 px-3 py-1.5 flex items-center gap-2 shrink-0">
          <AlertCircle size={12} className="text-status-warning shrink-0" />
          <p className="text-[10px] text-status-warning">
            <span className="font-bold">Sandbox:</span> Test avec {sandboxInfo.testNumbers?.SUCCESS_IMMEDIATE} (immédiat) ou {sandboxInfo.testNumbers?.SUCCESS_DELAYED} (30s)
          </p>
        </div>
      )}

      {/* Main Content - Single Row Layout */}
      <div className="flex-1 min-h-0 p-3">
        <div className="h-full grid grid-cols-12 gap-3">

          {/* LEFT: Client Search & Info (Compact) */}
          <div className="col-span-3 flex flex-col gap-2 h-full">
            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted h-3.5 w-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                placeholder="Client..."
                className="w-full bg-surface-base border border-edge rounded-lg py-2 pl-8 pr-14 text-sm text-content-primary focus:ring-1 focus:ring-accent focus:border-accent outline-none"
                autoFocus
              />
              <button
                onClick={rechercherClient}
                disabled={loading || !searchTerm.trim()}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] bg-accent-secondary hover:bg-accent-secondary disabled:bg-surface-elevated text-content-primary px-2 py-1 rounded font-bold transition-colors"
              >
                {loading ? <Loader2 size={10} className="animate-spin" /> : 'OK'}
              </button>
            </div>

            {/* Client Card */}
            {selectedClient ? (
              <Card className="flex-1 bg-surface/50 border-edge-subtle p-3 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-status-info flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {selectedClient.nom.charAt(0)}{selectedClient.prenom.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-content-primary">{selectedClient.nom} {selectedClient.prenom}</h3>
                    <p className="text-xs text-content-muted font-mono">{selectedClient.telephone || selectedClient.phone}</p>
                  </div>
                </div>

                {/* Info dynamique */}
                {infoCardData && (
                  <div className={`p-2.5 rounded-lg border text-center mt-auto ${
                    infoCardData.amount !== null && infoCardData.amount > 0
                    ? 'bg-status-info-bg border-status-info/30'
                    : 'bg-surface-base/50 border-edge'
                  }`}>
                    <p className="text-[9px] text-content-muted uppercase tracking-wider mb-0.5 truncate">{infoCardData.title}</p>
                    {infoLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin mx-auto text-accent" />
                    ) : (
                      <p className={`font-mono text-sm font-bold ${infoCardData.amount !== null ? 'text-content-primary' : 'text-content-muted'}`}>
                        {infoCardData.amount !== null ? formatMoney(infoCardData.amount) : '-'}
                      </p>
                    )}
                    {infoCardData.subtitle && <p className="text-[8px] text-content-muted truncate">{infoCardData.subtitle}</p>}
                  </div>
                )}
              </Card>
            ) : (
              <div className="flex-1 rounded-xl border-2 border-dashed border-edge flex items-center justify-center">
                <p className="text-xs text-content-muted">Recherchez un client</p>
              </div>
            )}
          </div>

          {/* RIGHT: Transaction Form (Full Width) */}
          <div className="col-span-9 h-full">
            <Card className="h-full bg-surface-base/80 border-edge p-0 flex flex-col overflow-hidden relative">
              {!selectedClient && (
                <div className="absolute inset-0 z-10 bg-surface-base/90 backdrop-blur-sm flex items-center justify-center">
                  <p className="text-content-muted text-xs bg-surface-base px-3 py-1.5 rounded-full border border-edge">← Sélectionnez un client</p>
                </div>
              )}

              {/* Header Row: Provider + Type */}
              <div className="p-3 border-b border-edge bg-surface-base/30 shrink-0">
                <div className="flex items-center gap-4">
                  {/* Provider Toggle */}
                  <div className="flex bg-surface-base p-0.5 rounded-lg border border-edge">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setProvider(p.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          provider === p.id ? 'bg-surface text-content-primary' : 'text-content-muted hover:text-content-secondary'
                        }`}
                      >
                        <img src={p.logo} className="w-4 h-4 object-contain" alt="" />
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {/* Type Selector */}
                  <div className="flex-1 grid grid-cols-2 gap-0.5 bg-surface-base p-0.5 rounded-lg border border-edge">
                    {(['Dépôt', 'Retrait'] as TypeOperation[]).map(type => (
                      <button
                        key={type}
                        onClick={() => { setTypeOperation(type); setTypeDepot(null); setTypeRetrait(null); setMontant(''); }}
                        className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-all ${
                          typeOperation === type
                          ? type === 'Dépôt' ? 'bg-status-success text-white' : 'bg-status-danger text-white'
                          : 'text-content-muted hover:text-content-secondary'
                        }`}
                      >
                        {type === 'Dépôt' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Content */}
              <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">
                {/* SubType Pills */}
                {typeOperation && (
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-content-muted font-bold mb-1.5 block">Destination</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(typeOperation === 'Dépôt'
                        ? ['Compte Courant', 'Compte Épargne', 'Compte Bloqué', 'Cotisation Tontine', 'Remboursement Crédit']
                        : ['Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine']
                      ).map((subType: any) => (
                        <button
                          key={subType}
                          onClick={() => {
                            if (typeOperation === 'Dépôt') setTypeDepot(subType);
                            else setTypeRetrait(subType);
                            setMontant('');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all ${
                            (typeOperation === 'Dépôt' ? typeDepot : typeRetrait) === subType
                            ? 'bg-surface-elevated text-content-primary border-edge-strong'
                            : 'bg-transparent border-edge text-content-muted hover:border-edge'
                          }`}
                        >
                          {subType.replace('Retrait ', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-content-muted font-medium mb-1 block">Numéro Mobile</label>
                    <div className="relative">
                      <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className={`w-full bg-surface-base border rounded-lg py-2 pl-8 pr-3 text-sm text-content-primary focus:ring-1 focus:ring-accent/50 outline-none font-mono ${
                          phoneValidation?.warning ? 'border-status-warning/50' : 'border-edge'
                        }`}
                        placeholder="+242..."
                      />
                    </div>
                    {phoneValidation?.warning && (
                      <div className="mt-1.5 p-1.5 rounded bg-status-warning-bg border border-status-warning/20 text-[9px] text-status-warning">
                        <span className="font-bold">Sandbox:</span> {phoneValidation.warning}
                        {phoneValidation.suggestion && <span className="block font-mono text-status-warning">{phoneValidation.suggestion}</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-content-muted font-medium mb-1 block">Montant</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={montant}
                        onChange={(e) => setMontant(e.target.value)}
                        className="w-full bg-surface-base border border-edge rounded-lg py-2 pl-3 pr-14 text-sm text-content-primary font-bold focus:ring-1 focus:ring-accent/50 outline-none font-mono"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-content-muted font-bold">FCFA</span>
                    </div>
                  </div>
                </div>

                {/* Confirmation Info - Compact */}
                {typeOperation && montant && parseFloat(montant) > 0 && (
                  <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                    typeOperation === 'Dépôt' ? 'bg-status-success/5 border-status-success/20' : 'bg-status-danger/5 border-status-danger/20'
                  }`}>
                    <AlertCircle size={14} className={`shrink-0 mt-0.5 ${typeOperation === 'Dépôt' ? 'text-status-success' : 'text-status-danger'}`} />
                    <p className="text-[10px] text-content-muted leading-relaxed">
                      {typeOperation === 'Dépôt'
                        ? `Collecte de ${formatMoney(parseFloat(montant))} sur ${phoneNumber || '...'}. Validation PIN ${provider} requise.`
                        : `Envoi de ${formatMoney(parseFloat(montant))} vers ${phoneNumber || '...'}. Vérifiez l'identité du bénéficiaire.`}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Action */}
              <div className="p-3 border-t border-edge bg-surface-base/50 shrink-0">
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !montant || parseFloat(montant) <= 0 || !phoneNumber || !(typeOperation === 'Dépôt' ? typeDepot : typeRetrait)}
                  className={`w-full h-11 rounded-lg font-bold text-sm transition-all ${
                    typeOperation === 'Dépôt' ? 'bg-status-success hover:bg-status-success' : 'bg-status-danger hover:bg-status-danger'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      {typeOperation === 'Dépôt' ? 'LANCER LA COLLECTE' : "CONFIRMER L'ENVOI"}
                      <ArrowRight size={16} />
                    </span>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
