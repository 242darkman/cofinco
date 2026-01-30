import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DollarSign, Phone, FileText, CheckCircle, Users, CheckCircle2, AlertCircle, AlertTriangle, X, ChevronDown, Banknote, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../auth/AccountHolderPresenceModal';
import { usePermissions } from '../auth/ProtectedFeature';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { securityConfigApi, SecurityConfigResponse, caisseAgentApi, creditApi, compteEpargneApi, clientApi, agentTerrainApi } from '../../lib/api-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePOSPrint } from '@/hooks/usePOSPrint';
import { StatutUser, StatutClient, StatutCredit, StatutOperationTerrain, TypeOperationTerrain, TYPE_OPERATION_TERRAIN_LABELS, TYPE_COMPTE_LABELS, TypeCompteType } from '@shared/enum/status-constants';

// MM Payment status types
type MMPaymentStatus = 'idle' | 'pending' | 'success' | 'failed' | 'expired';

interface PaymentIntent {
  id: string;
  status: string;
  amount: string;
  provider: string;
  externalRef: string;
  providerTxnId?: string;
  errorMessage?: string;
}

const AirtelLogo = ({ className = '' }: { className?: string }) => (
  <img src={airtelLogo} alt="Airtel Money" className={className} />
);

const MTNLogo = ({ className = '' }: { className?: string }) => (
  <img src={mtnLogo} alt="MTN MoMo" className={className} />
);

const formatReceiptAmount = (amount: number) => {
  const formatted = new Intl.NumberFormat('fr-FR')
    .format(amount)
    .replace(/[\u00A0\u202F]/g, ' ');
  return `${formatted} FCFA`;
};

const maskAccountNumber = (value?: string) => {
  if (!value) return undefined;
  if (value.includes('*')) return value;
  const compact = value.replace(/\s+/g, '');
  const last4 = compact.slice(-4);
  if (!last4) return value;
  return `**** ${last4}`;
};

const resolveTontineStatus = (amount: number, miseParTour: number) => {
  if (miseParTour <= 0) return 'Indéfini';
  if (amount < miseParTour) return 'Retard';
  const reste = amount % miseParTour;
  if (reste === 0 && amount === miseParTour) return 'À jour';
  if (reste === 0 && amount > miseParTour) return 'Avance';
  return 'Avance partielle';
};

const mapTransactionType = (typePaiement: string) => {
  const lower = typePaiement.toLowerCase();
  if (lower.includes('tontine')) return 'TONTINE';
  if (lower.includes('remboursement')) return 'REMBOURSEMENT';
  if (lower.includes('retrait')) return 'RETRAIT';
  return 'DEPOT';
};

interface ClientTontine {
  id: string;
  tontineId: string;
  clientId: string;
  statut: string;
  totalCotisations: string;
  tontine: {
    id: string;
    nom: string;
    montantCotisation: string;
    frequence: string;
    statut: string;
  };
}

interface AgentTerrainPaiementProps {
  onClose: () => void;
  onSuccess: () => void;
  agentId?: string;
  clientId?: string;
  visiteId?: string;
}

// Compact Select Component
const CompactSelect = ({
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
  icon: Icon
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
  disabled?: boolean;
  icon?: React.ElementType;
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full h-11 px-3 ${Icon ? 'pl-9' : ''} pr-8 rounded-lg appearance-none
        bg-slate-800/80 border text-sm
        ${error ? 'border-red-500/50' : 'border-slate-700/50 focus:border-cyan-500/50'}
        text-white disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
        transition-all cursor-pointer
      `}
    >
      <option value="" className="bg-slate-900">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
      ))}
    </select>
    {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />}
    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
    {error && <p className="text-[10px] text-red-400 mt-0.5 pl-1">{error}</p>}
  </div>
);

// Searchable Select Component
const SearchableSelect = ({
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
  loading: isLoading
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; sublabel?: string }[];
  placeholder: string;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(s) ||
      (o.sublabel?.toLowerCase().includes(s))
    );
  }, [options, search]);

  const selectedOption = options.find(o => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full h-11 px-3 rounded-lg text-left flex items-center justify-between
          bg-slate-800/80 border text-sm
          ${error ? 'border-red-500/50' : 'border-slate-700/50'}
          ${isOpen ? 'border-cyan-500/50 ring-2 ring-cyan-500/20' : ''}
          text-white disabled:opacity-50 disabled:cursor-not-allowed
          transition-all
        `}
      >
        {selectedOption ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-white font-medium truncate">{selectedOption.label}</span>
            {selectedOption.sublabel && (
              <span className="text-slate-500 text-xs flex-shrink-0">• {selectedOption.sublabel}</span>
            )}
          </div>
        ) : (
          <span className="text-slate-500">{placeholder}</span>
        )}
        <ChevronDown size={14} className={`text-slate-500 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700/50 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              autoFocus
              className="w-full h-9 px-3 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div className="p-4 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                {search ? 'Aucun résultat' : 'Aucune option'}
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`
                    w-full px-3 py-2.5 text-left flex items-center gap-3
                    hover:bg-slate-800 transition-colors
                    ${value === opt.value ? 'bg-cyan-500/10' : ''}
                  `}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Users size={14} className={value === opt.value ? 'text-cyan-400' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${value === opt.value ? 'text-cyan-400' : 'text-white'}`}>
                      {opt.label}
                    </p>
                    {opt.sublabel && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Phone size={10} />
                        {opt.sublabel}
                      </p>
                    )}
                  </div>
                  {value === opt.value && <CheckCircle2 size={16} className="text-cyan-400 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400 mt-0.5 pl-1">{error}</p>}
    </div>
  );
};

