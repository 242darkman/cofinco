import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, DollarSign, Calendar, CreditCard, Building, Smartphone, ArrowRight, AlertCircle, 
  CheckCircle, Clock, Banknote, FileCheck, RefreshCw, Phone, Hash, Wallet, AlertTriangle, 
  Loader2, Search, Percent, ShieldCheck, Lock, Building2, ChevronRight, ChevronLeft, FileText, Check
} from 'lucide-react';
import { clientApi, compteEpargneApi, transactionEpargneApi } from '../../../lib/api-client';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, validateRequired, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { Button } from '../../ui';
import { StatutClient, StatutCompte, TypeCompte as TypeCompteEnum, FrequenceVirement, FREQUENCE_VIREMENT_LABELS, type FrequenceVirementType } from '@shared/enum/status-constants';

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
  statut?: string;
}

interface CompteExistant {
  id: string;
  numeroCompte?: string;
  numero_compte: string;
  typeCompte?: string;
  type_compte: string;
  solde: number;
  solde_courant?: string | number;
  statut?: string;
}

interface ProduitCompte {
  id: string;
  nom: string;
  code?: string;
  type_compte?: string;
  typeCompte?: string;
  taux_interet?: number | string | null;
  tauxInteret?: number | string | null;
  frais?: {
    ouverture?: number;
    cloture?: number;
    tenue?: number;
    retrait?: number;
  } | null;
  regles?: {
    depotInitialObligatoire?: boolean;
    depotInitialMinimum?: number;
    validationOuvertureRequise?: boolean;
  } | null;
}

interface EpargneAccountFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
}

type TypeCompte = 'CURRENT' | 'SAVINGS' | 'BLOCKED';
type ModeOuverture = 'CASH' | 'TRANSFER' | 'MTN' | 'AIRTEL'; // MTN/AIRTEL map to MOBILE_MONEY on backend
type FrequenceVersement = FrequenceVirementType;

const normalizeTypeCompte = (value: string): TypeCompte => {
  if (value === TypeCompteEnum.CURRENT) return 'CURRENT';
  if (value === TypeCompteEnum.SAVINGS) return 'SAVINGS';
  if (value === TypeCompteEnum.BLOCKED) return 'BLOCKED';
  return 'CURRENT';
};

