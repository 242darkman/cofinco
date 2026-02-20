import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingUp, Save, AlertTriangle, Loader2, Info } from 'lucide-react';
import { clientSearchApi, demandeCreditApi, creditPlanApi, clientApi } from '../../../lib/api-client';
import { SelectField, SearchableSelect } from '../../ui';
import { formatClientName, resolveStorageUrl } from '../../../lib/format';
import { toast } from '../../../lib/toast';
import { SystemRole } from '@shared/types/roles';
import { StatutDemande, TypeCredit, TYPE_CREDIT_OPTIONS, normalizeDureeUnite, normalizeFrequenceRemboursement } from '@shared/enum/status-constants';
import useSmartDuration from '../../../hooks/credits/useSmartDuration';
import { useCurrency } from '../../../contexts/CurrencyContext';


interface Client {
  id: string;
  nom: string;
  email: string;
  score?: number;
  segment: string;
  tauxRemboursement: number;
  creditTotal: number;
  photoUrl?: string;
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

export default function CreditRequestForm({ onClose, onSuccess, clientId }: CreditRequestFormProps) {
  const { currency, label, fmt } = useCurrency();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateOverrideEnabled, setRateOverrideEnabled] = useState(false);
  const [rateOverrideReason, setRateOverrideReason] = useState('');

  // Credit Plans state
  const [creditPlans, setCreditPlans] = useState<any[]>([]);

