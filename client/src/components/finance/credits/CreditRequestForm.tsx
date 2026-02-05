import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DollarSign, TrendingUp, Save, RefreshCw } from 'lucide-react';
import { clientSearchApi, demandeCreditApi, creditPlanApi, clientApi } from '../../../lib/api-client';
import { Modal, SelectField, Button, SearchableSelect } from '../../ui';
import { formatClientName, resolveStorageUrl } from '../../../lib/format';
import { toast } from '../../../lib/toast';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import { StatutDemande, TypeCredit, TYPE_CREDIT_OPTIONS, normalizeDureeUnite, normalizeFrequenceRemboursement } from '@shared/enum/status-constants';
import useSmartDuration from '../../../hooks/credits/useSmartDuration';


interface Client {
  id: string;
  nom: string;
  email: string;
  score?: number;
  segment: string;
  taux_remboursement: number;
  credit_total: number;
  photo_url?: string;
  isEligible?: boolean;
  ineligibilityReason?: string;
  // Champs pour clients éligibles au crédit
  compteCourantId?: string;
  compteCourantNumero?: string;
  compteCourantSolde?: number;
  // Revenus du client
  revenuMensuel?: number;
  revenuJournalier?: number;
  typeRevenu?: string;
}



interface CreditRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
  clientId?: string;
  userRole?: SystemRole | string;
}

