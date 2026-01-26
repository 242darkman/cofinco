import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, DollarSign, Calendar, CreditCard, Building, Smartphone, ArrowRight, AlertCircle, CheckCircle, Clock, Banknote, FileCheck, RefreshCw, Phone, Hash, Wallet, AlertTriangle, Loader2, Search, Percent } from 'lucide-react';
import { clientApi, compteEpargneApi, transactionEpargneApi } from '../../../lib/api-client';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, validateRequired, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { Button, IconButton, Card, SelectField } from '../../ui';
import { StatutClient, StatutCompte, TypeCompte as TypeCompteEnum, FrequenceVirement } from '@shared/enum/status-constants';

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

import { type Compte } from '../../../../../shared/schema/finance';

interface CompteExistant {
  id: string;
  numero_compte: string;
  typeCompte?: string;
  type_compte: string;
  solde: number;
  solde_courant?: string | number;
  statut?: Compte['statut'];
}

interface ProduitCompte {
  id: string;
  nom: string;
  code?: string;
  type_compte?: string;
  typeCompte?: string;
  taux_interet?: number | string | null;
  tauxInteret?: number | string | null;
}

interface EpargneAccountFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
}

// Types utilisant les valeurs EN (alignées avec le backend)
type TypeCompte = 'CURRENT' | 'SAVINGS' | 'BLOCKED';
type ModeOuverture = 'CASH' | 'TRANSFER' | 'MOBILE_MONEY';
type FrequenceVersement = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

// Labels FR pour l'affichage UI
const TYPE_COMPTE_LABELS: Record<TypeCompte, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
};

const TYPE_COMPTE_DESCRIPTIONS: Record<TypeCompte, string> = {
  'CURRENT': 'Opérations quotidiennes',
  'SAVINGS': 'Économies avec intérêts',
  'BLOCKED': 'Épargne à terme fixe',
};

const FREQUENCE_LABELS: Record<FrequenceVersement, string> = {
  'WEEKLY': 'Chaque semaine',
  'BIWEEKLY': 'Toutes les 2 semaines',
  'MONTHLY': 'Chaque mois',
  'QUARTERLY': 'Chaque trimestre',
};

// Helper pour valider les valeurs de type compte
const normalizeTypeCompte = (value: string): TypeCompte => {
  if (value === TypeCompteEnum.CURRENT) return 'CURRENT';
  if (value === TypeCompteEnum.SAVINGS) return 'SAVINGS';
  if (value === TypeCompteEnum.BLOCKED) return 'BLOCKED';
  return 'CURRENT';
};

interface CreateAccountPayload {
  clientId: string;
  typeCompte: TypeCompte;
  produitId?: string;
  soldeInitial: number;
  modePaiement: ModeOuverture;
  compteSourceId?: string;
  blocageActif: boolean;
  blocageMotif?: string;
  blocageReference?: string;
  versementAutoActif: boolean;
  versementAutoMontant?: number;
  versementAutoFrequence?: FrequenceVersement;
  versementAutoJour?: number;
}

