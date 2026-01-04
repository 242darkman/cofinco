import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, User, Percent, DollarSign, Calendar, CreditCard, Building, Smartphone, ArrowRight, AlertCircle, CheckCircle, Clock, Banknote, FileCheck, RefreshCw, Phone, Hash, Wallet, AlertTriangle, Loader2, Search } from 'lucide-react';
import { clientApi, compteEpargneApi, transactionEpargneApi } from '../../../lib/api-client';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, validateRequired, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { Button, IconButton, Card } from '../../ui';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', textColor: 'text-yellow-500', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', textColor: 'text-red-500', prefix: '+242 04' }
] as const;

const BILLETS_FCFA = [10000, 5000, 2000, 1000, 500] as const;

interface Client {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  numero_compte?: string;
  agence_nom?: string;
}

interface CompteExistant {
  id: string;
  numero_compte: string;
  type_compte: string;
  solde: number;
}

interface EpargneAccountFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
}

type TypeCompte = 'Courant' | 'Épargne' | 'Bloqué';
type ModeOuverture = 'Espèces' | 'Chèque' | 'Virement' | 'Mobile Money' | 'Transfert interne';
type FrequenceVersement = 'Hebdomadaire' | 'Bimensuel' | 'Mensuel' | 'Trimestriel';

