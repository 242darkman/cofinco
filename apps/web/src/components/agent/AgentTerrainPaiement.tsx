import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { DollarSign, Phone, FileText, CheckCircle, Users, CheckCircle2, AlertCircle, AlertTriangle, X, ChevronDown, Banknote, Smartphone } from 'lucide-react';
import { SelectField, SearchableSelect } from '../ui';
import { toast } from 'sonner';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../auth/AccountHolderPresenceModal';
import { usePermissions } from '../auth/ProtectedFeature';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { securityConfigApi, SecurityConfigResponse, caisseAgentApi, creditApi, compteEpargneApi, clientApi, agentTerrainApi } from '../../lib/api-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { StatutUser, StatutClient, StatutCredit, StatutOperationTerrain, TypeOperationTerrain, TYPE_OPERATION_TERRAIN_LABELS, TYPE_COMPTE_LABELS, TypeCompteType } from '@shared/enum/status-constants';
import { currencySymbol, formatMoney } from '@shared/config/currency';
import { useEnabledPaymentMethods } from '../../contexts/FeatureFlagsContext';
import { formatPhoneInput, stripPhoneFormat } from '../../lib/format';

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



export default function AgentTerrainPaiement({ onClose, onSuccess, agentId, clientId, visiteId }: AgentTerrainPaiementProps) {
  const { hasPermission } = usePermissions();
  const canCreatePayments = hasPermission('agent_terrain', 'create') || hasPermission('paiements', 'create');
  const enabledPayments = useEnabledPaymentMethods();

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
  const [selectedCredit, setSelectedCredit] = useState<any>(null);
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
  const pollingCountRef = useRef(0);
  const MM_POLLING_MAX = 60; // 60 polls × 5s = 5 minutes max

  // Mobile Money fee estimation
  const [feeOption, setFeeOption] = useState<'CLIENT_PAYS' | 'FEES_DEDUCTED' | ''>('');
  const [feeEstimate, setFeeEstimate] = useState<{
    feeAmount: number;
    feeRate: number;
    montantBrut: number;
    montantNet: number;
    feeOption: string;
  } | null>(null);
  const [loadingFeeEstimate, setLoadingFeeEstimate] = useState(false);

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

  // MM Payment status polling (with timeout after MM_POLLING_MAX polls)
  useEffect(() => {
    if (!mmPaymentIntent?.id || mmPaymentStatus !== 'pending') {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      pollingCountRef.current = 0;
      return;
    }

    const pollStatus = async () => {
      pollingCountRef.current += 1;

      // Auto-expire after max polls (5 minutes)
      if (pollingCountRef.current > MM_POLLING_MAX) {
        setMmPaymentStatus('expired');
        toast.error('Délai d\'attente dépassé. Vérifiez le statut du paiement manuellement.');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      try {
        const response = await fetch(`/api/payments/${mmPaymentIntent.id}`, { credentials: 'include' });
        if (!response.ok) return;

        const intent: PaymentIntent = await response.json();
        setMmPaymentIntent(intent);

        if (intent.status === 'SUCCESS') {
          setMmPaymentStatus('success');
          toast.success('Paiement Mobile Money confirmé!');
          await handleMmPaymentSuccess(intent);
        } else if (intent.status === 'FAILED') {
          setMmPaymentStatus('failed');
          toast.error(`Paiement échoué: ${intent.errorMessage || 'Erreur inconnue'}`);
        } else if (intent.status === 'EXPIRED') {
          setMmPaymentStatus('expired');
          toast.error('Le paiement a expiré');
        }
      } catch {
        // Transient network error — will retry on next poll
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

  // Debounced fee estimate when amount + feeOption change
  useEffect(() => {
    if (!isMobileMoneyPayment || !feeOption || !formData.montant) {
      setFeeEstimate(null);
      return;
    }

    const amount = parseFloat(formData.montant);
    if (isNaN(amount) || amount <= 0) {
      setFeeEstimate(null);
      return;
    }

    const provider = formData.methode_paiement === 'MTN Mobile Money' ? 'MTN' : 'AIRTEL';

    const timer = setTimeout(async () => {
      setLoadingFeeEstimate(true);
      try {
        const params = new URLSearchParams({
          amount: amount.toString(),
          provider,
          direction: 'COLLECTION',
          feeOption,
        });
        const res = await fetch(`/api/payments/fee-estimate?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setFeeEstimate(data);
        }
      } catch (err) {
        // Error handled silently
      } finally {
        setLoadingFeeEstimate(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.montant, formData.methode_paiement, feeOption, isMobileMoneyPayment]);

  const loadSecurityConfig = async () => {
    try {
      const config = await securityConfigApi.getConfig();
      setSecurityConfig(config);
    } catch (error) {
      // Error handled silently
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
      // Error handled silently
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
      // Error handled silently
    } finally {
      setLoadingClients(false);
    }
  };

  const selectedAgent = useMemo(() => {
    return agents.find(a => a.id === formData.agent_id);
  }, [agents, formData.agent_id]);

  const clients = useMemo(() => {
    if (!selectedAgent?.agenceId) return allClients;
    const agentAgenceId = selectedAgent.agenceId;
    return allClients.filter(c => {
      const clientAgenceId = c.agenceId;
      return clientAgenceId === agentAgenceId;
    });
  }, [allClients, selectedAgent?.agenceId]);

  const loadClientDetails = async () => {
    try {
      const data = await clientApi.getById(formData.client_id);
      if (data) {
        setSelectedClient(data);
        // Toujours pré-remplir le numéro de téléphone avec celui du client
        if (data.telephone) {
          setFormData(prev => ({ ...prev, numero_telephone: data.telephone || '' }));
        }
      }
    } catch (error) {
      // Error handled silently
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
      // Error handled silently
    } finally {
      setLoadingTontines(false);
    }
  };

  const loadClientCredits = async (clientId: string) => {
    setLoadingCredits(true);
    setSelectedCredit(null);
    try {
      const credits = await creditApi.getByClient(clientId);
      setClientCredits((credits || []).filter((c: any) => c.statut === StatutCredit.ACTIVE || c.statut === StatutCredit.LATE));
    } catch (error: any) {
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
          activity_description: `Collecte ${TYPE_OPERATION_TERRAIN_LABELS[paiementData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || paiementData.type_paiement} - ${paiementData.montant.toLocaleString()} FCFA`,
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
      const numeroCompte = maskAccountNumber(compteSelectionne?.numeroCompte || selectedClient?.numeroCompte);

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
        type: TYPE_OPERATION_TERRAIN_LABELS[paiementData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || paiementData.type_paiement,
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
          telephone: selectedClient.telephone,
          numeroCompte: numeroCompte || selectedClient.numeroCompte
        },
        agent: { nom: agentName, prenom: '' },
        details,
        items: [{
          description: TYPE_OPERATION_TERRAIN_LABELS[paiementData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || paiementData.type_paiement,
          details: paiementData.notes || 'Collecte terrain',
          montant,
          quantite: 1
        }],
        total: montant,
        modePaiement: paiementData.methode_paiement,
        devise: currencySymbol(),
        notes: `${validationMethod} - En attente validation`
      };

      setReceiptData(rData);
      setLastPaymentInfo(paiementData);
      setShowSuccessModal(true);
    } catch (error: any) {
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
    const agenceId = agent?.agenceId;

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
      description: paiementData.notes || (TYPE_OPERATION_TERRAIN_LABELS[paiementData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || paiementData.type_paiement),
      observations: paiementData.notes,
      idempotencyKey: `agent-mm-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(36)).join('').slice(0, 9)}`,
      ...(feeOption && { feeOption }),
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
    const numeroCompte = maskAccountNumber(compteSelectionne?.numeroCompte || selectedClient?.numeroCompte);

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
      type: TYPE_OPERATION_TERRAIN_LABELS[formData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || formData.type_paiement,
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
        telephone: formData.numero_telephone || selectedClient?.telephone,
        numeroCompte: numeroCompte || selectedClient?.numeroCompte,
      },
      agent: { nom: agentName, prenom: '' },
      details,
      items: [{
        description: TYPE_OPERATION_TERRAIN_LABELS[formData.type_paiement as keyof typeof TYPE_OPERATION_TERRAIN_LABELS] || formData.type_paiement,
        details: formData.notes || `Paiement ${intent.provider}`,
        montant,
        quantite: 1,
      }],
      total: montant,
      modePaiement: formData.methode_paiement,
      devise: currencySymbol(),
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

          {/* Modal Content — flex column, full-width on mobile, max-w-lg on desktop */}
          <div className="relative w-full sm:max-w-lg max-h-[92vh] bg-gradient-to-b from-surface-base to-surface-base rounded-t-2xl sm:rounded-2xl border border-edge/50 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

            {/* ── HEADER ── */}
            <div className="shrink-0 px-5 py-4 border-b border-edge/50 flex items-center justify-between bg-surface-base/80 backdrop-blur-sm">
              <div>
                <h2 className="text-lg font-bold text-content-primary">Nouvelle Collecte</h2>
                <p className="text-[13px] text-content-muted mt-0.5">Enregistrer un paiement client</p>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* ── SCROLLABLE FORM CONTENT ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <form onSubmit={handleSubmit} className="p-5 space-y-4">

                {errors.submit && (
                  <div className="bg-status-danger-bg border border-status-danger/30 text-status-danger px-4 py-3 rounded-xl text-[13px] flex items-center gap-2">
                    <AlertCircle size={16} />
                    {errors.submit}
                  </div>
                )}

                {/* ── SECTION 1 : QUI ── */}
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-content-secondary">Identification</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <SelectField
                        label="Agent"
                        name="agent_id"
                        value={formData.agent_id}
                        onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                        options={agents.map((a: any) => ({ value: a.id, label: `${a.nom} ${a.prenom}` }))}
                        placeholder="Sélectionner un agent"
                        error={errors.agent_id}
                        disabled={!!agentId}
                      />
                    </div>
                    <div className="flex-1">
                      <SearchableSelect
                        label="Client"
                        name="client_id"
                        value={formData.client_id}
                        onChange={(val) => setFormData({ ...formData, client_id: String(val), credit_id: '', compte_id: '' })}
                        options={clients.map((c: any) => {
                          const fullName = [c.nom, c.prenom].filter(Boolean).join(' ') || 'Sans nom';
                          return {
                            value: c.id,
                            label: fullName,
                            subLabel: c.telephone || c.email || undefined
                          };
                        })}
                        placeholder="Rechercher client..."
                        error={errors.client_id}
                        disabled={!!clientId}
                        isLoading={loadingClients}
                      />
                    </div>
                  </div>
                </div>

                {/* ── SECTION 2 : QUOI ── */}
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-content-secondary">Opération</p>
                  <SelectField
                    label="Type d'opération"
                    name="type_paiement"
                    value={formData.type_paiement}
                    onChange={(e) => {
                      setFormData({ ...formData, type_paiement: e.target.value, credit_id: '', compte_id: '' });
                      setSelectedTontine(null);
                    }}
                    options={[
                      { value: TypeOperationTerrain.TONTINE_CONTRIBUTION, label: 'Cotisation Tontine' },
                      { value: TypeOperationTerrain.LOAN_REPAYMENT, label: 'Remboursement Crédit' },
                      { value: TypeOperationTerrain.SAVINGS_DEPOSIT, label: 'Dépôt Épargne' },
                      { value: TypeOperationTerrain.MISC_COLLECTION, label: 'Autre Collecte' }
                    ]}
                    placeholder="Type d'opération..."
                  />

                  {/* Tontine Selection */}
                  {isTontinePayment && formData.client_id && (
                    <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users size={16} className="text-accent" />
                        <span className="text-[13px] font-semibold text-accent">Tontine</span>
                      </div>
                      {loadingTontines ? (
                        <div className="py-4 flex items-center justify-center">
                          <Spinner size="sm" />
                        </div>
                      ) : clientTontines.length === 0 ? (
                        <p className="text-[13px] text-status-warning flex items-center gap-2">
                          <AlertCircle size={14} />
                          Aucune tontine active
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {clientTontines.map((ct) => (
                            <button
                              key={ct.id}
                              type="button"
                              onClick={() => selectTontine(ct)}
                              className={`
                                w-full px-4 py-3 rounded-xl border text-left flex items-center justify-between transition-all
                                ${selectedTontine?.id === ct.id
                                  ? 'border-status-success/50 bg-status-success-bg'
                                  : 'border-edge-subtle bg-surface/30 hover:border-accent/30'
                                }
                              `}
                            >
                              <div>
                                <p className="text-[13px] font-medium text-content-primary">{ct.tontine.nom}</p>
                                <p className="text-[12px] text-content-muted">
                                  {formatMoney(ct.tontine.montantCotisation)} • {ct.tontine.frequence}
                                </p>
                              </div>
                              {selectedTontine?.id === ct.id && <CheckCircle2 size={18} className="text-status-success" />}
                            </button>
                          ))}
                        </div>
                      )}
                      {errors.tontine && <p className="text-[12px] text-status-danger mt-2">{errors.tontine}</p>}
                    </div>
                  )}

                  {/* Credit Selection */}
                  {isCreditPayment && (
                    <div className="space-y-2">
                      <SelectField
                        label="Crédit"
                        name="credit_id"
                        value={formData.credit_id}
                        onChange={(e) => {
                          const creditId = e.target.value;
                          const credit = clientCredits.find((c: any) => c.id === creditId) || null;
                          setSelectedCredit(credit);
                          const echeance = credit?.montantEcheance ? String(Math.round(Number(credit.montantEcheance))) : '';
                          setFormData(prev => ({
                            ...prev,
                            credit_id: creditId,
                            montant: echeance,
                            notes: credit ? `Remboursement ${credit.numeroCredit || ''}`.trim() : '',
                          }));
                        }}
                        options={clientCredits.map((c: any) => ({
                          value: c.id,
                          label: `${c.numeroCredit || c.id.slice(0, 8)} — Solde: ${formatMoney(c.soldeRestant)}`
                        }))}
                        placeholder={loadingCredits ? 'Chargement...' : 'Sélectionner crédit'}
                        error={errors.credit_id}
                        disabled={loadingCredits || clientCredits.length === 0}
                      />
                      {selectedCredit && (
                        <div className="bg-surface-subtle rounded-lg px-3 py-2 text-[11px] space-y-1 border border-edge-subtle">
                          <div className="flex justify-between">
                            <span className="text-content-muted">Solde restant</span>
                            <span className="font-semibold text-content-primary">{formatMoney(selectedCredit.soldeRestant)}</span>
                          </div>
                          {selectedCredit.montantEcheance && (
                            <div className="flex justify-between">
                              <span className="text-content-muted">Échéance ({selectedCredit.echeance?.toLowerCase() || 'périodique'})</span>
                              <span className="font-semibold text-accent">{formatMoney(selectedCredit.montantEcheance)}</span>
                            </div>
                          )}
                          {selectedCredit.prochaineEcheance && (
                            <div className="flex justify-between">
                              <span className="text-content-muted">Prochaine échéance</span>
                              <span className="text-content-secondary">{new Date(selectedCredit.prochaineEcheance).toLocaleDateString('fr-FR')}</span>
                            </div>
                          )}
                          {selectedCredit.statut === 'LATE' && (
                            <div className="text-status-danger font-medium mt-1 flex items-center gap-1">
                              <AlertTriangle size={11} />
                              Crédit en retard de paiement
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Compte Selection */}
                  {isComptePayment && (
                    <SelectField
                      label="Compte"
                      name="compte_id"
                      value={formData.compte_id}
                      onChange={(e) => setFormData({ ...formData, compte_id: e.target.value })}
                      options={clientComptes.map((c: any) => ({
                        value: c.id,
                        label: `${TYPE_COMPTE_LABELS[c.typeCompte as TypeCompteType] || c.typeCompte || 'Compte'} - ${(c.numeroCompte || c.id).slice(-8)}`
                      }))}
                      placeholder={loadingComptes ? 'Chargement...' : 'Sélectionner compte'}
                      error={errors.compte_id}
                      disabled={loadingComptes || clientComptes.length === 0}
                    />
                  )}
                </div>

                {/* ── SECTION 3 : COMBIEN ── */}
                <div className="bg-surface/30 rounded-xl p-4 border border-edge-subtle space-y-3">
                  <label className="text-[13px] font-semibold text-content-secondary block">
                    Montant ({currencySymbol()})
                  </label>
                  <div className="relative">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={formData.montant}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, montant: v }); }}
                      placeholder="0"
                      className={`
                        w-full py-4 px-5 rounded-xl text-3xl font-bold text-center
                        bg-surface-base/80 border-2
                        ${errors.montant ? 'border-status-danger/50' : 'border-edge-subtle focus:border-accent/50'}
                        text-content-primary placeholder-content-muted
                        focus:outline-none focus:ring-4 focus:ring-accent/10
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                      `}
                    />
                  </div>
                  {errors.montant && <p className="text-[12px] text-status-danger text-center">{errors.montant}</p>}

                  {/* Quick Amount Chips — flex-wrap, no fixed sizes */}
                  <div className="flex gap-2 flex-wrap justify-center">
                    {[1000, 2000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setFormData({ ...formData, montant: (montantNum + amt).toString() })}
                        className="px-4 py-2.5 rounded-full text-[13px] font-semibold bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 active:scale-95 transition-all"
                      >
                        +{(amt / 1000)}k
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, montant: '' })}
                      className="px-4 py-2.5 rounded-full text-[13px] font-semibold bg-surface-elevated/50 text-content-muted hover:bg-surface-elevated active:scale-95 transition-all"
                    >
                      C
                    </button>
                  </div>
                </div>

                {/* ── SECTION 4 : COMMENT ── */}
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-content-secondary">Mode de paiement</p>
                  <div className="flex gap-3">
                    {[
                      { id: 'Espèces', label: 'Espèces', icon: Banknote, color: 'emerald', paymentKey: 'CASH' as const },
                      { id: 'Airtel Money', label: 'Airtel', icon: () => <AirtelLogo className="h-6 w-6" />, color: 'red', paymentKey: 'MOBILE_MONEY' as const },
                      { id: 'MTN Mobile Money', label: 'MTN', icon: () => <MTNLogo className="h-6 w-6" />, color: 'yellow', paymentKey: 'MOBILE_MONEY' as const }
                    ].filter((m) => enabledPayments[m.paymentKey] !== false).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            methode_paiement: m.id,
                            numero_telephone: selectedClient?.telephone || formData.numero_telephone || '',
                            numero_transaction: ''
                          });
                          setFeeOption('');
                          setFeeEstimate(null);
                        }}
                        className={`
                          flex-1 py-4 px-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all
                          ${formData.methode_paiement === m.id
                            ? m.id === 'Espèces'
                              ? 'border-status-success/60 bg-status-success-bg'
                              : m.id === 'Airtel Money'
                                ? 'border-status-danger/60 bg-status-danger-bg'
                                : 'border-status-warning/60 bg-status-warning-bg'
                            : 'border-edge-subtle bg-surface/30 hover:border-edge-strong'
                          }
                        `}
                      >
                        <m.icon size={22} className={
                          formData.methode_paiement === m.id
                            ? m.id === 'Espèces' ? 'text-status-success'
                              : m.id === 'Airtel Money' ? 'text-status-danger' : 'text-status-warning'
                            : 'text-content-muted'
                        } />
                        <span className={`text-[13px] font-semibold ${
                          formData.methode_paiement === m.id
                            ? m.id === 'Espèces' ? 'text-status-success'
                              : m.id === 'Airtel Money' ? 'text-status-danger' : 'text-status-warning'
                            : 'text-content-muted'
                        }`}>
                          {m.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Money Fields */}
                {isMobileMoneyPayment && (
                  <div className={`p-4 rounded-xl border ${
                    formData.methode_paiement === 'Airtel Money'
                      ? 'bg-status-danger/5 border-status-danger/20'
                      : 'bg-status-warning/5 border-status-warning/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Phone size={16} className={formData.methode_paiement === 'Airtel Money' ? 'text-status-danger' : 'text-status-warning'} />
                      <span className={`text-[13px] font-semibold ${formData.methode_paiement === 'Airtel Money' ? 'text-status-danger' : 'text-status-warning'}`}>
                        Numéro {formData.methode_paiement === 'Airtel Money' ? 'Airtel' : 'MTN'}
                      </span>
                    </div>
                    <input
                      type="tel"
                      value={formatPhoneInput(formData.numero_telephone || '')}
                      onChange={(e) => setFormData({ ...formData, numero_telephone: stripPhoneFormat(e.target.value) })}
                      placeholder="06 XXX XX XX"
                      className={`w-full py-3 px-4 rounded-lg text-[15px] font-medium bg-surface-base/80 border text-content-primary placeholder-content-muted focus:outline-none ${
                        errors.numero_telephone
                          ? 'border-status-danger/50'
                          : formData.methode_paiement === 'Airtel Money'
                            ? 'border-status-danger/30 focus:border-status-danger/60'
                            : 'border-status-warning/30 focus:border-status-warning/60'
                      }`}
                    />
                    {errors.numero_telephone && <p className="text-[12px] text-status-danger mt-1">{errors.numero_telephone}</p>}
                    <p className="text-[12px] text-content-muted mt-2">
                      Le client recevra une demande de paiement sur ce numéro
                    </p>

                    {/* Fee Option */}
                    <div className="mt-4 pt-4 border-t border-edge-subtle/50">
                      <label className="text-[12px] font-medium text-content-muted uppercase tracking-wider mb-2 block">
                        Option frais Mobile Money
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFeeOption(feeOption === 'CLIENT_PAYS' ? '' : 'CLIENT_PAYS')}
                          className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                            feeOption === 'CLIENT_PAYS'
                              ? 'border-accent/50 bg-accent/10'
                              : 'border-edge-subtle bg-surface-base/50 hover:border-edge'
                          }`}
                        >
                          <p className={`text-[13px] font-bold ${feeOption === 'CLIENT_PAYS' ? 'text-accent' : 'text-content-primary'}`}>
                            Client paie en plus
                          </p>
                          <p className="text-[11px] text-content-muted mt-0.5">Frais ajoutés au montant</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeeOption(feeOption === 'FEES_DEDUCTED' ? '' : 'FEES_DEDUCTED')}
                          className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                            feeOption === 'FEES_DEDUCTED'
                              ? 'border-accent/50 bg-accent/10'
                              : 'border-edge-subtle bg-surface-base/50 hover:border-edge'
                          }`}
                        >
                          <p className={`text-[13px] font-bold ${feeOption === 'FEES_DEDUCTED' ? 'text-accent' : 'text-content-primary'}`}>
                            Frais déduits
                          </p>
                          <p className="text-[11px] text-content-muted mt-0.5">Frais déduits du montant</p>
                        </button>
                      </div>

                      {/* Fee Preview */}
                      {feeOption && feeEstimate && (
                        <div className="mt-3 bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-1.5">
                          <div className="flex justify-between text-[13px]">
                            <span className="text-content-muted">Montant opération</span>
                            <span className="text-content-primary font-medium">{formatMoney(feeEstimate.montantBrut)}</span>
                          </div>
                          <div className="flex justify-between text-[13px]">
                            <span className="text-content-muted">Frais MM ({feeEstimate.feeRate}%)</span>
                            <span className="text-content-primary font-medium">{formatMoney(feeEstimate.feeAmount)}</span>
                          </div>
                          <div className="flex justify-between text-[13px] pt-1.5 border-t border-accent/20">
                            <span className="text-content-muted font-semibold">
                              {feeOption === 'CLIENT_PAYS' ? 'Total débité du téléphone' : 'Crédité au compte'}
                            </span>
                            <span className="text-content-primary font-bold">
                              {formatMoney(feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut : feeEstimate.montantNet)}
                            </span>
                          </div>
                        </div>
                      )}
                      {feeOption && loadingFeeEstimate && (
                        <div className="mt-2 flex items-center gap-2 text-[12px] text-content-muted">
                          <Spinner size="xs" tone="current" />
                          Calcul des frais...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes - Collapsible */}
                <details className="group">
                  <summary className="text-[13px] font-medium text-content-muted cursor-pointer flex items-center gap-1.5 select-none py-1">
                    <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                    Options avancées
                  </summary>
                  <div className="mt-3 space-y-3">
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      placeholder="Référence (optionnel)"
                      className="w-full py-3 px-4 rounded-xl text-[13px] bg-surface/50 border border-edge-subtle text-content-primary placeholder-content-muted focus:outline-none focus:border-accent/50"
                    />
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Notes..."
                      rows={2}
                      className="w-full py-3 px-4 rounded-xl text-[13px] bg-surface/50 border border-edge-subtle text-content-primary placeholder-content-muted focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                </details>
              </form>
            </div>

            {/* ── FOOTER ── */}
            <div className="shrink-0 p-5 border-t border-edge/50 bg-surface-base/80 backdrop-blur-sm space-y-3">
              {/* Total Preview */}
              {montantNum > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-status-success-bg border border-status-success/20">
                  <span className="text-[13px] text-status-success font-medium">
                    {feeEstimate && feeOption === 'CLIENT_PAYS' ? 'Total débité' : 'Total'}
                  </span>
                  <span className="text-xl font-bold text-status-success">
                    {(feeEstimate && feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut : montantNum).toLocaleString('fr-FR')} <span className="text-[13px]">{currencySymbol()}</span>
                  </span>
                </div>
              )}

              {/* Action Buttons — Valider full-width, Annuler as text link */}
              {canCreatePayments ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || montantNum <= 0}
                  className="w-full py-4 rounded-xl font-semibold text-white bg-linear-to-r from-status-success to-accent hover:from-status-success/90 hover:to-accent/90 shadow-lg shadow-status-success/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? (
                    <Spinner size="sm" tone="onAccent" />
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      <span className="text-[15px]">Valider la collecte</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full py-4 rounded-xl font-semibold text-status-warning bg-status-warning-bg border border-status-warning/30 flex items-center justify-center gap-2">
                  <AlertTriangle size={18} />
                  <span className="text-[13px]">Permission requise</span>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full py-2 text-[13px] font-medium text-content-muted hover:text-content-primary transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
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
          clientPhone={selectedClient.telephone}
          operationType={formData.type_paiement}
          amount={pendingPaymentData.montant}
          isLoading={loading}
        />
      )}

      {/* Mobile Money Pending Payment Overlay */}
      {mmPaymentStatus === 'pending' && mmPaymentIntent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative bg-surface-base rounded-2xl border border-edge-subtle p-6 max-w-sm mx-4 text-center animate-in zoom-in-95 duration-200">
            {/* Provider Logo */}
            <div className="mb-4">
              {mmPaymentIntent.provider === 'MTN' ? (
                <div className="w-16 h-16 mx-auto bg-status-warning-bg rounded-full flex items-center justify-center">
                  <MTNLogo className="h-10 w-10" />
                </div>
              ) : (
                <div className="w-16 h-16 mx-auto bg-status-danger-bg rounded-full flex items-center justify-center">
                  <AirtelLogo className="h-10 w-10" />
                </div>
              )}
            </div>

            {/* Spinner */}
            <div className="mb-4">
              <Spinner size="md" tone="current" className={`mx-auto ${
                mmPaymentIntent.provider === 'MTN' ? 'text-status-warning' : 'text-status-danger'
              }`} />
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-content-primary mb-2">
              En attente de confirmation
            </h3>

            {/* Instructions */}
            <p className="text-sm text-content-muted mb-4">
              Une demande de paiement a été envoyée au numéro{' '}
              <span className="font-semibold text-content-primary">{formData.numero_telephone}</span>
            </p>

            {/* Amount */}
            <div className={`py-3 px-4 rounded-xl mb-4 ${
              mmPaymentIntent.provider === 'MTN' ? 'bg-status-warning-bg' : 'bg-status-danger-bg'
            }`}>
              <p className="text-xs text-content-muted mb-1">Montant à confirmer</p>
              <p className={`text-2xl font-bold ${
                mmPaymentIntent.provider === 'MTN' ? 'text-status-warning' : 'text-status-danger'
              }`}>
                {formatMoney(mmPaymentIntent.amount)}
              </p>
            </div>

            {/* Ref */}
            <p className="text-[10px] text-content-muted mb-4">
              Réf: {mmPaymentIntent.externalRef?.slice(0, 8)}...
            </p>

            {/* Cancel button */}
            <button
              onClick={cancelMmPayment}
              className="w-full py-3 rounded-xl font-semibold text-content-muted bg-surface hover:bg-surface-elevated border border-edge transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}