export default function EpargneAccountForm({ onClose, onSuccess, clientId }: EpargneAccountFormProps) {
  const { mobileMoneyEnabled, mobileMoneyMessage } = useFeatureFlags();
  const [clients, setClients] = useState<Client[]>([]);
  const [comptesExistants, setComptesExistants] = useState<CompteExistant[]>([]);
  const [produits, setProduits] = useState<ProduitCompte[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProduits, setLoadingProduits] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(clientId ? 2 : 1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [validationRequise, setValidationRequise] = useState(false);
  const [showMobileMoneyModal, setShowMobileMoneyModal] = useState(false);
  const [showCaisseModal, setShowCaisseModal] = useState(false);
  const [mobileMoneyData, setMobileMoneyData] = useState({
    numero_telephone: '',
    numero_transaction: '',
    code_otp: ''
  });
  const [caisseData, setCaisseData] = useState({
    billets: {} as Record<number, number>,
    reference_recu: ''
  });

  const [formData, setFormData] = useState({
    client_id: clientId || '',
    type_compte: 'CURRENT' as TypeCompte,
    produit_id: '',
    solde_initial: '',
    mode_ouverture: 'CASH' as ModeOuverture,
    compte_source_id: '',
    reference_paiement: '',
    date_echeance: '',
    motif_blocage: '',
    notes: '',
    versement_auto_active: false,
    versement_auto_montant: '',
    versement_auto_frequence: 'MONTHLY' as FrequenceVersement,
    versement_auto_jour: '28'
  });

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const data = await clientApi.getAllList();
      const activeClients = Array.isArray(data) ? data.filter((c: any) => (c.statut || c.status) === StatutClient.ACTIVE) : [];
      setClients(activeClients);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des clients');
      toast.error(errorMessage);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const loadProduits = useCallback(async (typeCompte: TypeCompte) => {
    setLoadingProduits(true);
    try {
      // typeCompte is already in EN format
      const data = await compteEpargneApi.getProduits({ typeCompte });
      setProduits(Array.isArray(data) ? data : []);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des produits');
      toast.error(errorMessage);
      setProduits([]);
    } finally {
      setLoadingProduits(false);
    }
  }, []);

  const loadComptesClient = useCallback(async (clientIdParam: string) => {
    try {
      const data = await compteEpargneApi.getByClient(clientIdParam);
      const activeComptes = Array.isArray(data) ? data.filter((c: any) => {
          const status = c.statut as Compte['statut'] | undefined;
          if (!status) return false;

          return status !== StatutCompte.CLOSED;
      }) : [];
      setComptesExistants(activeComptes);

      // Check eligibility for internal transfer
      const isVirementEligible = activeComptes.some((c: any) => {
        const typeBackend = c.type_compte || c.typeCompte || '';
        const typeEN = normalizeTypeCompte(typeBackend);
        const soldeValue = c.solde !== undefined ? c.solde : c.solde_courant;
        const solde = typeof soldeValue === 'number' ? soldeValue : parseFloat(String(soldeValue || 0));
        return typeEN === 'CURRENT' && solde > 0;
      });

      // Reset mode_ouverture to 'CASH' if transfer is no longer eligible
      if (!isVirementEligible && formData.mode_ouverture === 'TRANSFER') {
        setFormData(prev => ({ ...prev, mode_ouverture: 'CASH' }));
      }

      // Auto-sélectionner un type disponible si celui par défaut est déjà possédé
      const ownedTypesEN = activeComptes.map((c: any) => {
        const typeBackend = c.typeCompte || c.type_compte || '';
        return normalizeTypeCompte(typeBackend);
      });
      if (ownedTypesEN.includes(formData.type_compte)) {
        const available = (['CURRENT', 'SAVINGS', 'BLOCKED'] as TypeCompte[]).find(t => !ownedTypesEN.includes(t));
        if (available) {
          setFormData(prev => ({ ...prev, type_compte: available }));
        }
      }
    } catch (error) {
      console.warn('Erreur chargement comptes:', error);
      setComptesExistants([]);
    }
  }, [formData.type_compte]);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (formData.client_id) {
      loadComptesClient(formData.client_id);
    }
  }, [formData.client_id]);

  useEffect(() => {
    loadProduits(formData.type_compte);
  }, [formData.type_compte, loadProduits]);

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
      'CURRENT': 'CRT',
      'SAVINGS': 'EPG',
      'BLOCKED': 'BLQ'
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
    if (formData.mode_ouverture === 'TRANSFER') {
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
    if (formData.type_compte === 'BLOCKED') {
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
    // Validation des versements automatiques
    if (formData.versement_auto_active) {
      const versementMontant = parseFloat(formData.versement_auto_montant) || 0;
      
      if (!formData.versement_auto_montant || versementMontant <= 0) {
        newErrors.versement_auto_montant = 'Montant invalide ou manquant';
      }
      
      if (versementMontant < 1000) {
        newErrors.versement_auto_montant = 'Montant minimum : 1 000 FCFA';
      }
      
      if (versementMontant > 10000000) {
        newErrors.versement_auto_montant = 'Montant maximum : 10 000 000 FCFA';
      }
      
      if (!formData.compte_source_id) {
        newErrors.compte_source_id = 'Compte source requis pour les versements automatiques';
      }
      
      if (!formData.versement_auto_frequence) {
        newErrors.versement_auto_frequence = 'Fréquence requise';
      }
      
      const jour = parseInt(formData.versement_auto_jour) || 0;
      if (formData.versement_auto_frequence === 'MONTHLY' || formData.versement_auto_frequence === 'QUARTERLY') {
        if (jour < 1 || jour > 28) {
          newErrors.versement_auto_jour = 'Jour doit être entre 1 et 28';
        }
      } else if (formData.versement_auto_frequence === 'WEEKLY') {
        if (jour < 1 || jour > 7) {
          newErrors.versement_auto_jour = 'Jour doit être entre 1 (Lundi) et 7 (Dimanche)';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, comptesExistants, selectedOperator]);

  // calculateTotalBillets removed as cash breakdown is handled in cashier session, not during account opening request


  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.warning('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    // Intercept Cash payments for validation
    if (formData.mode_ouverture === 'CASH' && parseFloat(formData.solde_initial) > 0) {
      setShowCaisseModal(true);
      return;
    }

    await createAccount();
  }, [formData, validate]);

  const createAccount = useCallback(async () => {
    setLoading(true);

    try {
      // Backend handles number generation now if not provided, sending as requested
      // But keeping frontend generation for consistent UX feedback if needed, 
      // though backend overrides usually. Let's let backend generate or use this.
      // Ideally let backend generate.
      
      const soldeInitial = parseFloat(formData.solde_initial) || 0;

      // Sanitize user inputs
      const sanitizedNotes = sanitizeInput(formData.notes);
      const sanitizedMotif = sanitizeInput(formData.motif_blocage);

      // Type and frequence are already in EN format
      const payload = {
        clientId: formData.client_id,
        typeCompte: formData.type_compte, // Already EN value
        produitId: formData.produit_id || undefined,
        soldeInitial: soldeInitial,
        modePaiement: formData.mode_ouverture,
        compteSourceId: formData.mode_ouverture === 'TRANSFER' ? formData.compte_source_id : undefined,
        blocageActif: formData.type_compte === 'BLOCKED',
        blocageMotif: formData.type_compte === 'BLOCKED' ? sanitizedMotif : undefined,
        blocageReference: formData.type_compte === 'BLOCKED' ? formData.date_echeance : undefined,
        versementAutoActif: formData.versement_auto_active,
        versementAutoMontant: formData.versement_auto_active ? parseFloat(formData.versement_auto_montant) : undefined,
        versementAutoFrequence: formData.versement_auto_active ? formData.versement_auto_frequence : undefined,
        versementAutoJour: formData.versement_auto_active ? parseInt(formData.versement_auto_jour) : undefined,
      };

      const newCompte = await compteEpargneApi.create(payload);

      // Success message
      if (formData.mode_ouverture === 'CASH' && soldeInitial > 0) {
        toast.success(`Compte créé avec succès !`);
        toast.info(`Statut: En attente de paiement. Veuillez encaisser ${formatMoney(soldeInitial)} en caisse.`);
      } else {
        toast.success(`Compte créé et activé avec succès !`);
      }

      onSuccess();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Erreur lors de la création du compte');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [formData, onSuccess]);



  const handleClientSelect = useCallback((client: Client) => {
    setFormData(prev => ({ ...prev, client_id: client.id }));
    setStep(2);
  }, []);

  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'type_compte' ? { produit_id: '' } : {})
    }));
    // Clear field error
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const selectedClient = useMemo(() => clients.find(c => c.id === formData.client_id), [clients, formData.client_id]);
  const compteSource = useMemo(() => comptesExistants.find(c => c.id === formData.compte_source_id), [comptesExistants, formData.compte_source_id]);
  const selectedProduit = useMemo(
    () => produits.find((p) => p.id === formData.produit_id),
    [produits, formData.produit_id]
  );
  const selectedProduitRate = selectedProduit
    ? Number(selectedProduit.tauxInteret || selectedProduit.taux_interet || 0)
    : 0;

  // Safe escaped values
  const safeClientName = selectedClient ? escapeHtml(`${selectedClient.nom} ${selectedClient.prenom || ''}`) : '';

  // Mobile Money Validation Stub
  const handleMobileMoneyValidation = async () => {
    // TODO: Implement Mobile Money validation
    console.log('Validating Mobile Money payment:', mobileMoneyData);
    setShowMobileMoneyModal(false);
  };

  // Caisse Validation Implementation
  const handleCaisseValidation = async () => {
    const totalBillets = Object.entries(caisseData.billets).reduce((sum, [billet, count]) => {
        return sum + (parseInt(billet) * count);
    }, 0);

    const initialAmount = parseFloat(formData.solde_initial) || 0;

    if (totalBillets !== initialAmount) {
        toast.error(`Le montant compté (${formatMoney(totalBillets)}) ne correspond pas au montant attendu (${formatMoney(initialAmount)})`);
        return;
    }
    
    // Proceed with creation
    await createAccount();
    setShowCaisseModal(false);
  };

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
                {/* Account Type - Visual Selector */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-300 mb-3">
                    Type de Compte <span className="text-red-400">*</span>
                  </label>
                  
                  {/* Visual Account Type Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['CURRENT', 'SAVINGS', 'BLOCKED'] as TypeCompte[]).map((type) => {
                    // Check if client ALREADY has this account type
                    const isOwned = comptesExistants.some(c => {
                      const compteType = c.typeCompte || c.type_compte || '';
                      const compteTypeEN = normalizeTypeCompte(compteType);
                      return compteTypeEN === type;
                    });
                    
                    const isSelected = formData.type_compte === type;
                    const isDisabled = loading || isOwned; // Disabled if already owned
                    
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => !isDisabled && handleInputChange('type_compte', type)}
                        disabled={isDisabled}
                        className={`
                          relative p-4 rounded-lg border-2 transition-all text-left
                          ${isOwned
                            ? 'bg-slate-800/30 border-slate-700 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/20'
                              : 'bg-slate-700/50 border-slate-600 hover:border-blue-500/50 hover:bg-slate-700 cursor-pointer'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`
                            mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                            ${isOwned 
                              ? 'border-slate-600 bg-slate-700'
                              : isSelected 
                                ? 'border-blue-500 bg-blue-500' 
                                : 'border-slate-500'
                            }
                          `}>
                            {isOwned ? (
                              <CheckCircle size={14} className="text-slate-500" />
                            ) : isSelected && (
                              <div className="w-2 h-2 bg-white rounded-full" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`font-semibold text-sm ${isOwned ? 'text-slate-500' : isSelected ? 'text-white' : 'text-slate-300'}`}>
                              {TYPE_COMPTE_LABELS[type]} {isOwned && (
                                <span className="text-xs font-normal opacity-70">
                                  {comptesExistants.some(c => {
                                     const compteType = c.typeCompte || c.type_compte || '';
                                     const compteTypeEN = normalizeTypeCompte(compteType);
                                     return compteTypeEN === type && c.statut === StatutCompte.PENDING_ACTIVATION;
                                  }) ? '(En attente)' : '(Déjà actif)'}
                                </span>
                              )}
                            </p>
                            <p className={`text-xs mt-1 ${isOwned ? 'text-slate-600' : 'text-slate-400'}`}>
                              {TYPE_COMPTE_DESCRIPTIONS[type]}
                            </p>
                            {isOwned && (
                              <span className="inline-block mt-2 px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] uppercase font-bold rounded-full border border-slate-700">
                                Compte existant
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                  
                  {/* Show owned accounts */}
                  {comptesExistants.length > 0 && (
                    <div className="mt-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                      <p className="text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1">
                        <CheckCircle size={12} className="text-green-400" />
                        Comptes déjà possédés
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {comptesExistants.map((compte) => {
                          const type = compte.typeCompte || compte.type_compte;
                          return (
                            <span
                              key={compte.id}
                              className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded-md border border-slate-600"
                            >
                              {type} • {compte.numero_compte}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Produit (taux au niveau produit) */}
                <div className="md:col-span-2">
                  <SelectField
                    label="Produit de Compte"
                    name="produit_id"
                    value={formData.produit_id}
                    onChange={(e) => handleInputChange('produit_id', e.target.value)}
                    options={produits.map((produit) => ({
                      value: produit.id,
                      label: `${produit.nom} • ${Number(produit.tauxInteret || produit.taux_interet || 0).toFixed(1)}%`,
                    }))}
                    placeholder={loadingProduits ? 'Chargement des produits...' : 'Sélectionner un produit'}
                    helperText={
                      selectedProduit
                        ? `Taux d'intérêt: ${selectedProduitRate.toFixed(1)}% / an`
                        : 'Le taux est défini par le produit sélectionné.'
                    }
                    disabled={loading || loadingProduits || produits.length === 0}
                  />
                  {produits.length === 0 && !loadingProduits && (
                    <p className="text-xs text-amber-400 mt-2">
                      Aucun produit disponible pour ce type de compte.
                    </p>
                  )}
                  {selectedProduit && (
                    <div className="mt-3 bg-slate-700/40 border border-slate-600/50 rounded-lg p-3 flex items-center gap-3">
                      <div className={`rounded-full p-2 ${selectedProduitRate > 0 ? 'bg-emerald-500/15' : 'bg-slate-600/30'}`}>
                        <Percent size={16} className={selectedProduitRate > 0 ? 'text-emerald-400' : 'text-slate-400'} />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-slate-400">Taux d'intérêt appliqué</p>
                        <p className={`text-lg font-bold ${selectedProduitRate > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {selectedProduitRate.toFixed(1)}% <span className="text-xs font-normal text-slate-500">/ an</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Produit</p>
                        <p className="text-xs text-slate-300 font-medium">{selectedProduit.nom || selectedProduit.code}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment Mode */}
                <fieldset className="md:col-span-2">
                  <legend className="block text-sm font-semibold text-slate-300 mb-2">
                    Mode de Paiement <span className="text-red-400">*</span>
                  </legend>
                  <div className="grid grid-cols-2 gap-3" role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_ouverture === 'CASH'}
                      onClick={() => handleInputChange('mode_ouverture', 'CASH')}
                      disabled={loading}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.mode_ouverture === 'CASH'
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <Banknote size={24} className="mb-2" aria-hidden="true" />
                      <span className="text-sm font-medium">Espèces</span>
                      <span className="text-xs opacity-75 mt-1">Paiement en caisse</span>
                    </button>

                    {comptesExistants.some(c => {
                        const typeBackend = c.type_compte || c.typeCompte || '';
                        const typeEN = normalizeTypeCompte(typeBackend);
                        const soldeValue = c.solde !== undefined ? c.solde : c.solde_courant;
                        const solde = typeof soldeValue === 'number' ? soldeValue : parseFloat(String(soldeValue || 0));
                        return typeEN === 'CURRENT' && solde > 0;
                    }) ? (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={formData.mode_ouverture === 'TRANSFER'}
                          onClick={() => handleInputChange('mode_ouverture', 'TRANSFER')}
                          disabled={loading}
                          className={`flex flex-col items-center justify-center p-4 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            formData.mode_ouverture === 'TRANSFER'
                              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                              : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <RefreshCw size={24} className="mb-2" aria-hidden="true" />
                          <span className="text-sm font-medium">Virement Interne</span>
                          <span className="text-xs opacity-75 mt-1">Depuis compte courant</span>
                        </button>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-4 rounded-lg border bg-slate-800/50 border-slate-700 text-slate-500 opacity-70 cursor-not-allowed">
                             <RefreshCw size={24} className="mb-2" />
                             <span className="text-sm font-medium">Virement Interne</span>
                             <span className="text-xs text-center mt-1">Aucun compte courant éligible</span>
                        </div>
                    )}

                    <button
                      type="button"
                      role="radio"
                      disabled={true}
                      className="flex flex-col items-center justify-center p-4 rounded-lg border bg-slate-800/50 border-slate-700 text-slate-500 opacity-50 cursor-not-allowed"
                    >
                      <Smartphone size={24} className="mb-2" aria-hidden="true" />
                      <span className="text-sm font-medium">Mobile Money</span>
                      <span className="text-xs opacity-75 mt-1">Bientôt disponible</span>
                    </button>
                    
                    <button
                      type="button"
                      role="radio"
                      disabled={true}
                      className="flex flex-col items-center justify-center p-4 rounded-lg border bg-slate-800/50 border-slate-700 text-slate-500 opacity-50 cursor-not-allowed"
                    >
                      <Smartphone size={24} className="mb-2" aria-hidden="true" />
                      <span className="text-sm font-medium">Mobile Money</span>
                      <span className="text-xs opacity-75 mt-1">Bientôt disponible</span>
                    </button>
                  </div>

                  {formData.mode_ouverture === 'CASH' && (
                     <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-3">
                        <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={16} />
                        <div className="text-sm">
                           <p className="text-yellow-200 font-medium">Information</p>
                           <p className="text-yellow-200/80">
                              Le compte sera créé avec le statut <strong>En attente de paiement</strong>. 
                              Le client devra se rendre en caisse pour effectuer le dépôt initial et activer le compte.
                           </p>
                        </div>
                     </div>
                  )}
                </fieldset>



                {/* Source Account for Internal Transfer */}
                {formData.mode_ouverture === 'TRANSFER' ? (
                  <div className="md:col-span-2">
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
                ) : null}

                {/* Initial Amount */}
                <div className="md:col-span-2">
                  <label htmlFor="solde-initial" className="block text-sm font-semibold text-slate-300 mb-2">
                    <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                    Montant de dépôt initial (FCFA)
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
                  {formData.mode_ouverture === 'TRANSFER' && compteSource && (
                    <p id="solde-disponible" className="text-xs text-slate-400 mt-1">
                      Solde disponible: {formatMoney(compteSource.solde)}
                    </p>
                  )}
                  {errors.solde_initial && (
                    <p className="text-red-400 text-sm mt-1" role="alert">{errors.solde_initial}</p>
                  )}
                </div>

                {/* Payment Reference */}
                {formData.mode_ouverture !== 'TRANSFER' && (
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
                {formData.type_compte === 'BLOCKED' && (
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

                {/* Auto Transfer Settings - For Savings and Blocked accounts */}
                {(formData.type_compte === 'SAVINGS' || formData.type_compte === 'BLOCKED') &&
                  comptesExistants.some(c => {
                    const typeBackend = c.type_compte || c.typeCompte || '';
                    return normalizeTypeCompte(typeBackend) === 'CURRENT';
                  }) && (
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
                          {formData.type_compte === 'SAVINGS'
                            ? 'Transférer automatiquement depuis votre compte courant pour épargner régulièrement'
                            : 'Alimenter automatiquement votre épargne bloquée selon la fréquence choisie'
                          }
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
                            <option value="WEEKLY">{FREQUENCE_LABELS['WEEKLY']}</option>
                            <option value="BIWEEKLY">{FREQUENCE_LABELS['BIWEEKLY']}</option>
                            <option value="MONTHLY">{FREQUENCE_LABELS['MONTHLY']}</option>
                            <option value="QUARTERLY">{FREQUENCE_LABELS['QUARTERLY']}</option>
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
                            {comptesExistants.filter(c => {
                              const typeBackend = c.type_compte || c.typeCompte || '';
                              return normalizeTypeCompte(typeBackend) === 'CURRENT';
                            }).map(compte => (
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
                      {formData.mode_ouverture !== 'TRANSFER' && (
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

      {/* Cash Validation Modal - Enhanced UX */}
      <AnimatePresence>
        {showCaisseModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="caisse-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCaisseModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative z-10"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                    <Wallet className="text-green-500" size={24} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="caisse-title" className="text-xl font-bold text-white tracking-tight">Validation Caisse</h3>
                    <p className="text-sm text-slate-400">Comptage des espèces</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCaisseModal(false)}
                  className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
                  aria-label="Fermer"
                  disabled={loading}
                >
                  <X size={24} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Amount Summary */}
                <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
                  <p className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Montant à Encaisser</p>
                  <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
                    {formatMoney(parseFloat(formData.solde_initial || '0'))}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                       <Banknote size={16} className="text-slate-400" />
                       Billetage
                    </label>
                    <button 
                      type="button" 
                      onClick={() => setCaisseData(prev => ({ ...prev, billets: {} }))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Réinitialiser
                    </button>
                  </div>
                  
                  <div className="grid gap-3">
                    {BILLETS_FCFA.map((billet, index) => {
                      const count = caisseData.billets[billet] || 0;
                      const subtotal = count * billet;
                      
                      return (
                        <motion.div 
                          key={billet}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`
                            flex items-center gap-3 bg-slate-800/40 rounded-xl p-3 border transition-all duration-200
                            ${count > 0 ? 'border-green-500/30 bg-green-500/5' : 'border-slate-700/50 hover:border-slate-600'}
                          `}
                        >
                          <div className="w-24 text-right shrink-0">
                            <span className="text-white font-bold text-lg">{billet.toLocaleString('fr-FR')}</span>
                            <span className="text-slate-500 text-xs ml-1 font-medium">FCFA</span>
                          </div>
                          
                          <span className="text-slate-600">×</span>
                          
                          <div className="flex-1 relative">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={caisseData.billets[billet] || ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setCaisseData({
                                  ...caisseData,
                                  billets: { ...caisseData.billets, [billet]: val }
                                });
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white text-center font-mono text-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-shadow"
                              placeholder="0"
                              disabled={loading}
                            />
                          </div>

                          <div className="w-28 text-right font-mono font-medium shrink-0">
                             <span className={subtotal > 0 ? 'text-green-400' : 'text-slate-600'}>
                               {formatMoney(subtotal)}
                             </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Total & Status */}
                {(() => {
                   const totalT = Object.entries(caisseData.billets).reduce((sum, [b, c]) => sum + (parseInt(b) * c), 0);
                   const target = parseFloat(formData.solde_initial || '0');
                   const diff = totalT - target;
                   const isMatch = totalT === target;
                   
                   return (
                     <div
                        className={`rounded-xl p-4 border-2 transition-all duration-300 ${
                          isMatch
                            ? 'bg-green-500/10 border-green-500/50'
                            : totalT > 0
                              ? 'bg-orange-500/10 border-orange-500/50'
                              : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 block mb-1">Total Compté</span>
                            <span className={`text-3xl font-bold ${
                              isMatch ? 'text-green-400' : totalT > 0 ? 'text-orange-400' : 'text-slate-500'
                            }`}>
                              {formatMoney(totalT)}
                            </span>
                          </div>
                          <div className="text-right">
                             {diff !== 0 && totalT > 0 && (
                               <div className={`text-sm font-medium px-2 py-1 rounded-lg inline-block ${
                                 diff > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                               }`}>
                                 {diff > 0 ? '+' : ''}{formatMoney(diff)}
                               </div>
                             )}
                          </div>
                        </div>
                      </div>
                   );
                })()}

                <div>
                  <label htmlFor="reference-recu" className="block text-sm font-semibold text-slate-300 mb-2">
                    Numéro de reçu (optionnel)
                  </label>
                  <div className="relative">
                    <FileCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      id="reference-recu"
                      type="text"
                      value={caisseData.reference_recu}
                      onChange={(e) => setCaisseData({ ...caisseData, reference_recu: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                      placeholder="Ex: REC-2024-001"
                      disabled={loading}
                      maxLength={50}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCaisseModal(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  onClick={handleCaisseValidation}
                  isLoading={loading}
                  disabled={loading || (() => {
                     const total = Object.entries(caisseData.billets).reduce((s, [b, c]) => s + (parseInt(b) * c), 0);
                     return total !== parseFloat(formData.solde_initial || '0');
                  })()}
                  className={`flex-1 ${
                    Object.entries(caisseData.billets).reduce((s, [b, c]) => s + (parseInt(b) * c), 0) === parseFloat(formData.solde_initial || '0')
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/20'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                  icon={CheckCircle}
                >
                  Valider le Paiement
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