  // Schedule preview state
  const [schedulePreview, setSchedulePreview] = useState<any>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  
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
    charges_mensuelles: '',
    montant_frais_engagement: '',
  });

  // Filter active plans (exclude expired/not yet effective)
  const activePlans = useMemo(() => {
    const now = new Date();
    return creditPlans.filter(p => {
      if (!p.isActive) return false;
      if (p.effectiveFrom && new Date(p.effectiveFrom) > now) return false;
      if (p.effectiveTo && new Date(p.effectiveTo) < now) return false;
      return true;
    });
  }, [creditPlans]);

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
      const plans = await creditPlanApi.getAll({ isActive: true });
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
    if (!planId) {
      // Deselect plan — clear locked fields
      setFormData(prev => ({ ...prev, credit_plan_id: '', montant_frais_engagement: '' }));
      setSchedulePreview(null);
      setRateOverrideEnabled(false);
      return;
    }
    const plan = creditPlans.find(p => p.id === planId);
    if (!plan) return;

    // Pré-remplir le montant si fixe (min == max)
    const min = parseFloat(plan.montantMin);
    const max = parseFloat(plan.montantMax);
    let fixedMontant = undefined;

    if (!isNaN(min) && !isNaN(max) && min === max) {
        fixedMontant = String(min);
    }

    // Normaliser les valeurs françaises vers anglaises (ex: "Jour" -> "DAY", "Journalier" -> "DAILY")
    const rawDureeUnite = plan.dureeUnite;
    const rawFrequence = plan.frequenceRemboursement;

    setFormData(prev => ({
      ...prev,
      credit_plan_id: planId,
      type_credit: normalizeTypeCredit(plan.typeCredit),
      taux_interet: String(plan.tauxInteret),
      duree_valeur: String(plan.dureeValeur),
      duree_unite: normalizeDureeUnite(rawDureeUnite),
      frequence_remboursement: normalizeFrequenceRemboursement(rawFrequence),
      objet_credit: plan.description ? `${plan.nom} - ${plan.description}` : prev.objet_credit,
      montant_demande: fixedMontant !== undefined ? fixedMontant : prev.montant_demande,
      montant_frais_engagement: '', // Will be pre-filled from schedule preview
    }));
    // Reset schedule preview & override state
    setSchedulePreview(null);
    setRateOverrideEnabled(false);
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

  // Set default rate only if no plan selected and no rate set yet
  useEffect(() => {
    if (!selectedPlan && !formData.taux_interet) {
      setFormData(prev => prev.taux_interet ? prev : { ...prev, taux_interet: String(RATE_BASE) });
    }
  }, [selectedPlan]);

  useEffect(() => {
    calculateLoan();
  }, [formData.montant_demande, formData.duree_valeur, formData.duree_unite, formData.taux_interet, formData.frequence_remboursement, formData.revenus_mensuels, formData.charges_mensuelles, schedulePreview]);

  // Fetch schedule preview from engine when entering step 3
  const fetchSchedulePreview = useCallback(async () => {
    const montant = parseFloat(formData.montant_demande);
    const dureeValeur = parseInt(formData.duree_valeur);
    if (!montant || !dureeValeur || !formData.frequence_remboursement) return;

    setScheduleLoading(true);
    setScheduleError(null);

    try {
      const plan = selectedPlan;
      const planConfig = plan ? {
        dureeValeur: plan.dureeValeur,
        dureeUnite: plan.dureeUnite,
        frequenceRemboursement: plan.frequenceRemboursement,
        tauxInteret: String(plan.tauxInteret),
        interestMethod: plan.interestMethod || 'FLAT',
        interestRatePeriod: plan.interestRatePeriod || 'MONTHLY',
        dayCountConvention: plan.dayCountConvention || '30_360',
        interestRoundingMode: plan.interestRoundingMode || 'ROUND',
        interestRoundingUnit: plan.interestRoundingUnit || 1,
        amortizationType: plan.amortizationType || 'EQUAL_INSTALLMENTS',
        firstDueRule: plan.firstDueRule || 'NEXT_DAY',
        gracePeriodDays: plan.gracePeriodDays || 0,
        preferredWeekday: plan.preferredWeekday ?? null,
        calendarMode: plan.calendarMode || 'ALL_DAYS',
        weekdaysMask: plan.weekdaysMask ?? 127,
        shiftNonWorkingDay: plan.shiftNonWorkingDay || 'NEXT',
        allowManualFirstDueDate: plan.allowManualFirstDueDate || false,
      } : {
        // Default plan config when no plan is selected
        dureeValeur: dureeValeur,
        dureeUnite: formData.duree_unite,
        frequenceRemboursement: formData.frequence_remboursement,
        tauxInteret: formData.taux_interet || '20',
        interestMethod: 'FLAT',
        interestRatePeriod: 'MONTHLY',
        dayCountConvention: '30_360',
        interestRoundingMode: 'ROUND',
        interestRoundingUnit: 1,
        amortizationType: 'EQUAL_INSTALLMENTS',
        firstDueRule: 'NEXT_DAY',
        gracePeriodDays: 0,
        preferredWeekday: null,
        calendarMode: 'ALL_DAYS',
        weekdaysMask: 127,
        shiftNonWorkingDay: 'NEXT',
        allowManualFirstDueDate: false,
      };

      const fees = plan?.fees?.filter((f: any) => f.isActive !== false).map((f: any) => ({
        feeType: f.feeType,
        label: f.label,
        calcType: f.calcType,
        value: String(f.value),
        minAmount: f.minAmount ? String(f.minAmount) : null,
        maxAmount: f.maxAmount ? String(f.maxAmount) : null,
        collectionMode: f.collectionMode,
      })) || [];

      const resp = await fetch('/api/credit-plans/preview-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planConfig,
          fees,
          principal: String(montant),
          disbursementDate: new Date().toISOString().split('T')[0],
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: 'Erreur serveur' }));
        throw new Error(err.message || 'Erreur lors du calcul');
      }

      const data = await resp.json();
      setSchedulePreview(data);
    } catch (err: any) {
      setScheduleError(err.message || 'Erreur lors du calcul de l\'échéancier');
      setSchedulePreview(null);
    } finally {
      setScheduleLoading(false);
    }
  }, [formData.montant_demande, formData.duree_valeur, formData.duree_unite, formData.taux_interet, formData.frequence_remboursement, selectedPlan]);

  // Auto-fetch preview when entering step 3
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 3;

  useEffect(() => {
    if (step === 3) {
      fetchSchedulePreview();
    }
  }, [step, fetchSchedulePreview]);

  // Pre-fill engagement fees from schedule preview (user can still override)
  useEffect(() => {
    if (schedulePreview?.upfrontFees?.length > 0) {
      const total = schedulePreview.upfrontFees.reduce((s: number, f: any) => s + parseFloat(f.amount || '0'), 0);
      setFormData(prev => prev.montant_frais_engagement === '' || prev.montant_frais_engagement === '0'
        ? { ...prev, montant_frais_engagement: String(Math.round(total)) }
        : prev
      );
    }
  }, [schedulePreview]);

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
        tauxRemboursement: parseFloat(c.tauxRemboursement) || 100,
        creditTotal: parseFloat(c.creditTotal) || 0,
        photoUrl: c.photoUrl,
        compteCourantId: c.compteCourantId,
        compteCourantNumero: c.compteCourantNumero,
        compteCourantSolde: parseFloat(c.compteCourantSolde) || 0,
        isEligible: c.isEligible !== undefined ? c.isEligible : true, // Par défaut éligible si vient de /eligible-credit
        ineligibilityReason: c.ineligibilityReason,
        // Revenus du client
        revenuMensuel: parseFloat(c.revenuMensuel) || 0,
        revenuJournalier: parseFloat(c.revenuJournalier) || 0,
        typeRevenu: c.typeRevenu || 'Mensuel'
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
    const taux = parseFloat(formData.taux_interet) || 0;
    const revenus = parseFloat(formData.revenus_mensuels) || 0;
    const charges = parseFloat(formData.charges_mensuelles) || 0;

    if (montant > 0 && dureeValeur > 0 && formData.frequence_remboursement) {
      // Use schedule preview data if available, otherwise estimate locally
      let montantEcheance: number;
      let nombreEcheances: number;
      let montantTotal: number;

      if (schedulePreview?.summary) {
        montantTotal = parseFloat(schedulePreview.summary.totalDue);
        nombreEcheances = schedulePreview.summary.numberOfInstallments;
        montantEcheance = nombreEcheances > 0 ? montantTotal / nombreEcheances : 0;
      } else {
        // Quick local estimate for debt ratio (recalculated properly when preview loads)
        montantTotal = montant * (1 + taux / 100);
        nombreEcheances = calculerNombreEcheances(
          formData.frequence_remboursement,
          dureeValeur,
          formData.duree_unite
        );
        montantEcheance = nombreEcheances > 0 ? montantTotal / nombreEcheances : 0;
      }

      const capaciteRemboursement = revenus - charges;

      // Convert installment to monthly for debt ratio
      let montantEcheanceMensuel = montantEcheance;
      if (formData.frequence_remboursement === 'DAILY') {
        montantEcheanceMensuel = montantEcheance * 26;
      } else if (formData.frequence_remboursement === 'WEEKLY') {
        montantEcheanceMensuel = montantEcheance * 4.33;
      } else if (formData.frequence_remboursement === 'BI_MONTHLY') {
        montantEcheanceMensuel = montantEcheance * 2;
      } else if (formData.frequence_remboursement === 'QUARTERLY') {
        montantEcheanceMensuel = montantEcheance / 3;
      }

      const totalDettesMensuelles = charges + montantEcheanceMensuel;
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
      const min = selectedPlan.montantMin;
      const max = selectedPlan.montantMax;
      
      if (min && montant < min) {
        newErrors.montant_demande = `Le montant minimum pour ce plan est de ${min.toLocaleString()} ${currency.symbol}`;
      }
      if (max && montant > max) {
        newErrors.montant_demande = `Le montant maximum pour ce plan est de ${max.toLocaleString()} ${currency.symbol}`;
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

      // Utiliser le taux du plan sélectionné s'il existe, sinon le taux saisi
      const tauxFinal = selectedPlan
        ? String(selectedPlan.tauxInteret)
        : formData.taux_interet;

      // Nombre d'échéances depuis le preview (moteur de calcul) ou calcul local en fallback
      const nombreEcheances = schedulePreview?.summary?.numberOfInstallments
        || calculatedData.nombreEcheances;

      // Frais de dossier : valeur saisie manuellement par l'utilisateur
      const montantFraisEngagement = formData.montant_frais_engagement
        ? String(formData.montant_frais_engagement)
        : null;

      await demandeCreditApi.create({
        clientId: formData.client_id,
        creditPlanId: formData.credit_plan_id || null,
        montantDemande: formData.montant_demande,
        tauxInteret: tauxFinal,
        frequenceRemboursement: formData.frequence_remboursement,
        dureeValeur: dureeValeur,
        dureeUnite: formData.duree_unite,
        nombreEcheances,
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
      setErrors({ general: error.message || 'Erreur lors de la création de la demande' });
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = clients.find(c => c.id === formData.client_id);

  // Eligibility warnings based on plan criteria
  const eligibilityWarnings = useMemo(() => {
    if (!selectedPlan || !selectedClient) return [];
    const warnings: string[] = [];
    if (selectedPlan.minSegment) {
      const segmentOrder = ['RISQUE', 'STANDARD', 'PREMIUM', 'VIP'];
      const clientIdx = segmentOrder.indexOf((selectedClient.segment || '').toUpperCase());
      const requiredIdx = segmentOrder.indexOf(selectedPlan.minSegment);
      if (clientIdx >= 0 && requiredIdx >= 0 && clientIdx < requiredIdx) {
        warnings.push(`Segment minimum requis : ${selectedPlan.minSegment} (client : ${selectedClient.segment})`);
      }
    }
    if (selectedPlan.minScoreGlobal && selectedClient.score != null && selectedClient.score < selectedPlan.minScoreGlobal) {
      warnings.push(`Score minimum requis : ${selectedPlan.minScoreGlobal} (client : ${selectedClient.score})`);
    }
    if (selectedPlan.maxDebtToIncomeRatio && calculatedData.tauxEndettement > parseFloat(selectedPlan.maxDebtToIncomeRatio)) {
      warnings.push(`Taux d'endettement max : ${selectedPlan.maxDebtToIncomeRatio}% (actuel : ${calculatedData.tauxEndettement.toFixed(1)}%)`);
    }
    if (selectedPlan.kycRequired) {
      warnings.push('Ce plan exige un dossier KYC complet');
    }
    if (selectedPlan.collateralRequired) {
      warnings.push('Ce plan exige une garantie');
    }
    return warnings;
  }, [selectedPlan, selectedClient, calculatedData.tauxEndettement]);

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
    subLabel: `Remb: ${client.tauxRemboursement}%`,
    image: getPhotoUrl(client.photoUrl),
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
            active ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-surface text-content-muted border border-edge'
         } ${isCurrent ? 'ring-2 ring-accent/50 scale-110' : ''}`}>
           {active && !isCurrent && stepNumber < current ? (
               <TrendingUp size={14} className="text-content-primary" /> 
           ) : stepNumber}
         </div>
         <span className={`text-xs font-bold uppercase tracking-wider hidden sm:block transition-colors ${
            active ? 'text-content-primary' : 'text-content-muted'
         }`}>{label}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      
      <div className="w-full max-w-2xl bg-surface-base border border-edge rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. HEADER (Stepper) */}
        <div className="bg-surface-base/50 border-b border-edge p-6">
           <div className="flex justify-between items-center mb-6">
              <div>
                  <h2 className="text-xl font-bold text-content-primary tracking-tight">Nouvelle Demande</h2>
                  <p className="text-xs text-content-muted mt-1">Créez un dossier de crédit en 3 étapes simples</p>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-status-danger-bg rounded-full text-content-muted hover:text-status-danger transition-colors"
                type="button"
              >
                  <span className="sr-only">Fermer</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 18 18"/></svg>
              </button>
           </div>

           {/* Progress Bar */}
           <div className="flex items-center gap-3">
              <StepIndicator stepNumber={1} current={step} label="Projet" />
              <div className="h-1 flex-1 bg-surface rounded-full overflow-hidden">
                 <div className={`h-full bg-accent transition-all duration-500 ease-out ${step >= 2 ? 'w-full' : 'w-0'}`} />
              </div>
              <StepIndicator stepNumber={2} current={step} label="Modalités" />
              <div className="h-1 flex-1 bg-surface rounded-full overflow-hidden">
                 <div className={`h-full bg-accent transition-all duration-500 ease-out ${step >= 3 ? 'w-full' : 'w-0'}`} />
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
                   <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Client Principal</label>
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
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Plan de Crédit</label>
                      <SelectField
                        label=""
                        name="creditPlanId"
                        value={formData.credit_plan_id}
                        onChange={(e) => handleApplyPlan(e.target.value)}
                        options={[
                            { value: '', label: 'Standard (Aucun plan)' },
                            ...activePlans.map(p => ({ value: p.id, label: p.nom }))
                        ]}
                        className="h-12 bg-surface-base border-edge text-content-primary focus:border-accent/50"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Objet du financement</label>
                      <input 
                        className={`w-full h-12 bg-surface-base border ${errors.objet_credit ? 'border-status-danger' : 'border-edge'} rounded-lg px-4 text-content-primary focus:border-accent focus:ring-1 focus:ring-accent/50 outline-none transition-all placeholder:text-content-muted`}
                        placeholder="Ex: Achat Stock"
                        value={formData.objet_credit}
                        onChange={e => setFormData({...formData, objet_credit: e.target.value})}
                      />
                   </div>
                </div>

                {/* Hero Amount */}
                <div className="flex-1 flex flex-col justify-center pb-4">
                   <label className="text-center text-xs font-bold text-content-muted uppercase tracking-wider mb-4">{label('Montant Demandé')}</label>
                   <div className="relative max-w-sm mx-auto w-full">
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formData.montant_demande}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, montant_demande: v}); }}
                        className={`w-full h-24 bg-surface-base/50 border-2 ${errors.montant_demande ? 'border-status-danger/50' : 'border-edge'} focus:border-accent/50 rounded-2xl pl-8 pr-8 text-5xl font-black text-content-primary text-center outline-none transition-all placeholder:text-content-primary`}
                        placeholder="0"
                        autoFocus
                      />
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-content-secondary opacity-20 text-3xl font-black">{currency.symbol}</span>
                   </div>
                </div>
             </div>
           )}

           {/* STEP 2: MODALITÉS */}
           {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                {/* Info bar when plan is selected */}
                {selectedPlan && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-status-info/5 border border-status-info/20">
                    <Info size={14} className="text-status-info mt-0.5 shrink-0" />
                    <div className="text-xs text-content-secondary">
                      <span className="font-semibold text-content-primary">{selectedPlan.nom}</span>
                      <span className="mx-1">—</span>
                      {selectedPlan.interestMethod === 'FLAT' ? 'Intérêt fixe' : 'Intérêt dégressif'}
                      {' / '}
                      {selectedPlan.amortizationType === 'EQUAL_INSTALLMENTS' ? 'Échéances constantes' :
                       selectedPlan.amortizationType === 'EQUAL_PRINCIPAL' ? 'Capital constant' :
                       'Ballon (intérêts puis capital)'}
                      <span className="text-content-muted ml-1">(les champs ci-dessous sont imposés par le plan)</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Type de crédit</label>
                      <SelectField
                         label=""
                         name="type_credit"
                         value={formData.type_credit}
                         onChange={(e) => setFormData({...formData, type_credit: e.target.value})}
                         options={typeCreditOptions}
                         disabled={!!selectedPlan}
                         className={`h-12 bg-surface-base border-edge text-content-primary ${selectedPlan ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Fréquence remboursements</label>
                      <SelectField
                         label=""
                         name="frequence_remboursement"
                         value={formData.frequence_remboursement}
                         onChange={(e) => setFormData({...formData, frequence_remboursement: e.target.value, duree_valeur: '', duree_unite: 'MONTH'})}
                         options={frequenceOptions}
                         disabled={!!selectedPlan}
                         className={`h-12 bg-surface-base border-edge text-content-primary ${selectedPlan ? 'opacity-60 cursor-not-allowed' : ''}`}
                         error={errors.frequence_remboursement}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Durée du crédit</label>
                   {formData.frequence_remboursement ? (
                       <>
                        <div className="flex gap-2 h-14">
                            <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className={`flex-1 h-full bg-surface-base border border-edge rounded-xl px-4 text-xl font-bold text-content-primary focus:border-accent outline-none ${selectedPlan ? 'opacity-60 cursor-not-allowed' : ''}`}
                                value={formData.duree_valeur}
                                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, duree_valeur: v}); }}
                                placeholder="0"
                                readOnly={!!selectedPlan}
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
                                    disabled={!!selectedPlan}
                                    className={`!h-14 bg-surface-base border-edge text-content-primary rounded-xl ${selectedPlan ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                            </div>
                        </div>

                        {/* Quick Chips (hidden when plan selected) */}
                        {!selectedPlan && (
                          <div className="flex gap-2">
                              {[30, 60, 90, 180].map(d => (
                                  <button
                                      key={d}
                                      type="button"
                                      onClick={() => setFormData({...formData, duree_valeur: String(d), duree_unite: 'DAY'})}
                                      className="px-4 py-2 bg-surface-base hover:bg-surface border border-edge hover:border-edge rounded-lg text-xs font-medium text-content-muted hover:text-content-primary transition-all"
                                  >
                                      {d} jours
                                  </button>
                              ))}
                              <div className="h-8 w-px bg-surface mx-2"></div>
                              <div className="text-xs text-content-muted flex items-center italic">
                                  {durationValidation && (
                                      <span className={durationValidation.type === 'error' ? 'text-status-danger' : 'text-status-warning'}>
                                          {durationValidation.message}
                                      </span>
                                  )}
                              </div>
                          </div>
                        )}
                       </>
                   ) : (
                       <div className="p-4 border border-dashed border-edge rounded-xl text-center text-content-muted text-sm">
                           Veuillez d'abord sélectionner une fréquence
                       </div>
                   )}
                </div>
             </div>
           )}

           {/* STEP 3: ANALYSE & VALIDATION */}
           {step === 3 && (
             <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300 h-full flex flex-col overflow-y-auto">

                {/* Eligibility warnings */}
                {eligibilityWarnings.length > 0 && (
                  <div className="space-y-1.5">
                    {eligibilityWarnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-status-warning/5 border border-status-warning/20">
                        <AlertTriangle size={13} className="text-status-warning shrink-0" />
                        <span className="text-xs text-content-secondary">{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Financial Inputs Grid */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Revenus {formData.type_revenu === 'DAILY' ? '(Journalier)' : '(Mensuel)'}</label>
                      <div className="relative h-12">
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="w-full h-full bg-surface-base border border-edge rounded-lg pl-4 pr-36 text-content-primary focus:border-accent outline-none"
                            placeholder="0"
                            value={formData.type_revenu === 'DAILY' ? formData.revenu_journalier : formData.revenus_mensuels}
                            onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, '');
                                if (formData.type_revenu === 'DAILY') {
                                   const m = v ? (parseFloat(v) * 26).toString() : '';
                                   setFormData({ ...formData, revenu_journalier: v, revenus_mensuels: m });
                                } else {
                                   setFormData({ ...formData, revenus_mensuels: v });
                                }
                            }}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-surface p-0.5 flex">
                              <button
                                type="button"
                                onClick={() => {
                                   if (formData.type_revenu !== 'MONTHLY') {
                                       setFormData(prev => ({ ...prev, type_revenu: 'MONTHLY' }));
                                   }
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                                    formData.type_revenu === 'MONTHLY'
                                    ? 'bg-accent text-white shadow-sm'
                                    : 'text-content-muted hover:text-content-secondary'
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
                                    ? 'bg-accent text-white shadow-sm'
                                    : 'text-content-muted hover:text-content-secondary'
                                }`}
                              >
                                Jour
                              </button>
                          </div>
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Charges Mensuelles</label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full h-12 bg-surface-base border border-edge rounded-lg px-4 text-content-primary focus:border-accent outline-none"
                        placeholder="0"
                        value={formData.charges_mensuelles}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, charges_mensuelles: v}); }}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Taux d'intérêt (%)</label>
                      <input
                        inputMode="decimal"
                        className={`w-full h-12 bg-surface-base border border-edge rounded-lg px-4 text-content-primary ${selectedPlan ? 'opacity-60 cursor-not-allowed font-bold' : ''}`}
                        value={formData.taux_interet}
                        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setRateOverrideEnabled(true); setFormData({...formData, taux_interet: v}); }}
                        readOnly={!!selectedPlan}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider ml-1">Frais de dossier ({currency.symbol})</label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full h-12 bg-surface-base border border-edge rounded-lg px-4 text-content-primary focus:border-accent outline-none"
                        placeholder="0"
                        value={formData.montant_frais_engagement}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, montant_frais_engagement: v}); }}
                      />
                   </div>
                </div>

                {/* Simulation Result Card — powered by schedule engine */}
                <div className="bg-gradient-to-br from-surface-base to-surface-base border border-edge p-5 rounded-xl shadow-inner mt-auto">
                   {scheduleLoading ? (
                     <div className="flex items-center justify-center gap-3 py-6">
                       <Loader2 size={20} className="animate-spin text-accent" />
                       <span className="text-sm text-content-muted">Calcul de l'échéancier...</span>
                     </div>
                   ) : scheduleError ? (
                     <div className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-bg">
                       <AlertTriangle size={14} className="text-status-danger shrink-0" />
                       <span className="text-xs text-status-danger">{scheduleError}</span>
                     </div>
                   ) : schedulePreview ? (
                     <>
                       <div className="flex justify-between items-end mb-4">
                          <div>
                              <div className="text-[10px] text-content-muted uppercase font-bold tracking-wider mb-1">
                                 {getFrequenceEcheanceLabel()} Estimée
                              </div>
                             <div className="text-3xl font-black text-status-success tracking-tight">
                                ~ {fmt(parseFloat(schedulePreview.summary.totalDue) / schedulePreview.summary.numberOfInstallments, { showCurrency: false })} <span className="text-sm font-normal text-status-success/50">{currency.symbol}</span>
                             </div>
                          </div>
                          <div className="text-right">
                             <div className="text-[10px] text-content-muted uppercase font-bold tracking-wider mb-1">Coût Total</div>
                             <div className="text-xl font-bold text-content-primary">
                                 {fmt(schedulePreview.summary.totalDue, { showCurrency: false })} <span className="text-xs font-normal text-content-muted">{currency.symbol}</span>
                              </div>

                              {/* Cost Breakdown */}
                              <div className="mt-1 flex flex-col items-end space-y-0.5">
                                 <div className="text-[10px] text-content-muted font-medium">
                                    Capital: <span className="text-content-secondary">{fmt(schedulePreview.summary.totalCapital, { showCurrency: false })}</span>
                                 </div>
                                 <div className="text-[10px] text-content-muted font-medium">
                                    Intérêts: <span className="text-content-secondary">{fmt(schedulePreview.summary.totalInterest, { showCurrency: false })}</span>
                                 </div>
                                 {parseFloat(schedulePreview.summary.totalFees) > 0 && (
                                   <div className="text-[10px] text-content-muted font-medium">
                                      Frais: <span className="text-content-secondary">{fmt(schedulePreview.summary.totalFees, { showCurrency: false })}</span>
                                   </div>
                                 )}
                              </div>
                          </div>
                       </div>

                       {/* Upfront Fees detail */}
                       {schedulePreview.upfrontFees?.length > 0 && (
                         <div className="mb-3 p-2.5 rounded-lg bg-surface border border-edge">
                           <div className="text-[10px] text-content-muted uppercase font-bold tracking-wider mb-1.5">Frais préalables</div>
                           {schedulePreview.upfrontFees.map((f: any, i: number) => (
                             <div key={i} className="flex justify-between text-xs text-content-secondary">
                               <span>{f.label || f.feeType}</span>
                               <span className="font-medium">{fmt(f.amount)}</span>
                             </div>
                           ))}
                         </div>
                       )}
                     </>
                   ) : (
                     <div className="text-center py-6 text-content-muted text-sm">
                       Renseignez les paramètres pour voir la simulation
                     </div>
                   )}

                   {/* Debt Ratio Bar */}
                   <div>
                      <div className="flex justify-between text-xs mb-2">
                         <span className="text-content-muted font-medium">Taux d'endettement</span>
                         <span className={`font-bold ${
                            calculatedData.tauxEndettement > 40 ? 'text-status-danger' :
                            calculatedData.tauxEndettement > 30 ? 'text-status-warning' : 'text-status-success'
                         }`}>{calculatedData.tauxEndettement.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-surface-base rounded-full overflow-hidden border border-edge/50">
                         <div
                           className={`h-full rounded-full transition-all duration-700 ease-out ${
                               calculatedData.tauxEndettement > 50 ? 'bg-status-danger' :
                               calculatedData.tauxEndettement > 40 ? 'bg-status-danger' :
                               calculatedData.tauxEndettement > 30 ? 'bg-status-warning' : 'bg-status-success shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                           }`}
                           style={{ width: `${Math.min(calculatedData.tauxEndettement, 100)}%` }}
                         />
                      </div>

                      {/* Pro Feedback Label */}
                      <div className="mt-2 text-right">
                         <span className={`text-[10px] uppercase font-bold tracking-wide ${
                            calculatedData.tauxEndettement > 50 ? 'text-status-danger' :
                            calculatedData.tauxEndettement > 40 ? 'text-status-danger' :
                            calculatedData.tauxEndettement > 30 ? 'text-status-warning' : 'text-status-success'
                         }`}>
                            {calculatedData.tauxEndettement > 50 ? "REFUS AUTOMATIQUE (SUR-ENDETTE)" :
                             calculatedData.tauxEndettement > 40 ? "RISQUE (BESOIN VALIDATION)" :
                             calculatedData.tauxEndettement > 30 ? "ACCEPTABLE AVEC PRUDENCE" : "DOSSIER SAIN"}
                         </span>
                      </div>
                   </div>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Navigation) */}
        <div className="p-5 bg-surface-base/80 border-t border-edge flex justify-between items-center backdrop-blur-sm">
           {step > 1 ? (
             <button 
                type="button"
                onClick={handleBack} 
                className="px-6 py-3 rounded-xl border border-edge text-content-secondary hover:text-content-primary hover:bg-surface transition-all flex items-center gap-2 font-medium"
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
                className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-primary-hover text-white font-bold transition-all flex items-center gap-2 shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:translate-y-[-1px]"
             >
                Suivant 
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
             </button>
           ) : (
             <button 
                onClick={handleSubmit}
                disabled={loading || calculatedData.tauxEndettement > 50}
                className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg ${
                    loading || calculatedData.tauxEndettement > 50
                    ? 'bg-surface-elevated text-content-muted cursor-not-allowed'
                    : 'bg-status-success hover:bg-status-success text-white shadow-status-success/20 hover:shadow-status-success/30 hover:translate-y-[-1px]'
                }`}
             >
                {loading ? (
                    <>Création en cours...</>
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