export default function CreditRequestForm({ onClose, onSuccess, clientId, userRole }: CreditRequestFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateOverrideEnabled, setRateOverrideEnabled] = useState(false);
  const [rateOverrideReason, setRateOverrideReason] = useState('');

  // Durees suggerees state (Legacy removed)
  // const [dureesSuggerees, setDureesSuggerees] = useState<DureeSuggeree[]>([]);
  // const [loadingDurees, setLoadingDurees] = useState(false);
  // const [showDureesSuggestions, setShowDureesSuggestions] = useState(false);

  // Credit Plans state
  const [creditPlans, setCreditPlans] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    client_id: clientId || '',
    credit_plan_id: '',
    montant_demande: '',
    duree_valeur: '',
    duree_unite: 'MONTH' as 'DAY' | 'WEEK' | 'MONTH',
    taux_interet: '',
    frequence_remboursement: '',
    type_credit: 'PERSONAL',
    objet_credit: '',
    revenus_mensuels: '',
    type_revenu: 'MONTHLY',
    revenu_journalier: '',
    charges_mensuelles: ''
  });

  // Calculate selected plan early for hook
  const selectedPlan = useMemo(() => 
    creditPlans.find(p => p.id === formData.credit_plan_id), 
    [creditPlans, formData.credit_plan_id]
  );
  
  // Smart Duration Hook
  const { suggestedDurations, calculateInstallment, validateDuration } = useSmartDuration({
    selectedPlan,
    amount: parseFloat(formData.montant_demande) || 0,
    frequence: formData.frequence_remboursement
  });

  // Duration Validation State
  const durationValidation = useMemo(() => {
    return validateDuration(
      parseInt(formData.duree_valeur) || 0, 
      formData.duree_unite
    );
  }, [validateDuration, formData.duree_valeur, formData.duree_unite]);

  const RATE_BASE = 20;
  const RATE_MIN = 10;
  const RATE_MAX = 24;
  const overrideRoles = new Set<SystemRole>([
    SystemRole.ADMIN,
    SystemRole.COMPTABLE,
    SystemRole.CHEF_AGENCE,
    SystemRole.GESTIONNAIRE_CREDIT,
    SystemRole.SUPERVISEUR
  ]);
  const normalizedUserRole = normalizeRole(userRole);
  const canOverrideRate = normalizedUserRole ? overrideRoles.has(normalizedUserRole) : false;

  const [calculatedData, setCalculatedData] = useState({
    montantTotal: 0,
    montantEcheance: 0,
    nombreEcheances: 0,
    capaciteRemboursement: 0,
    tauxEndettement: 0
  });

  // Alias pour la résolution des URLs de photos
  const getPhotoUrl = resolveStorageUrl;

  useEffect(() => {
    // Initial load: fetch some clients or at least verify initial clientId
    loadClients(""); 
    loadCreditPlans();

    // Listen for real-time client updates
    const handleClientUpdate = () => {
        console.log("🔄 Real-time update: Reloading clients...");
        loadClients("");
    };

    window.addEventListener('client-update', handleClientUpdate);
    
    return () => {
        window.removeEventListener('client-update', handleClientUpdate);
    };
  }, []);

  const loadCreditPlans = async () => {
    try {
      const plans = await creditPlanApi.getAll({ actif: true });
      setCreditPlans(plans || []);
    } catch (error) {
      console.error('Erreur chargement plans credit:', error);
    }
  };

  const normalizeTypeCredit = (value: string | undefined): string => {
    if (!value) return TypeCredit.PERSONAL;
    const upper = value.toUpperCase();
    if (upper === TypeCredit.COMMERCIAL || upper === 'ACCOMPAGNEMENT') return TypeCredit.COMMERCIAL;
    if (upper === TypeCredit.REAL_ESTATE || upper === 'IMMOBILIER') return TypeCredit.REAL_ESTATE;
    if (upper === TypeCredit.PERSONAL || upper === 'PERSONNEL') return TypeCredit.PERSONAL;
    return TypeCredit.PERSONAL;
  };

  const handleApplyPlan = (planId: string) => {
    const plan = creditPlans.find(p => p.id === planId);
    if (!plan) return;

    // Pré-remplir le montant si fixe (min == max)
    const min = parseFloat(plan.montantMin || plan.montant_min);
    const max = parseFloat(plan.montantMax || plan.montant_max);
    let fixedMontant = undefined;

    if (!isNaN(min) && !isNaN(max) && min === max) {
        fixedMontant = String(min);
    }

    // Normaliser les valeurs françaises vers anglaises (ex: "Jour" -> "DAY", "Journalier" -> "DAILY")
    const rawDureeUnite = plan.dureeUnite || plan.duree_unite;
    const rawFrequence = plan.frequenceRemboursement || plan.frequence_remboursement;

    setFormData(prev => ({
      ...prev,
      credit_plan_id: planId,
      type_credit: normalizeTypeCredit(plan.typeCredit || plan.type_credit),
      taux_interet: String(plan.tauxInteret || plan.taux_interet),
      duree_valeur: String(plan.dureeValeur || plan.duree_valeur),
      duree_unite: normalizeDureeUnite(rawDureeUnite),
      frequence_remboursement: normalizeFrequenceRemboursement(rawFrequence),
      objet_credit: plan.description ? `${plan.nom} - ${plan.description}` : prev.objet_credit,
      montant_demande: fixedMontant !== undefined ? fixedMontant : prev.montant_demande
    }));
  };



  // Convertir duree en jours pour les calculs
  const convertirDureeEnJours = useCallback((valeur: number, unite: string): number => {
    switch (unite) {
      case 'DAY': return valeur;
      case 'WEEK': return valeur * 7;
      case 'MONTH': return valeur * 30;
      default: return valeur;
    }
  }, []);

  // Calculer nombre d'echeances
  const calculerNombreEcheances = useCallback((frequence: string, dureeValeur: number, dureeUnite: string): number => {
    const joursTotal = convertirDureeEnJours(dureeValeur, dureeUnite);
    switch (frequence) {
      case 'DAILY': return joursTotal;
      case 'WEEKLY': return Math.ceil(joursTotal / 7);
      case 'MONTHLY': return Math.ceil(joursTotal / 30);
      case 'BI_MONTHLY': return Math.ceil(joursTotal / 15);
      case 'QUARTERLY': return Math.ceil(joursTotal / 90);
      default: return joursTotal;
    }
  }, [convertirDureeEnJours]);

  const suggestedRate = useMemo(() => {
    // SIMPLIFICATION: Le taux est fixe à 20% par défaut
    return RATE_BASE;
  }, []);

  useEffect(() => {
    if (!rateOverrideEnabled) {
      const nextRate = suggestedRate.toFixed(1);
      setFormData(prev => (prev.taux_interet === nextRate ? prev : { ...prev, taux_interet: nextRate }));
    }
  }, [suggestedRate, rateOverrideEnabled]);

  useEffect(() => {
    calculateLoan();
  }, [formData.montant_demande, formData.duree_valeur, formData.duree_unite, formData.taux_interet, formData.frequence_remboursement, formData.revenus_mensuels, formData.charges_mensuelles]);

  const loadClients = async (query: string) => {
    setSearchLoading(true);
    try {
      // Si la requête est vide, on charge les clients éligibles par défaut pour aider l'UI
      let data: any[] = [];
      if (!query || query.trim() === "") {
        const response = await clientApi.getEligibleForCredit({ page: 1, perPage: 25 });
        data = response.data || [];
      } else {
        const response = await clientSearchApi.search(query, { page: 1, perPage: 25 });
        data = response.data || [];
      }

      const enrichedClients = data.map((c: any) => ({
        id: c.id,
        nom: formatClientName(c.nom, c.prenom),
        email: c.email || '',
        segment: c.segment || 'Standard',
        taux_remboursement: parseFloat(c.tauxRemboursement || c.taux_remboursement) || 100,
        credit_total: parseFloat(c.creditTotal || c.credit_total) || 0,
        photo_url: c.photoUrl || c.photo_url,
        compteCourantId: c.compteCourantId || c.compte_courant_id,
        compteCourantNumero: c.compteCourantNumero || c.compte_courant_numero,
        compteCourantSolde: parseFloat(c.compteCourantSolde || c.compte_courant_solde) || 0,
        isEligible: c.isEligible !== undefined ? c.isEligible : true, // Par défaut éligible si vient de /eligible-credit
        ineligibilityReason: c.ineligibilityReason,
        // Revenus du client
        revenuMensuel: parseFloat(c.revenuMensuel || c.revenu_mensuel) || 0,
        revenuJournalier: parseFloat(c.revenuJournalier || c.revenu_journalier) || 0,
        typeRevenu: c.typeRevenu || c.type_revenu || 'Mensuel'
      }));
      setClients(enrichedClients);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    } finally {
        setSearchLoading(false);
    }
  };

  // Debounced search logic
  const searchTimeoutRef = useRef<any>(null);
  const handleSearchChange = (query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
        loadClients(query);
    }, 400); // 400ms debounce
  };

  const handleIneligibleClick = (option: any) => {
      toast.error(`Inéligible : ${option.disabledReason}`);
  };

  const calculateLoan = () => {
    const montant = parseFloat(formData.montant_demande) || 0;
    const dureeValeur = parseInt(formData.duree_valeur) || 0;
    const taux = parseFloat(formData.taux_interet) || suggestedRate || 0;
    const revenus = parseFloat(formData.revenus_mensuels) || 0;
    const charges = parseFloat(formData.charges_mensuelles) || 0;

    if (montant > 0 && dureeValeur > 0 && formData.frequence_remboursement) {
      const montantTotal = montant * (1 + taux / 100);
      const nombreEcheances = calculerNombreEcheances(
        formData.frequence_remboursement,
        dureeValeur,
        formData.duree_unite
      );

      const montantEcheance = nombreEcheances > 0 ? montantTotal / nombreEcheances : 0;
      const capaciteRemboursement = revenus - charges;

      // --- FORMULE ENDETTEMENT (PRO) ---
      // Etape 1: Mensualité du credit (ramené au mois)
      let montantEcheanceMensuel = montantEcheance;
      if (formData.frequence_remboursement === 'DAILY') {
        montantEcheanceMensuel = montantEcheance * 26; // 26 jours ouvrables business standard
      } else if (formData.frequence_remboursement === 'WEEKLY') {
        montantEcheanceMensuel = montantEcheance * 4.33; // 52 semaines / 12 mois
      } else if (formData.frequence_remboursement === 'BI_MONTHLY') {
        montantEcheanceMensuel = montantEcheance * 2;
      } else if (formData.frequence_remboursement === 'QUARTERLY') {
        montantEcheanceMensuel = montantEcheance / 3;
      }
      
      // Etape 2: Total Charges réelles (Charges existantes + Nouvelle Mensualité)
      // On s'assure de ne pas compter deux fois si "charges" inclut déjà le futur crédit (erreur commune), 
      // ici on part du principe que "charges_mensuelles" = charges actuelles HORS ce crédit.
      const totalDettesMensuelles = charges + montantEcheanceMensuel;

      // Etape 3: Ratio d'endettement
      const tauxEndettement = revenus > 0 ? (totalDettesMensuelles / revenus) * 100 : 0;

      setCalculatedData({
        montantTotal,
        montantEcheance,
        nombreEcheances,
        capaciteRemboursement,
        tauxEndettement
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    
    // Vérifier l'éligibilité avant de valider
    const client = clients.find(c => c.id === formData.client_id);
    if (client && client.isEligible === false) {
        newErrors.client_id = `Inéligible : ${client.ineligibilityReason}`;
    }

    if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) {
      newErrors.montant_demande = 'Montant invalide';
    } else if (selectedPlan) {
      const montant = parseFloat(formData.montant_demande);
      const min = selectedPlan.montantMin || selectedPlan.montant_min;
      const max = selectedPlan.montantMax || selectedPlan.montant_max;
      
      if (min && montant < min) {
        newErrors.montant_demande = `Le montant minimum pour ce plan est de ${min.toLocaleString()} FCFA`;
      }
      if (max && montant > max) {
        newErrors.montant_demande = `Le montant maximum pour ce plan est de ${max.toLocaleString()} FCFA`;
      }
    }
    if (!formData.frequence_remboursement) {
      newErrors.frequence_remboursement = 'Frequence requise';
    }
    if (!formData.duree_valeur || parseInt(formData.duree_valeur) <= 0) {
      newErrors.duree_valeur = 'Duree invalide';
    }
    if (!formData.objet_credit.trim()) newErrors.objet_credit = 'Objet requis';
    if (!formData.revenus_mensuels || parseFloat(formData.revenus_mensuels) <= 0) {
      newErrors.revenus_mensuels = 'Revenus requis';
    }



    if (rateOverrideEnabled) {
      const overrideValue = parseFloat(formData.taux_interet);
      if (Number.isNaN(overrideValue) || overrideValue < RATE_MIN || overrideValue > RATE_MAX) {
        newErrors.taux_interet = `Le taux doit etre entre ${RATE_MIN}% et ${RATE_MAX}%`;
      }
      if (!rateOverrideReason.trim()) {
        newErrors.taux_override_reason = 'Motif d\'override requis';
      }
    }

    setErrors(newErrors);
    
    // Afficher un toast pour chaque erreur
    if (Object.keys(newErrors).length > 0) {
      const firstError = Object.values(newErrors)[0];
      toast.error(firstError);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const overridePayload = rateOverrideEnabled
        ? {
            tauxInteretOverride: formData.taux_interet,
            tauxOverrideReason: rateOverrideReason,
          }
        : {};

      const dureeValeur = parseInt(formData.duree_valeur, 10);

      // Utiliser le taux du plan sélectionné s'il existe, sinon le taux proposé
      const tauxFinal = selectedPlan 
        ? String(selectedPlan.tauxInteret || selectedPlan.taux_interet)
        : formData.taux_interet || suggestedRate.toFixed(1);
      
      // Utiliser les frais de dossier du plan s'ils sont définis
      const fraisDossierPlan = selectedPlan?.fraisDossier || selectedPlan?.frais_dossier;
      const montantFraisEngagement = fraisDossierPlan 
        ? String(fraisDossierPlan)
        : null;

      await demandeCreditApi.create({
        clientId: formData.client_id,
        montantDemande: formData.montant_demande,
        tauxInteret: tauxFinal,
        frequenceRemboursement: formData.frequence_remboursement,
        dureeValeur: dureeValeur,
        dureeUnite: formData.duree_unite,
        nombreEcheances: calculatedData.nombreEcheances,
        typeCredit: formData.type_credit,
        objetCredit: formData.objet_credit,
        revenusMensuels: formData.revenus_mensuels,
        typeRevenu: formData.type_revenu,
        revenuJournalier: formData.revenu_journalier,
        chargesMensuelles: formData.charges_mensuelles,
        statut: StatutDemande.PENDING_FEES,
        montantFraisEngagement,
        ...overridePayload,
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erreur creation demande:', error);
      setErrors({ general: error.message || 'Erreur lors de la creation de la demande' });
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = clients.find(c => c.id === formData.client_id);

  // Pre-fill revenue fields when client changes
  useEffect(() => {
    if (selectedClient && formData.client_id) {
      const isJournalier = selectedClient.typeRevenu === 'Journalier';
      const revenuMensuel = selectedClient.revenuMensuel || 0;
      const revenuJournalier = selectedClient.revenuJournalier || 0;

      // Only update if client has revenue data
      if (revenuMensuel > 0 || revenuJournalier > 0) {
        setFormData(prev => ({
          ...prev,
          revenus_mensuels: revenuMensuel > 0 ? String(revenuMensuel) : (revenuJournalier > 0 ? String(revenuJournalier * 26) : ''),
          revenu_journalier: revenuJournalier > 0 ? String(revenuJournalier) : '',
          type_revenu: isJournalier ? 'DAILY' : 'MONTHLY'
        }));
      }
    }
  }, [selectedClient?.id, formData.client_id]);

  const clientOptions = useMemo(() => clients.map(client => ({
    value: client.id,
    label: client.nom,
    subLabel: `Remb: ${client.taux_remboursement}%`,
    image: getPhotoUrl(client.photo_url),
    disabled: client.isEligible === false,
    disabledReason: client.ineligibilityReason
  })), [clients]);



  const typeCreditOptions = TYPE_CREDIT_OPTIONS;

  const frequenceOptions = [
    { value: '', label: 'Selectionner une frequence...' },
    { value: 'DAILY', label: 'Journalier (chaque jour)' },
    { value: 'WEEKLY', label: 'Hebdomadaire (chaque semaine)' },
    { value: 'MONTHLY', label: 'Mensuel (chaque mois)' },
    { value: 'BI_MONTHLY', label: 'Bimensuel (2 fois par mois)' },
    { value: 'QUARTERLY', label: 'Trimestriel (tous les 3 mois)' }
  ];

  const getUniteLabel = (unite: string) => {
    switch (unite) {
      case 'DAY': return 'jours';
      case 'WEEK': return 'semaines';
      case 'MONTH': return 'mois';
      default: return unite;
    }
  };

  const getFrequenceEcheanceLabel = () => {
    switch (formData.frequence_remboursement) {
      case 'DAILY': return 'Jour';
      case 'WEEKLY': return 'Semaine';
      case 'MONTHLY': return 'Mois';
      case 'BI_MONTHLY': return 'Quinzaine';
      case 'QUARTERLY': return 'Trimestre';
      default: return 'Echeance';
    }
  };

  // --- WIZARD STATE ---
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 3;

  // --- NAVIGATION ---
  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const validateStep = (currentStep: number) => {
     // TODO: Implement thorough validation per step
     // For now, simpler checks
     const newErrors: Record<string, string> = {};
     let isValid = true;

     if (currentStep === 1) {
        if (!formData.client_id) { newErrors.client_id = 'Client requis'; isValid = false; }
        if (clients.find(c => c.id === formData.client_id)?.isEligible === false) { 
            newErrors.client_id = 'Client inéligible'; isValid = false; 
        }
        if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) {
            newErrors.montant_demande = 'Montant requis'; isValid = false;
        }
        if (!formData.objet_credit.trim()) { newErrors.objet_credit = 'Objet requis'; isValid = false; }
     }
     
     if (currentStep === 2) {
        if (!formData.frequence_remboursement) { newErrors.frequence_remboursement = 'Frequence requise'; isValid = false; }
        if (!formData.duree_valeur) { newErrors.duree_valeur = 'Durée requise'; isValid = false; }
     }

     if (!isValid) {
        setErrors(newErrors);
        const first = Object.values(newErrors)[0];
        if(first) toast.error(first);
     } else {
        setErrors({});
     }
     return isValid;
  };

  // --- RENDER HELPERS ---
  const StepIndicator = ({ stepNumber, current, label }: { stepNumber: number, current: number, label: string }) => {
    const active = current >= stepNumber;
    const isCurrent = current === stepNumber;
    return (
      <div className="flex items-center gap-2">
         <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'
         } ${isCurrent ? 'ring-2 ring-indigo-500/50 scale-110' : ''}`}>
           {active && !isCurrent && stepNumber < current ? (
               <TrendingUp size={14} className="text-white" /> 
           ) : stepNumber}
         </div>
         <span className={`text-xs font-bold uppercase tracking-wider hidden sm:block transition-colors ${
            active ? 'text-white' : 'text-slate-600'
         }`}>{label}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. HEADER (Stepper) */}
        <div className="bg-slate-900/50 border-b border-slate-800 p-6">
           <div className="flex justify-between items-center mb-6">
              <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Nouvelle Demande</h2>
                  <p className="text-xs text-slate-500 mt-1">Créez un dossier de crédit en 3 étapes simples</p>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-red-500/10 rounded-full text-slate-500 hover:text-red-500 transition-colors"
                type="button"
              >
                  <span className="sr-only">Fermer</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 18 18"/></svg>
              </button>
           </div>

           {/* Progress Bar */}
           <div className="flex items-center gap-3">
              <StepIndicator stepNumber={1} current={step} label="Projet" />
              <div className="h-1 flex-1 bg-slate-800 rounded-full overflow-hidden">
                 <div className={`h-full bg-indigo-500 transition-all duration-500 ease-out ${step >= 2 ? 'w-full' : 'w-0'}`} />
              </div>
              <StepIndicator stepNumber={2} current={step} label="Modalités" />
              <div className="h-1 flex-1 bg-slate-800 rounded-full overflow-hidden">
                 <div className={`h-full bg-indigo-500 transition-all duration-500 ease-out ${step >= 3 ? 'w-full' : 'w-0'}`} />
              </div>
              <StepIndicator stepNumber={3} current={step} label="Analyse" />
           </div>
        </div>

        {/* 2. BODY (Contenu Dynamique sans Scroll) */}
        <div className="p-6 h-[450px] flex flex-col relative group">
           
           {/* STEP 1: LE PROJET */}
           {step === 1 && (
             <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 h-full flex flex-col">
                
                {/* Client Select */}
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Client Principal</label>
                   <div className="relative h-12 z-20">
                      <SearchableSelect
                        label=""
                        name="client_id"
                        value={formData.client_id}
                        onChange={(value) => setFormData({ ...formData, client_id: String(value) })}
                        options={clientOptions}
                        onSearchChange={handleSearchChange}
                        onDisabledClick={handleIneligibleClick}
                        isLoading={searchLoading}
                        disabled={!!clientId}
                        required
                        error={errors.client_id}
                        placeholder="Rechercher un client..."
                        className="h-12 text-base"
                      />
                   </div>
                </div>

                {/* Plan & Objet Grid */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Plan de Crédit</label>
                      <SelectField
                        label=""
                        name="creditPlanId"
                        value={formData.credit_plan_id}
                        onChange={(e) => handleApplyPlan(e.target.value)}
                        options={[
                            { value: '', label: 'Standard (Aucun plan)' },
                            ...creditPlans.map(p => ({ value: p.id, label: p.nom }))
                        ]}
                        className="h-12 bg-slate-900 border-slate-700 text-white focus:border-indigo-500/50"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Objet du financement</label>
                      <input 
                        className={`w-full h-12 bg-slate-900 border ${errors.objet_credit ? 'border-red-500' : 'border-slate-700'} rounded-lg px-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-600`}
                        placeholder="Ex: Achat Stock"
                        value={formData.objet_credit}
                        onChange={e => setFormData({...formData, objet_credit: e.target.value})}
                      />
                   </div>
                </div>

                {/* Hero Amount */}
                <div className="flex-1 flex flex-col justify-center pb-4">
                   <label className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Montant Demandé (FCFA)</label>
                   <div className="relative max-w-sm mx-auto w-full">
                      <input 
                        type="number" 
                        value={formData.montant_demande}
                        onChange={e => setFormData({...formData, montant_demande: e.target.value})}
                        className={`w-full h-24 bg-slate-900/50 border-2 ${errors.montant_demande ? 'border-red-500/50' : 'border-slate-800'} focus:border-indigo-500/50 rounded-2xl pl-8 pr-8 text-5xl font-black text-white text-center outline-none transition-all placeholder:text-slate-800`}
                        placeholder="0"
                        autoFocus
                      />
                      <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-700 opacity-20" size={40} />
                   </div>
                </div>
             </div>
           )}

           {/* STEP 2: MODALITÉS */}
           {step === 2 && (
             <div className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Type d'amortissement</label>
                      <SelectField
                         label=""
                         name="type_credit"
                         value={formData.type_credit}
                         onChange={(e) => setFormData({...formData, type_credit: e.target.value})}
                         options={typeCreditOptions}
                         className="h-12 bg-slate-900 border-slate-700 text-white"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Fréquence remboursements</label>
                      <SelectField
                         label=""
                         name="frequence_remboursement"
                         value={formData.frequence_remboursement}
                         onChange={(e) => setFormData({...formData, frequence_remboursement: e.target.value, duree_valeur: '', duree_unite: 'MONTH'})}
                         options={frequenceOptions}
                         className="h-12 bg-slate-900 border-slate-700 text-white"
                         error={errors.frequence_remboursement}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Durée du crédit</label>
                   {formData.frequence_remboursement ? (
                       <>
                        <div className="flex gap-2 h-14">
                            <input 
                                type="number" 
                                className="flex-1 h-full bg-slate-900 border border-slate-700 rounded-xl px-4 text-xl font-bold text-white focus:border-indigo-500 outline-none" 
                                value={formData.duree_valeur}
                                onChange={e => setFormData({...formData, duree_valeur: e.target.value})}
                                placeholder="0"
                            />
                            <div className="w-40 h-full">
                                <SelectField
                                    label=""
                                    name="duree_unite"
                                    value={formData.duree_unite}
                                    onChange={(e) => setFormData({...formData, duree_unite: e.target.value as any})}
                                    options={[
                                        { value: 'DAY', label: 'Jours' },
                                        { value: 'WEEK', label: 'Semaines' },
                                        { value: 'MONTH', label: 'Mois' }
                                    ]}
                                    className="!h-14 bg-slate-900 border-slate-700 text-white rounded-xl"
                                />
                            </div>
                        </div>
                        
                        {/* Quick Chips */}
                        <div className="flex gap-2">
                            {[30, 60, 90, 180].map(d => (
                                <button 
                                    key={d} 
                                    type="button"
                                    onClick={() => setFormData({...formData, duree_valeur: String(d), duree_unite: 'DAY'})}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all"
                                >
                                    {d} jours
                                </button>
                            ))}
                            <div className="h-8 w-px bg-slate-800 mx-2"></div>
                            <div className="text-xs text-slate-500 flex items-center italic">
                                {durationValidation && (
                                    <span className={durationValidation.type === 'error' ? 'text-red-500' : 'text-amber-500'}>
                                        {durationValidation.message}
                                    </span>
                                )}
                            </div>
                        </div>
                       </>
                   ) : (
                       <div className="p-4 border border-dashed border-slate-700 rounded-xl text-center text-slate-500 text-sm">
                           Veuillez d'abord sélectionner une fréquence
                       </div>
                   )}
                </div>
             </div>
           )}

           {/* STEP 3: ANALYSE & VALIDATION */}
           {step === 3 && (
             <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 h-full flex flex-col">
                
                {/* Financial Inputs Grid */}
                <div className="grid grid-cols-2 gap-5">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Revenus {formData.type_revenu === 'DAILY' ? '(Journalier)' : '(Mensuel)'}</label>
                      <div className="relative h-12">
                          <input 
                            type="number" 
                            className="w-full h-full bg-slate-900 border border-slate-700 rounded-lg pl-4 pr-36 text-white focus:border-indigo-500 outline-none" 
                            placeholder="0" 
                            value={formData.type_revenu === 'DAILY' ? formData.revenu_journalier : formData.revenus_mensuels}
                            onChange={(e) => {
                                if (formData.type_revenu === 'DAILY') {
                                   const j = e.target.value;
                                   const m = j ? (parseFloat(j) * 26).toString() : '';
                                   setFormData({ ...formData, revenu_journalier: j, revenus_mensuels: m });
                                } else {
                                   setFormData({ ...formData, revenus_mensuels: e.target.value });
                                }
                            }}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-800 p-0.5 flex">
                              <button 
                                type="button"
                                onClick={() => {
                                   if (formData.type_revenu !== 'MONTHLY') {
                                       setFormData(prev => ({ ...prev, type_revenu: 'MONTHLY' })); 
                                   }
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                                    formData.type_revenu === 'MONTHLY' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-300'
                                }`}
                              >
                                Mois
                              </button>
                              <button 
                                type="button"
                                onClick={() => {
                                   if (formData.type_revenu !== 'DAILY') {
                                       setFormData(prev => ({ ...prev, type_revenu: 'DAILY' })); 
                                   }
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                                    formData.type_revenu === 'DAILY' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-300'
                                }`}
                              >
                                Jour
                              </button>
                          </div>
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Charges Mensuelles</label>
                      <input 
                        type="number" 
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-lg px-4 text-white focus:border-indigo-500 outline-none" 
                        placeholder="0" 
                        value={formData.charges_mensuelles}
                        onChange={e => setFormData({...formData, charges_mensuelles: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Taux d'intérêt (%)</label>
                      <input 
                        type="number" 
                        className={`w-full h-12 bg-slate-900 border border-slate-700 rounded-lg px-4 text-white ${selectedPlan ? 'text-emerald-400 font-bold' : ''}`}
                        value={formData.taux_interet}
                        onChange={e => { setRateOverrideEnabled(true); setFormData({...formData, taux_interet: e.target.value}); }}
                        readOnly={!!selectedPlan && !rateOverrideEnabled}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Frais de dossier</label>
                      <input 
                        type="text" 
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-lg px-4 text-white" 
                        value={selectedPlan?.fraisDossier || selectedPlan?.frais_dossier || '0'}
                        readOnly
                      />
                   </div>
                </div>

                {/* Simulation Result Card (The "Wow" factor) */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-xl shadow-inner mt-auto">
                   <div className="flex justify-between items-end mb-4">
                      <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                             {formData.frequence_remboursement === 'DAILY' ? 'Échéance Journalière' :
                              formData.frequence_remboursement === 'WEEKLY' ? 'Échéance Hebdo.' :
                              formData.frequence_remboursement === 'BI_MONTHLY' ? 'Échéance Bimensuelle' :
                              formData.frequence_remboursement === 'QUARTERLY' ? 'Échéance Trimestrielle' :
                              'Mensualité'} Estimée
                          </div>
                         <div className="text-3xl font-black text-emerald-400 tracking-tight">
                            ~ {Math.round(calculatedData.montantEcheance).toLocaleString()} <span className="text-sm font-normal text-emerald-500/50">FCFA</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Coût Total</div>
                         <div className="text-xl font-bold text-white">
                             {Math.round(calculatedData.montantTotal).toLocaleString()} <span className="text-xs font-normal text-slate-600">FCFA</span>
                          </div>
                          
                          {/* Cost Breakdown */}
                          <div className="mt-1 flex flex-col items-end space-y-0.5">
                             <div className="text-[10px] text-slate-500 font-medium">
                                Intérêts: <span className="text-slate-300">{Math.round(calculatedData.montantTotal - (parseFloat(formData.montant_demande) || 0)).toLocaleString()}</span>
                             </div>
                             {(selectedPlan?.fraisDossier || selectedPlan?.frais_dossier) && (
                                <div className="text-[10px] text-slate-500 font-medium">
                                    Frais: <span className="text-slate-300">
                                        {(selectedPlan?.fraisDossier || selectedPlan?.frais_dossier).toLocaleString()}
                                    </span>
                                </div>
                             )}
                          </div>
                      </div>
                   </div>
                   
                   {/* Debt Ratio Bar */}
                   <div>
                      <div className="flex justify-between text-xs mb-2">
                         <span className="text-slate-400 font-medium">Taux d'endettement</span>
                         <span className={`font-bold ${
                            calculatedData.tauxEndettement > 40 ? 'text-red-400' : 
                            calculatedData.tauxEndettement > 30 ? 'text-amber-400' : 'text-emerald-400'
                         }`}>{calculatedData.tauxEndettement.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
                         <div 
                           className={`h-full rounded-full transition-all duration-700 ease-out ${
                               calculatedData.tauxEndettement > 50 ? 'bg-red-600' :
                               calculatedData.tauxEndettement > 40 ? 'bg-red-500' :
                               calculatedData.tauxEndettement > 30 ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                           }`} 
                           style={{ width: `${Math.min(calculatedData.tauxEndettement, 100)}%` }} 
                         />
                      </div>
                      
                      {/* Pro Feedback Label */}
                      <div className="mt-2 text-right">
                         <span className={`text-[10px] uppercase font-bold tracking-wide ${
                            calculatedData.tauxEndettement > 50 ? 'text-red-500' :
                            calculatedData.tauxEndettement > 40 ? 'text-red-400' :
                            calculatedData.tauxEndettement > 30 ? 'text-amber-500' : 'text-emerald-600'
                         }`}>
                            {calculatedData.tauxEndettement > 50 ? "🚫 REFUS AUTOMATIQUE (SUR-ENDETTÉ)" :
                             calculatedData.tauxEndettement > 40 ? "⚠️ RISQUÉ (BESOIN VALIDATION)" :
                             calculatedData.tauxEndettement > 30 ? "✋ ACCEPTABLE AVEC PRUDENCE" : "✅ DOSSIER SAIN"}
                         </span>
                      </div>
                   </div>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Navigation) */}
        <div className="p-5 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center backdrop-blur-sm">
           {step > 1 ? (
             <button 
                type="button"
                onClick={handleBack} 
                className="px-6 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-2 font-medium"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg> 
                Précédent
             </button>
           ) : (
             <div /> // Spacer
           )}

           {step < 3 ? (
             <button 
                type="button"
                onClick={handleNext} 
                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 hover:shadow-indigo-500/30 hover:translate-y-[-1px]"
             >
                Suivant 
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
             </button>
           ) : (
             <button 
                onClick={handleSubmit}
                disabled={loading || calculatedData.tauxEndettement > 55}
                className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg ${
                    loading || calculatedData.tauxEndettement > 55
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 hover:shadow-emerald-500/30 hover:translate-y-[-1px]'
                }`}
             >
                {loading ? (
                    <>Creating...</>
                ) : (
                    <>
                        <Save size={18} /> Créer la Demande
                    </>
                )}
             </button>
           )}
        </div>

      </div>
    </div>
  );
}

