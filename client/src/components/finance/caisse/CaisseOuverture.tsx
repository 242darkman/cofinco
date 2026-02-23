import React, { useState, useEffect, useMemo } from 'react';
import { X, Unlock, DollarSign, Lock, Shield, Check, KeyRound, AlertCircle, Monitor, Wallet, Clock, User, CheckCircle2, Loader2, Send, Package, ArrowRight, Ban, Banknote, Plus, Eye, EyeOff } from 'lucide-react';
import { Card, Button, IconButton, LoadingSpinner, Badge } from '../../ui';
import SelectField from '../../ui/SelectField';
import { usePermissions } from '../../auth/ProtectedFeature';
import { authService } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { sessionCaisseApi, caisseAccessControlApi, authApi } from '../../../lib/api-client';
import { Actions, Subjects } from '@/lib/casl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import OfflineGuard from '../../shared/OfflineGuard';

interface CaisseOuvertureProps {
  onClose: () => void;
  onSuccess: () => void;
  pendingSession?: Record<string, unknown>; // Session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED)
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
  const { hasPermission, isAdmin, can } = usePermissions();
  const currentUser = authService.getCurrentUser();

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

  // Statut PIN de l'utilisateur (vérifié dynamiquement)
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean | null>(null);
  const [checkingPinStatus, setCheckingPinStatus] = useState(true);

