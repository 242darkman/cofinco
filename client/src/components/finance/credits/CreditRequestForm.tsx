import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DollarSign, Calendar, FileText, TrendingUp, AlertCircle, Save, RefreshCw } from 'lucide-react';
import { clientSearchApi, demandeCreditApi, creditPlanApi, clientApi } from '../../../lib/api-client';
import { Modal, FormField, SelectField, Button, SearchableSelect } from '../../ui';
import { formatClientName, resolveStorageUrl } from '../../../lib/format';
import { toast } from '../../../lib/toast';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import { StatutDemande, TypeCredit, TYPE_CREDIT_OPTIONS } from '@shared/enum/status-constants';
import useSmartDuration from '../../../hooks/credits/useSmartDuration';
import DurationSelector from './DurationSelector';

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

    setFormData(prev => ({
      ...prev,
      credit_plan_id: planId,
      type_credit: normalizeTypeCredit(plan.typeCredit || plan.type_credit),
      taux_interet: String(plan.tauxInteret || plan.taux_interet),
      duree_valeur: String(plan.dureeValeur || plan.duree_valeur),
      duree_unite: plan.dureeUnite || plan.duree_unite,
      frequence_remboursement: plan.frequenceRemboursement || plan.frequence_remboursement,
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
        ineligibilityReason: c.ineligibilityReason
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

      // Calcul du montant mensuel equivalent pour le taux d'endettement
      let montantEcheanceMensuel = montantEcheance;
      if (formData.frequence_remboursement === 'DAILY') {
        montantEcheanceMensuel = montantEcheance * 30;
      } else if (formData.frequence_remboursement === 'WEEKLY') {
        montantEcheanceMensuel = montantEcheance * 4;
      } else if (formData.frequence_remboursement === 'BI_MONTHLY') {
        montantEcheanceMensuel = montantEcheance * 2;
      } else if (formData.frequence_remboursement === 'QUARTERLY') {
        montantEcheanceMensuel = montantEcheance / 3;
      }

      const tauxEndettement = revenus > 0 ? (montantEcheanceMensuel / revenus) * 100 : 0;

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

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Nouvelle Demande de Credit"
      size="2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || calculatedData.tauxEndettement > 50}
            icon={Save}
            variant="primary"
            className={calculatedData.tauxEndettement > 50 
              ? "bg-slate-600 cursor-not-allowed opacity-50" 
              : "bg-green-600 hover:bg-green-700"
            }
          >
            {loading ? 'Creation...' : calculatedData.tauxEndettement > 50 ? 'Taux d\'endettement trop élevé' : 'Creer la Demande'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">


        <div className="grid md:grid-cols-2 gap-6">
          {/* Client Selection */}
          <div className="md:col-span-2">
             <SelectField
              label="Plan de Crédit (Optionnel)"
              name="creditPlanId"
              value={formData.credit_plan_id}
              onChange={(e) => handleApplyPlan(e.target.value)}
              options={[
                { value: '', label: '-- Sélectionner un modèle --' },
                ...creditPlans.map(p => ({ value: p.id, label: `${p.nom} (Taux: ${p.tauxInteret || p.taux_interet}%)` }))
              ]}
              className="bg-teal-500/10 border-teal-500/30 text-teal-100"
            />
          </div>

          <div className="md:col-span-2 flex items-start gap-2">
            <div className="flex-1">
              <SearchableSelect
                label="Client"
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
                placeholder="Rechercher un client (Nom ou Tél)..."
              />
            </div>
            <Button 
                type="button" 
                variant="secondary" 
                icon={RefreshCw} 
                onClick={() => loadClients("")}
                className="mt-7" // Align with input
                title="Actualiser la liste des clients"
            />
          </div>

          {/* Client Info Card */}
          {selectedClient && (
            <div className="md:col-span-2 bg-slate-700/30 p-4 rounded-lg border border-slate-600 mb-2">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-slate-500">
                  {getPhotoUrl(selectedClient.photo_url) ? (
                    <img src={getPhotoUrl(selectedClient.photo_url)} alt={selectedClient.nom} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-white">{selectedClient.nom.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{selectedClient.nom}</h3>
                  <div className="text-sm text-slate-400">Taux Remboursement: <span className="text-cyan-400">{selectedClient.taux_remboursement}%</span></div>
                  <div className="text-sm text-slate-400">Segment: {selectedClient.segment}</div>
                </div>
              </div>
            </div>
          )}

          {/* Type Credit */}
          <SelectField
            label="Type de Credit"
            name="type_credit"
            value={formData.type_credit}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, type_credit: e.target.value })}
            options={typeCreditOptions}
            required
          />

          {/* Montant */}
          {/* Montant avec validation min/max stricte */}
          <div className="space-y-1">
            <FormField
              label="Montant Demande (FCFA)"
              name="montant_demande"
              type="number"
              value={formData.montant_demande ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                let val = e.target.value;
                // Clamp Max immediately
                if (selectedPlan && (selectedPlan.montantMax || selectedPlan.montant_max)) {
                   const max = selectedPlan.montantMax || selectedPlan.montant_max;
                   if (parseFloat(val) > max) val = String(max);
                }
                setFormData({ ...formData, montant_demande: val });
              }}
              onBlur={() => {
                // Clamp Min on blur
                if (selectedPlan && (selectedPlan.montantMin || selectedPlan.montant_min)) {
                   const min = selectedPlan.montantMin || selectedPlan.montant_min;
                   if (formData.montant_demande && parseFloat(formData.montant_demande) < min) {
                      setFormData(prev => ({ ...prev, montant_demande: String(min) }));
                   }
                }
              }}
              placeholder="100000"
              error={errors.montant_demande}
              required
              icon={DollarSign}
            />
            
            {selectedPlan && (
               <div className="flex flex-wrap gap-2">
                  {(selectedPlan.montantMin || selectedPlan.montant_min) && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({...prev, montant_demande: String(selectedPlan.montantMin || selectedPlan.montant_min)}))}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded-md border border-slate-600 transition-colors flex items-center gap-1"
                    >
                      Min: <span className="font-bold text-white">{(selectedPlan.montantMin || selectedPlan.montant_min).toLocaleString()} FCFA</span>
                    </button>
                  )}
                  {(selectedPlan.montantMax || selectedPlan.montant_max) && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({...prev, montant_demande: String(selectedPlan.montantMax || selectedPlan.montant_max)}))}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded-md border border-slate-600 transition-colors flex items-center gap-1"
                    >
                      Max: <span className="font-bold text-white">{(selectedPlan.montantMax || selectedPlan.montant_max).toLocaleString()} FCFA</span>
                    </button>
                  )}
               </div>
            )}
          </div>

          {/* FREQUENCE DE REMBOURSEMENT - AVANT LA DUREE */}
          <div className="md:col-span-2">
            <SelectField
              label="Frequence de Remboursement"
              name="frequence_remboursement"
              value={formData.frequence_remboursement}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const newFrequence = e.target.value;
                setFormData({
                  ...formData,
                  frequence_remboursement: newFrequence,
                  // Reset duree when frequence changes
                  duree_valeur: '',
                  duree_unite: 'MONTH'
                });
              }}
              options={frequenceOptions}
              required
              error={errors.frequence_remboursement}
              helperText={!formData.frequence_remboursement ? "Selectionnez une frequence pour voir les durees suggerees" : undefined}
            />
          </div>

          {/* DUREE SELECTOR */}
          {formData.frequence_remboursement && (
            <div className="md:col-span-2">
              <DurationSelector
                options={suggestedDurations}
                selectedDuration={parseInt(formData.duree_valeur) || 0}
                selectedUnit={formData.duree_unite}
                amount={parseFloat(formData.montant_demande) || 0}
                interestRate={parseFloat(formData.taux_interet) || suggestedRate}
                frequence={formData.frequence_remboursement}
                onSelect={(val, unit) => setFormData(prev => ({
                  ...prev,
                  duree_valeur: String(val),
                  duree_unite: unit as 'DAY' | 'WEEK' | 'MONTH'
                }))}
                manualValue={formData.duree_valeur}
                onManualChange={(val) => setFormData(prev => ({ ...prev, duree_valeur: val }))}
                manualUnit={formData.duree_unite}
                onUnitChange={(unit) => setFormData(prev => ({ ...prev, duree_unite: unit as 'DAY' | 'WEEK' | 'MONTH' }))}
                validationResult={durationValidation}
                calculateInstallment={calculateInstallment}
                planColor={selectedPlan ? 'border-teal-500 bg-teal-600' : undefined}
              />
            </div>
          )}

          {/* Taux propose */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <TrendingUp size={16} className="inline mr-2" />
              Taux propose (%) *
              {selectedPlan && (
                <span className="text-teal-400 text-xs ml-2 font-normal">
                  (Plan: {selectedPlan.nom})
                </span>
              )}
            </label>
            <div className={`w-full border rounded-lg px-4 py-2 text-white h-11 flex items-center ${
              selectedPlan 
                ? 'bg-teal-500/20 border-teal-500/50' 
                : 'bg-slate-700 border-slate-600'
            }`}>
              {selectedPlan 
                ? `${selectedPlan.tauxInteret || selectedPlan.taux_interet} %`
                : `${suggestedRate.toFixed(1)} %`
              }
            </div>
          </div>

          {/* Frais de dossier du plan - Affiché uniquement si un plan avec frais est sélectionné */}
          {selectedPlan && (selectedPlan.fraisDossier || selectedPlan.frais_dossier) && (
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <DollarSign size={16} className="inline mr-2" />
                Frais de dossier
                <span className="text-orange-400 text-xs ml-2 font-normal">
                  (Défini par le plan)
                </span>
              </label>
              <div className="w-full bg-orange-500/20 border border-orange-500/50 rounded-lg px-4 py-2 text-orange-300 h-11 flex items-center font-semibold">
                {Number(selectedPlan.fraisDossier || selectedPlan.frais_dossier).toLocaleString()} FCFA
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Ce montant sera demandé lors du paiement des frais d'engagement
              </p>
            </div>
          )}

          {/* Override taux */}
          {canOverrideRate && (
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rateOverrideEnabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRateOverrideEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                />
                Ajuster le taux propose
              </label>
            </div>
          )}

          {canOverrideRate && rateOverrideEnabled && (
            <>
              <FormField
                label="Taux ajuste (%)"
                name="taux_interet"
                type="number"
                step="0.1"
                value={formData.taux_interet ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, taux_interet: e.target.value })}
                error={errors.taux_interet}
                required
                icon={TrendingUp}
              />

              <div className="md:col-span-2">
                <FormField
                  label="Motif de l'ajustement"
                  name="taux_override_reason"
                  value={rateOverrideReason ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRateOverrideReason(e.target.value)}
                  placeholder="Ex: dossier prioritaire, garantie solide"
                  error={errors.taux_override_reason}
                  required
                />
              </div>
            </>
          )}

          {/* Revenus et Charges */}
          <div className="md:col-span-2 space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-300">
                    <TrendingUp size={16} className="inline mr-2" />
                    {formData.type_revenu === 'DAILY' ? 'Revenu Journalier' : 'Revenus Mensuels'} *
                  </label>
                  <div className="flex bg-slate-700/50 p-0.5 rounded-lg border border-slate-600/50">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type_revenu: 'MONTHLY' })}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        formData.type_revenu === 'MONTHLY'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mensuel
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type_revenu: 'DAILY' })}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        formData.type_revenu === 'DAILY'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Journalier
                    </button>
                  </div>
                </div>
 
                {formData.type_revenu === 'DAILY' ? (
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      name="revenu_journalier"
                      type="number"
                      value={formData.revenu_journalier}
                      onChange={(e) => {
                        const journalier = e.target.value;
                        const mensuel = journalier ? (parseFloat(journalier) * 26).toString() : '';
                        setFormData({
                          ...formData,
                          revenu_journalier: journalier,
                          revenus_mensuels: mensuel
                        });
                      }}
                      placeholder="10000"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg py-2 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                ) : (
                  <div className="relative">
                     <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input
                      name="revenus_mensuels"
                      type="number"
                      value={formData.revenus_mensuels}
                      onChange={(e) => setFormData({ ...formData, revenus_mensuels: e.target.value })}
                      placeholder="50000"
                      className={`w-full bg-slate-700/50 border ${errors.revenus_mensuels ? 'border-red-500' : 'border-slate-600'} rounded-lg py-2 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                    />
                  </div>
                )}
                {errors.revenus_mensuels && <p className="text-red-400 text-xs mt-1">{errors.revenus_mensuels}</p>}

                {formData.type_revenu === 'Journalier' && formData.revenu_journalier && (
                  <div className="text-xs text-blue-400 flex items-center gap-1 mt-1 bg-blue-500/10 px-2 py-1 rounded w-fit">
                    <span>Est. mensuel (26j):</span>
                    <span className="font-bold">{(parseFloat(formData.revenu_journalier) * 26).toLocaleString()} FCFA</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-300 h-[26px] flex items-center">
                  Charges Mensuelles (FCFA)
                </label>
                <div className="relative">
                  <input
                    name="charges_mensuelles"
                    type="number"
                    value={formData.charges_mensuelles}
                    onChange={(e) => setFormData({ ...formData, charges_mensuelles: e.target.value })}
                    placeholder="20000"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          </div>



          {/* Objet du credit */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <FileText size={16} className="inline mr-2" />
              Objet du Credit *
            </label>
            <textarea
              value={formData.objet_credit}
              onChange={(e) => setFormData({ ...formData, objet_credit: e.target.value })}
              className={`w-full bg-slate-700 border ${errors.objet_credit ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              rows={3}
              placeholder="Details de l'utilisation des fonds..."
            />
            {errors.objet_credit && <p className="text-red-400 text-sm mt-1">{errors.objet_credit}</p>}
          </div>
        </div>

        {/* Analyse Previsionnelle */}
        {formData.montant_demande && formData.duree_valeur && formData.frequence_remboursement && (
          <div className="bg-slate-700/50 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Analyse Previsionnelle</h3>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Montant Total a Rembourser</div>
                <div className="text-2xl font-bold text-white">{calculatedData.montantTotal.toLocaleString()} FCFA</div>
                <div className="text-xs text-slate-400 mt-1">
                  Capital: {parseFloat(formData.montant_demande).toLocaleString()} FCFA +
                  Interets: {(calculatedData.montantTotal - parseFloat(formData.montant_demande || '0')).toLocaleString()} FCFA
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">
                  Montant par {getFrequenceEcheanceLabel()}
                </div>
                <div className="text-2xl font-bold text-green-400">{Math.round(calculatedData.montantEcheance).toLocaleString()} FCFA</div>
                <div className="text-xs text-slate-400 mt-1">
                  {calculatedData.nombreEcheances} paiements
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Capacite de Remboursement</div>
                <div className="text-2xl font-bold text-cyan-400">{calculatedData.capaciteRemboursement.toLocaleString()} FCFA</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Taux d'Endettement</div>
                <div className={`text-2xl font-bold ${calculatedData.tauxEndettement > 50 ? 'text-red-400' : calculatedData.tauxEndettement > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {calculatedData.tauxEndettement.toFixed(1)}%
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Analyse de Solvabilité (Detailed) */}
        {calculatedData.montantEcheance > 0 && parseFloat(formData.revenus_mensuels) > 0 && (
            <div className={`mt-4 rounded-xl p-4 border ${
                calculatedData.tauxEndettement > 50 
                  ? 'bg-red-500/10 border-red-500/30' 
                  : calculatedData.tauxEndettement > 35 
                    ? 'bg-amber-500/10 border-amber-500/30' 
                    : 'bg-emerald-500/10 border-emerald-500/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <TrendingUp size={16} />
                    Analyse de Solvabilité
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    calculatedData.tauxEndettement > 50 
                      ? 'bg-red-500/20 text-red-400' 
                      : calculatedData.tauxEndettement > 35 
                        ? 'bg-amber-500/20 text-amber-400' 
                        : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {calculatedData.tauxEndettement > 50 
                      ? '⚠️ Risque élevé' 
                      : calculatedData.tauxEndettement > 35 
                        ? '⚡ Risque modéré' 
                        : '✓ Acceptable'}
                  </span>
                </div>
                
                {/* Barre de progression du taux d'endettement */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Taux d'endettement</span>
                    <span className={`font-bold ${
                      calculatedData.tauxEndettement > 50 
                        ? 'text-red-400' 
                        : calculatedData.tauxEndettement > 35 
                          ? 'text-amber-400' 
                          : 'text-emerald-400'
                    }`}>
                      {calculatedData.tauxEndettement.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        calculatedData.tauxEndettement > 50 
                          ? 'bg-red-500' 
                          : calculatedData.tauxEndettement > 35 
                            ? 'bg-amber-500' 
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(calculatedData.tauxEndettement, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0%</span>
                    <span className="text-amber-500/70">35% (Attention)</span>
                    <span className="text-red-500/70">50% (Max)</span>
                  </div>
                </div>

                {/* Commentaire d'analyse */}
                <p className={`text-xs leading-relaxed ${
                  calculatedData.tauxEndettement > 50 
                    ? 'text-red-300' 
                    : calculatedData.tauxEndettement > 35 
                      ? 'text-amber-300' 
                      : 'text-emerald-300'
                }`}>
                  {calculatedData.tauxEndettement > 50 
                    ? `⛔ Le client consacrerait ${calculatedData.tauxEndettement.toFixed(1)}% de ses revenus au remboursement. Ce niveau dépasse le seuil acceptable (50%) et expose à un risque élevé de défaut. La demande ne peut pas être créée.`
                    : calculatedData.tauxEndettement > 35 
                      ? `⚠️ Le taux d'endettement de ${calculatedData.tauxEndettement.toFixed(1)}% est modéré. Le client dispose d'environ ${calculatedData.capaciteRemboursement.toLocaleString()} FCFA après charges. Une enquête approfondie est recommandée.`
                      : `✅ Profil favorable. Le client conserve une marge confortable avec ${calculatedData.capaciteRemboursement.toLocaleString()} FCFA de capacité de remboursement mensuelle.`
                  }
                </p>
            </div>
        )}
      </form>
    </Modal>
  );
}
