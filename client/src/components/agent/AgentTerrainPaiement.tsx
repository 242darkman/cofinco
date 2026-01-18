import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Phone, FileText, CheckCircle, Users, CheckCircle2, AlertCircle, AlertTriangle, Printer } from 'lucide-react';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../auth/AccountHolderPresenceModal';
import { Modal, Button, FormField, SelectField, TextareaField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { securityConfigApi, SecurityConfigResponse, caisseAgentApi, creditApi, compteEpargneApi, clientApi, agentTerrainApi } from '../../lib/api-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePOSPrint } from '@/hooks/usePOSPrint';

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

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
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

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    client_id: clientId || '',
    visite_id: visiteId || '',
    montant: '',
    methode_paiement: 'Espèces',
    numero_telephone: '',
    numero_transaction: '',
    type_paiement: 'Versement Tontine',
    reference: '',
    notes: '',
    credit_id: '',
    compte_id: ''
  });

  const isTontinePayment = formData.type_paiement === 'Versement Tontine';
  const isCreditPayment = formData.type_paiement === 'Remboursement Crédit';
  const isComptePayment = ['Dépôt Épargne', 'Dépôt Courant', 'Dépôt Bloqué'].includes(formData.type_paiement);

  // Auth context for auto-select agent
  const { user } = useUserProfile();
  
  // POS Print service
  const { autoPrint, isPrinting } = usePOSPrint();
  
  // Auto-select agent from auth context
  const isAgentAutoSelected = useMemo(() => {
    // If agentId prop provided, use it. Otherwise try to match user to agent.
    return !!agentId;
  }, [agentId]);

  // Sync formData with agentId prop
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
  
  // Auto-select agent when agents are loaded and user is logged in
  useEffect(() => {
    if (agents.length > 0 && user && !formData.agent_id) {
      // Try to find agent matching current user by name or ID
      const matchedAgent = agents.find(
        (a: any) => a.userId === user.id || 
                    (a.nom === user.nom && a.prenom === user.prenom)
      );
      if (matchedAgent) {
        setFormData(prev => ({ ...prev, agent_id: matchedAgent.id }));
      }
    }
  }, [agents, user, formData.agent_id]);

  useEffect(() => {
    if (formData.client_id) {
      loadClientDetails();
      if (isTontinePayment) {
        loadClientTontines(formData.client_id);
      }
      if (isCreditPayment) {
        loadClientCredits(formData.client_id);
      }
      if (isComptePayment) {
        loadClientComptes(formData.client_id);
      }
    } else {
      setClientTontines([]);
      setSelectedTontine(null);
      setClientCredits([]);
      setClientComptes([]);
    }
  }, [formData.client_id, formData.type_paiement]);

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
      setAgents(data.filter((a: any) => a.statut === 'Actif'));
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadClients = async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data.filter((c: any) => c.status === 'Actif'));
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const loadClientDetails = async () => {
    try {
      const data = await clientApi.getById(formData.client_id);
      if (data) {
        setSelectedClient(data);
        if (formData.methode_paiement !== 'Espèces' && !formData.numero_telephone) {
          setFormData(prev => ({ ...prev, numero_telephone: data.phone }));
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
        if (tontines.length === 1) {
          selectTontine(tontines[0]);
        }
      }
    } catch (error) {
      console.error('Error loading client tontines:', error);
    } finally {
      setLoadingTontines(false);
    }
  };

  const loadClientCredits = async (clientId: string) => {
    setLoadingCredits(true);
    try {
      const credits = await creditApi.getByClient(clientId);
      setClientCredits((credits || []).filter((c: any) => c.statut === 'Actif' || c.statut === 'En retard'));
    } catch (error) {
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
    } catch (error) {
      console.error('Error loading client accounts:', error);
      setClientComptes([]);
    } finally {
      setLoadingComptes(false);
    }
  };

  const selectTontine = (tontine: ClientTontine) => {
    setSelectedTontine(tontine);
    const montantCotisation = tontine.tontine.montantCotisation;
    setFormData(prev => ({
      ...prev,
      montant: montantCotisation,
      notes: `Cotisation ${tontine.tontine.nom} - ${tontine.tontine.frequence}`
    }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.agent_id) newErrors.agent_id = 'Sélectionner un agent';
    if (!formData.client_id) newErrors.client_id = 'Sélectionner un client';
    if (!formData.montant || parseFloat(formData.montant) <= 0) {
      newErrors.montant = 'Montant invalide';
    }
    if (['Airtel Money', 'MTN Mobile Money'].includes(formData.methode_paiement) && !formData.numero_telephone) {
      newErrors.numero_telephone = 'Numéro requis pour Mobile Money';
    }
    if (['Airtel Money', 'MTN Mobile Money'].includes(formData.methode_paiement) && !formData.numero_transaction) {
      newErrors.numero_transaction = 'Numéro de transaction requis';
    }
    if (isTontinePayment && !selectedTontine) {
      newErrors.tontine = 'Veuillez sélectionner une tontine';
    }
    if (isCreditPayment && !formData.credit_id) {
      newErrors.credit_id = 'Veuillez sélectionner un crédit';
    }
    if (isComptePayment && !formData.compte_id) {
      newErrors.compte_id = 'Veuillez sélectionner un compte';
    }
    if (!selectedClient) {
      newErrors.client_id = 'Chargement des données client...';
    }

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
        numero_telephone: formData.methode_paiement !== 'Espèces' ? formData.numero_telephone : null,
        numero_transaction: formData.methode_paiement !== 'Espèces' ? formData.numero_transaction : null,
        type_paiement: formData.type_paiement,
        reference,
        notes: formData.notes.trim(),
        statut: 'Pending',
        tontineId: selectedTontine?.tontineId || null,
        membreId: selectedTontine?.id || null,
        creditId: formData.credit_id || null,
        compteId: formData.compte_id || null
      };

      const needsPresenceVerification = requiresPresenceVerification(formData.type_paiement);

      if (needsPresenceVerification) {
        setPendingPaymentData(paiementData);
        setShowPresenceModal(true);
      } else {
        await finaliserPaiementDirect(paiementData);
      }

    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
      setLoading(false);
    }
  };

  const finaliserPaiementDirect = async (paiementData: any, presenceData?: PresenceConfirmationData) => {
    try {
      // Use caisseAgentApi.createCollectCash for Pending Operations flow
      await caisseAgentApi.createCollectCash({
        agentId: paiementData.agent_id,
        clientId: paiementData.client_id,
        montant: Number(paiementData.montant),
        typePaiementClient: paiementData.type_paiement,
        numeroRecu: paiementData.reference,
        observations: `${paiementData.notes} [Methode: ${paiementData.methode_paiement}] ${paiementData.numeroTelephone ? `[Tel: ${paiementData.numeroTelephone}]` : ''} ${paiementData.numeroTransaction ? `[Trans: ${paiementData.numeroTransaction}]` : ''}`,
        tontineId: paiementData.tontineId || undefined,
        creditId: paiementData.creditId || undefined,
        compteId: paiementData.compteId || undefined,
        // membreId not supported in schema directly, implicit via tontine logic?
      });

      // NO manual update of Tontine/Client Account here. 
      // The backend 'operations-terrain' service + 'approval-service' handles it upon validation.

      const validationMethod = presenceData
        ? `Présence titulaire vérifiée`
        : 'Validation directe';

      // Log activity (optional, but good for tracking)
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: paiementData.client_id,
          activity_type: 'paiement',
          activity_description: `Collecte ${paiementData.type_paiement} - ${paiementData.montant.toLocaleString()} FCFA (En attente de validation)`,
          amount: paiementData.montant
        })
      });

      if (presenceData) setPresenceVerified(presenceData);

      if (paiementData.visite_id) {
        await fetch(`/api/visites-terrain/${paiementData.visite_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            montant_collecte: paiementData.montant,
            statut: 'Effectuée'
          })
        });
      }

      // Receipt Generation
      const agent = agents.find(a => a.id === paiementData.agent_id);
      const agentName = agent ? `${agent.nom} ${agent.prenom}` : 'Agent Terrain';

      const montant = Number(paiementData.montant);
      const details: NonNullable<ReceiptData['details']> = [];
      const compteSelectionne = paiementData.compteId
        ? clientComptes.find((compte: any) => compte.id === paiementData.compteId)
        : null;
      const numeroCompte = maskAccountNumber(
        compteSelectionne?.numeroCompte || selectedClient?.numero_compte
      );

      if (paiementData.type_paiement === 'Versement Tontine' && selectedTontine) {
        const miseParTour = Number(selectedTontine.tontine.montantCotisation || 0);
        const toursRegles = miseParTour > 0 ? Math.floor(montant / miseParTour) : 0;
        const statut = resolveTontineStatus(montant, miseParTour);
        details.push({ label: 'Mise par tour', value: formatReceiptAmount(miseParTour) });
        details.push({
          label: 'Tours réglés',
          value: `${toursRegles} ${toursRegles > 1 ? 'tours' : 'tour'}`
        });
        details.push({ label: 'Avance/Retard', value: statut });
      } else {
        details.push({ label: 'Montant', value: formatReceiptAmount(montant), isBold: true });
      }

      const rData: ReceiptData = {
        title: 'REÇU PROVISOIRE',
        reference: paiementData.reference || `PAY-${Date.now()}`,
        date: new Date(),
        type: paiementData.type_paiement,
        transaction: {
          id: paiementData.reference || `PAY-${Date.now()}`,
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
        agent: {
          nom: agentName,
          prenom: ''
        },
        details,
        items: [{
          description: `Collecte ${paiementData.type_paiement} (En attente)`,
          details: paiementData.notes || 'Collecte terrain',
          montant: montant,
          quantite: 1
        }],
        total: montant,
        modePaiement: paiementData.methode_paiement,
        devise: 'FCFA',
        notes: `${validationMethod} - En attente de validation agence`
      };

      setReceiptData(rData);
      setLastPaymentInfo(paiementData);
      setShowSuccessModal(true);
      
      // Auto-print receipt on POS devices
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
    try {
      await finaliserPaiementDirect(pendingPaymentData, presenceData);
    } catch (error: any) {
       // Error handled in finaliser
    } finally {
      setPendingPaymentData(null);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    setLastPaymentInfo(null);
    setPresenceVerified(null);
    onSuccess();
  };

  return (
    <>
      <UniversalPaymentSuccessModal 
        isOpen={showSuccessModal}
        onClose={handleCloseSuccess}
        term="Terminer"
        data={receiptData}
      />

      <Modal
        isOpen={!showSuccessModal}
        onClose={onClose}
        title="Enregistrer un Paiement"
        size="lg"
        footer={
           <div className="flex gap-2 w-full sm:w-auto">
             <Button variant="ghost" onClick={onClose} disabled={loading} className="flex-1 sm:flex-none">
               Annuler
             </Button>
             {canCreatePayments ? (
               <Button variant="success" onClick={handleSubmit} isLoading={loading} icon={CheckCircle} className="flex-1 sm:flex-none">
                 Valider
               </Button>
             ) : (
               <div className="flex-1 sm:flex-none px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg font-medium flex items-center justify-center gap-2">
                 <AlertTriangle size={16} />
                 Permission requise
               </div>
             )}
           </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.submit && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">
              {errors.submit}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <SelectField
              label="Agent *"
              name="agent_id"
              value={formData.agent_id}
              onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
              options={agents.map(a => ({ value: a.id, label: `${a.nom} ${a.prenom}` }))}
              error={errors.agent_id}
              disabled={!!agentId}
              placeholder="Sélectionner un agent"
            />
            
            <SelectField
              label="Client *"
              name="client_id"
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value, credit_id: '', compte_id: '' })}
              options={clients.map(c => ({ value: c.id, label: `${c.nom} - ${c.telephone}` }))}
              error={errors.client_id}
              disabled={!!clientId}
              placeholder="Sélectionner un client"
            />
          </div>

          {selectedClient && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-400">Crédit Total:</span>
                  <span className="text-white font-semibold ml-2">
                    {selectedClient.credit_total?.toLocaleString() || 0} FCFA
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Épargne Total:</span>
                  <span className="text-white font-semibold ml-2">
                    {selectedClient.epargne_total?.toLocaleString() || 0} FCFA
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <SelectField
              label="Type de Paiement *"
              name="type_paiement"
              value={formData.type_paiement}
              onChange={(e) => {
                setFormData({ ...formData, type_paiement: e.target.value, credit_id: '', compte_id: '' });
                setSelectedTontine(null);
              }}
              options={[
                { value: 'Versement Tontine', label: 'Tontine' },
                { value: 'Remboursement Crédit', label: 'Crédit' },
                { value: 'Dépôt Épargne', label: 'Épargne' },
                { value: 'Dépôt Courant', label: 'Compte Courant' },
                { value: 'Dépôt Bloqué', label: 'Compte Bloqué' }
              ]}
            />
            {/* Amount Input with Quick Buttons - POS Optimized */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-300">
                Montant (FCFA) *
              </label>
              <div className="relative">
                <DollarSign size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  inputMode="numeric"
                  name="montant"
                  value={formData.montant}
                  onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                  placeholder="0"
                  min="0"
                  step="100"
                  className={`
                    w-full h-14 pl-12 pr-4 rounded-xl text-xl font-bold
                    bg-slate-800 border-2 
                    ${errors.montant ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'}
                    text-white placeholder-slate-500
                    focus:outline-none focus:ring-4 focus:ring-cyan-500/10
                    transition-all
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                  `}
                />
              </div>
              {errors.montant && (
                <p className="text-sm text-red-500">{errors.montant}</p>
              )}
              
              {/* Quick Amount Buttons */}
              <div className="flex gap-2 flex-wrap">
                {[1000, 2000, 5000, 10000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(formData.montant) || 0;
                      setFormData({ ...formData, montant: (current + amount).toString() });
                    }}
                    className="
                      px-3 py-2 rounded-lg text-sm font-bold
                      bg-cyan-500/20 border border-cyan-500/30 text-cyan-400
                      hover:bg-cyan-500/30 hover:border-cyan-500/50
                      active:scale-95
                      transition-all touch-manipulation
                    "
                  >
                    +{amount.toLocaleString()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, montant: '' })}
                  className="
                    px-3 py-2 rounded-lg text-sm font-bold
                    bg-slate-700/50 border border-slate-600 text-slate-400
                    hover:bg-slate-700 hover:text-white
                    active:scale-95
                    transition-all touch-manipulation
                  "
                >
                  Effacer
                </button>
              </div>
            </div>
          </div>

          {isCreditPayment && (
            <SelectField
              label="Crédit *"
              name="credit_id"
              value={formData.credit_id}
              onChange={(e) => setFormData({ ...formData, credit_id: e.target.value })}
              options={clientCredits.map((credit: any) => ({
                value: credit.id,
                label: `Crédit #${credit.numero || credit.reference || credit.id.slice(0, 8)} - ${Number(credit.solde_restant || credit.soldeRestant || 0).toLocaleString('fr-FR')} FCFA`
              }))}
              error={errors.credit_id}
              disabled={loadingCredits || clientCredits.length === 0}
              placeholder={loadingCredits ? 'Chargement des crédits...' : 'Sélectionner un crédit'}
            />
          )}

          {isComptePayment && (
            <SelectField
              label="Compte *"
              name="compte_id"
              value={formData.compte_id}
              onChange={(e) => setFormData({ ...formData, compte_id: e.target.value })}
              options={clientComptes
                .filter((compte: any) => {
                  const type = (compte.type_compte || compte.typeCompte || '').toLowerCase();
                  if (formData.type_paiement === 'Dépôt Courant') return type.includes('courant');
                  if (formData.type_paiement === 'Dépôt Bloqué') return type.includes('bloqué') || type.includes('bloque');
                  return type.includes('épargne') || type.includes('epargne');
                })
                .map((compte: any) => ({
                  value: compte.id,
                  label: `${compte.type_compte || compte.typeCompte || 'Compte'} - ${compte.numero || compte.numero_compte || compte.numeroCompte || compte.id.slice(0, 8)}`
                }))}
              error={errors.compte_id}
              disabled={loadingComptes || clientComptes.length === 0}
              placeholder={loadingComptes ? 'Chargement des comptes...' : 'Sélectionner un compte'}
            />
          )}

          {isTontinePayment && formData.client_id && (
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="text-purple-400" size={18} />
                <h4 className="font-semibold text-white text-sm">Tontines du client</h4>
              </div>

              {loadingTontines ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : (clientTontines?.length || 0) === 0 ? (
                <div className="flex items-center gap-2 text-amber-400 py-2 text-sm">
                  <AlertCircle size={16} />
                  <span>Aucune tontine active</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientTontines.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => selectTontine(ct)}
                      className={`w-full p-3 rounded-lg border transition text-left flex items-center justify-between ${
                        selectedTontine?.id === ct.id
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-slate-600 bg-slate-700/30 hover:border-purple-500'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-white text-sm">{ct.tontine.nom}</p>
                        <p className="text-xs text-slate-400">
                          <span className="text-green-400 font-bold">{parseFloat(ct.tontine.montantCotisation).toLocaleString()} FCFA</span>
                          {' • '}{ct.tontine.frequence}
                        </p>
                      </div>
                      {selectedTontine?.id === ct.id && (
                        <CheckCircle2 className="text-green-400" size={20} />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {errors.tontine && <p className="text-red-500 text-xs mt-2">{errors.tontine}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-300 mb-2">
              Méthode de Paiement *
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { id: 'Espèces', label: 'Espèces', icon: 'FCFA', color: 'green', disabled: false },
                { id: 'Airtel Money', label: 'Airtel', icon: <AirtelLogo className="h-8 w-8" />, color: 'red', disabled: true },
                { id: 'MTN Mobile Money', label: 'MTN', icon: <MTNLogo className="h-8 w-8" />, color: 'yellow', disabled: true }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={m.disabled}
                  onClick={() => !m.disabled && setFormData({ ...formData, methode_paiement: m.id, numero_telephone: '', numero_transaction: '' })}
                  className={`
                    p-2 sm:p-3 rounded-lg border-2 transition flex flex-col items-center justify-center gap-1 relative overflow-hidden
                    ${formData.methode_paiement === m.id
                      ? `border-${m.color}-500 bg-${m.color}-500/10`
                      : m.disabled
                        ? 'border-slate-800 bg-slate-800/30 opacity-50 cursor-not-allowed grayscale'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }
                  `}
                >
                  {m.disabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                      <span className="text-[10px] font-bold text-white bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700">
                        Bientôt
                      </span>
                    </div>
                  )}
                  <div className={`font-bold ${formData.methode_paiement === m.id ? `text-${m.color}-400` : 'text-slate-400'}`}>
                    {typeof m.icon === 'string' ? <span className="text-lg">{m.icon}</span> : m.icon}
                  </div>
                  <div className={`text-[10px] sm:text-xs font-semibold ${formData.methode_paiement === m.id ? `text-${m.color}-400` : 'text-slate-500'}`}>
                    {m.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {formData.methode_paiement !== 'Espèces' && (
            <div className="grid md:grid-cols-2 gap-4 p-3 bg-slate-700/20 border border-slate-600/50 rounded-lg">
              <FormField
                label="Numéro de Téléphone *"
                name="numero_telephone"
                type="tel"
                value={formData.numero_telephone}
                onChange={(e) => setFormData({ ...formData, numero_telephone: e.target.value })}
                error={errors.numero_telephone}
                icon={Phone}
                placeholder="+242..."
              />
              <FormField
                label="N° Transaction *"
                name="numero_transaction"
                type="text"
                value={formData.numero_transaction}
                onChange={(e) => setFormData({ ...formData, numero_transaction: e.target.value })}
                error={errors.numero_transaction}
                icon={FileText}
                placeholder="ID Transaction..."
              />
            </div>
          )}

          <FormField
            label="Référence"
            name="reference"
            value={formData.reference}
            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            placeholder="Référence interne (optionnel)"
          />

          <TextareaField
            label="Notes"
            name="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notes additionnelles..."
            rows={2}
          />

          {formData.montant && parseFloat(formData.montant) > 0 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Total à payer</p>
                <p className="text-2xl font-bold text-green-400">
                  {parseFloat(formData.montant).toLocaleString()} <span className="text-sm">FCFA</span>
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                via {formData.methode_paiement}
              </div>
            </div>
          )}
        </form>
      </Modal>

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
    </>
  );
}