export default function EpargneAccountForm({ onClose, onSuccess, clientId }: EpargneAccountFormProps) {
  const { mobileMoneyEnabled, mobileMoneyMessage } = useFeatureFlags();
  const [clients, setClients] = useState<Client[]>([]);
  const [comptesExistants, setComptesExistants] = useState<CompteExistant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(clientId ? 2 : 1);
  const [searchQuery, setSearchQuery] = useState('');
  const [validationRequise, setValidationRequise] = useState(true);

  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [showMobileMoneyModal, setShowMobileMoneyModal] = useState(false);
  const [showCaisseModal, setShowCaisseModal] = useState(false);
  const [pendingAccountData, setPendingAccountData] = useState<any>(null);
  const [mobileMoneyData, setMobileMoneyData] = useState({
    numero_telephone: '',
    numero_transaction: '',
    code_otp: ''
  });
  const [caisseData, setCaisseData] = useState({
    reference_recu: '',
    billets: {} as Record<string, number>
  });
  const [paymentValidated, setPaymentValidated] = useState(false);

  const [formData, setFormData] = useState({
    client_id: clientId || '',
    type_compte: 'Courant' as TypeCompte,
    taux_interet: '5',
    solde_initial: '',
    mode_ouverture: 'Espèces' as ModeOuverture,
    compte_source_id: '',
    reference_paiement: '',
    date_echeance: '',
    motif_blocage: '',
    notes: '',
    versement_auto_active: false,
    versement_auto_montant: '',
    versement_auto_frequence: 'Mensuel' as FrequenceVersement,
    versement_auto_jour: '28'
  });

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (formData.client_id) {
      loadComptesClient(formData.client_id);
    }
  }, [formData.client_id]);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const data = await clientApi.getAll();
      const activeClients = data.filter((c: any) => c.status === 'Actif');
      setClients(activeClients);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des clients');
      toast.error(errorMessage);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const loadComptesClient = useCallback(async (clientIdParam: string) => {
    try {
      const data = await compteEpargneApi.getByClient(clientIdParam);
      const activeComptes = data.filter((c: any) => c.statut === 'Actif');
      setComptesExistants(activeComptes);
    } catch (error) {
      console.warn('Erreur chargement comptes:', error);
      setComptesExistants([]);
    }
  }, []);

  const filteredClients = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return clients.filter(c =>
      c.nom.toLowerCase().includes(query) ||
      c.prenom?.toLowerCase().includes(query) ||
      c.telephone?.includes(searchQuery) ||
      c.email?.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  const generateNumeroCompte = useCallback(() => {
    const prefixes: Record<TypeCompte, string> = {
      'Courant': 'CRT',
      'Épargne': 'EPG',
      'Bloqué': 'BLQ'
    };
    const prefix = prefixes[formData.type_compte];
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  }, [formData.type_compte]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    const soldeInitial = parseFloat(formData.solde_initial) || 0;

    // Client required
    if (!validateRequired(formData.client_id, 'Client').isValid) {
      newErrors.client_id = 'Client requis';
    }

    // Internal transfer validation
    if (formData.mode_ouverture === 'Transfert interne') {
      if (!formData.compte_source_id) {
        newErrors.compte_source_id = 'Compte source requis';
      } else {
        const compteSource = comptesExistants.find(c => c.id === formData.compte_source_id);
        if (compteSource && soldeInitial > compteSource.solde) {
          newErrors.solde_initial = `Solde insuffisant. Maximum disponible: ${formatMoney(compteSource.solde)}`;
        }
      }
    }

    // Amount validation
    if (soldeInitial > 0) {
      const amountValidation = validateAmount(soldeInitial, {
        min: 0,
        max: VALIDATION_LIMITS.MAX_EPARGNE,
      });
      if (!amountValidation.isValid) {
        newErrors.solde_initial = amountValidation.error || 'Montant invalide';
      }
    } else if (soldeInitial < 0) {
      newErrors.solde_initial = 'Le montant ne peut pas être négatif';
    }

    // Blocked account validation
    if (formData.type_compte === 'Bloqué') {
      if (!formData.date_echeance) {
        newErrors.date_echeance = "Date d'échéance requise";
      } else {
        const echeance = new Date(formData.date_echeance);
        if (echeance <= new Date()) {
          newErrors.date_echeance = "La date d'échéance doit être dans le futur";
        }
      }
      if (!formData.motif_blocage.trim()) {
        newErrors.motif_blocage = 'Motif requis';
      }
    }

    // Auto transfer validation
    if (formData.versement_auto_active) {
      const versementMontant = parseFloat(formData.versement_auto_montant) || 0;
      if (versementMontant <= 0) {
        newErrors.versement_auto_montant = 'Montant invalide';
      }
      if (!formData.compte_source_id) {
        newErrors.compte_source_id = 'Compte source requis pour versement auto';
      }
    }

    // Mobile money operator validation
    if (formData.mode_ouverture === 'Mobile Money' && !selectedOperator) {
      newErrors.operateur = 'Veuillez sélectionner un opérateur';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, comptesExistants, selectedOperator]);

  const calculateTotalBillets = useMemo(() => {
    return Object.entries(caisseData.billets).reduce((total, [billet, count]) => {
      return total + (parseInt(billet) * (count || 0));
    }, 0);
  }, [caisseData.billets]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.warning('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    const soldeInitial = parseFloat(formData.solde_initial) || 0;

    // Show payment modals for cash or mobile money deposits
    if (soldeInitial > 0 && (formData.mode_ouverture === 'Mobile Money' || formData.mode_ouverture === 'Espèces')) {
      const accountData = {
        numeroCompte: generateNumeroCompte(),
        soldeInitial,
        formData: { ...formData },
        selectedOperator
      };
      setPendingAccountData(accountData);

      if (formData.mode_ouverture === 'Mobile Money') {
        setShowMobileMoneyModal(true);
      } else if (formData.mode_ouverture === 'Espèces') {
        setShowCaisseModal(true);
      }
      return;
    }

    await createAccount();
  }, [formData, validate, generateNumeroCompte, selectedOperator]);

  const createAccount = useCallback(async (paymentRef?: string) => {
    setLoading(true);

    try {
      const numeroCompte = pendingAccountData?.numeroCompte || generateNumeroCompte();
      const soldeInitial = pendingAccountData?.soldeInitial || parseFloat(formData.solde_initial) || 0;

      // Sanitize user inputs
      const sanitizedNotes = sanitizeInput(formData.notes);
      const sanitizedMotif = sanitizeInput(formData.motif_blocage);
      const sanitizedReference = sanitizeInput(paymentRef || formData.reference_paiement);

      const compteData: any = {
        client_id: formData.client_id,
        type_compte: formData.type_compte,
        numero_compte: numeroCompte,
        solde: (paymentValidated || formData.mode_ouverture === 'Transfert interne' ? soldeInitial : 0).toString(),
        taux_interet: formData.taux_interet,
        mode_ouverture: formData.mode_ouverture,
        montant_ouverture: soldeInitial,
        statut: validationRequise ? 'En attente validation' : 'Actif',
        paiement_valide: paymentValidated || formData.mode_ouverture === 'Transfert interne',
        reference_paiement: sanitizedReference || null,
        notes: sanitizedNotes || null
      };

      if (formData.mode_ouverture === 'Mobile Money' && selectedOperator) {
        compteData.operateur_mobile = selectedOperator;
        compteData.numero_mobile = sanitizeInput(mobileMoneyData.numero_telephone);
      }

      if (formData.type_compte === 'Bloqué') {
        compteData.date_echeance = formData.date_echeance;
        compteData.motif_blocage = sanitizedMotif;
      }

      const newCompte = await compteEpargneApi.create(compteData);

      // Handle internal transfer
      if (formData.mode_ouverture === 'Transfert interne' && formData.compte_source_id && soldeInitial > 0) {
        const compteSource = comptesExistants.find(c => c.id === formData.compte_source_id);

        if (compteSource && compteSource.solde >= soldeInitial) {
          await compteEpargneApi.update(formData.compte_source_id, {
            solde: compteSource.solde - soldeInitial
          });

          await transactionEpargneApi.create({
            compte_id: formData.compte_source_id,
            type_transaction: 'Transfert sortant',
            montant: soldeInitial,
            solde_avant: compteSource.solde,
            solde_apres: compteSource.solde - soldeInitial,
            mode_paiement: 'Transfert interne',
            description: `Transfert vers ${numeroCompte}`
          });

          await transactionEpargneApi.create({
            compte_id: newCompte.id,
            type_transaction: 'Transfert entrant',
            montant: soldeInitial,
            solde_avant: 0,
            solde_apres: soldeInitial,
            mode_paiement: 'Transfert interne',
            description: 'Dépôt initial'
          });
        } else {
          throw new Error('Solde insuffisant dans le compte source');
        }
      }

      // Record initial deposit transaction
      if (paymentValidated && soldeInitial > 0) {
        await transactionEpargneApi.create({
          compte_id: newCompte.id,
          type_transaction: 'Dépôt',
          montant: soldeInitial,
          solde_avant: 0,
          solde_apres: soldeInitial,
          mode_paiement: formData.mode_ouverture,
          reference: sanitizedReference,
          description: "Dépôt initial à l'ouverture"
        });
      }

      // Success message
      if (validationRequise) {
        toast.success(`Demande d'ouverture créée avec succès ! Numéro: ${numeroCompte}`);
        toast.info('En attente de validation du chef d\'agence');
      } else {
        toast.success(`Compte ${numeroCompte} créé avec succès !`);
      }

      onSuccess();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Erreur lors de la création du compte');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowMobileMoneyModal(false);
      setShowCaisseModal(false);
    }
  }, [formData, pendingAccountData, generateNumeroCompte, paymentValidated, validationRequise, comptesExistants, selectedOperator, mobileMoneyData, onSuccess]);

  const handleMobileMoneyValidation = useCallback(async () => {
    if (!mobileMoneyData.numero_telephone || !mobileMoneyData.numero_transaction) {
      toast.warning('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setPaymentValidated(true);
    const paymentRef = `MM-${selectedOperator.toUpperCase()}-${sanitizeInput(mobileMoneyData.numero_transaction)}`;
    await createAccount(paymentRef);
  }, [mobileMoneyData, selectedOperator, createAccount]);

  const handleCaisseValidation = useCallback(async () => {
    const montantAttendu = parseFloat(formData.solde_initial) || 0;

    if (calculateTotalBillets !== montantAttendu) {
      toast.error(`Le total des billets (${formatMoney(calculateTotalBillets)}) ne correspond pas au montant attendu (${formatMoney(montantAttendu)})`);
      return;
    }

    setPaymentValidated(true);
    const paymentRef = `CAISSE-${Date.now()}-${sanitizeInput(caisseData.reference_recu) || 'SANS-REF'}`;
    await createAccount(paymentRef);
  }, [formData.solde_initial, calculateTotalBillets, caisseData.reference_recu, createAccount]);

  const handleClientSelect = useCallback((client: Client) => {
    setFormData(prev => ({ ...prev, client_id: client.id }));
    setStep(2);
  }, []);

  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const selectedClient = useMemo(() => clients.find(c => c.id === formData.client_id), [clients, formData.client_id]);
  const compteSource = useMemo(() => comptesExistants.find(c => c.id === formData.compte_source_id), [comptesExistants, formData.compte_source_id]);

  // Safe escaped values
  const safeClientName = selectedClient ? escapeHtml(`${selectedClient.nom} ${selectedClient.prenom || ''}`) : '';

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-form-title"
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center z-10">
          <div>
            <h2 id="account-form-title" className="text-2xl font-bold text-white">Nouveau Compte</h2>
            <p className="text-slate-400 text-sm mt-1">
              {step === 1 ? 'Sélection du client' : step === 2 ? 'Configuration du compte' : 'Confirmation'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded-lg p-2"
            type="button"
            aria-label="Fermer"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Step 1: Client Selection */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 mb-6" role="note">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={20} aria-hidden="true" />
                  <div className="text-sm text-slate-300">
                    <p className="font-semibold text-white mb-1">Information importante</p>
                    <p className="text-slate-400">
                      Un client peut avoir plusieurs comptes (courant, épargne, bloqué).
                      Si le client existe déjà, sélectionnez-le pour lui ouvrir un nouveau compte.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="search-client" className="block text-sm font-semibold text-slate-300 mb-2">
                  <Search size={16} className="inline mr-2" aria-hidden="true" />
                  Rechercher un client
                </label>
                <input
                  id="search-client"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom, téléphone ou email..."
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2" role="listbox" aria-label="Liste des clients">
                {loadingClients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-blue-400" size={32} />
                    <span className="ml-3 text-slate-400">Chargement des clients...</span>
                  </div>
                ) : filteredClients.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">Aucun client trouvé</p>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={formData.client_id === client.id}
                      onClick={() => handleClientSelect(client)}
                      className={`w-full text-left p-4 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.client_id === client.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-white">
                            {escapeHtml(client.nom)} {escapeHtml(client.prenom || '')}
                          </div>
                          <div className="text-sm text-slate-400">
                            {client.telephone} • {client.email}
                          </div>
                          {client.numero_compte && (
                            <div className="text-xs text-blue-400 mt-1">
                              Compte principal: {client.numero_compte}
                            </div>
                          )}
                        </div>
                        <ArrowRight size={20} className="text-slate-400" aria-hidden="true" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Account Configuration */}
          {step === 2 && selectedClient && (
            <div className="space-y-6">
              {/* Selected Client Info */}
              <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-400">Client sélectionné</p>
                <p className="text-white font-semibold">{safeClientName}</p>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                   <span>{selectedClient.telephone}</span>
                   {selectedClient.agence_nom && (
                     <>
                      <span>•</span>
                      <span className="text-slate-500 italic">{selectedClient.agence_nom}</span>
                     </>
                   )}
                </div>
                {comptesExistants.length > 0 && (
                  <p className="text-xs text-blue-400 mt-2">
                    {comptesExistants.length} compte(s) existant(s)
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Account Type */}
                <div>
                  <label htmlFor="type-compte" className="block text-sm font-semibold text-slate-300 mb-2">
                    Type de Compte <span className="text-red-400">*</span>
                  </label>
                  <select
                    id="type-compte"
                    value={formData.type_compte}
                    onChange={(e) => handleInputChange('type_compte', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  >
                    <option value="Courant">Compte Courant</option>
                    <option value="Épargne">Compte Épargne</option>
                    <option value="Bloqué">Compte Bloqué</option>
                  </select>
                </div>

                {/* Interest Rate */}
                <div>
                  <label htmlFor="taux-interet" className="block text-sm font-semibold text-slate-300 mb-2">
                    <Percent size={16} className="inline mr-2" aria-hidden="true" />
                    Taux d'Intérêt Annuel (%)
                  </label>
                  <input
                    id="taux-interet"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.taux_interet}
                    onChange={(e) => handleInputChange('taux_interet', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  />
                </div>

                {/* Payment Mode */}
                <fieldset className="md:col-span-2">
                  <legend className="block text-sm font-semibold text-slate-300 mb-2">
                    Mode de Paiement <span className="text-red-400">*</span>
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_ouverture === 'Espèces'}
                      onClick={() => handleInputChange('mode_ouverture', 'Espèces')}
                      disabled={loading}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.mode_ouverture === 'Espèces'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50`}
                    >
                      <Banknote size={20} className="mb-1" aria-hidden="true" />
                      <span className="text-xs">Espèces</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_ouverture === 'Chèque'}
                      onClick={() => handleInputChange('mode_ouverture', 'Chèque')}
                      disabled={loading}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.mode_ouverture === 'Chèque'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50`}
                    >
                      <FileCheck size={20} className="mb-1" aria-hidden="true" />
                      <span className="text-xs">Chèque</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_ouverture === 'Virement'}
                      onClick={() => handleInputChange('mode_ouverture', 'Virement')}
                      disabled={loading}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.mode_ouverture === 'Virement'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50`}
                    >
                      <Building size={20} className="mb-1" aria-hidden="true" />
                      <span className="text-xs">Virement</span>
                    </button>
                    <div className="relative group">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={formData.mode_ouverture === 'Mobile Money'}
                        aria-disabled={!mobileMoneyEnabled}
                        onClick={() => mobileMoneyEnabled && handleInputChange('mode_ouverture', 'Mobile Money')}
                        disabled={!mobileMoneyEnabled || loading}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          !mobileMoneyEnabled
                            ? 'opacity-50 cursor-not-allowed bg-slate-700 border-slate-600 text-slate-500'
                            : formData.mode_ouverture === 'Mobile Money'
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        <Smartphone size={20} className="mb-1" aria-hidden="true" />
                        <span className="text-xs">Mobile Money</span>
                        {!mobileMoneyEnabled && (
                          <span className="absolute -top-1 -right-1 px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] rounded border border-amber-500/30">
                            Bientôt
                          </span>
                        )}
                      </button>
                      {!mobileMoneyEnabled && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-amber-400 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-amber-500/30 pointer-events-none">
                          {mobileMoneyMessage}
                        </div>
                      )}
                    </div>
                    {comptesExistants.length > 0 && (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={formData.mode_ouverture === 'Transfert interne'}
                        onClick={() => handleInputChange('mode_ouverture', 'Transfert interne')}
                        disabled={loading}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          formData.mode_ouverture === 'Transfert interne'
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                        } disabled:opacity-50`}
                      >
                        <RefreshCw size={20} className="mb-1" aria-hidden="true" />
                        <span className="text-xs">Transfert</span>
                      </button>
                    )}
                  </div>
                </fieldset>

                {/* Mobile Money Operator Selection */}
                {formData.mode_ouverture === 'Mobile Money' && (
                  <fieldset className="md:col-span-2">
                    <legend className="block text-sm font-semibold text-slate-300 mb-2">
                      <Smartphone size={16} className="inline mr-2" aria-hidden="true" />
                      Sélectionner l'opérateur <span className="text-red-400">*</span>
                    </legend>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup">
                      {MOBILE_OPERATORS.map(op => (
                        <button
                          key={op.id}
                          type="button"
                          role="radio"
                          aria-checked={selectedOperator === op.id}
                          onClick={() => setSelectedOperator(op.id)}
                          disabled={loading}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            selectedOperator === op.id
                              ? `${op.color} border-white text-white`
                              : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                          } disabled:opacity-50`}
                        >
                          <div className={`w-10 h-10 rounded-full ${selectedOperator === op.id ? 'bg-white/20' : op.color} flex items-center justify-center`}>
                            <Smartphone size={20} className="text-white" aria-hidden="true" />
                          </div>
                          <div className="text-left">
                            <p className="font-semibold">{op.name}</p>
                            <p className="text-xs opacity-75">{op.prefix}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {errors.operateur && (
                      <p className="text-red-400 text-sm mt-1" role="alert">{errors.operateur}</p>
                    )}
                  </fieldset>
                )}

                {/* Source Account for Internal Transfer */}
                {formData.mode_ouverture === 'Transfert interne' && comptesExistants.length > 0 && (
                  <div>
                    <label htmlFor="compte-source" className="block text-sm font-semibold text-slate-300 mb-2">
                      Compte Source <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="compte-source"
                      value={formData.compte_source_id}
                      onChange={(e) => handleInputChange('compte_source_id', e.target.value)}
                      className={`w-full bg-slate-700 border ${errors.compte_source_id ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      disabled={loading}
                      aria-invalid={!!errors.compte_source_id}
                    >
                      <option value="">Sélectionner un compte</option>
                      {comptesExistants.map(compte => (
                        <option key={compte.id} value={compte.id}>
                          {compte.type_compte} - {compte.numero_compte} (Solde: {formatMoney(compte.solde)})
                        </option>
                      ))}
                    </select>
                    {errors.compte_source_id && (
                      <p className="text-red-400 text-sm mt-1" role="alert">{errors.compte_source_id}</p>
                    )}
                  </div>
                )}

                {/* Initial Amount */}
                <div className="md:col-span-2">
                  <label htmlFor="solde-initial" className="block text-sm font-semibold text-slate-300 mb-2">
                    <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                    Montant Initial (FCFA)
                  </label>
                  <input
                    id="solde-initial"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={VALIDATION_LIMITS.MAX_EPARGNE}
                    value={formData.solde_initial}
                    onChange={(e) => handleInputChange('solde_initial', e.target.value)}
                    className={`w-full bg-slate-700 border ${errors.solde_initial ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="0"
                    disabled={loading}
                    aria-invalid={!!errors.solde_initial}
                    aria-describedby={compteSource ? 'solde-disponible' : undefined}
                  />
                  {formData.mode_ouverture === 'Transfert interne' && compteSource && (
                    <p id="solde-disponible" className="text-xs text-slate-400 mt-1">
                      Solde disponible: {formatMoney(compteSource.solde)}
                    </p>
                  )}
                  {errors.solde_initial && (
                    <p className="text-red-400 text-sm mt-1" role="alert">{errors.solde_initial}</p>
                  )}
                </div>

                {/* Payment Reference */}
                {formData.mode_ouverture !== 'Transfert interne' && (
                  <div className="md:col-span-2">
                    <label htmlFor="reference-paiement" className="block text-sm font-semibold text-slate-300 mb-2">
                      Référence de Paiement
                    </label>
                    <input
                      id="reference-paiement"
                      type="text"
                      value={formData.reference_paiement}
                      onChange={(e) => handleInputChange('reference_paiement', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="N° chèque, référence mobile money, etc."
                      disabled={loading}
                      maxLength={100}
                    />
                  </div>
                )}

                {/* Blocked Account Fields */}
                {formData.type_compte === 'Bloqué' && (
                  <>
                    <div>
                      <label htmlFor="date-echeance" className="block text-sm font-semibold text-slate-300 mb-2">
                        <Calendar size={16} className="inline mr-2" aria-hidden="true" />
                        Date d'Échéance <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="date-echeance"
                        type="date"
                        value={formData.date_echeance}
                        onChange={(e) => handleInputChange('date_echeance', e.target.value)}
                        className={`w-full bg-slate-700 border ${errors.date_echeance ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        min={new Date().toISOString().split('T')[0]}
                        disabled={loading}
                        aria-invalid={!!errors.date_echeance}
                      />
                      {errors.date_echeance && (
                        <p className="text-red-400 text-sm mt-1" role="alert">{errors.date_echeance}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="motif-blocage" className="block text-sm font-semibold text-slate-300 mb-2">
                        Motif du Blocage <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="motif-blocage"
                        type="text"
                        value={formData.motif_blocage}
                        onChange={(e) => handleInputChange('motif_blocage', e.target.value)}
                        className={`w-full bg-slate-700 border ${errors.motif_blocage ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        placeholder="Ex: Épargne projet immobilier"
                        disabled={loading}
                        maxLength={200}
                        aria-invalid={!!errors.motif_blocage}
                      />
                      {errors.motif_blocage && (
                        <p className="text-red-400 text-sm mt-1" role="alert">{errors.motif_blocage}</p>
                      )}
                    </div>
                  </>
                )}

                {/* Auto Transfer Settings */}
                {formData.type_compte === 'Épargne' && comptesExistants.some(c => c.type_compte === 'Courant') && (
                  <div className="md:col-span-2 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.versement_auto_active}
                        onChange={(e) => handleInputChange('versement_auto_active', e.target.checked)}
                        className="w-5 h-5 rounded border-slate-600 bg-slate-700 focus:ring-2 focus:ring-green-500"
                        disabled={loading}
                      />
                      <div>
                        <p className="font-semibold text-white">Activer les versements automatiques</p>
                        <p className="text-sm text-slate-400">
                          Transférer automatiquement un montant depuis votre compte courant chaque mois
                        </p>
                      </div>
                    </label>

                    {formData.versement_auto_active && (
                      <div className="grid md:grid-cols-3 gap-4 mt-4">
                        <div>
                          <label htmlFor="versement-montant" className="block text-sm font-semibold text-slate-300 mb-2">
                            Montant (FCFA) <span className="text-red-400">*</span>
                          </label>
                          <input
                            id="versement-montant"
                            type="number"
                            min="0"
                            value={formData.versement_auto_montant}
                            onChange={(e) => handleInputChange('versement_auto_montant', e.target.value)}
                            className={`w-full bg-slate-700 border ${errors.versement_auto_montant ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                            placeholder="10000"
                            disabled={loading}
                            aria-invalid={!!errors.versement_auto_montant}
                          />
                          {errors.versement_auto_montant && (
                            <p className="text-red-400 text-sm mt-1" role="alert">{errors.versement_auto_montant}</p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="versement-frequence" className="block text-sm font-semibold text-slate-300 mb-2">
                            Fréquence
                          </label>
                          <select
                            id="versement-frequence"
                            value={formData.versement_auto_frequence}
                            onChange={(e) => handleInputChange('versement_auto_frequence', e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          >
                            <option value="Hebdomadaire">Chaque semaine</option>
                            <option value="Bimensuel">Toutes les 2 semaines</option>
                            <option value="Mensuel">Chaque mois</option>
                            <option value="Trimestriel">Chaque trimestre</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="versement-jour" className="block text-sm font-semibold text-slate-300 mb-2">
                            Jour du mois (1-28)
                          </label>
                          <input
                            id="versement-jour"
                            type="number"
                            min="1"
                            max="28"
                            value={formData.versement_auto_jour}
                            onChange={(e) => handleInputChange('versement_auto_jour', e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label htmlFor="versement-source" className="block text-sm font-semibold text-slate-300 mb-2">
                            Depuis le compte <span className="text-red-400">*</span>
                          </label>
                          <select
                            id="versement-source"
                            value={formData.compte_source_id}
                            onChange={(e) => handleInputChange('compte_source_id', e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          >
                            <option value="">Sélectionner un compte</option>
                            {comptesExistants.filter(c => c.type_compte === 'Courant').map(compte => (
                              <option key={compte.id} value={compte.id}>
                                {compte.numero_compte} (Solde: {formatMoney(compte.solde)})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="md:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-semibold text-slate-300 mb-2">
                    Notes / Commentaires
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Informations complémentaires..."
                    disabled={loading}
                    maxLength={500}
                  />
                </div>

                {/* Validation Checkbox */}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={validationRequise}
                      onChange={(e) => setValidationRequise(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-700 focus:ring-2 focus:ring-blue-500"
                      disabled={loading}
                    />
                    <div>
                      <p className="font-semibold text-white">Validation du chef d'agence requise</p>
                      <p className="text-sm text-slate-400">
                        Si coché, le compte sera créé en attente de validation
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Process Info */}
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-4" role="note">
                <div className="flex items-start gap-3">
                  <Clock className="text-emerald-400 flex-shrink-0 mt-1" size={20} aria-hidden="true" />
                  <div className="text-sm text-slate-300">
                    <p className="font-semibold text-white mb-1">Processus d'ouverture</p>
                    <ul className="space-y-1 text-slate-400">
                      <li>✓ Le compte sera créé {validationRequise ? 'en attente de validation' : 'immédiatement'}</li>
                      {formData.mode_ouverture !== 'Transfert interne' && (
                        <li>✓ Le client doit se présenter à la caisse pour effectuer le paiement</li>
                      )}
                      {validationRequise && (
                        <li>✓ Le chef d'agence doit valider la demande d'ouverture</li>
                      )}
                      {formData.versement_auto_active && (
                        <li>✓ Les versements automatiques commenceront le mois prochain</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  fullWidth
                  disabled={loading}
                >
                  Retour
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={CheckCircle}
                  isLoading={loading}
                  fullWidth
                >
                  Créer le Compte
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Mobile Money Validation Modal */}
      {showMobileMoneyModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-money-title"
        >
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className={`border-b border-slate-700 p-4 flex justify-between items-center ${
              selectedOperator === 'mtn' ? 'bg-yellow-500/20' : 'bg-red-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${selectedOperator === 'mtn' ? 'bg-yellow-500' : 'bg-red-500'} flex items-center justify-center`}>
                  <Smartphone className="text-white" size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 id="mobile-money-title" className="text-lg font-bold text-white">Validation Mobile Money</h3>
                  <p className="text-sm text-slate-400">
                    {MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMobileMoneyModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
                aria-label="Fermer"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-sm text-slate-400">Montant à recevoir</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatMoney(parseFloat(formData.solde_initial || '0'))}
                </p>
              </div>

              <div>
                <label htmlFor="mm-telephone" className="block text-sm font-semibold text-slate-300 mb-2">
                  <Phone size={16} className="inline mr-2" aria-hidden="true" />
                  Numéro de téléphone <span className="text-red-400">*</span>
                </label>
                <input
                  id="mm-telephone"
                  type="tel"
                  value={mobileMoneyData.numero_telephone}
                  onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_telephone: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={MOBILE_OPERATORS.find(op => op.id === selectedOperator)?.prefix || '+242 XX XXX XXXX'}
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="mm-transaction" className="block text-sm font-semibold text-slate-300 mb-2">
                  <Hash size={16} className="inline mr-2" aria-hidden="true" />
                  Numéro de transaction <span className="text-red-400">*</span>
                </label>
                <input
                  id="mm-transaction"
                  type="text"
                  value={mobileMoneyData.numero_transaction}
                  onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, numero_transaction: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: TXN123456789"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="mm-otp" className="block text-sm font-semibold text-slate-300 mb-2">
                  Code OTP (optionnel)
                </label>
                <input
                  id="mm-otp"
                  type="text"
                  value={mobileMoneyData.code_otp}
                  onChange={(e) => setMobileMoneyData({ ...mobileMoneyData, code_otp: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="• • • • • •"
                  maxLength={6}
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMobileMoneyModal(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleMobileMoneyValidation}
                  disabled={loading}
                  className={`flex-1 px-4 py-3 ${
                    selectedOperator === 'mtn' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-500 hover:bg-red-600'
                  } text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <CheckCircle size={20} aria-hidden="true" />
                      Valider
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Validation Modal */}
      {showCaisseModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="caisse-title"
        >
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-700 p-4 flex justify-between items-center bg-green-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <Wallet className="text-white" size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 id="caisse-title" className="text-lg font-bold text-white">Validation Caisse</h3>
                  <p className="text-sm text-slate-400">Comptage des billets</p>
                </div>
              </div>
              <button
                onClick={() => setShowCaisseModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
                aria-label="Fermer"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-sm text-slate-400">Montant attendu</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatMoney(parseFloat(formData.solde_initial || '0'))}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  <Banknote size={16} className="inline mr-2" aria-hidden="true" />
                  Comptage des billets
                </label>
                <div className="space-y-2">
                  {BILLETS_FCFA.map(billet => (
                    <div key={billet} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-2">
                      <div className="w-20 text-right">
                        <span className="text-white font-semibold">{billet.toLocaleString('fr-FR')}</span>
                        <span className="text-slate-400 text-sm ml-1">FC</span>
                      </div>
                      <span className="text-slate-400">×</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={caisseData.billets[billet] || ''}
                        onChange={(e) => setCaisseData({
                          ...caisseData,
                          billets: { ...caisseData.billets, [billet]: parseInt(e.target.value) || 0 }
                        })}
                        className="w-20 bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                        disabled={loading}
                        aria-label={`Nombre de billets de ${billet} FCFA`}
                      />
                      <span className="text-slate-400">=</span>
                      <span className="text-green-400 font-semibold flex-1 text-right">
                        {formatMoney((caisseData.billets[billet] || 0) * billet)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={`rounded-lg p-3 border-2 ${
                  calculateTotalBillets === parseFloat(formData.solde_initial || '0')
                    ? 'bg-green-500/20 border-green-500'
                    : calculateTotalBillets > 0
                      ? 'bg-orange-500/20 border-orange-500'
                      : 'bg-slate-700/50 border-slate-600'
                }`}
                role="status"
                aria-live="polite"
              >
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-semibold">Total compté</span>
                  <span className={`text-2xl font-bold ${
                    calculateTotalBillets === parseFloat(formData.solde_initial || '0')
                      ? 'text-green-400'
                      : 'text-orange-400'
                  }`}>
                    {formatMoney(calculateTotalBillets)}
                  </span>
                </div>
                {calculateTotalBillets > 0 && calculateTotalBillets !== parseFloat(formData.solde_initial || '0') && (
                  <p className="text-orange-400 text-sm mt-1">
                    Différence: {formatMoney(calculateTotalBillets - parseFloat(formData.solde_initial || '0'))}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="reference-recu" className="block text-sm font-semibold text-slate-300 mb-2">
                  Numéro de reçu (optionnel)
                </label>
                <input
                  id="reference-recu"
                  type="text"
                  value={caisseData.reference_recu}
                  onChange={(e) => setCaisseData({ ...caisseData, reference_recu: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: REC-2024-001"
                  disabled={loading}
                  maxLength={50}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCaisseModal(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleCaisseValidation}
                  disabled={loading || calculateTotalBillets !== parseFloat(formData.solde_initial || '0')}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <CheckCircle size={20} aria-hidden="true" />
                      Valider le paiement
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
