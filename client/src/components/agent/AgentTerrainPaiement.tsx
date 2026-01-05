import React, { useState, useEffect } from 'react';
import { DollarSign, Phone, User, FileText, CheckCircle, Users, CheckCircle2, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import OTPValidationModal from '../auth/OTPValidationModal';
import { Modal, Button, FormField, SelectField, TextareaField, Card } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

const AirtelLogo = ({ className = '' }: { className?: string }) => (
  <img src={airtelLogo} alt="Airtel Money" className={className} />
);

const MTNLogo = ({ className = '' }: { className?: string }) => (
  <img src={mtnLogo} alt="MTN MoMo" className={className} />
);

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
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreatePayments = hasPermission('agent_terrain', 'create') || hasPermission('paiements', 'create');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);
  const [smsValidationEnabled, setSmsValidationEnabled] = useState(true);
  const [clientTontines, setClientTontines] = useState<ClientTontine[]>([]);
  const [selectedTontine, setSelectedTontine] = useState<ClientTontine | null>(null);
  const [loadingTontines, setLoadingTontines] = useState(false);

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    client_id: clientId || '',
    visite_id: visiteId || '',
    montant: '',
    methode_paiement: 'Espèce',
    numero_telephone: '',
    numero_transaction: '',
    type_paiement: 'Tontine',
    reference: '',
    notes: ''
  });

  const isTontinePayment = formData.type_paiement === 'Tontine';

  useEffect(() => {
    loadAgents();
    loadClients();
    loadSystemSettings();
  }, []);

  useEffect(() => {
    if (formData.client_id) {
      loadClientDetails();
      if (isTontinePayment) {
        loadClientTontines(formData.client_id);
      }
    } else {
      setClientTontines([]);
      setSelectedTontine(null);
    }
  }, [formData.client_id, formData.type_paiement]);

  const loadSystemSettings = async () => {
    try {
      const response = await fetch('/api/system-settings', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setSmsValidationEnabled(data.sms_payment_validation_enabled !== false);
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/agents-terrain', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAgents(data.filter((a: any) => a.statut === 'Actif'));
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadClients = async () => {
    try {
      const response = await fetch('/api/clients', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setClients(data.filter((c: any) => c.status === 'Actif'));
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const loadClientDetails = async () => {
    try {
      const response = await fetch(`/api/clients/${formData.client_id}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setSelectedClient(data);
        if (formData.methode_paiement !== 'Espèce' && !formData.numero_telephone) {
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
        numero_telephone: formData.methode_paiement !== 'Espèce' ? formData.numero_telephone : null,
        numero_transaction: formData.methode_paiement !== 'Espèce' ? formData.numero_transaction : null,
        type_paiement: formData.type_paiement,
        reference,
        notes: formData.notes.trim(),
        statut: 'En attente',
        tontineId: selectedTontine?.tontineId || null,
        membreId: selectedTontine?.id || null
      };

      if (smsValidationEnabled) {
        setPendingPaymentData(paiementData);
        setShowOTPModal(true);
      } else {
        await finaliserPaiementSansOTP(paiementData);
      }

    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
      setLoading(false);
    }
  };

  const finaliserPaiementSansOTP = async (paiementData: any) => {
    try {
      const response = await fetch('/api/paiements-terrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...paiementData,
          statut: 'Validé (sans SMS)',
          validation_id: null
        })
      });

      if (!response.ok) throw new Error('Erreur lors de l\'enregistrement');

      // Record tontine contribution if applicable - MUST succeed for tontine payments
      if (isTontinePayment && selectedTontine) {
        const cotisationResponse = await fetch(`/api/tontines/${selectedTontine.tontineId}/cotisation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientId: paiementData.client_id,
            montant: paiementData.montant,
            methodePaiement: paiementData.methode_paiement,
            reference: paiementData.reference
          })
        });
        
        if (!cotisationResponse.ok) {
          const errorData = await cotisationResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erreur lors de l\'enregistrement de la cotisation tontine');
        }
      }

      // Record client activity
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: paiementData.client_id,
          activity_type: 'paiement',
          activity_description: `Paiement ${paiementData.type_paiement} - ${paiementData.montant.toLocaleString()} FCFA via ${paiementData.methode_paiement} (Agent terrain - Validé sans OTP)`,
          amount: paiementData.montant
        })
      });

      // Update visit if applicable
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

      onSuccess();
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSuccess = async (validationData: any) => {
    try {
      if (!pendingPaymentData) return;

      setLoading(true);

      // Create the payment
      const response = await fetch('/api/paiements-terrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...pendingPaymentData,
          statut: 'Validé',
          validation_id: validationData.isValidation_id
        })
      });

      if (!response.ok) throw new Error('Erreur lors de l\'enregistrement');

      // Record tontine contribution if applicable - MUST succeed for tontine payments
      if (isTontinePayment && selectedTontine) {
        const cotisationResponse = await fetch(`/api/tontines/${selectedTontine.tontineId}/cotisation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientId: pendingPaymentData.client_id,
            montant: pendingPaymentData.montant,
            methodePaiement: pendingPaymentData.methode_paiement,
            reference: pendingPaymentData.reference
          })
        });
        
        if (!cotisationResponse.ok) {
          const errorData = await cotisationResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erreur lors de l\'enregistrement de la cotisation tontine');
        }
      }

      // Record client activity
      await fetch('/api/client-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: pendingPaymentData.client_id,
          activity_type: 'paiement',
          activity_description: `Paiement ${pendingPaymentData.type_paiement} - ${pendingPaymentData.montant.toLocaleString()} FCFA via ${pendingPaymentData.methode_paiement} (Agent terrain - Validé par OTP)`,
          amount: pendingPaymentData.montant
        })
      });

      // Update visit if applicable
      if (pendingPaymentData.visite_id) {
        await fetch(`/api/visites-terrain/${pendingPaymentData.visite_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            montant_collecte: pendingPaymentData.montant,
            statut: 'Effectuée'
          })
        });
      }

      setShowOTPModal(false);
      setPendingPaymentData(null);
      onSuccess();
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
      setShowOTPModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Enregistrer un Paiement"
        size="lg"
        footer={
           <div className="flex gap-2 w-full sm:w-auto">
             <Button variant="ghost" onClick={onClose} disabled={loading} className="flex-1 sm:flex-none">
               Annuler
             </Button>
             {canCreatePayments ? (
               <Button
                 variant="success"
                 onClick={handleSubmit}
                 isLoading={loading}
                 icon={CheckCircle}
                 className="flex-1 sm:flex-none"
               >
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
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
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
                setFormData({ ...formData, type_paiement: e.target.value });
                setSelectedTontine(null);
              }}
              options={['Tontine', 'Crédit', 'Épargne', 'Compte Courant', 'Compte Bloqué', 'Autre']}
            />

            <FormField
              label="Montant (FCFA) *"
              name="montant"
              type="number"
              value={formData.montant}
              onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
              error={errors.montant}
              icon={DollarSign}
              placeholder="50000"
              min="0"
              step="100"
            />
          </div>

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
                { id: 'Espèce', label: 'Espèce', icon: 'FCFA', color: 'green', disabled: false },
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

          {formData.methode_paiement !== 'Espèce' && (
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

      {showOTPModal && pendingPaymentData && selectedClient && (
        <OTPValidationModal
          isOpen={showOTPModal}
          onClose={() => {
            setShowOTPModal(false);
            setPendingPaymentData(null);
            setLoading(false);
          }}
          onSuccess={handleOTPSuccess}
          transactionType={`PAIEMENT_${formData.type_paiement.toUpperCase()}`}
          transactionReference={pendingPaymentData.reference}
          clientId={formData.client_id}
          clientName={selectedClient.nom}
          clientPhone={selectedClient.phone || formData.numero_telephone}
          montant={pendingPaymentData.montant}
          createdBy={pendingPaymentData.userId}
          createdByRole="AGENT_TERRAIN"
        />
      )}
    </>
  );
}