export default function EpargneAccountForm({ onClose, onSuccess, clientId }: EpargneAccountFormProps) {
  const { mobileMoneyEnabled } = useFeatureFlags();
  // Data State
  const [clients, setClients] = useState<Client[]>([]);
  const [comptesExistants, setComptesExistants] = useState<CompteExistant[]>([]);
  const [produits, setProduits] = useState<ProduitCompte[]>([]);
  
  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProduits, setLoadingProduits] = useState(false);
  
  // Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // UI State
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals Logic
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
  const [selectedOperator, setSelectedOperator] = useState<string>('');

  // Form Data
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
    versement_auto_jour: '28',
    validation_requise: false
  });

  // --- Data Loading ---
  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const data = await clientApi.getAllList();
      const activeClients = Array.isArray(data) ? data.filter((c: any) => (c.statut || c.status) === StatutClient.ACTIVE) : [];
      setClients(activeClients);
    } catch (error) {
      toast.error("Erreur lors du chargement des clients");
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const loadProduits = useCallback(async (typeCompte: TypeCompte) => {
    setLoadingProduits(true);
    try {
      const data = await compteEpargneApi.getProduits({ typeCompte });
      const productList = Array.isArray(data) ? data : [];
      setProduits(productList);
      
      // Auto-select first product if available
      if (productList.length > 0 && !formData.produit_id) {
         setFormData(prev => ({ ...prev, produit_id: productList[0].id }));
      }
    } catch (error) {
      console.error(error);
      setProduits([]);
    } finally {
      setLoadingProduits(false);
    }
  }, [formData.produit_id]);

  const loadComptesClient = useCallback(async (clientIdParam: string) => {
    try {
      const data = await compteEpargneApi.getByClient(clientIdParam);
      const activeComptes = Array.isArray(data) ? data.filter((c: any) => c.statut !== StatutCompte.CLOSED) : [];
      setComptesExistants(activeComptes);
    } catch (error) {
      setComptesExistants([]);
    }
  }, []);

  // --- Effects ---
  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (formData.client_id) {
      loadComptesClient(formData.client_id);
    }
  }, [formData.client_id, loadComptesClient]);

  useEffect(() => {
    loadProduits(formData.type_compte);
  }, [formData.type_compte, loadProduits]);

   // Selected Data Helpers
   const selectedClient = useMemo(() => clients.find(c => c.id === formData.client_id), [clients, formData.client_id]);
   const filteredClients = useMemo(() => {
     if (!searchQuery) return [];
     const query = searchQuery.toLowerCase();
     return clients.filter(c =>
       c.nom.toLowerCase().includes(query) ||
       c.prenom?.toLowerCase().includes(query) ||
       c.telephone?.includes(query)
     );
   }, [clients, searchQuery]);
   
   const selectedProduct = useMemo(() => produits.find(p => p.id === formData.produit_id), [produits, formData.produit_id]);
   const openingFee = selectedProduct?.frais?.ouverture ?? 0;
   const depotMinimum = selectedProduct?.regles?.depotInitialMinimum ?? 0;
   const validationRequise = selectedProduct?.regles?.validationOuvertureRequise ?? false;

   const existingAccountsTypes = useMemo(() =>
     comptesExistants.map(c => normalizeTypeCompte(c.typeCompte || '')),
   [comptesExistants]);

   const eligibleForTransfer = useMemo(() => 
     comptesExistants.some(c => {
        const type = normalizeTypeCompte(c.typeCompte || '');
        const solde = typeof c.solde === 'number' ? c.solde : parseFloat(String(c.solde || 0));
        return type === 'CURRENT' && solde > 0;
     }),
   [comptesExistants]);

  // --- Actions ---
  const handleClientSelect = (client: Client) => {
    setFormData(prev => ({ ...prev, client_id: client.id }));
    setSearchQuery('');
    if (errors.client_id) setErrors(prev => ({ ...prev, client_id: '' }));
  };

  const handleSearchChange = (val: string) => {
     setSearchQuery(val);
     if (errors.client_id) setErrors(prev => ({ ...prev, client_id: '' }));
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!formData.client_id) newErrors.client_id = "Veuillez sélectionner un client";
      if (!formData.produit_id) newErrors.produit_id = "Produit requis";
    }
    
    if (currentStep === 2) {
      // Amount validation
      const amount = parseFloat(formData.solde_initial);
      if (formData.solde_initial && isNaN(amount)) newErrors.solde_initial = "Montant invalide";
      if (amount < 0) newErrors.solde_initial = "Ne peut être négatif";

      // Check against fee + minimum deposit
      const minRequired = openingFee + depotMinimum;
      if (minRequired > 0 && amount < minRequired) {
        newErrors.solde_initial = `Montant minimum requis: ${formatMoney(minRequired)} FCFA (frais ${formatMoney(openingFee)} + dépôt min ${formatMoney(depotMinimum)})`;
      }

      // Transfer validation
      if (formData.mode_ouverture === 'TRANSFER' && !formData.compte_source_id) {
         newErrors.compte_source_id = "Compte source requis";
      }
    }
    
    if (currentStep === 3) {
       // Validation Blocked
       if (formData.type_compte === 'BLOCKED') {
          if (!formData.date_echeance) newErrors.date_echeance = "Date requise";
          if (!formData.motif_blocage) newErrors.motif_blocage = "Motif requis";
       }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(s => s + 1);
    }
  };

  const prevStep = () => {
    setStep(s => s - 1);
  };

  // --- Submission Logic ---

  const isMobileMoneyMode = formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL';

  const handleCreateClick = () => {
     if (!validateStep(3)) return;

     const soldeInitial = parseFloat(formData.solde_initial) || 0;

     if (formData.mode_ouverture === 'CASH' && soldeInitial > 0) {
        setShowCaisseModal(true);
     } else if (isMobileMoneyMode && soldeInitial > 0) {
        setSelectedOperator(formData.mode_ouverture);
        setShowMobileMoneyModal(true);
     } else {
        performAccountCreation();
     }
  };

  const performAccountCreation = async () => {
    setLoading(true);
    try {
      const soldeInitial = parseFloat(formData.solde_initial) || 0;
      const sanitizedMotif = sanitizeInput(formData.motif_blocage);

      // Map MTN/AIRTEL to MOBILE_MONEY for backend
      const modePaiement = (formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL')
        ? 'MOBILE_MONEY'
        : formData.mode_ouverture;

      const payload = {
        clientId: formData.client_id,
        typeCompte: formData.type_compte,
        produitId: formData.produit_id || undefined,
        soldeInitial: soldeInitial,
        modePaiement,
        operateurMobile: (formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL') ? formData.mode_ouverture : undefined,
        telephoneMobileMoney: mobileMoneyData.numero_telephone || undefined,
        referenceTransaction: mobileMoneyData.numero_transaction || undefined,
        compteSourceId: formData.mode_ouverture === 'TRANSFER' ? formData.compte_source_id : undefined,
        blocageActif: formData.type_compte === 'BLOCKED',
        blocageMotif: formData.type_compte === 'BLOCKED' ? sanitizedMotif : undefined,
        blocageReference: formData.type_compte === 'BLOCKED' ? formData.date_echeance : undefined,
        versementAutoActif: formData.versement_auto_active,
        versementAutoMontant: formData.versement_auto_active ? parseFloat(formData.versement_auto_montant) : undefined,
        versementAutoFrequence: formData.versement_auto_active ? formData.versement_auto_frequence : undefined,
        versementAutoJour: formData.versement_auto_active ? parseInt(formData.versement_auto_jour) : undefined,
      };

      await compteEpargneApi.create(payload);

      if (validationRequise && (formData.type_compte === 'SAVINGS' || formData.type_compte === 'BLOCKED')) {
        toast.success('Compte créé — en attente de validation du chef d\'agence.');
        toast.info('Le compte apparaîtra dans le Centre de Validations.');
      } else if (formData.mode_ouverture === 'CASH' && soldeInitial > 0) {
        toast.success('Compte créé avec succès !');
        toast.info(`Statut: En attente de paiement. Veuillez encaisser ${formatMoney(soldeInitial)} en caisse.`);
      } else {
        toast.success('Compte créé et activé avec succès !');
      }
      onSuccess();
    } catch (error: any) {
      toast.error(handleApiError(error, 'Erreur création compte'));
    } finally {
      setLoading(false);
      setShowCaisseModal(false);
    }
  };

  // --- Mobile Money Logic ---
  const handleMobileMoneyValidation = () => {
    if (!mobileMoneyData.numero_telephone) {
      toast.error("Veuillez saisir le numéro de téléphone");
      return;
    }
    if (!mobileMoneyData.numero_transaction) {
      toast.error("Veuillez saisir la référence de transaction");
      return;
    }
    setShowMobileMoneyModal(false);
    performAccountCreation();
  };

  // --- Caisse Logic ---
  const handleCaisseValidation = () => {
    const totalBillets = Object.entries(caisseData.billets).reduce((sum, [billet, count]) => sum + (parseInt(billet) * count), 0);
    const initialAmount = parseFloat(formData.solde_initial) || 0;
    if (totalBillets !== initialAmount) {
        toast.error(`Le montant compté (${formatMoney(totalBillets)}) ne correspond pas au montant attendu`);
        return;
    }
    performAccountCreation();
  };

  // --- Sub-components (Inline for access to state) ---

  const StepIndicator = ({ s, label }: { s: number, label: string }) => {
    const active = step >= s;
    const current = step === s;
    return (
      <div className="flex items-center gap-2">
         <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300 ${
           active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-500'
         }`}>
           {s}
         </div>
         <span className={`text-xs font-medium hidden sm:block transition-colors duration-300 ${
           active ? 'text-white' : 'text-slate-600'
         } ${current ? 'text-indigo-400' : ''}`}>{label}</span>
      </div>
    );
  };

  const AccountTypeCard = ({ id, label, icon: Icon, desc }: any) => {
    const isSelected = formData.type_compte === id;
    const existing = existingAccountsTypes.includes(id);

    return (
      <button 
        type="button"
        onClick={() => !existing && handleInputChange('type_compte', id)}
        disabled={existing}
        className={`relative h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all w-full
          ${existing 
             ? 'border-slate-800 bg-slate-900/50 opacity-50 cursor-not-allowed' 
             : isSelected 
                ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' 
                : 'border-slate-800 bg-slate-900 hover:border-slate-600 hover:bg-slate-800'
          }
        `}
      >
        <Icon size={24} className={isSelected ? 'text-indigo-400' : 'text-slate-400'} />
        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-500'}`}>{label}</span>
        <span className="text-[10px] text-slate-500">{desc}</span>
        {existing && (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-500 uppercase">
             Existant
          </span>
        )}
      </button>
    );
  };

  const PaymentCard = ({ id, label, icon: Icon, color = 'emerald' }: any) => {
    const isSelected = formData.mode_ouverture === id;
    const colors: any = {
      emerald: 'border-emerald-500 bg-emerald-500/10 text-emerald-500',
      yellow: 'border-yellow-500 bg-yellow-500/10 text-yellow-500',
      red: 'border-red-500 bg-red-500/10 text-red-500',
      blue: 'border-blue-500 bg-blue-500/10 text-blue-500',
    };
    
    // Disable if transfer not eligible or MM not enabled
    const isMM = id === 'MTN' || id === 'AIRTEL';
    const disabled = (id === 'TRANSFER' && !eligibleForTransfer) || (isMM && !mobileMoneyEnabled);

    return (
      <button
        type="button"
        onClick={() => handleInputChange('mode_ouverture', id)}
        disabled={disabled}
        className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all w-full
          ${disabled ? 'opacity-40 grayscale cursor-not-allowed border-slate-800 bg-slate-900' :
            isSelected ? colors[color] : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-600'
          }
        `}
      >
         <Icon size={20} />
         <span className="text-xs font-bold">{label}</span>
         {isMM && !mobileMoneyEnabled && <span className="text-[8px] text-slate-600">Bientôt</span>}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      <div className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* 1. HEADER */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 shrink-0">
           <div className="flex justify-between items-center mb-4">
              <div>
                 <h2 className="text-xl font-bold text-white">Ouvrir un Compte</h2>
                 <p className="text-xs text-slate-400">Assistant de création de compte</p>
              </div>
              <button onClick={onClose}><X className="text-slate-500 hover:text-white" /></button>
           </div>
           
           {/* Stepper */}
           <div className="flex items-center justify-between px-4 max-w-2xl mx-auto w-full">
              <StepIndicator s={1} label="Type de Compte" />
              <div className={`h-0.5 flex-1 mx-4 transition-colors duration-500 ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
              <StepIndicator s={2} label="Approvisionnement" />
              <div className={`h-0.5 flex-1 mx-4 transition-colors duration-500 ${step >= 3 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
              <StepIndicator s={3} label="Termes & Validation" />
           </div>
        </div>

        {/* 2. BODY (Hauteur Fixe) */}
        <div className="p-8 h-[480px] flex flex-col overflow-y-auto custom-scrollbar relative">
           
           {/* STEP 1: DÉFINITION */}
           {step === 1 && (
             <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
                
                {/* Client Select */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Client Titulaire</label>
                   {!selectedClient ? (
                      <div className="relative">
                         <div className="relative h-12">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                              type="text"
                              value={searchQuery}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              placeholder="Rechercher par nom ou téléphone..."
                              className="w-full h-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 text-white focus:border-indigo-500 outline-none placeholder-slate-600 transition-colors"
                              autoFocus
                            />
                         </div>
                         {/* Dropdown Results */}
                         {searchQuery && (
                           <div className="absolute z-10 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                              {loadingClients ? (
                                <div className="p-4 text-center text-slate-500 text-sm">Chargement...</div> 
                              ) : filteredClients.length > 0 ? (
                                filteredClients.map(c => (
                                  <button 
                                    key={c.id} 
                                    onClick={() => handleClientSelect(c)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center justify-between group"
                                  >
                                    <div>
                                      <div className="text-sm font-bold text-slate-200 group-hover:text-white">{c.nom} {c.prenom}</div>
                                      <div className="text-xs text-slate-500">{c.telephone}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-600 group-hover:text-white" />
                                  </button>
                                ))
                              ) : (
                                <div className="p-4 text-center text-slate-500 text-sm">Aucun client trouvé</div>
                              )}
                           </div>
                         )}
                      </div>
                   ) : (
                      <div className="h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                               {selectedClient.nom.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                               <div className="text-sm font-bold text-white">{selectedClient.nom} {selectedClient.prenom}</div>
                               <div className="text-[10px] text-indigo-300">
                                  {comptesExistants.length} compte(s) existant(s)
                               </div>
                            </div>
                         </div>
                         <button onClick={() => setFormData(prev => ({...prev, client_id: ''}))} className="text-xs text-slate-400 hover:text-white hover:underline">
                            Changer
                         </button>
                      </div>
                   )}
                   {errors.client_id && <p className="text-xs text-red-400 ml-1">{errors.client_id}</p>}
                </div>

                {/* Type de Compte (Tuiles) */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Type de Compte</label>
                   <div className="grid grid-cols-3 gap-4">
                      <AccountTypeCard 
                        id="CURRENT" 
                        label="Courant" 
                        icon={Wallet} 
                        desc="Opérations quotidiennes" 
                      />
                      <AccountTypeCard 
                        id="SAVINGS" 
                        label="Épargne" 
                        icon={ShieldCheck} 
                        desc="Avec intérêts" 
                      />
                      <AccountTypeCard 
                        id="BLOCKED" 
                        label="Bloqué" 
                        icon={Lock} 
                        desc="Terme fixe (DAT)" 
                      />
                   </div>
                </div>

                {/* Produit Select */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Produit Associé</label>
                   <div className="relative">
                      <select 
                        value={formData.produit_id}
                        onChange={(e) => handleInputChange('produit_id', e.target.value)}
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none appearance-none focus:border-indigo-500 transition-colors"
                        disabled={loadingProduits}
                      >
                         {loadingProduits ? (
                             <option>Chargement...</option>
                         ) : produits.length === 0 ? (
                             <option>Aucun produit disponible</option>
                         ) : (
                             produits.map(p => (
                               <option key={p.id} value={p.id}>{p.nom} ({(p.tauxInteret || p.taux_interet || 0)}%)</option>
                             ))
                         )}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                         <ChevronRight size={16} className="rotate-90" />
                      </div>
                   </div>
                   {errors.produit_id && <p className="text-xs text-red-400 ml-1">{errors.produit_id}</p>}
                </div>
             </div>
           )}

           {/* STEP 2: APPROVISIONNEMENT */}
           {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
                
                {/* Info Banner */}
                {formData.mode_ouverture === 'CASH' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-amber-400 text-xs">
                     <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                     <p>Le compte sera créé avec le statut <strong>"En attente"</strong> jusqu'à validation du dépôt initial en caisse.</p>
                  </div>
                )}
                {(formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL') && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3 text-blue-400 text-xs">
                     <Smartphone size={16} className="mt-0.5 flex-shrink-0" />
                     <p>Le paiement sera validé par <strong>{formData.mode_ouverture === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}</strong>. Vous devrez fournir le numéro et la référence de transaction.</p>
                  </div>
                )}

                {/* Mode de Paiement (Grid 4) */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Mode de Dépôt</label>
                   <div className="grid grid-cols-4 gap-3">
                      <PaymentCard id="CASH" label="Espèces" icon={Banknote} />
                      <PaymentCard id="MTN" label="MTN MoMo" icon={Smartphone} color="yellow" />
                      <PaymentCard id="AIRTEL" label="Airtel" icon={Smartphone} color="red" />
                      <PaymentCard id="TRANSFER" label="Interne" icon={Building2} color="blue" />
                   </div>
                   
                   {/* Transfer Source Select */}
                   {formData.mode_ouverture === 'TRANSFER' && (
                      <div className="mt-2 animate-in fade-in">
                          <select 
                             value={formData.compte_source_id}
                             onChange={(e) => handleInputChange('compte_source_id', e.target.value)}
                             className="w-full h-10 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-3 focus:border-indigo-500 outline-none"
                          >
                             <option value="">Sélectionner le compte source</option>
                             {comptesExistants.filter(c => normalizeTypeCompte(c.typeCompte || '') === 'CURRENT').map(c => (
                                <option key={c.id} value={c.id}>{c.numeroCompte} ({formatMoney(parseFloat(String(c.solde)))})</option>
                             ))}
                          </select>
                          {errors.compte_source_id && <p className="text-xs text-red-400 ml-1 mt-1">{errors.compte_source_id}</p>}
                      </div>
                   )}
                </div>

                {/* Montant Hero */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Montant Initial (FCFA)</label>
                   <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xl">$</span>
                      <input
                        type="number"
                        value={formData.solde_initial}
                        onChange={(e) => handleInputChange('solde_initial', e.target.value)}
                        className="w-full h-20 bg-slate-900 border-2 border-slate-700 rounded-xl pl-10 pr-4 text-4xl font-bold text-white placeholder-slate-800 outline-none focus:border-indigo-500 transition-all"
                        placeholder="0"
                        min="0"
                      />
                   </div>
                   {errors.solde_initial && <p className="text-xs text-red-400 ml-1">{errors.solde_initial}</p>}

                   {/* Fee breakdown */}
                   {(openingFee > 0 || depotMinimum > 0) && (
                     <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3 space-y-2">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ventilation du montant</p>
                       <div className="space-y-1.5">
                         {openingFee > 0 ? (
                           <div className="flex justify-between text-xs">
                             <span className="text-slate-400">Frais d'ouverture</span>
                             <span className="text-red-400 font-medium">{formatMoney(openingFee)} F</span>
                           </div>
                         ) : (
                           <div className="flex justify-between text-xs">
                             <span className="text-slate-400">Frais d'ouverture</span>
                             <span className="text-emerald-400 font-medium">Offerts</span>
                           </div>
                         )}
                         <div className="flex justify-between text-xs">
                           <span className="text-slate-400">Dépôt initial minimum</span>
                           <span className="text-slate-300 font-medium">{formatMoney(depotMinimum)} F</span>
                         </div>
                         <div className="border-t border-slate-700/50 pt-1.5 flex justify-between text-xs">
                           <span className="text-white font-semibold">Minimum à verser</span>
                           <span className="text-white font-bold">{formatMoney(openingFee + depotMinimum)} F</span>
                         </div>
                         {parseFloat(formData.solde_initial) > openingFee + depotMinimum && (
                           <div className="flex justify-between text-xs text-emerald-400">
                             <span>Solde effectif du compte</span>
                             <span className="font-medium">{formatMoney(parseFloat(formData.solde_initial) - openingFee)} F</span>
                           </div>
                         )}
                       </div>
                     </div>
                   )}

                   {/* Validation notice */}
                   {validationRequise && (
                     <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                       <ShieldCheck size={14} className="text-amber-400 mt-0.5 shrink-0" />
                       <p className="text-xs text-amber-400/90">
                         Ce produit nécessite une validation du chef d'agence avant activation. Le compte sera en attente de validation après création.
                       </p>
                     </div>
                   )}
                </div>
             </div>
           )}

           {/* STEP 3: TERMES & VALIDATION */}
           {step === 3 && (
             <div className="space-y-5 animate-in slide-in-from-right fade-in duration-300">
                
                {/* Champs Spécifiques Compte Bloqué */}
                {formData.type_compte === 'BLOCKED' && (
                   <div className="grid grid-cols-2 gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Date Échéance</label>
                         <input 
                           type="date" 
                           value={formData.date_echeance}
                           onChange={(e) => handleInputChange('date_echeance', e.target.value)}
                           className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-3 text-white text-sm focus:border-indigo-500 outline-none" 
                           min={new Date().toISOString().split('T')[0]}
                         />
                         {errors.date_echeance && <p className="text-xs text-red-400">{errors.date_echeance}</p>}
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Motif Blocage</label>
                         <input 
                           type="text" 
                           value={formData.motif_blocage}
                           onChange={(e) => handleInputChange('motif_blocage', e.target.value)}
                           placeholder="Ex: Projet Immo" 
                           className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg px-3 text-white text-sm focus:border-indigo-500 outline-none" 
                         />
                         {errors.motif_blocage && <p className="text-xs text-red-400">{errors.motif_blocage}</p>}
                      </div>
                      
                      {/* Auto Transfer Option */}
                      {eligibleForTransfer && (
                         <div className="col-span-2 pt-2 border-t border-slate-800">
                           <div className="flex items-center gap-2">
                             <input 
                               type="checkbox" 
                               id="auto" 
                               checked={formData.versement_auto_active}
                               onChange={(e) => handleInputChange('versement_auto_active', e.target.checked)}
                               className="rounded bg-slate-800 border-slate-600 text-indigo-600 focus:ring-offset-slate-900" 
                             />
                             <label htmlFor="auto" className="text-sm text-slate-300">Activer les versements automatiques mensuels</label>
                           </div>
                           
                           {/* Expanded Auto Transfer Fields */}
                           {formData.versement_auto_active && (
                             <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2">
                                <input
                                  type="number"
                                  placeholder="Montant (ex: 50000)"
                                  value={formData.versement_auto_montant}
                                  onChange={(e) => handleInputChange('versement_auto_montant', e.target.value)}
                                  className="h-9 bg-slate-950 border border-slate-700 rounded-md px-2 text-white text-xs"
                                />
                                <select
                                  value={formData.versement_auto_frequence}
                                  onChange={(e) => handleInputChange('versement_auto_frequence', e.target.value)}
                                  className="h-9 bg-slate-950 border border-slate-700 rounded-md px-2 text-white text-xs appearance-none"
                                >
                                  {([FrequenceVirement.WEEKLY, FrequenceVirement.BI_MONTHLY, FrequenceVirement.MONTHLY, FrequenceVirement.QUARTERLY] as FrequenceVirementType[]).map(freq => (
                                    <option key={freq} value={freq}>{FREQUENCE_VIREMENT_LABELS[freq]}</option>
                                  ))}
                                </select>
                                {/* Day selector: hidden for BI_MONTHLY (uses 1st/15th automatically) */}
                                {formData.versement_auto_frequence !== FrequenceVirement.BI_MONTHLY && (
                                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-md px-2 col-span-2">
                                     <span className="text-[10px] text-slate-500 uppercase whitespace-nowrap">Jour du mois:</span>
                                     <input
                                        type="number"
                                        min="1" max="28"
                                        value={formData.versement_auto_jour}
                                        onChange={(e) => handleInputChange('versement_auto_jour', e.target.value)}
                                        className="h-9 bg-transparent border-none text-white text-xs w-full focus:ring-0"
                                     />
                                  </div>
                                )}
                                {formData.versement_auto_frequence === FrequenceVirement.BI_MONTHLY && (
                                  <p className="text-[10px] text-slate-500 col-span-2">Exécution automatique le 1er et le 15 de chaque mois</p>
                                )}
                             </div>
                           )}
                         </div>
                      )}
                   </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Notes / Commentaires</label>
                   <textarea 
                     value={formData.notes}
                     onChange={(e) => handleInputChange('notes', e.target.value)}
                     className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-sm focus:border-indigo-500 outline-none resize-none" 
                     placeholder="Informations complémentaires sur le compte..." 
                   />
                </div>

                {/* Validation Info (driven by product config) */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
                   <div>
                      <div className="text-sm font-bold text-white">Validation Chef d'Agence</div>
                      <div className="text-xs text-slate-500">
                        {validationRequise
                          ? 'Requise par la politique du produit sélectionné'
                          : 'Non requise pour ce produit'}
                      </div>
                   </div>
                   <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                     validationRequise
                       ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                       : 'bg-slate-700/50 text-slate-500'
                   }`}>
                     {validationRequise ? 'Requise' : 'Non'}
                   </span>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Navigation) */}
        <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center shrink-0">
           <div className={step === 1 ? 'invisible' : ''}>
             <Button 
               onClick={prevStep}
               variant="outline"
               icon={ChevronLeft}
             >
                Précédent
             </Button>
           </div>

           {step < 3 ? (
             <Button 
               onClick={nextStep} 
               variant="primary"
               icon={ChevronRight}
               iconPosition="right"
             >
                Suivant
             </Button>
           ) : (
             <Button 
               onClick={handleCreateClick} 
               disabled={loading}
               isLoading={loading}
               variant="success"
               icon={CheckCircle}
             >
                Créer le Compte
             </Button>
           )}
        </div>

      </div>

      {/* --- Caisse Confirmation Modal --- */}
      <AnimatePresence>
        {showCaisseModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
               onClick={() => setShowCaisseModal(false)}
            />
            <motion.div 
               initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
               className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg z-10 relative shadow-2xl"
            >
               <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Banknote className="text-emerald-500" /> Validation Caisse
               </h3>
               <p className="text-slate-400 mb-6">Confirmez le comptage physique des espèces pour le dépôt initial.</p>

               {/* Summary */}
               <div className="bg-slate-800 p-4 rounded-xl mb-6 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Montant Total Attendu</span>
                    <span className="text-2xl font-bold text-white">{formatMoney(parseFloat(formData.solde_initial))}</span>
                  </div>
                  {openingFee > 0 && (
                    <div className="border-t border-slate-700 pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Dont frais d'ouverture</span>
                        <span className="text-red-400">{formatMoney(openingFee)} F</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Dont dépôt sur compte</span>
                        <span className="text-emerald-400">{formatMoney(parseFloat(formData.solde_initial) - openingFee)} F</span>
                      </div>
                    </div>
                  )}
               </div>

               {/* Billetage Forms */}
               <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-2">
                  {BILLETS_FCFA.map(billet => (
                     <div key={billet} className="flex items-center gap-4">
                        <span className="w-16 text-right font-mono text-slate-400">{billet}</span>
                        <input 
                           type="number" 
                           placeholder="0"
                           value={caisseData.billets[billet] || ''}
                           onChange={(e) => setCaisseData(p => ({
                              ...p, 
                              billets: { ...p.billets, [billet]: parseInt(e.target.value) || 0}
                           }))}
                           className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-right focus:border-emerald-500 outline-none"
                        />
                     </div>
                  ))}
               </div>
               
               {/* Computed Total */}
               <div className="flex justify-between items-center py-4 border-t border-slate-800 mb-6">
                  <span className="font-bold text-slate-300">Total Compté</span>
                  <span className={`text-xl font-bold ${
                     Object.entries(caisseData.billets).reduce((s, [b, c]) => s + (parseInt(b) * c), 0) === parseFloat(formData.solde_initial)
                        ? 'text-emerald-400' 
                        : 'text-red-400'
                  }`}>
                     {formatMoney(Object.entries(caisseData.billets).reduce((s, [b, c]) => s + (parseInt(b) * c), 0))}
                  </span>
               </div>

               <div className="flex gap-3">
                  <Button onClick={() => setShowCaisseModal(false)} variant="ghost" fullWidth>Annuler</Button>
                  <Button 
                     onClick={handleCaisseValidation}
                     variant="success"
                     fullWidth
                  >
                     Valider le Dépôt
                  </Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Mobile Money Confirmation Modal --- */}
      <AnimatePresence>
        {showMobileMoneyModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
               onClick={() => setShowMobileMoneyModal(false)}
            />
            <motion.div
               initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
               className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg z-10 relative shadow-2xl"
            >
               <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Smartphone className={selectedOperator === 'MTN' ? 'text-yellow-500' : 'text-red-500'} />
                  Paiement {selectedOperator === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}
               </h3>
               <p className="text-slate-400 mb-6">Confirmez les informations de paiement mobile.</p>

               {/* Summary */}
               <div className="bg-slate-800 p-4 rounded-xl mb-6 flex justify-between items-center">
                  <span className="text-slate-400">Montant</span>
                  <span className="text-2xl font-bold text-white">{formatMoney(parseFloat(formData.solde_initial))}</span>
               </div>

               {/* MM Fields */}
               <div className="space-y-4 mb-6">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Numéro de Téléphone</label>
                     <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                           type="tel"
                           placeholder={selectedOperator === 'MTN' ? '+242 05/06 XX XX XX' : '+242 04 XX XX XX'}
                           value={mobileMoneyData.numero_telephone}
                           onChange={(e) => setMobileMoneyData(p => ({ ...p, numero_telephone: e.target.value }))}
                           className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 text-white text-sm focus:border-indigo-500 outline-none"
                        />
                     </div>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Référence Transaction</label>
                     <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                           type="text"
                           placeholder="Ex: TXN-123456789"
                           value={mobileMoneyData.numero_transaction}
                           onChange={(e) => setMobileMoneyData(p => ({ ...p, numero_transaction: e.target.value }))}
                           className="w-full h-10 bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 text-white text-sm focus:border-indigo-500 outline-none"
                        />
                     </div>
                  </div>
               </div>

               <div className="flex gap-3">
                  <Button onClick={() => setShowMobileMoneyModal(false)} variant="ghost" fullWidth>Annuler</Button>
                  <Button
                     onClick={handleMobileMoneyValidation}
                     variant="success"
                     fullWidth
                     isLoading={loading}
                  >
                     Confirmer le Paiement
                  </Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
