import React, { useState, useEffect, useMemo } from 'react';
import { X, Unlock, DollarSign, Lock, Shield, Check, KeyRound, AlertCircle, Monitor, Wallet, Clock, User, CheckCircle2, Loader2, Send, Package, ArrowRight, Ban, Banknote, Plus } from 'lucide-react';
import { Card, Button, IconButton, LoadingSpinner, Badge } from '../../ui';
import SelectField from '../../ui/SelectField';
import { usePermissions } from '../../auth/ProtectedFeature';
import { authService } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { sessionCaisseApi, caisseAccessControlApi } from '../../../lib/api-client';
import { SystemRole, isAdminRole, normalizeRole } from '@shared/types/roles';
import { useQueryClient } from '@tanstack/react-query';

interface CaisseOuvertureProps {
  onClose: () => void;
  onSuccess: () => void;
  pendingSession?: any; // Session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED)
}

interface Caisse {
  id: string;
  nom: string;
  type: string;
  statut: string;
  isOccupied: boolean;
  occupiedBy?: string;
  occupiedByName?: string;
  solde: string;
  assignments?: string[];
  lastSession?: {
    closedAt?: string;
    closed_at?: string;
    solde_reel?: number;
    caissier_nom?: string;
  };
}

interface Agence {
  id: string;
  nom: string;
}

type WorkflowStep = 'auth' | 'choice' | 'waiting' | 'confirm';
type OpeningMode = 'request' | 'direct'; // request = demander au coffre, direct = avec fonds existants

/**
 * Workflow Sécurisé d'Ouverture de Caisse (Coffre → Caisse)
 *
 * Nouveau flux avec fonds reporté:
 * - Si la caisse a un solde > 0: proposer le choix (direct ou avec complément)
 * - Ouverture directe: PIN → Session ouverte immédiatement
 * - Avec complément: Phase A → Phase B → Phase C (workflow coffre)
 */
