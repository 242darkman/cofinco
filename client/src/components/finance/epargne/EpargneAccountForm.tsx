import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, AlertCircle, CheckCircle, Banknote, Phone, Wallet,
  ShieldCheck, Lock, Building2, ChevronRight, ChevronLeft, Loader2, XCircle
} from 'lucide-react';
import { clientApi, compteEpargneApi, paymentsApi } from '../../../lib/api-client';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { sanitizeInput } from '../../../lib/sanitize';
import { Button } from '../../ui';
import { StatutClient, StatutCompte, TypeCompte as TypeCompteEnum, FrequenceVirement, FREQUENCE_VIREMENT_LABELS, type FrequenceVirementType } from '@shared/enum/status-constants';
import { currencySymbol } from '@shared/config/currency';
import { v4 as uuidv4 } from 'uuid';
import { UniversalPaymentSuccessModal } from '../caisse/shared/UniversalPaymentSuccessModal';
import type { ReceiptData } from '../../ui/printable/ReceiptTemplate';


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
  const [mobileMoneyData, setMobileMoneyData] = useState({
    numero_telephone: '',
  });
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [mmFeeEstimate, setMmFeeEstimate] = useState<{ feeAmount: number; feeRate: number; montantBrut: number; montantNet: number } | null>(null);
  const [mmFeeLoading, setMmFeeLoading] = useState(false);

  // MM live payment state
  const [mmStep, setMmStep] = useState<'idle' | 'pending' | 'success' | 'failed' | 'expired'>('idle');
  const [mmError, setMmError] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createdAccountRef = useRef<{ id: string; numeroCompte: string } | null>(null);
  const mmIdempotencyKey = useMemo(() => uuidv4(), []);

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

  // Fetch MM fee estimate when MM mode is selected (step 2) or modal opens — debounced 500ms
  useEffect(() => {
    const isMM = formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL';
    const operator = showMobileMoneyModal ? selectedOperator : (isMM ? formData.mode_ouverture : '');
    if (!operator) { setMmFeeEstimate(null); return; }
    const amount = parseFloat(formData.solde_initial);
    if (isNaN(amount) || amount <= 0) { setMmFeeEstimate(null); return; }

    setMmFeeLoading(true);
    const timer = setTimeout(() => {
      paymentsApi.feeEstimate({
        amount,
        provider: operator as 'MTN' | 'AIRTEL',
        direction: 'COLLECTION',
        feeOption: 'CLIENT_PAYS',
      }).then(est => setMmFeeEstimate(est)).catch(() => setMmFeeEstimate(null)).finally(() => setMmFeeLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [showMobileMoneyModal, selectedOperator, formData.mode_ouverture, formData.solde_initial]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

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

   // Auto-select the next available account type when client has existing accounts
   useEffect(() => {
     if (existingAccountsTypes.length === 0) return;
     const typeOrder: TypeCompte[] = ['CURRENT', 'SAVINGS', 'BLOCKED'];
     // If current selection is already available, keep it
     if (!existingAccountsTypes.includes(formData.type_compte)) return;
     // Find the first type not yet owned
     const nextAvailable = typeOrder.find(t => !existingAccountsTypes.includes(t));
     if (nextAvailable) {
       setFormData(prev => ({ ...prev, type_compte: nextAvailable, produit_id: '' }));
     }
   }, [existingAccountsTypes]); // eslint-disable-line react-hooks/exhaustive-deps

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
        newErrors.solde_initial = `Montant minimum requis: ${formatMoney(minRequired)} (frais ${formatMoney(openingFee)} + dépôt min ${formatMoney(depotMinimum)})`;
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

     if (isMobileMoneyMode && soldeInitial > 0) {
        setSelectedOperator(formData.mode_ouverture);
        setMmStep('idle');
        setMmError(null);
        setShowMobileMoneyModal(true);
     } else {
        // CASH & TRANSFER: create account directly (PENDING_PAYMENT → caisse queue)
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
        compteSourceId: formData.mode_ouverture === 'TRANSFER' ? formData.compte_source_id : undefined,
        blocageActif: formData.type_compte === 'BLOCKED',
        blocageMotif: formData.type_compte === 'BLOCKED' ? sanitizedMotif : undefined,
        blocageFin: formData.type_compte === 'BLOCKED' ? formData.date_echeance : undefined,
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
    }
  };

  // --- Mobile Money Live Payment Logic ---
  const startMmPolling = useCallback((intentId: string) => {
    setMmStep('pending');
    pollingRef.current = setInterval(async () => {
      try {
        const intent = await paymentsApi.getIntent(intentId);
        if (intent.status === 'SUCCESS') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('success');
          const mmFee = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
          const amount = parseFloat(formData.solde_initial);
          const receipt: ReceiptData = {
            title: 'Ouverture de Compte',
            reference: intent.providerTxnId || intent.externalRef || `MM-${Date.now()}`,
            date: new Date(),
            type: 'Dépôt Initial - Ouverture',
            client: { nom: selectedClient?.nom || '', prenom: selectedClient?.prenom || '' },
            items: [
              { description: `Dépôt initial - Compte ${createdAccountRef.current?.numeroCompte || ''}`, montant: amount, quantite: 1 },
              ...(mmFee > 0 ? [{ description: `Frais Mobile Money (${formData.mode_ouverture})`, montant: mmFee, quantite: 1 }] : []),
            ],
            total: amount + mmFee,
            modePaiement: formData.mode_ouverture === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money',
            devise: currencySymbol(),
            notes: `Compte ${createdAccountRef.current?.numeroCompte || ''} créé et activé`,
          };
          setReceiptData(receipt);
          setShowReceipt(true);
          toast.success('Paiement réussi ! Compte créé avec succès.');
        } else if (intent.status === 'FAILED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('failed');
          setMmError(intent.errorMessage || 'Le paiement a échoué. Veuillez réessayer.');
        } else if (intent.status === 'EXPIRED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMmStep('expired');
          setMmError('Le paiement a expiré. Le client n\'a pas confirmé à temps.');
        }
      } catch {
        // Network error during poll — keep trying
      }
    }, 3000);
  }, [formData.solde_initial, formData.mode_ouverture, selectedClient]);

  const handleMmPayment = async () => {
    if (!mobileMoneyData.numero_telephone || mobileMoneyData.numero_telephone.length < 8) {
      toast.error("Numéro de téléphone invalide");
      return;
    }

    setLoading(true);
    setMmError(null);

    try {
      // Step 1: Create the account if not already created
      if (!createdAccountRef.current) {
        const soldeInitial = parseFloat(formData.solde_initial) || 0;
        const sanitizedMotif = sanitizeInput(formData.motif_blocage);
        const payload = {
          clientId: formData.client_id,
          typeCompte: formData.type_compte,
          produitId: formData.produit_id || undefined,
          soldeInitial,
          modePaiement: 'MOBILE_MONEY',
          operateurMobile: formData.mode_ouverture,
          telephoneMobileMoney: mobileMoneyData.numero_telephone,
          compteSourceId: undefined,
          blocageActif: formData.type_compte === 'BLOCKED',
          blocageMotif: formData.type_compte === 'BLOCKED' ? sanitizedMotif : undefined,
          blocageFin: formData.type_compte === 'BLOCKED' ? formData.date_echeance : undefined,
          versementAutoActif: formData.versement_auto_active,
          versementAutoMontant: formData.versement_auto_active ? parseFloat(formData.versement_auto_montant) : undefined,
          versementAutoFrequence: formData.versement_auto_active ? formData.versement_auto_frequence : undefined,
          versementAutoJour: formData.versement_auto_active ? parseInt(formData.versement_auto_jour) : undefined,
        };
        const result = await compteEpargneApi.create(payload);
        createdAccountRef.current = {
          id: result?.id || result?.compte?.id || '',
          numeroCompte: result?.numeroCompte || result?.compte?.numeroCompte || '',
        };
      }

      // Step 2: Initiate collection via pawaPay
      const intent = await paymentsApi.collect({
        provider: formData.mode_ouverture as 'MTN' | 'AIRTEL',
        amount: parseFloat(formData.solde_initial),
        phone: mobileMoneyData.numero_telephone,
        clientId: formData.client_id,
        compteId: createdAccountRef.current.id,
        description: `Dépôt initial compte ${createdAccountRef.current.numeroCompte}`,
        idempotencyKey: mmIdempotencyKey,
        feeOption: 'CLIENT_PAYS',
        metadata: {
          purpose: 'ACCOUNT_ACTIVATION',
          accountNumber: createdAccountRef.current.numeroCompte,
          accountType: formData.type_compte,
        },
      });

      // Step 3: Start polling for payment status
      startMmPolling(intent.id);
    } catch (error: any) {
      const msg = handleApiError(error, 'Erreur lors du paiement');
      setMmError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMmRetry = () => {
    setMmStep('idle');
    setMmError(null);
  };

  // --- Sub-components (Inline for access to state) ---

  const StepIndicator = ({ s, label }: { s: number, label: string }) => {
    const active = step >= s;
    const current = step === s;
    return (
      <div className="flex items-center gap-2">
         <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300 ${
           active ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-surface text-content-muted'
         }`}>
           {s}
         </div>
         <span className={`text-xs font-medium hidden sm:block transition-colors duration-300 ${
           active ? 'text-content-primary' : 'text-content-muted'
         } ${current ? 'text-accent' : ''}`}>{label}</span>
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
             ? 'border-edge bg-surface-base/50 opacity-50 cursor-not-allowed' 
             : isSelected 
                ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10' 
                : 'border-edge bg-surface-base hover:border-edge-strong hover:bg-surface'
          }
        `}
      >
        <Icon size={24} className={isSelected ? 'text-accent' : 'text-content-muted'} />
        <span className={`text-sm font-bold ${isSelected ? 'text-content-primary' : 'text-content-muted'}`}>{label}</span>
        <span className="text-[10px] text-content-muted">{desc}</span>
        {existing && (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-status-warning-bg px-1.5 py-0.5 rounded text-[9px] font-bold text-status-warning uppercase">
             Existant
          </span>
        )}
      </button>
    );
  };

  const PaymentCard = ({ id, label, icon: Icon, logoSrc, color = 'emerald' }: any) => {
    const isSelected = formData.mode_ouverture === id;
    const colors: any = {
      emerald: 'border-status-success bg-status-success-bg text-status-success',
      yellow: 'border-status-warning bg-status-warning-bg text-status-warning',
      red: 'border-status-danger bg-status-danger-bg text-status-danger',
      blue: 'border-status-info bg-status-info-bg text-status-info',
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
          ${disabled ? 'opacity-40 grayscale cursor-not-allowed border-edge bg-surface-base' :
            isSelected ? colors[color] : 'border-edge bg-surface-base text-content-muted hover:border-edge-strong'
          }
        `}
      >
         {logoSrc ? (
           <img src={logoSrc} alt={label} className="w-7 h-7 object-contain rounded" />
         ) : (
           <Icon size={20} />
         )}
         <span className="text-xs font-bold">{label}</span>
         {isMM && !mobileMoneyEnabled && <span className="text-[8px] text-content-muted">Bientôt</span>}
      </button>
    );
  };

  // Show receipt on successful MM payment
  if (showReceipt && receiptData) {
    return (
      <UniversalPaymentSuccessModal
        isOpen={true}
        onClose={() => { setShowReceipt(false); onSuccess(); }}
        data={receiptData}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      <div className="w-full max-w-3xl bg-surface-base border border-edge rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* 1. HEADER */}
        <div className="bg-surface-base border-b border-edge px-6 py-4 shrink-0">
           <div className="flex justify-between items-center mb-4">
              <div>
                 <h2 className="text-xl font-bold text-content-primary">Ouvrir un Compte</h2>
                 <p className="text-xs text-content-muted">Assistant de création de compte</p>
              </div>
              <button onClick={onClose}><X className="text-content-muted hover:text-content-primary" /></button>
           </div>
           
           {/* Stepper */}
           <div className="flex items-center justify-between px-4 max-w-2xl mx-auto w-full">
              <StepIndicator s={1} label="Type de Compte" />
              <div className={`h-0.5 flex-1 mx-4 transition-colors duration-500 ${step >= 2 ? 'bg-accent' : 'bg-surface'}`} />
              <StepIndicator s={2} label="Approvisionnement" />
              <div className={`h-0.5 flex-1 mx-4 transition-colors duration-500 ${step >= 3 ? 'bg-accent' : 'bg-surface'}`} />
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
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Client Titulaire</label>
                   {!selectedClient ? (
                      <div className="relative">
                         <div className="relative h-12">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
                            <input 
                              type="text"
                              value={searchQuery}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              placeholder="Rechercher par nom ou téléphone..."
                              className="w-full h-full bg-surface-base border border-edge rounded-xl pl-10 pr-4 text-content-primary focus:border-accent outline-none placeholder-content-muted transition-colors"
                              autoFocus
                            />
                         </div>
                         {/* Dropdown Results */}
                         {searchQuery && (
                           <div className="absolute z-10 w-full mt-2 bg-surface-base border border-edge rounded-xl shadow-xl max-h-60 overflow-y-auto">
                              {loadingClients ? (
                                <div className="p-4 text-center text-content-muted text-sm">Chargement...</div> 
                              ) : filteredClients.length > 0 ? (
                                filteredClients.map(c => (
                                  <button 
                                    key={c.id} 
                                    onClick={() => handleClientSelect(c)}
                                    className="w-full text-left px-4 py-3 hover:bg-surface flex items-center justify-between group"
                                  >
                                    <div>
                                      <div className="text-sm font-bold text-content-secondary group-hover:text-content-primary">{c.nom} {c.prenom}</div>
                                      <div className="text-xs text-content-muted">{c.telephone}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary" />
                                  </button>
                                ))
                              ) : (
                                <div className="p-4 text-center text-content-muted text-sm">Aucun client trouvé</div>
                              )}
                           </div>
                         )}
                      </div>
                   ) : (
                      <div className="h-12 bg-accent/10 border border-accent/30 rounded-xl px-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white">
                               {selectedClient.nom.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                               <div className="text-sm font-bold text-content-primary">{selectedClient.nom} {selectedClient.prenom}</div>
                               <div className="text-[10px] text-accent">
                                  {comptesExistants.length} compte(s) existant(s)
                               </div>
                            </div>
                         </div>
                         <button onClick={() => setFormData(prev => ({...prev, client_id: ''}))} className="text-xs text-content-muted hover:text-content-primary hover:underline">
                            Changer
                         </button>
                      </div>
                   )}
                   {errors.client_id && <p className="text-xs text-status-danger ml-1">{errors.client_id}</p>}
                </div>

                {/* Type de Compte (Tuiles) */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Type de Compte</label>
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
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Produit Associé</label>
                   <div className="relative">
                      <select 
                        value={formData.produit_id}
                        onChange={(e) => handleInputChange('produit_id', e.target.value)}
                        className="w-full h-12 bg-surface-base border border-edge rounded-xl px-4 text-content-primary outline-none appearance-none focus:border-accent transition-colors"
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
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-content-muted">
                         <ChevronRight size={16} className="rotate-90" />
                      </div>
                   </div>
                   {errors.produit_id && <p className="text-xs text-status-danger ml-1">{errors.produit_id}</p>}
                </div>

                {/* Frais & Conditions (shown after product selection) */}
                {selectedProduct && (
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="text-xs font-bold text-content-muted uppercase tracking-wider ml-1">
                      Frais & Conditions
                    </label>
                    <div className="bg-surface-subtle border border-edge-subtle rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-content-muted">Frais d'ouverture</span>
                        {openingFee > 0 ? (
                          <span className="text-sm font-bold text-status-danger">{formatMoney(openingFee)}</span>
                        ) : (
                          <span className="text-sm font-medium text-status-success">Gratuit</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-content-muted">Dépôt initial minimum</span>
                        {depotMinimum > 0 ? (
                          <span className="text-sm font-bold text-content-secondary">{formatMoney(depotMinimum)}</span>
                        ) : (
                          <span className="text-sm font-medium text-content-muted">Aucun</span>
                        )}
                      </div>

                      {(selectedProduct.frais?.tenue ?? 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-content-muted">Frais de tenue / mois</span>
                          <span className="text-sm font-medium text-content-secondary">{formatMoney(selectedProduct.frais!.tenue!)}</span>
                        </div>
                      )}

                      {(selectedProduct.frais?.cloture ?? 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-content-muted">Frais de clôture</span>
                          <span className="text-sm font-medium text-content-secondary">{formatMoney(selectedProduct.frais!.cloture!)}</span>
                        </div>
                      )}

                      {validationRequise && (
                        <div className="flex items-center gap-2 pt-2 border-t border-edge-subtle">
                          <ShieldCheck size={14} className="text-status-warning" />
                          <span className="text-xs text-status-warning">Validation du chef d'agence requise</span>
                        </div>
                      )}

                      {(openingFee + depotMinimum) > 0 && (
                        <div className="border-t border-edge-subtle pt-2 flex justify-between items-center">
                          <span className="text-sm font-semibold text-content-primary">Minimum à verser</span>
                          <span className="text-sm font-bold text-accent">{formatMoney(openingFee + depotMinimum)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
             </div>
           )}

           {/* STEP 2: APPROVISIONNEMENT */}
           {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
                
                {/* Info Banner */}
                {formData.mode_ouverture === 'CASH' && (
                  <div className="p-3 bg-status-warning-bg border border-status-warning/20 rounded-xl flex items-start gap-3 text-status-warning text-xs">
                     <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                     <p>Le compte sera créé avec le statut <strong>"En attente"</strong> jusqu'à validation du dépôt initial en caisse.</p>
                  </div>
                )}
                {(formData.mode_ouverture === 'MTN' || formData.mode_ouverture === 'AIRTEL') && (
                  <div className="p-3 bg-status-info-bg border border-status-info/20 rounded-xl flex items-start gap-3 text-status-info text-xs">
                     <img src={formData.mode_ouverture === 'MTN' ? mtnLogo : airtelLogo} alt={formData.mode_ouverture} className="w-5 h-5 mt-0.5 flex-shrink-0 rounded" />
                     <p>Une demande de paiement <strong>{formData.mode_ouverture === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}</strong> sera envoyée directement sur le téléphone du client pour confirmation.</p>
                  </div>
                )}

                {/* Mode de Paiement (Grid 4) */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Mode de Dépôt</label>
                   <div className="grid grid-cols-4 gap-3">
                      <PaymentCard id="CASH" label="Espèces" icon={Banknote} />
                      <PaymentCard id="MTN" label="MTN MoMo" logoSrc={mtnLogo} color="yellow" />
                      <PaymentCard id="AIRTEL" label="Airtel" logoSrc={airtelLogo} color="red" />
                      <PaymentCard id="TRANSFER" label="Interne" icon={Building2} color="blue" />
                   </div>
                   
                   {/* Transfer Source Select */}
                   {formData.mode_ouverture === 'TRANSFER' && (
                      <div className="mt-2 animate-in fade-in">
                          <select 
                             value={formData.compte_source_id}
                             onChange={(e) => handleInputChange('compte_source_id', e.target.value)}
                             className="w-full h-10 bg-surface-base border border-edge rounded-lg text-sm text-content-primary px-3 focus:border-accent outline-none"
                          >
                             <option value="">Sélectionner le compte source</option>
                             {comptesExistants.filter(c => normalizeTypeCompte(c.typeCompte || '') === 'CURRENT' && (typeof c.solde === 'number' ? c.solde : parseFloat(String(c.solde || 0))) > 0).map(c => (
                                <option key={c.id} value={c.id}>{c.numeroCompte} ({formatMoney(parseFloat(String(c.solde)))})</option>
                             ))}
                          </select>
                          {errors.compte_source_id && <p className="text-xs text-status-danger ml-1 mt-1">{errors.compte_source_id}</p>}
                      </div>
                   )}
                </div>

                {/* Montant Hero */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Montant ({currencySymbol()})</label>
                   <div className="relative group">
                      <input
                        type="number"
                        value={formData.solde_initial}
                        onChange={(e) => handleInputChange('solde_initial', e.target.value)}
                        className="w-full h-20 bg-surface-base border-2 border-edge rounded-xl px-6 pr-20 text-4xl font-bold text-content-primary placeholder-content-muted outline-none focus:border-accent transition-all text-right"
                        placeholder="0"
                        min="0"
                      />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-content-muted font-semibold text-lg pointer-events-none">{currencySymbol()}</span>
                   </div>
                   {errors.solde_initial && <p className="text-xs text-status-danger ml-1">{errors.solde_initial}</p>}

                   {/* Fee breakdown */}
                   {(openingFee > 0 || depotMinimum > 0) && (
                     <div className="bg-surface-base/80 border border-edge-subtle rounded-xl p-3 space-y-2">
                       <p className="text-[10px] font-bold text-content-muted uppercase tracking-wide">Ventilation du montant</p>
                       <div className="space-y-1.5">
                         {openingFee > 0 ? (
                           <div className="flex justify-between text-xs">
                             <span className="text-content-muted">Frais d'ouverture</span>
                             <span className="text-status-danger font-medium">{formatMoney(openingFee)}</span>
                           </div>
                         ) : (
                           <div className="flex justify-between text-xs">
                             <span className="text-content-muted">Frais d'ouverture</span>
                             <span className="text-status-success font-medium">Offerts</span>
                           </div>
                         )}
                         <div className="flex justify-between text-xs">
                           <span className="text-content-muted">Dépôt initial minimum</span>
                           <span className="text-content-secondary font-medium">{formatMoney(depotMinimum)}</span>
                         </div>
                         <div className="border-t border-edge-subtle pt-1.5 flex justify-between text-xs">
                           <span className="text-content-primary font-semibold">Minimum à verser</span>
                           <span className="text-content-primary font-bold">{formatMoney(openingFee + depotMinimum)}</span>
                         </div>
                         {parseFloat(formData.solde_initial) > openingFee + depotMinimum && (
                           <div className="flex justify-between text-xs text-status-success">
                             <span>Solde effectif du compte</span>
                             <span className="font-medium">{formatMoney(parseFloat(formData.solde_initial) - openingFee)}</span>
                           </div>
                         )}
                       </div>
                     </div>
                   )}

                   {/* MM fee breakdown (shown when MTN/AIRTEL selected and amount > 0) */}
                   {isMobileMoneyMode && parseFloat(formData.solde_initial) > 0 && (
                     <div className="bg-surface-base/80 border border-status-warning/20 rounded-xl p-3 space-y-2">
                       <div className="flex items-center gap-2">
                         <img
                           src={formData.mode_ouverture === 'MTN' ? mtnLogo : airtelLogo}
                           alt={formData.mode_ouverture}
                           className="w-4 h-4 rounded"
                         />
                         <p className="text-[10px] font-bold text-content-muted uppercase tracking-wide">
                           Frais {formData.mode_ouverture === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}
                         </p>
                       </div>
                       {mmFeeLoading ? (
                         <div className="flex items-center gap-2 text-xs text-content-muted">
                           <Loader2 size={12} className="animate-spin" />
                           <span>Calcul des frais...</span>
                         </div>
                       ) : mmFeeEstimate ? (
                         <div className="space-y-1.5">
                           <div className="flex justify-between text-xs">
                             <span className="text-content-muted">Montant crédité au compte</span>
                             <span className="text-content-primary font-medium">{formatMoney(mmFeeEstimate.montantNet)}</span>
                           </div>
                           <div className="flex justify-between text-xs">
                             <span className="text-content-muted">Frais Mobile Money ({mmFeeEstimate.feeRate}%)</span>
                             <span className="text-status-warning font-medium">+ {formatMoney(mmFeeEstimate.feeAmount)}</span>
                           </div>
                           <div className="border-t border-edge-subtle pt-1.5 flex justify-between text-xs">
                             <span className="text-content-primary font-semibold">Total débité du téléphone</span>
                             <span className="text-content-primary font-bold">{formatMoney(mmFeeEstimate.montantBrut)}</span>
                           </div>
                         </div>
                       ) : (
                         <p className="text-xs text-content-muted">Impossible d'estimer les frais</p>
                       )}
                     </div>
                   )}

                   {/* Validation notice */}
                   {validationRequise && (
                     <div className="flex items-start gap-2 px-3 py-2 bg-status-warning/5 border border-status-warning/15 rounded-lg">
                       <ShieldCheck size={14} className="text-status-warning mt-0.5 shrink-0" />
                       <p className="text-xs text-status-warning/90">
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
                   <div className="grid grid-cols-2 gap-4 p-4 bg-surface-base rounded-xl border border-edge">
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-content-muted uppercase">Date Échéance</label>
                         <input 
                           type="date" 
                           value={formData.date_echeance}
                           onChange={(e) => handleInputChange('date_echeance', e.target.value)}
                           className="w-full h-10 bg-surface-base border border-edge rounded-lg px-3 text-content-primary text-sm focus:border-accent outline-none" 
                           min={new Date().toISOString().split('T')[0]}
                         />
                         {errors.date_echeance && <p className="text-xs text-status-danger">{errors.date_echeance}</p>}
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-content-muted uppercase">Motif Blocage</label>
                         <input 
                           type="text" 
                           value={formData.motif_blocage}
                           onChange={(e) => handleInputChange('motif_blocage', e.target.value)}
                           placeholder="Ex: Projet Immo" 
                           className="w-full h-10 bg-surface-base border border-edge rounded-lg px-3 text-content-primary text-sm focus:border-accent outline-none" 
                         />
                         {errors.motif_blocage && <p className="text-xs text-status-danger">{errors.motif_blocage}</p>}
                      </div>
                      
                      {/* Auto Transfer Option */}
                      {eligibleForTransfer && (
                         <div className="col-span-2 pt-2 border-t border-edge">
                           <div className="flex items-center gap-2">
                             <input 
                               type="checkbox" 
                               id="auto" 
                               checked={formData.versement_auto_active}
                               onChange={(e) => handleInputChange('versement_auto_active', e.target.checked)}
                               className="rounded bg-surface border-edge-strong text-accent focus:ring-offset-surface-base" 
                             />
                             <label htmlFor="auto" className="text-sm text-content-secondary">Activer les versements automatiques mensuels</label>
                           </div>
                           
                           {/* Expanded Auto Transfer Fields */}
                           {formData.versement_auto_active && (
                             <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2">
                                <input
                                  type="number"
                                  placeholder="Montant (ex: 50000)"
                                  value={formData.versement_auto_montant}
                                  onChange={(e) => handleInputChange('versement_auto_montant', e.target.value)}
                                  className="h-9 bg-surface-base border border-edge rounded-md px-2 text-content-primary text-xs"
                                />
                                <select
                                  value={formData.versement_auto_frequence}
                                  onChange={(e) => handleInputChange('versement_auto_frequence', e.target.value)}
                                  className="h-9 bg-surface-base border border-edge rounded-md px-2 text-content-primary text-xs appearance-none"
                                >
                                  {([FrequenceVirement.WEEKLY, FrequenceVirement.BI_MONTHLY, FrequenceVirement.MONTHLY, FrequenceVirement.QUARTERLY] as FrequenceVirementType[]).map(freq => (
                                    <option key={freq} value={freq}>{FREQUENCE_VIREMENT_LABELS[freq]}</option>
                                  ))}
                                </select>
                                {/* Day selector: hidden for BI_MONTHLY (uses 1st/15th automatically) */}
                                {formData.versement_auto_frequence !== FrequenceVirement.BI_MONTHLY && (
                                  <div className="flex items-center gap-2 bg-surface-base border border-edge rounded-md px-2 col-span-2">
                                     <span className="text-[10px] text-content-muted uppercase whitespace-nowrap">Jour du mois:</span>
                                     <input
                                        type="number"
                                        min="1" max="28"
                                        value={formData.versement_auto_jour}
                                        onChange={(e) => handleInputChange('versement_auto_jour', e.target.value)}
                                        className="h-9 bg-transparent border-none text-content-primary text-xs w-full focus:ring-0"
                                     />
                                  </div>
                                )}
                                {formData.versement_auto_frequence === FrequenceVirement.BI_MONTHLY && (
                                  <p className="text-[10px] text-content-muted col-span-2">Exécution automatique le 1er et le 15 de chaque mois</p>
                                )}
                             </div>
                           )}
                         </div>
                      )}
                   </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                   <label className="text-xs font-bold text-content-muted uppercase ml-1">Notes / Commentaires</label>
                   <textarea 
                     value={formData.notes}
                     onChange={(e) => handleInputChange('notes', e.target.value)}
                     className="w-full h-24 bg-surface-base border border-edge rounded-xl p-4 text-content-primary text-sm focus:border-accent outline-none resize-none" 
                     placeholder="Informations complémentaires sur le compte..." 
                   />
                </div>

                {/* Validation Info (driven by product config) */}
                <div className="flex items-center justify-between p-4 bg-surface-base border border-edge rounded-xl">
                   <div>
                      <div className="text-sm font-bold text-content-primary">Validation Chef d'Agence</div>
                      <div className="text-xs text-content-muted">
                        {validationRequise
                          ? 'Requise par la politique du produit sélectionné'
                          : 'Non requise pour ce produit'}
                      </div>
                   </div>
                   <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                     validationRequise
                       ? 'bg-status-warning-bg text-status-warning border border-status-warning/30'
                       : 'bg-surface-elevated/50 text-content-muted'
                   }`}>
                     {validationRequise ? 'Requise' : 'Non'}
                   </span>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Navigation) */}
        <div className="p-6 bg-surface-base border-t border-edge flex justify-between items-center shrink-0">
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

      {/* --- Mobile Money Live Payment Modal --- */}
      <AnimatePresence>
        {showMobileMoneyModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
               onClick={() => { if (mmStep === 'idle' && !loading) setShowMobileMoneyModal(false); }}
            />
            <motion.div
               initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
               className="bg-surface-base border border-edge rounded-2xl p-6 w-full max-w-lg z-10 relative shadow-2xl"
            >
               {/* Header */}
               <h3 className="text-xl font-bold text-content-primary mb-2 flex items-center gap-3">
                  <img
                    src={selectedOperator === 'MTN' ? mtnLogo : airtelLogo}
                    alt={selectedOperator}
                    className="w-8 h-8 object-contain rounded-lg"
                  />
                  Paiement {selectedOperator === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}
               </h3>

               {/* MM Pending State */}
               {mmStep === 'pending' && (
                 <div className="py-8 flex flex-col items-center gap-4 text-center">
                   <div className="relative">
                     <div className="w-20 h-20 rounded-full bg-status-info-bg flex items-center justify-center">
                       <img
                         src={selectedOperator === 'MTN' ? mtnLogo : airtelLogo}
                         alt={selectedOperator}
                         className="w-12 h-12 object-contain rounded-lg"
                       />
                     </div>
                     <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-base border-2 border-status-info flex items-center justify-center">
                       <Loader2 size={14} className="animate-spin text-status-info" />
                     </div>
                   </div>
                   <div>
                     <h4 className="text-lg font-bold text-content-primary">Paiement en cours...</h4>
                     <p className="text-sm text-content-muted mt-1">
                       Une notification a été envoyée sur le téléphone <strong className="text-content-primary">{mobileMoneyData.numero_telephone}</strong>.
                     </p>
                     <p className="text-xs text-content-muted mt-2">
                       Le client doit confirmer le paiement de <strong className="text-status-info">{formatMoney(mmFeeEstimate?.montantBrut || parseFloat(formData.solde_initial))}</strong> sur son téléphone.
                     </p>
                   </div>
                   <div className="flex items-center gap-2 text-xs text-content-muted animate-pulse">
                     <Loader2 size={12} className="animate-spin" />
                     En attente de confirmation...
                   </div>
                 </div>
               )}

               {/* MM Failed / Expired State */}
               {(mmStep === 'failed' || mmStep === 'expired') && (
                 <div className="py-8 flex flex-col items-center gap-4 text-center">
                   <div className="w-20 h-20 rounded-full bg-status-danger-bg flex items-center justify-center">
                     <XCircle size={40} className="text-status-danger" />
                   </div>
                   <div>
                     <h4 className="text-lg font-bold text-content-primary">
                       {mmStep === 'failed' ? 'Paiement échoué' : 'Paiement expiré'}
                     </h4>
                     <p className="text-sm text-content-muted mt-1">{mmError}</p>
                     {createdAccountRef.current && (
                       <p className="text-xs text-content-muted mt-2">
                         Le compte <strong>{createdAccountRef.current.numeroCompte}</strong> a été créé et reste en attente d'activation.
                       </p>
                     )}
                   </div>
                   <div className="flex gap-3 w-full">
                     <Button onClick={() => { setShowMobileMoneyModal(false); onSuccess(); }} variant="ghost" fullWidth>Fermer</Button>
                     <Button onClick={handleMmRetry} variant="primary" fullWidth>Réessayer</Button>
                   </div>
                 </div>
               )}

               {/* Normal form (idle state) */}
               {mmStep === 'idle' && (
                 <>
                   <p className="text-content-muted mb-6">Le paiement sera envoyé directement sur le téléphone du client.</p>

                   {/* Fee breakdown */}
                   <div className="bg-surface rounded-xl p-4 mb-6 space-y-2">
                      <div className="flex justify-between items-center">
                         <span className="text-sm text-content-muted">Montant dépôt</span>
                         <span className="text-lg font-bold text-content-primary">{formatMoney(parseFloat(formData.solde_initial))}</span>
                      </div>
                      {mmFeeLoading ? (
                        <div className="flex items-center gap-2 text-xs text-content-muted">
                          <Loader2 size={12} className="animate-spin" />
                          Calcul des frais...
                        </div>
                      ) : mmFeeEstimate ? (
                        <>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-content-muted">Frais {selectedOperator} ({mmFeeEstimate.feeRate}%)</span>
                            <span className="text-status-warning font-medium">+{formatMoney(mmFeeEstimate.feeAmount)}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-edge-subtle pt-2">
                            <span className="text-sm font-semibold text-content-primary">Total débité du téléphone</span>
                            <span className="text-lg font-bold text-status-danger">{formatMoney(mmFeeEstimate.montantBrut)}</span>
                          </div>
                        </>
                      ) : null}
                   </div>

                   {/* Phone input */}
                   <div className="space-y-4 mb-6">
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-content-muted uppercase">Numéro de Téléphone du Client</label>
                         <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                            <input
                               type="tel"
                               placeholder={selectedOperator === 'MTN' ? '+242 05/06 XX XX XX' : '+242 04 XX XX XX'}
                               value={mobileMoneyData.numero_telephone}
                               onChange={(e) => setMobileMoneyData(p => ({ ...p, numero_telephone: e.target.value }))}
                               className="w-full h-10 bg-surface-base border border-edge rounded-lg pl-10 pr-4 text-content-primary text-sm focus:border-accent outline-none"
                            />
                         </div>
                      </div>
                   </div>

                   {/* Error */}
                   {mmError && (
                     <div className="flex items-center gap-2 p-3 mb-4 bg-status-danger-bg border border-status-danger/30 rounded-xl text-status-danger text-sm">
                       <AlertCircle size={16} />
                       {mmError}
                     </div>
                   )}

                   <div className="flex gap-3">
                      <Button onClick={() => { setShowMobileMoneyModal(false); setMmFeeEstimate(null); }} variant="ghost" fullWidth>Annuler</Button>
                      <Button
                         onClick={handleMmPayment}
                         variant="success"
                         fullWidth
                         isLoading={loading}
                         disabled={!mobileMoneyData.numero_telephone || mobileMoneyData.numero_telephone.length < 8}
                      >
                         {loading ? 'Envoi...' : 'Lancer le Paiement'}
                      </Button>
                   </div>
                 </>
               )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