export default function AgentTerrainPaiement({ onClose, onSuccess, agentId, clientId, visiteId }: AgentTerrainPaiementProps) {
  const { hasPermission } = usePermissions();
  const canCreatePayments = hasPermission('agent_terrain', 'create') || hasPermission('paiements', 'create');

  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfigResponse | null>(null);
  const [presenceVerified, setPresenceVerified] = useState<PresenceConfirmationData | null>(null);
  const [clientTontines, setClientTontines] = useState<ClientTontine[]>([]);
  const [selectedTontine, setSelectedTontine] = useState<ClientTontine | null>(null);
  const [loadingTontines, setLoadingTontines] = useState(false);
  const [clientCredits, setClientCredits] = useState<any[]>([]);
  const [clientComptes, setClientComptes] = useState<any[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [loadingComptes, setLoadingComptes] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);
  const [lastPaymentInfo, setLastPaymentInfo] = useState<any>(null);

  // Mobile Money payment state
  const [mmPaymentStatus, setMmPaymentStatus] = useState<MMPaymentStatus>('idle');
  const [mmPaymentIntent, setMmPaymentIntent] = useState<PaymentIntent | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<{
    agent_id: string;
    client_id: string;
    visite_id: string;
    montant: string;
    methode_paiement: string;
    numero_telephone: string;
    numero_transaction: string;
    type_paiement: string;
    reference: string;
    notes: string;
    credit_id: string;
    compte_id: string;
  }>({
    agent_id: agentId || '',
    client_id: clientId || '',
    visite_id: visiteId || '',
    montant: '',
    methode_paiement: 'Espèces',
    numero_telephone: '',
    numero_transaction: '',
    type_paiement: TypeOperationTerrain.TONTINE_CONTRIBUTION,
    reference: '',
    notes: '',
    credit_id: '',
    compte_id: ''
  });

  const isTontinePayment = formData.type_paiement === TypeOperationTerrain.TONTINE_CONTRIBUTION;
  const isCreditPayment = formData.type_paiement === TypeOperationTerrain.LOAN_REPAYMENT;
  const isComptePayment = formData.type_paiement === TypeOperationTerrain.SAVINGS_DEPOSIT || formData.type_paiement === TypeOperationTerrain.MISC_COLLECTION;
  const isMobileMoneyPayment = formData.methode_paiement === 'Airtel Money' || formData.methode_paiement === 'MTN Mobile Money';

  const { user } = useUserProfile();
  const { autoPrint, isPrinting } = usePOSPrint();

  const isAgentAutoSelected = useMemo(() => !!agentId, [agentId]);

  useEffect(() => {
    if (agentId) {
      setFormData(prev => ({ ...prev, agent_id: agentId }));
    }
  }, [agentId]);

  useEffect(() => {
    loadAgents();
    loadClients();
    loadSecurityConfig();
  }, []);

  useEffect(() => {
    if (agents.length > 0 && user && !formData.agent_id) {
      const matchedAgent = agents.find(
        (a: any) => a.userId === user.id || (a.nom === user.nom && a.prenom === user.prenom)
      );
      if (matchedAgent) {
        setFormData(prev => ({ ...prev, agent_id: matchedAgent.id }));
      }
    }
  }, [agents, user, formData.agent_id]);

  // Reset client when agent changes (different agence = different client list)
  useEffect(() => {
    if (formData.agent_id && formData.client_id) {
      const agent = agents.find(a => a.id === formData.agent_id);
      const client = allClients.find(c => c.id === formData.client_id);
      if (agent?.agenceId && client?.agenceId && agent.agenceId !== client.agenceId) {
        setFormData(prev => ({ ...prev, client_id: '', credit_id: '', compte_id: '' }));
        setSelectedClient(null);
      }
    }
  }, [formData.agent_id]);

  useEffect(() => {
    if (formData.client_id) {
      loadClientDetails();
      if (isTontinePayment) loadClientTontines(formData.client_id);
      if (isCreditPayment) loadClientCredits(formData.client_id);
      if (isComptePayment) loadClientComptes(formData.client_id);
    } else {
      setClientTontines([]);
      setSelectedTontine(null);
      setClientCredits([]);
      setClientComptes([]);
    }
  }, [formData.client_id, formData.type_paiement]);

  // MM Payment status polling
  useEffect(() => {
    if (!mmPaymentIntent?.id || mmPaymentStatus !== 'pending') {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/payments/${mmPaymentIntent.id}`, { credentials: 'include' });
        if (!response.ok) return;

        const intent: PaymentIntent = await response.json();
        setMmPaymentIntent(intent);

        if (intent.status === 'SUCCESS') {
          setMmPaymentStatus('success');
          toast.success('Paiement Mobile Money confirmé!');
          // Process success - create receipt and show success modal
          await handleMmPaymentSuccess(intent);
        } else if (intent.status === 'FAILED') {
          setMmPaymentStatus('failed');
          toast.error(`Paiement échoué: ${intent.errorMessage || 'Erreur inconnue'}`);
        } else if (intent.status === 'EXPIRED') {
          setMmPaymentStatus('expired');
          toast.error('Le paiement a expiré');
        }
      } catch (error) {
        console.error('[MM Poll] Error:', error);
      }
    };

    // Poll every 5 seconds
    pollingIntervalRef.current = setInterval(pollStatus, 5000);
    // Initial poll
    pollStatus();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [mmPaymentIntent?.id, mmPaymentStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const loadSecurityConfig = async () => {
    try {
      const config = await securityConfigApi.getConfig();
      setSecurityConfig(config);
    } catch (error) {
      console.error('Erreur chargement config sécurité:', error);
    }
  };

  const requiresPresenceVerification = (typePaiement: string): boolean => {
    if (!securityConfig?.requireAccountHolderPresence) return false;
    const operationsRequiringPresence = ['Retrait Épargne', 'Décaissement Crédit'];
    return operationsRequiringPresence.some(op =>
      typePaiement.toLowerCase().includes(op.toLowerCase().replace('Retrait ', '').replace('Décaissement ', ''))
    );
  };

  const loadAgents = async () => {
    try {
      const data = await agentTerrainApi.getAllList();
      setAgents(data.filter((a: any) => a.statut === StatutUser.ACTIVE));
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const data = await clientApi.getAllList();
      const activeClients = data.filter((c: any) => {
        const clientStatus = c.statut || c.status;
        return clientStatus === StatutClient.ACTIVE || clientStatus === 'ACTIVE';
      });
      setAllClients(activeClients);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const selectedAgent = useMemo(() => {
    return agents.find(a => a.id === formData.agent_id);
  }, [agents, formData.agent_id]);

  const clients = useMemo(() => {
    if (!selectedAgent?.agenceId) return allClients;
    const agentAgenceId = selectedAgent.agenceId || selectedAgent.agence_id;
    return allClients.filter(c => {
      const clientAgenceId = c.agenceId || c.agence_id;
      return clientAgenceId === agentAgenceId;
    });
  }, [allClients, selectedAgent?.agenceId]);

  const loadClientDetails = async () => {
    try {
      const data = await clientApi.getById(formData.client_id);
      if (data) {
        setSelectedClient(data);
        // Toujours pré-remplir le numéro de téléphone avec celui du client
        if (data.phone || data.telephone) {
          setFormData(prev => ({ ...prev, numero_telephone: data.phone || data.telephone || '' }));
        }
      }
    } catch (error) {
      console.error('Error loading client details:', error);
    }
  };

  const loadClientTontines = async (clientId: string) => {
    setLoadingTontines(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/tontines`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const tontines = Array.isArray(data) ? data : [];
        setClientTontines(tontines);
        if (tontines.length === 1) selectTontine(tontines[0]);
      }
    } catch (error: any) {
      console.error('Error loading client tontines:', error);
    } finally {
      setLoadingTontines(false);
    }
  };

  const loadClientCredits = async (clientId: string) => {
    setLoadingCredits(true);
    try {
      const credits = await creditApi.getByClient(clientId);
      setClientCredits((credits || []).filter((c: any) => c.statut === StatutCredit.ACTIVE || c.statut === StatutCredit.LATE));
    } catch (error: any) {
      console.error('Error loading client credits:', error);
      setClientCredits([]);
    } finally {
      setLoadingCredits(false);
    }
  };

  const loadClientComptes = async (clientId: string) => {
    setLoadingComptes(true);
    try {
      const comptes = await compteEpargneApi.getByClient(clientId);
      setClientComptes(comptes || []);
    } catch (error: any) {
      console.error('Error loading client accounts:', error);
      setClientComptes([]);
    } finally {
      setLoadingComptes(false);
    }
  };

  const selectTontine = (tontine: ClientTontine) => {
    setSelectedTontine(tontine);
    setFormData(prev => ({
      ...prev,
      montant: tontine.tontine.montantCotisation,
      notes: `Cotisation ${tontine.tontine.nom}`
    }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.agent_id) newErrors.agent_id = 'Requis';
    if (!formData.client_id) newErrors.client_id = 'Requis';
    if (!formData.montant || parseFloat(formData.montant) <= 0) newErrors.montant = 'Montant invalide';
    if (isMobileMoneyPayment) {
      // For MM payments, only phone is required (transaction ID comes from provider)
      if (!formData.numero_telephone) newErrors.numero_telephone = 'Numéro requis';
      // Validate phone format (Congo: 06XXXXXXXX or 05XXXXXXXX)
      const phoneClean = formData.numero_telephone.replace(/\s+/g, '').replace(/^\+242/, '');
      if (phoneClean.length < 9) newErrors.numero_telephone = 'Numéro invalide';
    }
    if (isTontinePayment && !selectedTontine) newErrors.tontine = 'Sélectionner une tontine';
    if (isCreditPayment && !formData.credit_id) newErrors.credit_id = 'Sélectionner un crédit';
    if (isComptePayment && !formData.compte_id) newErrors.compte_id = 'Sélectionner un compte';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const montant = parseFloat(formData.montant);
      const reference = formData.reference || `PAY-${Date.now()}`;

      const paiementData = {
        agent_id: formData.agent_id,
        client_id: formData.client_id,
        visite_id: formData.visite_id || null,
        montant,
        methode_paiement: formData.methode_paiement,
        numero_telephone: isMobileMoneyPayment ? formData.numero_telephone : null,
        numero_transaction: null, // Will come from provider for MM
        type_paiement: formData.type_paiement,
        reference,
        notes: formData.notes.trim(),
        statut: StatutOperationTerrain.SUBMITTED,
        tontineId: selectedTontine?.tontineId || null,
        membreId: selectedTontine?.id || null,
        creditId: formData.credit_id || null,
        compteId: formData.compte_id || null
      };

      // Mobile Money flow - initiate async payment
      if (isMobileMoneyPayment) {
        await initiateMobileMoneyPayment(paiementData);
        // Don't set loading to false - we're now in polling mode
        return;
      }

      // Cash flow - existing logic
      if (requiresPresenceVerification(formData.type_paiement)) {
        setPendingPaymentData(paiementData);
        setShowPresenceModal(true);
      } else {
        await finaliserPaiementDirect(paiementData);
      }
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.message || error.error || 'Erreur inconnue' });
      setLoading(false);
      setMmPaymentStatus('idle');
    }
  };

  const finaliserPaiementDirect = async (paiementData: any, presenceData?: PresenceConfirmationData) => {
    try {
      await caisseAgentApi.createCollectCash({
        agentId: paiementData.agent_id,
        clientId: paiementData.client_id,
        montant: Number(paiementData.montant),
        typePaiementClient: paiementData.type_paiement,
        numeroRecu: paiementData.reference,
        observations: `${paiementData.notes} [${paiementData.methode_paiement}]`.trim(),
        tontineId: paiementData.tontineId || undefined,
        creditId: paiementData.creditId || undefined,
        compteId: paiementData.compteId || undefined,
      });

      const validationMethod = presenceData ? `Présence vérifiée` : 'Direct';

      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: paiementData.client_id,
          activity_type: 'paiement',
          activity_description: `Collecte ${paiementData.type_paiement} - ${paiementData.montant.toLocaleString()} FCFA`,
          amount: paiementData.montant
        })
      });

      if (presenceData) setPresenceVerified(presenceData);

      if (paiementData.visite_id) {
        await fetch(`/api/visites-terrain/${paiementData.visite_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ montant_collecte: paiementData.montant, statut: 'COMPLETED' })
        });
      }

      const agent = agents.find(a => a.id === paiementData.agent_id);
      const agentName = agent ? `${agent.nom} ${agent.prenom}` : 'Agent';
      const montant = Number(paiementData.montant);
      const details: NonNullable<ReceiptData['details']> = [];

      const compteSelectionne = paiementData.compteId
        ? clientComptes.find((compte: any) => compte.id === paiementData.compteId)
        : null;
      const numeroCompte = maskAccountNumber(compteSelectionne?.numeroCompte || selectedClient?.numero_compte);

      if (paiementData.type_paiement === TypeOperationTerrain.TONTINE_CONTRIBUTION && selectedTontine) {
        const miseParTour = Number(selectedTontine.tontine.montantCotisation || 0);
        const toursRegles = miseParTour > 0 ? Math.floor(montant / miseParTour) : 0;
        details.push({ label: 'Mise/tour', value: formatReceiptAmount(miseParTour) });
        details.push({ label: 'Tours', value: `${toursRegles}` });
      } else {
        details.push({ label: 'Montant', value: formatReceiptAmount(montant), isBold: true });
      }

      const rData: ReceiptData = {
        title: 'REÇU PROVISOIRE',
        reference: paiementData.reference,
        date: new Date(),
        type: paiementData.type_paiement,
        transaction: {
          id: paiementData.reference,
          date: new Date(),
          type: mapTransactionType(paiementData.type_paiement),
          amount: montant,
          cashierName: agentName
        },
        client: {
          nom: selectedClient.nom,
          prenom: selectedClient.prenom,
          email: selectedClient.email,
          telephone: selectedClient.phone || selectedClient.telephone,
          numeroCompte: numeroCompte || selectedClient.numero_compte
        },
        agent: { nom: agentName, prenom: '' },
        details,
        items: [{
          description: `Collecte ${paiementData.type_paiement}`,
          details: paiementData.notes || 'Collecte terrain',
          montant,
          quantite: 1
        }],
        total: montant,
        modePaiement: paiementData.methode_paiement,
        devise: 'FCFA',
        notes: `${validationMethod} - En attente validation`
      };

      setReceiptData(rData);
      setLastPaymentInfo(paiementData);
      setShowSuccessModal(true);
      autoPrint(rData).catch(err => console.warn('[AutoPrint]', err.message));
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.message || "Erreur lors de l'enregistrement" });
    } finally {
      setLoading(false);
    }
  };

  const handlePresenceConfirm = async (presenceData: PresenceConfirmationData) => {
    if (!pendingPaymentData) return;
    setShowPresenceModal(false);
    setLoading(true);
    await finaliserPaiementDirect(pendingPaymentData, presenceData);
    setPendingPaymentData(null);
  };

  // Determine the payment type for the new agent MM API
  const determineAgentMmPaymentType = (typePaiement: string): 'CREDIT_REPAYMENT' | 'DEPOSIT_SAVINGS' | 'TONTINE_CONTRIBUTION' => {
    const lower = typePaiement.toLowerCase();
    if (lower.includes('remboursement') || lower.includes('credit')) return 'CREDIT_REPAYMENT';
    if (lower.includes('tontine') || lower.includes('cotisation')) return 'TONTINE_CONTRIBUTION';
    return 'DEPOSIT_SAVINGS';
  };

  // Initiate Mobile Money payment via new Agent MM API
  // This uses the new workflow: Agent initiates → MM succeeds → Client account updated immediately (no remise needed)
  const initiateMobileMoneyPayment = async (paiementData: any): Promise<void> => {
    const provider = paiementData.methode_paiement === 'MTN Mobile Money' ? 'MTN' : 'AIRTEL';

    const agent = agents.find(a => a.id === paiementData.agent_id);
    const agenceId = agent?.agenceId || agent?.agence_id;

    if (!agenceId) {
      throw new Error("L'agent n'est pas rattaché à une agence");
    }

    const typePaiement = determineAgentMmPaymentType(paiementData.type_paiement);

    const payload = {
      agentId: paiementData.agent_id,
      clientId: paiementData.client_id,
      agenceId,
      provider,
      phone: paiementData.numero_telephone,
      amount: Number(paiementData.montant),
      typePaiement,
      compteId: paiementData.compteId || undefined,
      creditId: paiementData.creditId || undefined,
      tontineId: paiementData.tontineId || undefined,
      description: paiementData.notes || `Collecte ${paiementData.type_paiement}`,
      observations: paiementData.notes,
      idempotencyKey: `agent-mm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    try {
      // Use the new agent MM payment endpoint
      const response = await fetch('/api/caisse-agent/mm-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Erreur lors de l\'initiation du paiement');
      }

      const result = await response.json();
      // The response contains the agent mm payment and the paymentIntentId
      // We'll poll the payment intent for status updates
      if (result.paymentIntentId) {
        setMmPaymentIntent({
          id: result.paymentIntentId,
          status: 'PENDING',
          amount: paiementData.montant.toString(),
          provider,
          externalRef: result.payment?.externalReference || '',
        });
        setMmPaymentStatus('pending');

        toast.info(`Paiement ${provider} initié. Veuillez confirmer sur votre téléphone.`, {
          duration: 10000,
        });
      } else {
        throw new Error('Aucun payment intent créé');
      }
    } catch (error: any) {
      throw error;
    }
  };

  // Handle successful MM payment - create receipt and show modal
  const handleMmPaymentSuccess = async (intent: PaymentIntent) => {
    const agent = agents.find(a => a.id === formData.agent_id);
    const agentName = agent ? `${agent.nom} ${agent.prenom}` : 'Agent';
    const montant = Number(intent.amount);

    const details: NonNullable<ReceiptData['details']> = [];
    const compteSelectionne = formData.compte_id
      ? clientComptes.find((compte: any) => compte.id === formData.compte_id)
      : null;
    const numeroCompte = maskAccountNumber(compteSelectionne?.numeroCompte || selectedClient?.numero_compte);

    if (formData.type_paiement === TypeOperationTerrain.TONTINE_CONTRIBUTION && selectedTontine) {
      const miseParTour = Number(selectedTontine.tontine.montantCotisation || 0);
      const toursRegles = miseParTour > 0 ? Math.floor(montant / miseParTour) : 0;
      details.push({ label: 'Mise/tour', value: formatReceiptAmount(miseParTour) });
      details.push({ label: 'Tours', value: `${toursRegles}` });
    } else {
      details.push({ label: 'Montant', value: formatReceiptAmount(montant), isBold: true });
    }

    // Add MM-specific details
    details.push({ label: 'Mode', value: formData.methode_paiement });
    details.push({ label: 'Réf. Provider', value: intent.providerTxnId || intent.externalRef || '-' });

    const rData: ReceiptData = {
      title: 'REÇU PAIEMENT MOBILE',
      reference: intent.externalRef || `MM-${Date.now()}`,
      date: new Date(),
      type: formData.type_paiement,
      transaction: {
        id: intent.id,
        date: new Date(),
        type: mapTransactionType(formData.type_paiement),
        amount: montant,
        cashierName: agentName,
      },
      client: {
        nom: selectedClient?.nom || '',
        prenom: selectedClient?.prenom || '',
        email: selectedClient?.email,
        telephone: formData.numero_telephone || selectedClient?.phone,
        numeroCompte: numeroCompte || selectedClient?.numero_compte,
      },
      agent: { nom: agentName, prenom: '' },
      details,
      items: [{
        description: `Collecte ${formData.type_paiement}`,
        details: formData.notes || `Paiement ${intent.provider}`,
        montant,
        quantite: 1,
      }],
      total: montant,
      modePaiement: formData.methode_paiement,
      devise: 'FCFA',
      notes: `Confirmé via ${intent.provider} - ${intent.providerTxnId || ''}`,
    };

    setReceiptData(rData);
    setLastPaymentInfo({
      ...formData,
      montant,
      reference: intent.externalRef,
    });
    setShowSuccessModal(true);
    setLoading(false);
    setMmPaymentStatus('idle');
    setMmPaymentIntent(null);

    // Auto-print receipt
    autoPrint(rData).catch(err => console.warn('[AutoPrint]', err.message));
  };

  // Cancel MM payment polling
  const cancelMmPayment = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setMmPaymentStatus('idle');
    setMmPaymentIntent(null);
    setLoading(false);
    toast.info('Paiement annulé');
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    setLastPaymentInfo(null);
    setPresenceVerified(null);
    onSuccess();
  };

  const montantNum = parseFloat(formData.montant) || 0;

  return (
    <>
      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={handleCloseSuccess}
        term="Terminer"
        data={receiptData}
      />

      {/* Fullscreen Modal Overlay */}
      {!showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal Content */}
          <div className="relative w-full max-w-md max-h-[92vh] bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-2xl sm:rounded-2xl border border-slate-800/50 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

            {/* Header - Fixed */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/80 backdrop-blur-sm">
              <div>
                <h2 className="text-base font-bold text-white">Nouvelle Collecte</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Enregistrer un paiement client</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <form onSubmit={handleSubmit} className="p-4 space-y-3">

                {errors.submit && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle size={14} />
                    {errors.submit}
                  </div>
                )}

                {/* Agent & Client Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Agent</label>
                    <CompactSelect
                      value={formData.agent_id}
                      onChange={(v) => setFormData({ ...formData, agent_id: v })}
                      options={agents.map(a => ({ value: a.id, label: `${a.nom} ${a.prenom}` }))}
                      placeholder="Agent..."
                      error={errors.agent_id}
                      disabled={!!agentId}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">
                      Client {clients.length > 0 && <span className="text-slate-600">({clients.length})</span>}
                    </label>
                    <SearchableSelect
                      value={formData.client_id}
                      onChange={(v) => setFormData({ ...formData, client_id: v, credit_id: '', compte_id: '' })}
                      options={clients.map(c => {
                        // Build full name from nom + prenom
                        const fullName = [c.nom, c.prenom].filter(Boolean).join(' ') || 'Sans nom';
                        const phone = c.phone || c.telephone;
                        return {
                          value: c.id,
                          label: fullName,
                          sublabel: phone || c.email || undefined
                        };
                      })}
                      placeholder="Rechercher client..."
                      error={errors.client_id}
                      disabled={!!clientId}
                      loading={loadingClients}
                    />
                  </div>
                </div>

                {/* Payment Type */}
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Type</label>
                  <CompactSelect
                    value={formData.type_paiement}
                    onChange={(v) => {
                      setFormData({ ...formData, type_paiement: v, credit_id: '', compte_id: '' });
                      setSelectedTontine(null);
                    }}
                    options={[
                      { value: TypeOperationTerrain.TONTINE_CONTRIBUTION, label: 'Cotisation Tontine' },
                      { value: TypeOperationTerrain.LOAN_REPAYMENT, label: 'Remboursement Crédit' },
                      { value: TypeOperationTerrain.SAVINGS_DEPOSIT, label: 'Dépôt Épargne' },
                      { value: TypeOperationTerrain.MISC_COLLECTION, label: 'Autre Collecte' }
                    ]}
                    placeholder="Type..."
                  />
                </div>

                {/* Tontine Selection */}
                {isTontinePayment && formData.client_id && (
                  <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={14} className="text-violet-400" />
                      <span className="text-xs font-semibold text-violet-300">Tontine</span>
                    </div>
                    {loadingTontines ? (
                      <div className="h-10 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                      </div>
                    ) : clientTontines.length === 0 ? (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5">
                        <AlertCircle size={12} />
                        Aucune tontine active
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {clientTontines.map((ct) => (
                          <button
                            key={ct.id}
                            type="button"
                            onClick={() => selectTontine(ct)}
                            className={`
                              w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-all
                              ${selectedTontine?.id === ct.id
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-slate-700/50 bg-slate-800/30 hover:border-violet-500/30'
                              }
                            `}
                          >
                            <div>
                              <p className="text-xs font-medium text-white">{ct.tontine.nom}</p>
                              <p className="text-[10px] text-slate-500">
                                {parseFloat(ct.tontine.montantCotisation).toLocaleString()} F • {ct.tontine.frequence}
                              </p>
                            </div>
                            {selectedTontine?.id === ct.id && <CheckCircle2 size={16} className="text-emerald-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.tontine && <p className="text-[10px] text-red-400 mt-1">{errors.tontine}</p>}
                  </div>
                )}

                {/* Credit Selection */}
                {isCreditPayment && (
                  <CompactSelect
                    value={formData.credit_id}
                    onChange={(v) => setFormData({ ...formData, credit_id: v })}
                    options={clientCredits.map((c: any) => ({
                      value: c.id,
                      label: `#${(c.numero || c.id).slice(0, 8)} - ${Number(c.soldeRestant || 0).toLocaleString()} F`
                    }))}
                    placeholder={loadingCredits ? 'Chargement...' : 'Sélectionner crédit'}
                    error={errors.credit_id}
                    disabled={loadingCredits || clientCredits.length === 0}
                  />
                )}

                {/* Compte Selection */}
                {isComptePayment && (
                  <CompactSelect
                    value={formData.compte_id}
                    onChange={(v) => setFormData({ ...formData, compte_id: v })}
                    options={clientComptes.map((c: any) => ({
                      value: c.id,
                      label: `${TYPE_COMPTE_LABELS[c.typeCompte as TypeCompteType] || c.typeCompte || 'Compte'} - ${(c.numeroCompte || c.id).slice(-8)}`
                    }))}
                    placeholder={loadingComptes ? 'Chargement...' : 'Sélectionner compte'}
                    error={errors.compte_id}
                    disabled={loadingComptes || clientComptes.length === 0}
                  />
                )}

                {/* Amount Section */}
                <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Montant (FCFA)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={formData.montant}
                      onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                      placeholder="0"
                      className={`
                        w-full h-14 px-4 rounded-xl text-2xl font-bold text-center
                        bg-slate-900/80 border-2
                        ${errors.montant ? 'border-red-500/50' : 'border-slate-700/50 focus:border-cyan-500/50'}
                        text-white placeholder-slate-600
                        focus:outline-none focus:ring-4 focus:ring-cyan-500/10
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                      `}
                    />
                  </div>
                  {errors.montant && <p className="text-[10px] text-red-400 mt-1 text-center">{errors.montant}</p>}

                  {/* Quick Amount Chips */}
                  <div className="flex gap-1.5 mt-2 flex-wrap justify-center">
                    {[1000, 2000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setFormData({ ...formData, montant: (montantNum + amt).toString() })}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 active:scale-95 transition-all"
                      >
                        +{(amt / 1000)}k
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, montant: '' })}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/50 text-slate-400 hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      C
                    </button>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Mode de paiement
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Espèces', label: 'Espèces', icon: Banknote, color: 'emerald' },
                      { id: 'Airtel Money', label: 'Airtel', icon: () => <AirtelLogo className="h-5 w-5" />, color: 'red' },
                      { id: 'MTN Mobile Money', label: 'MTN', icon: () => <MTNLogo className="h-5 w-5" />, color: 'yellow' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          methode_paiement: m.id,
                          numero_telephone: selectedClient?.phone || selectedClient?.telephone || formData.numero_telephone || '',
                          numero_transaction: ''
                        })}
                        className={`
                          relative py-3 px-2 rounded-xl border-2 flex flex-col items-center gap-1 transition-all
                          ${formData.methode_paiement === m.id
                            ? m.id === 'Espèces'
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : m.id === 'Airtel Money'
                                ? 'border-red-500/60 bg-red-500/10'
                                : 'border-yellow-500/60 bg-yellow-500/10'
                            : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                          }
                        `}
                      >
                        <m.icon size={18} className={
                          formData.methode_paiement === m.id
                            ? m.id === 'Espèces' ? 'text-emerald-400'
                              : m.id === 'Airtel Money' ? 'text-red-400' : 'text-yellow-400'
                            : 'text-slate-500'
                        } />
                        <span className={`text-[10px] font-semibold ${
                          formData.methode_paiement === m.id
                            ? m.id === 'Espèces' ? 'text-emerald-400'
                              : m.id === 'Airtel Money' ? 'text-red-400' : 'text-yellow-400'
                            : 'text-slate-500'
                        }`}>
                          {m.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Money Fields */}
                {isMobileMoneyPayment && (
                  <div className={`p-3 rounded-xl border ${
                    formData.methode_paiement === 'Airtel Money'
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-yellow-500/5 border-yellow-500/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Phone size={14} className={formData.methode_paiement === 'Airtel Money' ? 'text-red-400' : 'text-yellow-400'} />
                      <span className={`text-xs font-semibold ${formData.methode_paiement === 'Airtel Money' ? 'text-red-300' : 'text-yellow-300'}`}>
                        Numéro {formData.methode_paiement === 'Airtel Money' ? 'Airtel' : 'MTN'}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="tel"
                        value={formData.numero_telephone}
                        onChange={(e) => setFormData({ ...formData, numero_telephone: e.target.value })}
                        placeholder="06XXXXXXXX ou 05XXXXXXXX"
                        className={`w-full h-12 px-4 rounded-lg text-base font-medium bg-slate-900/80 border text-white placeholder-slate-600 focus:outline-none ${
                          errors.numero_telephone
                            ? 'border-red-500/50'
                            : formData.methode_paiement === 'Airtel Money'
                              ? 'border-red-500/30 focus:border-red-500/60'
                              : 'border-yellow-500/30 focus:border-yellow-500/60'
                        }`}
                      />
                    </div>
                    {errors.numero_telephone && <p className="text-[10px] text-red-400 mt-1">{errors.numero_telephone}</p>}
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      Le client recevra une demande de paiement sur ce numéro
                    </p>
                  </div>
                )}

                {/* Notes - Collapsible */}
                <details className="group">
                  <summary className="text-[10px] font-medium text-slate-500 uppercase tracking-wider cursor-pointer flex items-center gap-1 select-none">
                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                    Options avancées
                  </summary>
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      placeholder="Référence (optionnel)"
                      className="w-full h-10 px-3 rounded-lg text-sm bg-slate-800/50 border border-slate-700/30 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                    />
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Notes..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800/50 border border-slate-700/30 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none"
                    />
                  </div>
                </details>
              </form>
            </div>

            {/* Footer - Fixed */}
            <div className="flex-shrink-0 p-4 border-t border-slate-800/50 bg-slate-900/80 backdrop-blur-sm">
              {/* Total Preview */}
              {montantNum > 0 && (
                <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-xs text-emerald-300">Total</span>
                  <span className="text-lg font-bold text-emerald-400">{montantNum.toLocaleString()} <span className="text-xs">F</span></span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 h-12 rounded-xl font-semibold text-slate-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                {canCreatePayments ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || montantNum <= 0}
                    className="flex-[2] h-12 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle size={18} />
                        Valider
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex-[2] h-12 rounded-xl font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-2">
                    <AlertTriangle size={16} />
                    Permission requise
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPresenceModal && pendingPaymentData && selectedClient && (
        <AccountHolderPresenceModal
          isOpen={showPresenceModal}
          onClose={() => {
            setShowPresenceModal(false);
            setPendingPaymentData(null);
            setLoading(false);
          }}
          onConfirm={handlePresenceConfirm}
          clientName={`${selectedClient.nom} ${selectedClient.prenom || ''}`}
          clientPhone={selectedClient.phone || selectedClient.telephone}
          operationType={formData.type_paiement}
          amount={pendingPaymentData.montant}
          isLoading={loading}
        />
      )}

      {/* Mobile Money Pending Payment Overlay */}
      {mmPaymentStatus === 'pending' && mmPaymentIntent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700/50 p-6 max-w-sm mx-4 text-center animate-in zoom-in-95 duration-200">
            {/* Provider Logo */}
            <div className="mb-4">
              {mmPaymentIntent.provider === 'MTN' ? (
                <div className="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center">
                  <MTNLogo className="h-10 w-10" />
                </div>
              ) : (
                <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
                  <AirtelLogo className="h-10 w-10" />
                </div>
              )}
            </div>

            {/* Spinner */}
            <div className="mb-4">
              <Loader2 size={32} className={`mx-auto animate-spin ${
                mmPaymentIntent.provider === 'MTN' ? 'text-yellow-400' : 'text-red-400'
              }`} />
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-white mb-2">
              En attente de confirmation
            </h3>

            {/* Instructions */}
            <p className="text-sm text-slate-400 mb-4">
              Une demande de paiement a été envoyée au numéro{' '}
              <span className="font-semibold text-white">{formData.numero_telephone}</span>
            </p>

            {/* Amount */}
            <div className={`py-3 px-4 rounded-xl mb-4 ${
              mmPaymentIntent.provider === 'MTN' ? 'bg-yellow-500/10' : 'bg-red-500/10'
            }`}>
              <p className="text-xs text-slate-400 mb-1">Montant à confirmer</p>
              <p className={`text-2xl font-bold ${
                mmPaymentIntent.provider === 'MTN' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {Number(mmPaymentIntent.amount).toLocaleString()} <span className="text-sm">FCFA</span>
              </p>
            </div>

            {/* Ref */}
            <p className="text-[10px] text-slate-600 mb-4">
              Réf: {mmPaymentIntent.externalRef?.slice(0, 8)}...
            </p>

            {/* Cancel button */}
            <button
              onClick={cancelMmPayment}
              className="w-full py-3 rounded-xl font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}