export default function CaisseOuverture({ onClose, onSuccess, pendingSession }: CaisseOuvertureProps) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const currentUser = authService.getCurrentUser();
  const isAdmin = isAdminRole(currentUser?.role);

  // Déterminer l'étape initiale basée sur la session en attente
  const getInitialStep = (): WorkflowStep => {
    if (pendingSession) {
      if (pendingSession.statut === 'REQUESTING_FUNDS') return 'waiting';
      if (pendingSession.statut === 'FUNDS_DISPATCHED') return 'confirm';
    }
    return 'auth';
  };

  const [step, setStep] = useState<WorkflowStep>(getInitialStep());
  const [loading, setLoading] = useState(false);
  const [loadingCaisses, setLoadingCaisses] = useState(true);

  // Update step when pendingSession changes (e.g., from REQUESTING_FUNDS to FUNDS_DISPATCHED)
  useEffect(() => {
    if (!pendingSession) return;

    // If we're in waiting step and status changed to FUNDS_DISPATCHED, move to confirm
    if (step === 'waiting' && pendingSession.statut === 'FUNDS_DISPATCHED') {
      setStep('confirm');
      setSession(pendingSession);
    }
    // If pendingSession appears while we're on auth step, jump to appropriate step
    else if (step === 'auth') {
      if (pendingSession.statut === 'REQUESTING_FUNDS') {
        setStep('waiting');
        setSession(pendingSession);
      } else if (pendingSession.statut === 'FUNDS_DISPATCHED') {
        setStep('confirm');
        setSession(pendingSession);
      }
    }
  }, [pendingSession, step]);

  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string>('');

  const [agences, setAgences] = useState<Agence[]>([]);
  const [selectedAgenceId, setSelectedAgenceId] = useState<string>(currentUser?.agenceId || '');

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [authData, setAuthData] = useState({ pin: '' });
  const [montantDemande, setMontantDemande] = useState<number>(500000); // Montant par défaut
  const [observations, setObservations] = useState('');

  // Suggestions de montant pour aller vite (POS Friendly)
  const quickAmounts = [50000, 100000, 250000, 500000];

  // Session créée après Phase A
  const [session, setSession] = useState<any>(pendingSession || null);

  // Billetage pour Phase C
  const [billetage, setBilletage] = useState({
    billets_10000: 0, billets_5000: 0, billets_2000: 0, billets_1000: 0, billets_500: 0,
    billets_200: 0, billets_100: 0, billets_50: 0,
    pieces_500: 0, pieces_200: 0, pieces_100: 0, pieces_50: 0,
    pieces_25: 0, pieces_20: 0, pieces_10: 0, pieces_5: 0, pieces_1: 0,
  });

  // Mode d'ouverture sélectionné (direct = sans coffre, request = avec coffre)
  const [openingMode, setOpeningMode] = useState<OpeningMode>('direct');

  // Code de secours superviseur
  const [showSupervisorCode, setShowSupervisorCode] = useState(false);
  const [supervisorCode, setSupervisorCode] = useState('');
  const [supervisorValidated, setSupervisorValidated] = useState(false);
  const [supervisorLoading, setSupervisorLoading] = useState(false);
  const [supervisorError, setSupervisorError] = useState('');

  // Charger les agences pour Admin
  useEffect(() => {
    if (isAdmin) {
      const fetchAgences = async () => {
        try {
          const res = await api.get<Agence[]>('/agences');
          if (res.data) {
            setAgences(res.data);
            if (!selectedAgenceId && res.data.length > 0) {
              setSelectedAgenceId(res.data[0].id);
            }
          }
        } catch (e) {
          console.error("Erreur chargement agences", e);
        }
      };
      fetchAgences();
    }
  }, [isAdmin, selectedAgenceId]);

  // Charger les caisses quand l'agence change
  useEffect(() => {
    const fetchCaisses = async () => {
      if (!selectedAgenceId) {
        if (!isAdmin) {
          setError("Impossible de charger les caisses : Agence non identifiée.");
        }
        setLoadingCaisses(false);
        return;
      }
      setLoadingCaisses(true);
      try {
        const res = await api.get<Caisse[]>(`/agences/${selectedAgenceId}/caisses`);
        if (res.data) {
          let availableCaisses = res.data;

          const normalizedRole = normalizeRole(currentUser?.role);
          const isManager = normalizedRole === SystemRole.CHEF_AGENCE || normalizedRole === SystemRole.ADMIN;

          if (!isManager && currentUser?.id) {
            availableCaisses = res.data.filter(c =>
              c.assignments && c.assignments.includes(currentUser.id)
            );
          }

          setCaisses(availableCaisses);

          if (availableCaisses.length === 1) {
            setSelectedCaisseId(availableCaisses[0].id);
          } else {
            setSelectedCaisseId('');
          }

          const firstAvailable = availableCaisses.find(c => !c.isOccupied && c.statut !== 'CLOSED');
          if (firstAvailable) setSelectedCaisseId(firstAvailable.id);
        }
      } catch (e) {
        console.error("Erreur chargement caisses", e);
        setError("Impossible de charger la liste des caisses.");
      } finally {
        setLoadingCaisses(false);
      }
    };

    if (step === 'auth') {
      fetchCaisses();
    }
  }, [selectedAgenceId, isAdmin, step, currentUser?.id, currentUser?.role]);

  const calculerTotal = () => {
    return (
      billetage.billets_10000 * 10000 + billetage.billets_5000 * 5000 +
      billetage.billets_2000 * 2000 + billetage.billets_1000 * 1000 +
      billetage.billets_500 * 500 + billetage.billets_200 * 200 +
      billetage.pieces_500 * 500 + billetage.pieces_200 * 200 +
      billetage.pieces_100 * 100 + billetage.pieces_50 * 50 +
      billetage.pieces_25 * 25 + billetage.pieces_20 * 20 +
      billetage.pieces_10 * 10 + billetage.pieces_5 * 5 +
      billetage.pieces_1 * 1
    );
  };

  // ========== VALIDATION CODE SUPERVISEUR ==========
  const handleValidateSupervisorCode = async () => {
    if (!supervisorCode || supervisorCode.length < 6) {
      setSupervisorError('Code invalide (minimum 6 caractères)');
      return;
    }
    setSupervisorLoading(true);
    setSupervisorError('');
    try {
      const result = await caisseAccessControlApi.validateCode(
        supervisorCode,
        selectedCaisseId || undefined,
        selectedAgenceId || currentUser?.agenceId
      );
      if (result.success) {
        setSupervisorValidated(true);
        setSupervisorError('');
      } else {
        setSupervisorError(result.error || 'Code invalide ou expiré');
      }
    } catch (err: any) {
      setSupervisorError(err.message || 'Erreur de validation');
    } finally {
      setSupervisorLoading(false);
    }
  };

  // ========== PHASE A: Authentification + Demande de fonds ==========
  const handleRequestOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!selectedCaisseId) {
      setError("Veuillez sélectionner une caisse physique.");
      setLoading(false);
      return;
    }

    if (!authData.pin || authData.pin.length < 4) {
      setError("Veuillez entrer votre PIN à 6 chiffres.");
      setLoading(false);
      return;
    }

    if (montantDemande <= 0) {
      setError("Le montant demandé doit être positif.");
      setLoading(false);
      return;
    }

    try {
      // 1. Vérifier le PIN
      const pinRes = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: authData.pin })
      });

      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        if (pinData?.requirePinSetup) {
          setError('Aucun PIN configuré. Définissez votre PIN dans Paramètres > Sécurité.');
        } else {
          setError(pinData?.error || 'PIN incorrect.');
        }
        setLoading(false);
        return;
      }

      // 2. Soumettre la demande d'ouverture
      const result = await sessionCaisseApi.requestOpening({
        caisseId: selectedCaisseId,
        montantDemande,
        agenceId: selectedAgenceId || currentUser?.agenceId,
        observations,
        ...(supervisorValidated && { supervisorOverride: true }),
      });

      setSession(result.session);
      setSuccessMessage('Demande soumise ! En attente de validation par le coffre.');

      // Passer à l'étape d'attente
      setTimeout(() => {
        setStep('waiting');
        setSuccessMessage('');
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Erreur lors de la soumission de la demande.");
    } finally {
      setLoading(false);
    }
  };

  // ========== PHASE B: En attente (polling ou WebSocket pour transition) ==========
  useEffect(() => {
    if (step !== 'waiting') return;

    const checkStatus = async () => {
      try {
        const pending = await sessionCaisseApi.getPending();
        if (pending) {
          setSession(pending);
          if (pending.statut === 'FUNDS_DISPATCHED') {
            setStep('confirm');
          }
        } else {
          // Session annulée ou rejetée
          setError("La demande a été annulée ou rejetée. Veuillez réessayer.");
          setStep('auth');
        }
      } catch (e) {
        console.error("Erreur vérification statut:", e);
      }
    };

    // Polling toutes les 5 secondes
    const interval = setInterval(checkStatus, 5000);
    checkStatus(); // Vérifier immédiatement

    return () => clearInterval(interval);
  }, [step]);

  // ========== PHASE C: Confirmation de réception ==========
  const handleConfirmReception = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const totalCalcule = calculerTotal();

    if (totalCalcule <= 0) {
      setError("Veuillez saisir le billetage des fonds reçus.");
      setLoading(false);
      return;
    }

    try {
      const result = await sessionCaisseApi.receiveFunds(session.id, {
        billetageReception: billetage,
        observations,
      });

      setSuccessMessage('Session ouverte avec succès !');
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Erreur lors de la confirmation.");
    } finally {
      setLoading(false);
    }
  };

  // ========== Annulation de la demande ==========
  const handleCancelRequest = async () => {
    if (!session?.id) return;

    setLoading(true);
    setError('');

    try {
      await sessionCaisseApi.cancelRequest(session.id, "Annulé par le caissier");
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setSuccessMessage('Demande annulée.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'annulation.");
    } finally {
      setLoading(false);
    }
  };

  // Obtenir les détails de la caisse sélectionnée
  const selectedCaisse = useMemo(() =>
    caisses.find(c => c.id === selectedCaisseId),
    [caisses, selectedCaisseId]
  );

  // Calculer le solde existant de la caisse (fonds reporté)
  const soldeExistant = useMemo(() => {
    if (!selectedCaisse) return 0;
    return Number(selectedCaisse.solde || 0);
  }, [selectedCaisse]);

  // La caisse a-t-elle des fonds reportés ?
  const hasFondsReporte = soldeExistant > 0;

  // ========== OUVERTURE DIRECTE (avec fonds existants) ==========
  const handleDirectOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!selectedCaisseId) {
      setError("Veuillez sélectionner une caisse physique.");
      setLoading(false);
      return;
    }

    if (!authData.pin || authData.pin.length < 4) {
      setError("Veuillez entrer votre PIN à 6 chiffres.");
      setLoading(false);
      return;
    }

    try {
      // 1. Vérifier le PIN
      const pinRes = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: authData.pin })
      });

      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        if (pinData?.requirePinSetup) {
          setError('Aucun PIN configuré. Définissez votre PIN dans Paramètres > Sécurité.');
        } else {
          setError(pinData?.error || 'PIN incorrect.');
        }
        setLoading(false);
        return;
      }

      // 2. Ouverture directe avec fonds existants
      const result = await sessionCaisseApi.openDirect({
        caisseId: selectedCaisseId,
        agenceId: selectedAgenceId || currentUser?.agenceId,
        observations,
        ...(supervisorValidated && { supervisorOverride: true }),
      });

      setSession(result.session);
      setSuccessMessage('Session ouverte avec succès !');
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Erreur lors de l'ouverture directe.");
    } finally {
      setLoading(false);
    }
  };

  // Formater les montants
  const formatMoney = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      {/* Container Modale "Zero Scroll" */}
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[600px]">
        
        {/* COLONNE GAUCHE : CONTEXTE & INFO (Visuel) */}
        <div className="md:w-1/3 bg-slate-900 p-6 flex flex-col border-r border-slate-800 relative">
           
           {/* Header Context */}
           <div className="mb-8">
             <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
               <Shield className="h-6 w-6" />
               <span>Ouverture Sécurisée</span>
             </div>
             <p className="text-xs text-slate-400 leading-relaxed">
               Ouvrez votre caisse directement ou demandez un approvisionnement au coffre-fort.
             </p>
           </div>

           {/* Stepper Vertical */}
           <div className="flex-1 space-y-6">
             <StepItem 
               number="1" 
               label="Configuration" 
               active={step === 'auth'} 
               completed={step === 'waiting' || step === 'confirm'} 
             />
             <StepItem 
               number="2" 
               label="Validation Coffre" 
               active={step === 'waiting'} 
               completed={step === 'confirm'} 
             />
             <StepItem 
               number="3" 
               label="Réception & Confirmation" 
               active={step === 'confirm'} 
               completed={false} 
             />
           </div>

           {/* Agence Info */}
           <div className="mt-auto pt-6 border-t border-slate-800">
             <div className="flex items-center gap-3 opacity-70">
                <Monitor className="text-slate-500 h-5 w-5" />
                <div>
                   <div className="text-xs text-slate-500 uppercase">Agence</div>
                   <div className="text-sm font-bold text-white">
                     {agences.find(a => a.id === selectedAgenceId)?.nom || 'Siège Principal'}
                   </div>
                </div>
             </div>
           </div>
        </div>

        {/* COLONNE DROITE : ACTION (Interactive) */}
        <div className="flex-1 p-6 md:p-8 flex flex-col bg-slate-950 overflow-y-auto">
           
           <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {step === 'auth' && 'Initialisation Caisse'}
                  {step === 'waiting' && 'Vérification en cours...'}
                  {step === 'confirm' && 'Confirmation des fonds'}
                </h2>
                <p className="text-sm text-slate-500">
                  {step === 'auth' && 'Sélectionnez votre caisse et le mode d\'ouverture.'}
                  {step === 'waiting' && 'En attente de l\'approbation du responsable.'}
                  {step === 'confirm' && 'Veuillez confirmer le billetage reçu.'}
                </p>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X size={24}/>
              </button>
           </div>

           {/* Messages d'erreur/succès */}
           {error && (
             <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-200 text-sm animate-in slide-in-from-top-2">
               <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
               <span>{error}</span>
             </div>
           )}

           {successMessage && (
             <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/50 rounded-xl flex items-center gap-3 text-emerald-200 text-sm animate-in slide-in-from-top-2">
               <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
               <span>{successMessage}</span>
             </div>
           )}

           <div className="flex-1">
              {/* PHASE A: Demande de fonds */}
              {step === 'auth' && (
                <div className="space-y-6">
                  {/* 1. SÉLECTION AGENCE & CAISSE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isAdmin && (
                      <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-500 uppercase ml-1">Agence</label>
                         <div className="relative">
                            <Monitor className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <select 
                              value={selectedAgenceId}
                              onChange={(e) => setSelectedAgenceId(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-10 py-3 text-white appearance-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer hover:bg-slate-800"
                            >
                              {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                              <span className="text-slate-500">▼</span>
                            </div>
                         </div>
                      </div>
                    )}

                    <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sélectionner votre caisse</label>
                       <div className="relative">
                          <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                          {loadingCaisses ? (
                            <div className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-400 flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Chargement...</span>
                            </div>
                          ) : (
                            <>
                              <select 
                                value={selectedCaisseId}
                                onChange={(e) => setSelectedCaisseId(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-10 py-3 text-white appearance-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer hover:bg-slate-800"
                              >
                                <option value="">Choisir une caisse</option>
                                {caisses.map(c => (
                                  <option key={c.id} value={c.id} disabled={c.isOccupied}>
                                    {c.nom} {c.isOccupied ? '(Occupée)' : ''}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <span className="text-slate-500">▼</span>
                              </div>
                            </>
                          )}
                       </div>
                    </div>
                  </div>

                  {/* CHOIX DU MODE D'OUVERTURE */}
                  {selectedCaisseId && (
                    <div className={`p-4 ${hasFondsReporte ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/50 border-slate-700'} border rounded-xl space-y-4 animate-in slide-in-from-top-2`}>
                      {hasFondsReporte && (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Banknote className="h-5 w-5 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-amber-200">Fonds reporté disponible</p>
                            <p className="text-xs text-amber-300/70">
                              Cette caisse contient <span className="font-bold text-amber-200">{formatMoney(soldeExistant)}</span> de la session précédente.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setOpeningMode('direct')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            openingMode === 'direct'
                              ? 'bg-emerald-500/20 border-emerald-500 ring-1 ring-emerald-500'
                              : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Unlock className={`h-4 w-4 ${openingMode === 'direct' ? 'text-emerald-400' : 'text-slate-400'}`} />
                            <span className={`text-sm font-semibold ${openingMode === 'direct' ? 'text-emerald-300' : 'text-slate-300'}`}>
                              {hasFondsReporte ? 'Ouverture rapide' : 'Ouverture à vide'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {hasFondsReporte
                              ? `Ouvrir avec le fonds existant (${formatMoney(soldeExistant)})`
                              : 'Ouvrir la caisse à 0 FCFA sans approvisionnement'}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setOpeningMode('request')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            openingMode === 'request'
                              ? 'bg-cyan-500/20 border-cyan-500 ring-1 ring-cyan-500'
                              : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Plus className={`h-4 w-4 ${openingMode === 'request' ? 'text-cyan-400' : 'text-slate-400'}`} />
                            <span className={`text-sm font-semibold ${openingMode === 'request' ? 'text-cyan-300' : 'text-slate-300'}`}>
                              {hasFondsReporte ? 'Avec complément' : 'Demander au coffre'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {hasFondsReporte
                              ? 'Demander des fonds supplémentaires au coffre'
                              : 'Demander un approvisionnement au coffre-fort'}
                          </p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. MONTANT DOTATION - uniquement si mode "request" (demande au coffre) */}
                  {openingMode === 'request' && (
                  <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-500 uppercase ml-1">Dotation souhaitée (FCFA)</label>
                     
                     {/* Input Géant */}
                     <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xl group-focus-within:text-emerald-400">F</span>
                        <input 
                          type="number" 
                          value={montantDemande}
                          onChange={(e) => setMontantDemande(Number(e.target.value))}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-5 text-3xl font-bold text-white placeholder-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                        />
                     </div>

                     {/* Chips Rapides */}
                     <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {quickAmounts.map(amt => (
                          <button 
                            key={amt}
                            type="button"
                            onClick={() => setMontantDemande(amt)}
                            className={`px-4 py-2 bg-slate-900 border rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                              montantDemande === amt 
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' 
                                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                            }`}
                          >
                            {new Intl.NumberFormat('fr-FR').format(amt)}
                          </button>
                        ))}
                     </div>
                  </div>
                  )}

                  {/* 3. PIN SÉCURITÉ */}
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-500 uppercase ml-1">Code PIN Agent</label>
                     <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="password" 
                          placeholder="••••••"
                          maxLength={6}
                          value={authData.pin}
                          onChange={(e) => setAuthData({ ...authData, pin: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white tracking-[1em] font-mono text-xl focus:border-emerald-500 outline-none transition-all placeholder-slate-800"
                        />
                        {authData.pin.length === 6 && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 animate-in zoom-in">
                            <CheckCircle2 size={24} />
                          </div>
                        )}
                     </div>
                  </div>

                  {/* 4. CODE DE SECOURS SUPERVISEUR (optionnel) */}
                  <div className="border-t border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowSupervisorCode(!showSupervisorCode)}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <KeyRound size={14} />
                      <span>Code de secours superviseur</span>
                      <span className="text-[10px]">{showSupervisorCode ? '▲' : '▼'}</span>
                      {supervisorValidated && (
                        <span className="ml-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold">
                          Autorisé
                        </span>
                      )}
                    </button>

                    {showSupervisorCode && (
                      <div className="mt-3 space-y-2 animate-in slide-in-from-top-2">
                        <div className="relative flex gap-2">
                          <div className="relative flex-1">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                              type="text"
                              placeholder="Code 8 caractères"
                              maxLength={8}
                              value={supervisorCode}
                              onChange={(e) => {
                                setSupervisorCode(e.target.value.toUpperCase());
                                setSupervisorValidated(false);
                                setSupervisorError('');
                              }}
                              disabled={supervisorValidated}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-white font-mono tracking-widest text-sm focus:border-amber-500 outline-none transition-all placeholder-slate-700 disabled:opacity-50"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleValidateSupervisorCode}
                            disabled={supervisorLoading || supervisorValidated || supervisorCode.length < 6}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                          >
                            {supervisorLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : supervisorValidated ? (
                              <Check size={14} />
                            ) : (
                              'Valider'
                            )}
                          </button>
                        </div>
                        {supervisorError && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle size={12} />
                            {supervisorError}
                          </p>
                        )}
                        {supervisorValidated && (
                          <p className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Autorisation superviseur accordée
                          </p>
                        )}
                        <p className="text-[10px] text-slate-600">
                          Demandez ce code à votre superviseur pour un accès d'urgence.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PHASE B: En attente */}
              {step === 'waiting' && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in-95">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full animate-ping" />
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full">
                      <Clock className="h-10 w-10 text-emerald-400" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-lg font-bold text-white">Transmission au coffre...</h3>
                    <p className="text-sm text-slate-400">
                      Veuillez patienter pendant que le responsable valide votre dotation de 
                      <span className="text-white font-bold mx-1">
                        {Number(session?.montantDemande || montantDemande).toLocaleString('fr-FR')} FCFA
                      </span>
                    </p>
                  </div>

                  <div className="w-full max-w-xs bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-left space-y-3">
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-slate-500">Caisse</span>
                       <span className="text-white font-medium">{session?.caisse?.nom || selectedCaisse?.nom}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-slate-500">Statut</span>
                       <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-full text-[10px] uppercase font-bold tracking-wider">
                         Validation en cours
                       </span>
                    </div>
                  </div>

                  <button 
                    onClick={handleCancelRequest}
                    disabled={loading}
                    className="text-slate-500 hover:text-red-400 text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban size={14} />}
                    Annuler la demande
                  </button>
                </div>
              )}

              {/* PHASE C: Confirmation de réception */}
              {step === 'confirm' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/20 border-2 border-emerald-500/30 rounded-xl flex items-center justify-center">
                      <Package className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                       <div className="text-xs font-bold text-emerald-500/70 uppercase">Fonds Prêts</div>
                       <div className="text-xl font-black text-white">
                         {Number(session?.montantDemande || montantDemande).toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-500">FCFA</span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Billetage de réception</h4>
                      <div className="text-xs font-bold text-emerald-400">
                        Total compté: {calculerTotal().toLocaleString()} F
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5].map((value) => {
                        const isBillet = value >= 500;
                        const key = (isBillet ? `billets_${value}` : `pieces_${value}`) as keyof typeof billetage;
                        // Special case for 500 which can be both, but we use billets_500 in state
                        const stateKey = value === 500 ? 'billets_500' : key;
                        
                        return (
                          <div key={value} className="bg-slate-900 border border-slate-800 rounded-xl p-2 focus-within:border-emerald-500/50 transition-all">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">{value} F</label>
                            <input 
                              type="number" 
                              value={billetage[stateKey as keyof typeof billetage] || ''}
                              onChange={(e) => setBilletage({ ...billetage, [stateKey]: Number(e.target.value) || 0 })}
                              className="w-full bg-transparent text-white font-bold text-sm outline-none px-1"
                              placeholder="0"
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Alerte écart */}
                    {Math.abs(calculerTotal() - Number(session?.montantDemande || montantDemande)) > 0 && calculerTotal() > 0 && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-200 text-xs">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span>Écart de {Math.abs(calculerTotal() - Number(session?.montantDemande || montantDemande)).toLocaleString()} F.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
           </div>

           {/* FOOTER ACTION */}
           <div className="mt-auto pt-6 border-t border-slate-800">
              {step === 'auth' && (
                <button
                  onClick={openingMode === 'direct' ? handleDirectOpening : handleRequestOpening}
                  disabled={loading || !selectedCaisseId || authData.pin.length < 4}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 ${
                    openingMode === 'direct'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20 text-white'
                  }`}
                >
                   {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                     <>
                       <span>
                         {openingMode === 'direct'
                           ? 'Ouvrir la session'
                           : 'Envoyer la demande'}
                       </span>
                       {openingMode === 'direct'
                         ? <Unlock size={20} />
                         : <ArrowRight size={20} />}
                     </>
                   )}
                </button>
              )}

              {step === 'confirm' && (
                <div className="space-y-3">
                  <button
                    onClick={handleConfirmReception}
                    disabled={loading || calculerTotal() <= 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
                  >
                     {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                       <>
                         <span>Confirmer & Ouvrir</span>
                         <Check size={20} />
                       </>
                     )}
                  </button>
                  <button
                    onClick={handleCancelRequest}
                    disabled={loading}
                    className="w-full text-slate-500 hover:text-red-400 text-xs font-bold transition-colors flex items-center justify-center gap-2 py-2"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban size={14} />}
                    Annuler l'ouverture et restituer les fonds au coffre
                  </button>
                </div>
              )}
           </div>

        </div>
      </div>
    </div>
  );
}

// Composant Visuel Stepper
function StepItem({ number, label, active, completed }: { number: string; label: string; active: boolean; completed: boolean }) {
  return (
    <div className={`flex items-center gap-4 transition-all duration-300 ${active || completed ? 'opacity-100' : 'opacity-30'}`}>
       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm border-2 transition-all ${
         completed 
           ? 'bg-emerald-500 border-emerald-500 text-white' 
           : active 
             ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
             : 'bg-transparent border-slate-700 text-slate-500'
       }`}>
         {completed ? <Check size={18} /> : number}
       </div>
       <div className="flex flex-col">
         <span className={`text-[10px] uppercase font-bold tracking-wider ${active ? 'text-emerald-500' : 'text-slate-500'}`}>Étape {number}</span>
         <span className={`text-sm font-bold ${active || completed ? 'text-white' : 'text-slate-500'}`}>{label}</span>
       </div>
    </div>
  )
}