  // Code d'accès (requis si pas de PIN, optionnel sinon)
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState('');
  // Toggle entre PIN et code d'accès (quand l'utilisateur a un PIN)
  const [useAccessCode, setUseAccessCode] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Vérifier si l'utilisateur a un PIN configuré au chargement
  useEffect(() => {
    const checkPinStatus = async () => {
      try {
        const result = await authApi.checkPinStatus();
        setHasPinConfigured(result.hasPinConfigured);
      } catch (err) {
        // En cas d'erreur, on suppose qu'il n'a pas de PIN (plus sécurisé)
        setHasPinConfigured(false);
      } finally {
        setCheckingPinStatus(false);
      }
    };
    checkPinStatus();
  }, []);

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
        } catch {
          // Silently fail - agences will remain empty
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
          // Exclure les coffres-forts — uniquement les caisses physiques
          let availableCaisses = res.data.filter((c: { type?: string }) => c.type !== 'Coffre-Fort');

          const isManager = isAdmin || can(Actions.MANAGE, Subjects.CAISSE);

          if (!isManager && currentUser?.id) {
            availableCaisses = availableCaisses.filter(c =>
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
      } catch {
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

  // ========== VALIDATION CODE D'ACCÈS ==========
  const handleValidateAccessCode = async () => {
    if (!accessCode || accessCode.length < 6) {
      setAccessCodeError('Code invalide (minimum 6 caractères)');
      return;
    }
    setAccessCodeLoading(true);
    setAccessCodeError('');
    try {
      const result = await caisseAccessControlApi.validateCode(
        accessCode,
        selectedCaisseId || undefined,
        selectedAgenceId || currentUser?.agenceId
      );
      if (result.success) {
        setAccessCodeValidated(true);
        setAccessCodeError('');
      } else {
        setAccessCodeError(result.error || 'Code invalide ou expiré');
      }
    } catch (err: unknown) {
      setAccessCodeError(err.message || 'Erreur de validation');
    } finally {
      setAccessCodeLoading(false);
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

    // Validation: soit PIN valide, soit code d'accès validé (mutuellement exclusif)
    if (useAccessCode || !hasPinConfigured) {
      if (!accessCodeValidated) {
        setError("Veuillez valider un code d'accès pour continuer.");
        setLoading(false);
        return;
      }
    } else {
      if (!authData.pin || authData.pin.length < 6) {
        setError("Veuillez entrer votre PIN à 6 chiffres.");
        setLoading(false);
        return;
      }
    }

    if (montantDemande <= 0) {
      setError("Le montant demandé doit être positif.");
      setLoading(false);
      return;
    }

    try {
      // 1. Vérifier le PIN (sauf si mode code d'accès)
      if (!useAccessCode && hasPinConfigured && !accessCodeValidated) {
        const pinRes = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin: authData.pin })
        });

        const pinData = await pinRes.json();
        if (!pinRes.ok) {
          if (pinData?.requirePinSetup) {
            setError('Aucun PIN configuré. Utilisez un code d\'accès ou définissez votre PIN dans Paramètres > Sécurité.');
          } else {
            setError(pinData?.error || 'PIN incorrect.');
          }
          setLoading(false);
          return;
        }
      }

      // 2. Soumettre la demande d'ouverture
      const result = await sessionCaisseApi.requestOpening({
        caisseId: selectedCaisseId,
        montantDemande,
        agenceId: selectedAgenceId || currentUser?.agenceId,
        observations,
        ...((useAccessCode || !hasPinConfigured) && accessCodeValidated && { supervisorOverride: true }),
      });

      setSession(result.session);
      setSuccessMessage('Demande soumise ! En attente de validation par le coffre.');

      // Passer à l'étape d'attente
      setTimeout(() => {
        setStep('waiting');
        setSuccessMessage('');
      }, 1500);

    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : "Erreur lors de la soumission de la demande.");
      setError(msg);
      if (msg.includes('négatif') || msg.includes('NEGATIVE')) {
        setBackendNegativeBalance(true);
      }
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
      } catch {
        // Silently fail - status check is non-critical
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

      setSuccessMessage('Session ouverte');
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Erreur lors de la confirmation."));
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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Erreur lors de l'annulation."));
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

  // Détection de solde négatif pour permettre la correction admin
  // Double détection : via le solde local OU via l'erreur backend
  const [backendNegativeBalance, setBackendNegativeBalance] = useState(false);
  const hasNegativeBalance = soldeExistant < 0 || backendNegativeBalance;
  const [correcting, setCorrecting] = useState(false);

  const handleBalanceCorrection = async () => {
    if (!selectedCaisseId || !isAdmin) return;
    setCorrecting(true);
    setError('');
    try {
      const res = await fetch(`/api/caisses/${selectedCaisseId}/balance-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          newBalance: 0,
          motif: `Correction automatique du solde négatif (${soldeExistant} FCFA) détecté à l'ouverture de session`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la correction');
      toast.success('Solde corrigé', { description: data.message });
      // Recharger les caisses pour mettre à jour le solde affiché
      if (selectedCaisse) {
        selectedCaisse.solde = '0';
      }
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setBackendNegativeBalance(false);
      setError('');
      setSuccessMessage(`Solde remis à 0 FCFA. Vous pouvez maintenant ouvrir la session.`);
    } catch (err: unknown) {
      setError(err.message || 'Erreur lors de la correction du solde');
    } finally {
      setCorrecting(false);
    }
  };

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

    // Validation: soit PIN valide, soit code d'accès validé (mutuellement exclusif)
    if (useAccessCode || !hasPinConfigured) {
      if (!accessCodeValidated) {
        setError("Veuillez valider un code d'accès pour continuer.");
        setLoading(false);
        return;
      }
    } else {
      if (!authData.pin || authData.pin.length < 6) {
        setError("Veuillez entrer votre PIN à 6 chiffres.");
        setLoading(false);
        return;
      }
    }

    try {
      // 1. Vérifier le PIN (sauf si mode code d'accès)
      if (!useAccessCode && hasPinConfigured && !accessCodeValidated) {
        const pinRes = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin: authData.pin })
        });

        const pinData = await pinRes.json();
        if (!pinRes.ok) {
          if (pinData?.requirePinSetup) {
            setError('Aucun PIN configuré. Utilisez un code d\'accès ou définissez votre PIN dans Paramètres > Sécurité.');
          } else {
            setError(pinData?.error || 'PIN incorrect.');
          }
          setLoading(false);
          return;
        }
      }

      // 2. Ouverture directe avec fonds existants
      const result = await sessionCaisseApi.openDirect({
        caisseId: selectedCaisseId,
        agenceId: selectedAgenceId || currentUser?.agenceId,
        observations,
        ...((useAccessCode || !hasPinConfigured) && accessCodeValidated && { supervisorOverride: true }),
      });

      setSession(result.session);
      setSuccessMessage('Session ouverte');
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : "Erreur lors de l'ouverture directe.");
      setError(msg);
      // Détecter l'erreur de solde négatif du backend
      if (msg.includes('négatif') || msg.includes('NEGATIVE')) {
        setBackendNegativeBalance(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Formater les montants
  const formatMoney = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      {/* Container Modale "Zero Scroll" */}
      <div className="w-full max-w-4xl bg-surface-base border border-edge rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[600px]">
        
        {/* COLONNE GAUCHE : CONTEXTE & INFO (Visuel) */}
        <div className="md:w-1/3 bg-surface-base p-6 flex flex-col border-r border-edge relative">
           
           {/* Header Context */}
           <div className="mb-8">
             <div className="flex items-center gap-2 text-status-success font-bold mb-2">
               <Shield className="h-6 w-6" />
               <span>Ouverture Sécurisée</span>
             </div>
             <p className="text-xs text-content-muted leading-relaxed">
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
           <div className="mt-auto pt-6 border-t border-edge">
             <div className="flex items-center gap-3 opacity-70">
                <Monitor className="text-content-muted h-5 w-5" />
                <div>
                   <div className="text-xs text-content-muted uppercase">Agence</div>
                   <div className="text-sm font-bold text-content-primary">
                     {agences.find(a => a.id === selectedAgenceId)?.nom || 'Siège Principal'}
                   </div>
                </div>
             </div>
           </div>
        </div>

        {/* COLONNE DROITE : ACTION (Interactive) */}
        <div className="flex-1 p-6 md:p-8 flex flex-col bg-surface-base overflow-y-auto">
           
           <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-content-primary">
                  {step === 'auth' && 'Initialisation Caisse'}
                  {step === 'waiting' && 'Vérification en cours...'}
                  {step === 'confirm' && 'Confirmation des fonds'}
                </h2>
                <p className="text-xs text-content-muted">
                  {step === 'auth' && 'Sélectionnez votre caisse et le mode d\'ouverture.'}
                  {step === 'waiting' && 'En attente de l\'approbation du responsable.'}
                  {step === 'confirm' && 'Veuillez confirmer le billetage reçu.'}
                </p>
              </div>
              <button onClick={onClose} className="text-content-muted hover:text-content-primary transition-colors">
                <X size={20}/>
              </button>
           </div>

           {/* Messages d'erreur/succès */}
           {error && (
             <div className="mb-4 p-3 bg-status-danger-bg border border-status-danger/50 rounded-xl text-sm animate-in slide-in-from-top-2">
               <div className="flex items-center gap-3 text-status-danger-text">
                 <AlertCircle className="h-5 w-5 flex-shrink-0 text-status-danger" />
                 <span>{error}</span>
               </div>
               {/* Bouton de correction pour admins quand solde négatif */}
               {hasNegativeBalance && isAdmin && selectedCaisseId && (
                 <div className="mt-3 pt-3 border-t border-status-danger/20">
                   <p className="text-xs text-content-muted mb-2">
                     En tant que superviseur, vous pouvez remettre le solde à 0 FCFA pour débloquer l'ouverture.
                   </p>
                   <Button
                     size="sm"
                     variant="outline"
                     onClick={handleBalanceCorrection}
                     disabled={correcting}
                     className="border-status-danger/50 text-status-danger hover:bg-status-danger-bg"
                   >
                     {correcting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Shield size={14} className="mr-1.5" />}
                     {correcting ? 'Correction en cours...' : 'Corriger le solde à 0 FCFA'}
                   </Button>
                 </div>
               )}
             </div>
           )}

           {successMessage && (
             <div className="mb-4 p-3 bg-status-success-bg border border-status-success/50 rounded-xl flex items-center gap-3 text-status-success-text text-sm animate-in slide-in-from-top-2">
               <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-status-success" />
               <span>{successMessage}</span>
             </div>
           )}

           <div className="flex-1">
              {/* PHASE A: Demande de fonds */}
              {step === 'auth' && (
                <div className="space-y-4">
                  {/* 1. SÉLECTION AGENCE & CAISSE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {isAdmin && (
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-content-muted uppercase ml-1">Agence</label>
                         <div className="relative">
                            <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                            <select
                              value={selectedAgenceId}
                              onChange={(e) => setSelectedAgenceId(e.target.value)}
                              className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-8 py-2.5 text-sm text-content-primary appearance-none focus:ring-2 focus:ring-status-success outline-none transition-all cursor-pointer hover:bg-surface"
                            >
                              {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                              <span className="text-content-muted text-xs">▼</span>
                            </div>
                         </div>
                      </div>
                    )}

                    <div className="space-y-1">
                       <label className="text-[10px] font-bold text-content-muted uppercase ml-1">Sélectionner votre caisse</label>
                       <div className="relative">
                          <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                          {loadingCaisses ? (
                            <div className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-4 py-2.5 text-content-muted flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Chargement...</span>
                            </div>
                          ) : (
                            <>
                              <select
                                value={selectedCaisseId}
                                onChange={(e) => setSelectedCaisseId(e.target.value)}
                                className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-8 py-2.5 text-sm text-content-primary appearance-none focus:ring-2 focus:ring-status-success outline-none transition-all cursor-pointer hover:bg-surface"
                              >
                                <option value="">Choisir une caisse</option>
                                {caisses.map(c => (
                                  <option key={c.id} value={c.id} disabled={c.isOccupied}>
                                    {c.nom} {c.isOccupied ? '(Occupée)' : ''}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <span className="text-content-muted text-xs">▼</span>
                              </div>
                            </>
                          )}
                       </div>
                    </div>
                  </div>

                  {/* CHOIX DU MODE D'OUVERTURE */}
                  {selectedCaisseId && (
                    <div className={`p-3 ${hasFondsReporte ? 'bg-status-warning-bg border-status-warning/30' : 'bg-surface-base/50 border-edge'} border rounded-xl space-y-3 animate-in slide-in-from-top-2`}>
                      {hasFondsReporte && (
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-status-warning shrink-0" />
                          <p className="text-xs text-status-warning/70">
                            Fonds reporté : <span className="font-bold text-status-warning-text">{formatMoney(soldeExistant)}</span>
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpeningMode('direct')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            openingMode === 'direct'
                              ? 'bg-status-success-bg border-status-success ring-1 ring-status-success'
                              : 'bg-surface-base/50 border-edge hover:border-edge-strong'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Unlock className={`h-3.5 w-3.5 ${openingMode === 'direct' ? 'text-status-success' : 'text-content-muted'}`} />
                            <span className={`text-xs font-semibold ${openingMode === 'direct' ? 'text-status-success' : 'text-content-secondary'}`}>
                              {hasFondsReporte ? 'Ouverture rapide' : 'Ouverture à vide'}
                            </span>
                          </div>
                          <p className="text-[10px] text-content-muted leading-tight">
                            {hasFondsReporte
                              ? `Ouvrir avec le fonds existant`
                              : 'Ouvrir à 0 FCFA sans approvisionnement'}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setOpeningMode('request')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            openingMode === 'request'
                              ? 'bg-accent/10 border-accent ring-1 ring-accent'
                              : 'bg-surface-base/50 border-edge hover:border-edge-strong'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Plus className={`h-3.5 w-3.5 ${openingMode === 'request' ? 'text-accent' : 'text-content-muted'}`} />
                            <span className={`text-xs font-semibold ${openingMode === 'request' ? 'text-accent' : 'text-content-secondary'}`}>
                              {hasFondsReporte ? 'Avec complément' : 'Demander au coffre'}
                            </span>
                          </div>
                          <p className="text-[10px] text-content-muted leading-tight">
                            {hasFondsReporte
                              ? 'Demander des fonds supplémentaires'
                              : 'Demander un approvisionnement au coffre-fort'}
                          </p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. MONTANT DOTATION - uniquement si mode "request" (demande au coffre) */}
                  {openingMode === 'request' && (
                  <div className="space-y-3">
                     <label className="text-xs font-bold text-content-muted uppercase ml-1">Dotation souhaitée (FCFA)</label>
                     
                     {/* Input Géant */}
                     <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted font-bold text-xl group-focus-within:text-status-success">F</span>
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={montantDemande}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontantDemande(v ? Number(v) : 0); }}
                          placeholder="0"
                          className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-4 py-5 text-3xl font-bold text-content-primary placeholder-content-muted focus:border-status-success focus:ring-1 focus:ring-status-success outline-none transition-all"
                        />
                     </div>

                     {/* Chips Rapides */}
                     <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {quickAmounts.map(amt => (
                          <button 
                            key={amt}
                            type="button"
                            onClick={() => setMontantDemande(amt)}
                            className={`px-4 py-2 bg-surface-base border rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                              montantDemande === amt 
                                ? 'border-status-success bg-status-success-bg text-status-success' 
                                : 'border-edge text-content-muted hover:border-edge-strong hover:text-content-primary'
                            }`}
                          >
                            {new Intl.NumberFormat('fr-FR').format(amt)}
                          </button>
                        ))}
                     </div>
                  </div>
                  )}

                  {/* 3. AUTHENTIFICATION (PIN ou Code d'accès — mutuellement exclusif) */}
                  {checkingPinStatus ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-content-muted" />
                      <span className="ml-2 text-xs text-content-muted">Vérification...</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Toggle PIN / Code d'accès */}
                      {hasPinConfigured ? (
                        <div className="flex items-center bg-surface/50 rounded-lg p-0.5 border border-edge-subtle">
                          <button
                            type="button"
                            onClick={() => { setUseAccessCode(false); setAccessCode(''); setAccessCodeValidated(false); setAccessCodeError(''); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                              !useAccessCode
                                ? 'bg-status-success text-white shadow-sm'
                                : 'text-content-muted hover:text-content-primary'
                            }`}
                          >
                            <Lock size={12} />
                            Code PIN
                          </button>
                          <button
                            type="button"
                            onClick={() => { setUseAccessCode(true); setAuthData({ pin: '' }); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                              useAccessCode
                                ? 'bg-status-warning text-white shadow-sm'
                                : 'text-content-muted hover:text-content-primary'
                            }`}
                          >
                            <KeyRound size={12} />
                            Code d'accès
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-status-warning-bg border border-status-warning/30 rounded-lg p-2">
                          <AlertCircle className="w-3.5 h-3.5 text-status-warning shrink-0" />
                          <p className="text-[10px] text-status-warning">PIN non configuré — utilisez un code d'accès admin.</p>
                        </div>
                      )}

                      {/* Champ PIN */}
                      {hasPinConfigured && !useAccessCode && (
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                          <input
                            type={showPin ? 'text' : 'password'}
                            placeholder="••••••"
                            maxLength={6}
                            value={authData.pin}
                            onChange={(e) => setAuthData({ ...authData, pin: e.target.value })}
                            className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-10 py-3 text-content-primary tracking-[0.8em] font-mono text-lg focus:border-status-success outline-none transition-all placeholder-content-muted"
                          />
                          {authData.pin.length === 6 ? (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-status-success animate-in zoom-in">
                              <CheckCircle2 size={20} />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowPin(!showPin)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors"
                            >
                              {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Champ Code d'accès */}
                      {(useAccessCode || !hasPinConfigured) && (
                        <>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-status-warning" size={16} />
                              <input
                                type={showAccessCode ? 'text' : 'password'}
                                placeholder="XXXXXX"
                                maxLength={8}
                                value={accessCode}
                                onChange={(e) => {
                                  setAccessCode(e.target.value.toUpperCase());
                                  setAccessCodeValidated(false);
                                  setAccessCodeError('');
                                }}
                                disabled={accessCodeValidated}
                                autoFocus
                                className={`w-full bg-surface-base border rounded-xl pl-10 pr-10 py-3 text-content-primary font-mono tracking-[0.3em] text-lg focus:ring-1 outline-none transition-all placeholder-content-muted disabled:opacity-50 ${
                                  accessCodeValidated ? 'border-status-success focus:ring-status-success' : 'border-status-warning/50 focus:border-status-warning focus:ring-status-warning/20'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowAccessCode(!showAccessCode)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors"
                              >
                                {showAccessCode ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleValidateAccessCode}
                              disabled={accessCodeLoading || accessCodeValidated || accessCode.length < 6}
                              className="px-4 py-3 bg-status-warning hover:bg-status-warning disabled:bg-surface disabled:text-content-muted text-white text-sm font-bold rounded-xl transition-all flex items-center gap-1.5"
                            >
                              {accessCodeLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : accessCodeValidated ? (
                                <Check size={14} />
                              ) : (
                                'Valider'
                              )}
                            </button>
                          </div>
                          {accessCodeError && (
                            <p className="text-[10px] text-status-danger flex items-center gap-1">
                              <AlertCircle size={11} />
                              {accessCodeError}
                            </p>
                          )}
                          {accessCodeValidated && (
                            <p className="text-[10px] text-status-success flex items-center gap-1">
                              <CheckCircle2 size={11} />
                              Code validé — vous pouvez ouvrir la session
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PHASE B: En attente */}
              {step === 'waiting' && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in-95">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-status-success/20 rounded-full animate-ping" />
                    <div className="absolute inset-0 flex items-center justify-center bg-status-success-bg border-2 border-status-success/30 rounded-full">
                      <Clock className="h-10 w-10 text-status-success" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-lg font-bold text-content-primary">Transmission au coffre...</h3>
                    <p className="text-sm text-content-muted">
                      Veuillez patienter pendant que le responsable valide votre dotation de 
                      <span className="text-content-primary font-bold mx-1">
                        {Number(session?.montantDemande || montantDemande).toLocaleString('fr-FR')} FCFA
                      </span>
                    </p>
                  </div>

                  <div className="w-full max-w-xs bg-surface-base/50 border border-edge rounded-2xl p-4 text-left space-y-3">
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-content-muted">Caisse</span>
                       <span className="text-content-primary font-medium">{session?.caisse?.nom || selectedCaisse?.nom}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-content-muted">Statut</span>
                       <span className="px-2 py-0.5 bg-status-warning-bg text-status-warning border border-status-warning/30 rounded-full text-[10px] uppercase font-bold tracking-wider">
                         Validation en cours
                       </span>
                    </div>
                  </div>

                  <button 
                    onClick={handleCancelRequest}
                    disabled={loading}
                    className="text-content-muted hover:text-status-danger text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban size={14} />}
                    Annuler la demande
                  </button>
                </div>
              )}

              {/* PHASE C: Confirmation de réception */}
              {step === 'confirm' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-status-success-bg border border-status-success/20 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-status-success-bg border-2 border-status-success/30 rounded-xl flex items-center justify-center">
                      <Package className="h-6 w-6 text-status-success" />
                    </div>
                    <div>
                       <div className="text-xs font-bold text-status-success/70 uppercase">Fonds Prêts</div>
                       <div className="text-xl font-black text-content-primary">
                         {Number(session?.montantDemande || montantDemande).toLocaleString('fr-FR')} <span className="text-xs font-bold text-content-muted">FCFA</span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-content-muted uppercase tracking-widest">Billetage de réception</h4>
                      <div className="text-xs font-bold text-status-success">
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
                          <div key={value} className="bg-surface-base border border-edge rounded-xl p-2 focus-within:border-status-success/50 transition-all">
                            <label className="block text-[10px] font-bold text-content-muted uppercase mb-1 ml-1">{value} F</label>
                            <input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={billetage[stateKey as keyof typeof billetage] || ''}
                              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setBilletage({ ...billetage, [stateKey]: v ? Number(v) : 0 }); }}
                              className="w-full bg-transparent text-content-primary font-bold text-sm outline-none px-1"
                              placeholder="0"
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Alerte écart */}
                    {Math.abs(calculerTotal() - Number(session?.montantDemande || montantDemande)) > 0 && calculerTotal() > 0 && (
                      <div className="p-3 bg-status-warning-bg border border-status-warning/30 rounded-xl flex items-center gap-3 text-status-warning-text text-xs">
                        <AlertCircle className="h-4 w-4 text-status-warning" />
                        <span>Écart de {Math.abs(calculerTotal() - Number(session?.montantDemande || montantDemande)).toLocaleString()} F.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
           </div>

           {/* FOOTER ACTION */}
           <div className="mt-auto pt-4 border-t border-edge">
              {step === 'auth' && (
                <OfflineGuard blockMode="dialog" offlineMessage="L'ouverture de caisse nécessite une connexion active au serveur.">
                <button
                  onClick={openingMode === 'direct' ? handleDirectOpening : handleRequestOpening}
                  disabled={
                    loading ||
                    checkingPinStatus ||
                    !selectedCaisseId ||
                    (useAccessCode || !hasPinConfigured ? !accessCodeValidated : authData.pin.length < 6)
                  }
                  className={`w-full py-3 rounded-xl font-bold text-base shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:bg-surface disabled:text-content-muted ${
                    openingMode === 'direct'
                      ? 'bg-status-success hover:bg-status-success shadow-status-success/20 text-white'
                      : 'bg-accent-secondary hover:bg-accent-secondary shadow-accent/20 text-content-primary'
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
                </OfflineGuard>
              )}

              {step === 'confirm' && (
                <div className="space-y-3">
                  <button
                    onClick={handleConfirmReception}
                    disabled={loading || calculerTotal() <= 0}
                    className="w-full bg-status-success hover:bg-status-success disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
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
                    className="w-full text-content-muted hover:text-status-danger text-xs font-bold transition-colors flex items-center justify-center gap-2 py-2"
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
           ? 'bg-status-success border-status-success text-white' 
           : active 
             ? 'bg-status-success-bg border-status-success text-status-success' 
             : 'bg-transparent border-edge text-content-muted'
       }`}>
         {completed ? <Check size={18} /> : number}
       </div>
       <div className="flex flex-col">
         <span className={`text-[10px] uppercase font-bold tracking-wider ${active ? 'text-status-success' : 'text-content-muted'}`}>Étape {number}</span>
         <span className={`text-sm font-bold ${active || completed ? 'text-content-primary' : 'text-content-muted'}`}>{label}</span>
       </div>
    </div>
  )
}
