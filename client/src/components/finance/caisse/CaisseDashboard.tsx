import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, RefreshCw, ArrowRightLeft, Users, Smartphone, Wallet,
  CreditCard, Lock, Unlock, FileText, TrendingUp, TrendingDown, Clock,
  PiggyBank, ArrowUpRight, ArrowDownRight, Shield, Timer, AlertCircle,
  LockKeyhole, KeyRound, Package, Check, UserCheck, History
} from 'lucide-react';
import { toast } from 'sonner';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { Button, Card, StatCard, TabGroup } from '../../ui';
import { usePermissions } from '../../auth/ProtectedFeature';
import { sessionCaisseApi, caisseOperationApi, caisseSepareeApi, authApi, compteEpargneApi, api } from '../../../lib/api-client';
import { computeSessionStatus } from '../../../lib/format';
import { isIncomingOperation, isOutgoingOperation } from '@shared/config/caisse-operations';
import { CaisseQuickActions } from './CaisseQuickActions';
import CaisseOuverture from './CaisseOuverture';
import { useCaisseWebSocket } from '../../../hooks/useCaisseWebSocket';
import CaisseOperations from './CaisseOperations';
import CaisseRapprochement from './CaisseRapprochement';
import CaisseTransferts from './CaisseTransferts';
import CaisseEtats from './CaisseEtats';
import CaisseSupervision from './CaisseSupervision';
import CaissePaiementModal from './CaissePaiementModal';
import CaisseEspeces from './CaisseEspeces';
import CaisseMobileMoney from './CaisseMobileMoney';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { SupervisionSession } from './shared/SupervisionConfirmModal';
import { isAdminRole } from '@shared/types/roles';

import CaisseAccessControl from './CaisseAccessControl';
import CaisseClientInfos from './CaisseClientInfos';
import CaisseHistoriqueGlobal from './CaisseHistoriqueGlobal';
import { TransactionsList, TransactionDetailDrawer, TransactionHistoryPage } from '../transactions';
import type { TransactionItem, TransactionDetails } from '../transactions';
import { PendingActivationDrawer } from './PendingActivationDrawer';
import { SessionCaisse, CaisseTransaction as Transaction } from '../../../types/finance';

interface CaisseProps {
  userRole?: string;
  onModuleChange?: (module: string) => void;
  activeView?: string;
  initialShowPaiement?: boolean;
  onPaiementModalClose?: () => void;
  initialState?: any;
}

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function CaisseDashboard({ 
  userRole, 
  onModuleChange, 
  activeView,
  initialShowPaiement = false,
  onPaiementModalClose,
  initialState
}: CaisseProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canOpenCaisse = hasPermission('caisse', 'open') || hasPermission('caisse', 'manage');
  const canCloseCaisse = hasPermission('caisse', 'close') || hasPermission('caisse', 'manage');
  const canCreatePayments = hasPermission('caisse', 'deposit') || hasPermission('paiements', 'create');

  const { mobileMoneyEnabled } = useFeatureFlags();
  const [activeTab, setActiveTab] = useState('dashboard');

  const [showOuverture, setShowOuverture] = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [showActivationDrawer, setShowActivationDrawer] = useState(false);
  const [initialPaymentType, setInitialPaymentType] = useState<string | undefined>(undefined);
  // État pour pré-remplir le modal de paiement (activation de compte)
  const [preSelectedAccountId, setPreSelectedAccountId] = useState<string | undefined>(undefined);
  const [preFilledAmount, setPreFilledAmount] = useState<number | undefined>(undefined);
  const [preSelectedClientId, setPreSelectedClientId] = useState<string | undefined>(undefined);
  const [caissesSeparees, setCaissesSeparees] = useState<any[]>([]);
  
  // Super-User mode: Admin can supervise a specific active session
  const [supervisedSession, setSupervisedSession] = useState<SessionCaisse | null>(null);
  const [supervisionInfo, setSupervisionInfo] = useState<SupervisionSession | null>(null);
  const [supervisionTimeElapsed, setSupervisionTimeElapsed] = useState(0);

  const [accessGranted, setAccessGranted] = useState(isAdminRole(userRole));

  // End of day reminder state
  const [showEndOfDayReminder, setShowEndOfDayReminder] = useState(false);



  // History Receipt State
  const [showHistoryReceipt, setShowHistoryReceipt] = useState(false);
  const [historyReceiptData, setHistoryReceiptData] = useState<ReceiptData | undefined>(undefined);
  const [historyFactureId, setHistoryFactureId] = useState<string | undefined>(undefined);

  // Historique Mode: 'today' = transactions du jour, 'global' = historique complet avec pagination
  const [historiqueMode, setHistoriqueMode] = useState<'today' | 'global'>('today');

  // Transaction Detail Drawer State
  const [selectedTxDetail, setSelectedTxDetail] = useState<TransactionDetails | null>(null);
  const [isTxDrawerOpen, setIsTxDrawerOpen] = useState(false);

  // React Query for Real-time Data
  const {
    data: sessionActive,
    isLoading: loadingSession,
    refetch: refetchSession
  } = useQuery({
    queryKey: ['session-caisse', 'active'],
    queryFn: async () => {
      // If supervised, use that
      if (supervisedSession) return supervisedSession;

      const data = await sessionCaisseApi.getActive();
      const status = data ? (data.computedStatus || computeSessionStatus(data)) : null;
      // Consider OPEN, CLOSING_COUNT, and CLOSING_VALIDATION as active sessions
      if (data && (status === 'OPEN' || status === 'CLOSING_COUNT' || status === 'CLOSING_VALIDATION')) {
        return data as SessionCaisse;
      }
      return null;
    }
  });

  // Query for pending sessions (REQUESTING_FUNDS or FUNDS_DISPATCHED)
  const {
    data: pendingSession,
    isLoading: loadingPendingSession,
    refetch: refetchPendingSession
  } = useQuery({
    queryKey: ['session-caisse', 'pending'],
    queryFn: async () => {
      const data = await sessionCaisseApi.getPending();
      return data as SessionCaisse | null;
    },
    // Only check for pending if we don't have an active session
    enabled: !sessionActive && !supervisedSession
  });

  // Actual session being used (own or supervised)
  const currentSession = supervisedSession || sessionActive;

  // Determine if we have a pending opening workflow
  const hasPendingOpening = !currentSession && pendingSession &&
    (pendingSession.statut === 'REQUESTING_FUNDS' || pendingSession.statut === 'FUNDS_DISPATCHED');

  // Pending activations - sync with PendingActivationDrawer
  const { data: pendingActivations = [] } = useQuery({
    queryKey: ['comptes', 'pending-activation'],
    queryFn: () => api.get<any[]>('/comptes/pending-activation'),
    enabled: !!currentSession,
    refetchInterval: 30000
  });

  const comptesEnAttenteCount = pendingActivations.length;

  useEffect(() => {
    if (activeView) {
      switch (activeView) {
        case 'caisse-session': setActiveTab('dashboard'); break;
        case 'caisse-operations': setActiveTab('operations'); break;
        case 'caisse-cloture': setActiveTab('rapprochement'); break;
        default: setActiveTab('dashboard');
      }
    }
  }, [activeView]);

  useEffect(() => {
    if (initialShowPaiement) {
      setShowPaiement(true);
    }
  }, [initialShowPaiement]);

  const { 
    data: transactions = [], 
    isLoading: loadingTransactions,
    refetch: refetchTransactions
  } = useQuery({
    queryKey: ['operations-caisse', 'today', 'debug'],
    queryFn: async () => {
      try {
        const res = await caisseOperationApi.getToday();
        return res;
      } catch (e) {
        throw e;
      }
    },
    enabled: !!currentSession,
    initialData: []
  });

  // Debug effect
  useEffect(() => {
    // Force refetch
    refetchSession();
    if (currentSession) {
        refetchTransactions();
    }
  }, [currentSession?.id]);

  // Real-time Updates
  useCaisseWebSocket({
    caisseId: currentSession?.caisse_id,
    sessionId: currentSession?.id,
    enabled: !!currentSession,
    onSessionUpdated: (data) => {
        refetchSession(); // To update balance
        refetchTransactions(); // To show new operation
        toast.info(data.type === 'MOUVEMENT_CREE' ? 'Nouvelle opération reçue' : 'Session mise à jour');
    },
    onCaisseStatusChanged: (data) => {
        if (data.sessionId === currentSession?.id && data.status === 'CLOSED') {
            refetchSession();
            toast.warning('La session a été fermée');
        }
    }
  });

  const loading = loadingSession || loadingTransactions || loadingPendingSession;

  // Manual refresh logic replaced by React Query's automatic background refetching
  // But we keep manual refetch capability for specific actions
  useEffect(() => {
    // If we have a supervised session update, we might need to manually set it?
    // Actually, forcing a refetch is better.
    if (initialState?.supervisedSession) {
       setSupervisedSession(initialState.supervisedSession);
       // We don't refetch sessionActive here because sessionActive query handles the "supervisedSession" logic
    }
  }, [initialState]);

  const loadSessionActive = async () => {
    await refetchSession();
  };

  const loadTransactionsJour = async () => {
    // Force refetch des transactions pour mettre à jour l'UI après mutation
    await refetchTransactions();
  };

  const loadCaissesSeparees = async () => {
    try {
      if (!currentSession?.id) return;
      const data = await caisseSepareeApi.getBySession(currentSession.id);
      setCaissesSeparees(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // Manual loadComptesEnAttente removed in favor of useQuery

  useEffect(() => {
    loadCaissesSeparees();
    loadCaissesSeparees();
    // loadComptesEnAttente(); // Handled by useQuery
  }, [currentSession?.id]);

  // Sync sessionActive query result to currentSession logic
  // sessionActive from useQuery is the source of truth for "active session"
  // supervisedSession overrides it if set.




  // Heartbeat - envoie un signal au serveur toutes les 5 minutes pour éviter le timeout de session
  useEffect(() => {
    const status = currentSession ? (currentSession.computedStatus || computeSessionStatus(currentSession)) : null;
    if (!currentSession?.id || status !== 'OPEN') return;

    // Envoyer un heartbeat immédiatement à l'ouverture
    const sendHeartbeat = async () => {
      try {
        await sessionCaisseApi.heartbeat(currentSession.id);
      } catch (error) {
        // Silencieux - le heartbeat est optionnel
      }
    };

    sendHeartbeat();

    // Puis toutes les 5 minutes
    const interval = setInterval(sendHeartbeat, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentSession?.id, currentSession?.computedStatus, currentSession?.openedAt, currentSession?.closedAt, currentSession?.timeoutAt]);

  // Supervision timer - counts elapsed time since supervision started
  useEffect(() => {
    if (!supervisionInfo) {
      setSupervisionTimeElapsed(0);
      return;
    }

    const startTime = new Date(supervisionInfo.startedAt).getTime();

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60); // minutes
      setSupervisionTimeElapsed(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [supervisionInfo]);

  // End of day reminder - check at 17:00 if session is still open
  useEffect(() => {
    if (!sessionActive) return;

    const checkEndOfDay = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Show reminder at 17:00, 17:30, 18:00
      if ((hour === 17 && (minute === 0 || minute === 30)) || (hour === 18 && minute === 0)) {
        setShowEndOfDayReminder(true);
        toast.warning('Rappel de fin de journée', {
          description: 'Pensez à clôturer votre caisse avant de partir.',
          duration: 10000,
        });
      }
    };

    // Check every minute
    const interval = setInterval(checkEndOfDay, 60000);

    // Also check on mount
    checkEndOfDay();

    return () => clearInterval(interval);
  }, [sessionActive]);

  const handleOuvertureCaisse = async () => {
    await loadSessionActive();
    await refetchPendingSession();
    await loadCaissesSeparees();
    setSupervisedSession(null); // Clear supervision if we open our own
    setSupervisionInfo(null);
    setShowOuverture(false);
  };

  // Handle supervision start with full info
  const handleSupervisionStart = useCallback((session: SessionCaisse, info: SupervisionSession) => {
    setSupervisedSession(session);
    setSupervisionInfo(info);
    setActiveTab('dashboard');
    toast.success(`Supervision activée`, {
      description: `Vous supervisez maintenant ${info.targetCaisseName} (${info.targetCaissierName})`,
    });
  }, []);

  // Handle supervision end
  const handleSupervisionEnd = useCallback(() => {
    if (supervisionInfo) {
      toast.info('Supervision terminée', {
        description: `Vous avez quitté la supervision de ${supervisionInfo.targetCaisseName}`,
      });
    }
    setSupervisedSession(null);
    setSupervisionInfo(null);
  }, [supervisionInfo]);

  // Extend supervision duration
  const handleExtendSupervision = useCallback(() => {
    if (!supervisionInfo) return;
    setSupervisionInfo({
      ...supervisionInfo,
      maxDurationMinutes: supervisionInfo.maxDurationMinutes + 15,
    });
    toast.success('Supervision prolongée de 15 minutes');
  }, [supervisionInfo]);

  // Calculate remaining supervision time
  const supervisionTimeRemaining = supervisionInfo
    ? Math.max(0, supervisionInfo.maxDurationMinutes - supervisionTimeElapsed)
    : 0;

  const handleFermetureCaisse = () => {
    setActiveTab('rapprochement');
  };

  const handleDepotRapide = () => {
    if (currentSession) {
      setInitialPaymentType('Encaissement Divers');
      setShowPaiement(true);
    } else {
      alert('Veuillez ouvrir une session de caisse');
    }
  };

  const handleRetraitRapide = () => {
    if (currentSession) {
      setInitialPaymentType('Décaissement Divers');
      setShowPaiement(true);
    } else {
      alert('Veuillez ouvrir une session de caisse');
    }
  };

  const handleArreteCaisse = () => {
    if (currentSession) {
        setActiveTab('rapprochement');
    } else {
        alert('Veuillez ouvrir une session de caisse');
    }
  };

  // Calcul des entrées/sorties en utilisant les helpers centralisés
  const totalEntrees = transactions
    .filter(t => isIncomingOperation(t.type_operation))
    .reduce((sum, t) => sum + toNumber(t.montant), 0);

  const totalSorties = transactions
    .filter(t => isOutgoingOperation(t.type_operation))
    .reduce((sum, t) => sum + toNumber(t.montant), 0);

  // Use montant_ouverture (the actual DB field) with fallback to solde_initial for backwards compatibility
  const soldeActuel = currentSession
    ? toNumber((currentSession as any).montant_ouverture || currentSession.solde_initial) + totalEntrees - totalSorties
    : 0;

  const isSessionOpen = !!currentSession;

  // Redirection automatique si on tente d'accéder à un onglet verrouillé
  useEffect(() => {
    if (!isSessionOpen && activeTab !== 'dashboard' && activeTab !== 'supervision') {
      setActiveTab('dashboard');
      toast.error("Session fermée", {
        description: "Veuillez ouvrir une session pour accéder à ce module."
      });
    }
  }, [isSessionOpen, activeTab]);

  // Check if session is in closing workflow (frozen - no new transactions allowed)
  const isClosingWorkflow = currentSession?.statut === 'CLOSING_COUNT' || currentSession?.statut === 'CLOSING_VALIDATION';

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: Activity, disabled: false },
    { key: 'infos-client', label: 'Info Client', icon: Users, disabled: !isSessionOpen },
    { key: 'especes', label: 'Espèces', icon: Wallet, disabled: !isSessionOpen || isClosingWorkflow },
    { key: 'mobilemoney', label: 'Mobile Money', icon: Smartphone, disabled: !mobileMoneyEnabled || !isSessionOpen || isClosingWorkflow },
    { key: 'historique', label: 'Historique', icon: Clock, disabled: !isSessionOpen },
    { key: 'rapprochement', label: 'Clôture', icon: RefreshCw, disabled: !isSessionOpen },
    { key: 'transferts', label: 'Transferts', icon: ArrowRightLeft, disabled: !isSessionOpen || isClosingWorkflow },
    { key: 'etats', label: 'États', icon: FileText, disabled: !isSessionOpen },
    { key: 'supervision', label: 'Supervision', icon: Shield, disabled: false },
  ];

  if (!accessGranted) {
    return (
      <CaisseAccessControl
        onAccessGranted={() => setAccessGranted(true)}
        onClose={() => onModuleChange?.('dashboard')}
        userRole={userRole}
      />
    );
  }





  const formattedMoney = (amount: number) => {
      return new Intl.NumberFormat('fr-FR').format(amount);
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'operations':
        return currentSession ? <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseOperations sessionId={currentSession.id} onBack={() => setActiveTab('dashboard')} /></div> : null;
      case 'historique':
        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Toggle between Today and Global History */}
            <div className="flex items-center justify-between mb-4 px-4 md:px-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('dashboard')}
                  icon={ArrowRightLeft}
                  className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180"
                />
                <h2 className="text-lg font-bold text-white">Historique</h2>
              </div>
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setHistoriqueMode('today')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    historiqueMode === 'today'
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock size={14} className="inline mr-1" />
                  Aujourd'hui
                </button>
                <button
                  onClick={() => setHistoriqueMode('global')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    historiqueMode === 'global'
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <History size={14} className="inline mr-1" />
                  Tout l'historique
                </button>
              </div>
            </div>

            {historiqueMode === 'global' && currentSession?.caisse_id ? (
              <CaisseHistoriqueGlobal
                caisseId={currentSession.caisse_id}
                caisseName={currentSession.caisse_nom}
                onBack={() => setActiveTab('dashboard')}
              />
            ) : (
              <div className="-mx-4 md:-mx-6 -mb-16">
                <TransactionHistoryPage
                  transactions={transactions.map(tx => ({
                    id: tx.id,
                    reference: tx.reference,
                    amount: toNumber(tx.montant),
                    type: tx.type_operation,
                    type_operation: tx.type_operation,
                    status: 'SUCCESS',
                    date: tx.created_at,
                    description: tx.description,
                    client: tx.client_nom ? {
                      name: `${tx.client_nom} ${tx.client_prenom || ''}`.trim(),
                      phone: tx.client_telephone
                    } : undefined,
                    agent: currentSession?.caissier_nom,
                    mode_paiement: tx.mode_paiement,
                    created_at: tx.created_at
                  }))}
                  isLoading={loadingTransactions}
                  onRefresh={() => refetchTransactions()}
                  onBack={() => setActiveTab('dashboard')}
                />
              </div>
            )}
          </div>
        );
      case 'especes':
        return currentSession ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Espèces</h2>
                 </div>
                 <CaisseEspeces sessionId={currentSession.id} onTransactionComplete={() => { loadSessionActive(); loadTransactionsJour(); }} />
            </div>
        ) : null;
      case 'mobilemoney':
        return currentSession ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Mobile Money</h2>
                 </div>
                 <CaisseMobileMoney sessionId={currentSession.id} onTransactionComplete={() => { loadSessionActive(); loadTransactionsJour(); loadCaissesSeparees(); }} />
            </div>
        ) : null;
      case 'infos-client':
        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseClientInfos /></div>
        );
      case 'rapprochement':
        return currentSession ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseRapprochement session={currentSession} onClose={() => { setActiveTab('dashboard'); loadSessionActive(); loadTransactionsJour(); }} soldeTheoriqueCalcule={soldeActuel} /></div>
        ) : null;
      case 'transferts':
        return <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseTransferts session={currentSession} soldeActuel={soldeActuel} onBack={() => setActiveTab('dashboard')} /></div>;
      case 'etats':
        return <CaisseEtats onBack={() => setActiveTab('dashboard')} />;

      case 'supervision':
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Supervision</h2>
                 </div>
                 <CaisseSupervision
                    activeSupervision={supervisionInfo}
                    onTakeControl={handleSupervisionStart}
                 />
            </div>
        );
      default:
        // Handle pending opening workflow states
        if (hasPendingOpening && pendingSession) {
          return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {pendingSession.statut === 'REQUESTING_FUNDS' ? (
                <>
                  <div className="p-8 rounded-[2rem] bg-amber-500/5 ring-1 ring-amber-500/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Clock className="w-16 h-16 text-amber-500 relative z-10 animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-white tracking-tight">Vérification Coffre</h2>
                    <p className="text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">
                      Votre demande de <span className="text-amber-500 font-bold">{new Intl.NumberFormat('fr-FR').format(pendingSession.montant_demande || 0)} FCFA</span> est en cours d'examen par la supervision.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                       <Timer size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                       Statut: Transmission Sécurisée
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setShowOuverture(true)}
                      className="w-full border-white/10 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl font-bold"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Gérer la Demande
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-8 rounded-[2rem] bg-emerald-500/5 ring-1 ring-emerald-500/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Package className="w-16 h-16 text-emerald-500 relative z-10" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-white tracking-tight">Dotation Prête</h2>
                    <p className="text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">
                      Le coffre a débloqué <span className="text-emerald-500 font-bold">{new Intl.NumberFormat('fr-FR').format(pendingSession.montant_demande || 0)} FCFA</span>. Vous devez confirmer le comptage pour activer votre session.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                       <Check size={12} />
                       Validation Coffre: Reçue
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      onClick={() => setShowOuverture(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 rounded-2xl font-black py-6 text-lg"
                    >
                      <KeyRound className="w-5 h-5 mr-2" />
                      Ouvrir le Terminal
                    </Button>
                  </div>
                </>
              )}

              {isAdminRole(userRole) && (
                <button
                  onClick={() => setActiveTab('supervision')}
                  className="text-sm text-slate-500 hover:text-indigo-400 underline decoration-slate-900 hover:decoration-indigo-400/50 underline-offset-4 transition-all"
                >
                  Accéder aux outils de supervision
                </button>
              )}
            </div>
          );
        }

        // Handle closing workflow states - session is frozen
        if (currentSession && (currentSession.statut === 'CLOSING_COUNT' || currentSession.statut === 'CLOSING_VALIDATION')) {
          const isCountPhase = currentSession.statut === 'CLOSING_COUNT';
          const isValidationPhase = currentSession.statut === 'CLOSING_VALIDATION';
          const isPendingCoffreValidation = isValidationPhase && currentSession.coffre_validation_status === 'PENDING';

          return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {isCountPhase ? (
                // Phase 1: Counting in progress
                <>
                  <div className="p-6 rounded-full bg-blue-500/10 ring-1 ring-blue-500/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-blue-500/10 to-blue-400/5" />
                    <RefreshCw className="w-16 h-16 text-blue-400 relative z-10 animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Session en Fermeture</h2>
                    <p className="text-slate-400 max-w-md mx-auto">
                      La session est <span className="text-blue-400 font-bold">gelée</span>. Veuillez compter vos billets et soumettre le comptage physique.
                    </p>
                    {currentSession.closing_initiated_at && (
                      <p className="text-xs text-slate-500">
                        Fermeture initiée le {new Date(currentSession.closing_initiated_at).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                    <Button
                      size="lg"
                      onClick={() => setActiveTab('rapprochement')}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] font-bold py-6 text-lg"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Soumettre le Comptage
                    </Button>
                  </div>
                </>
              ) : isPendingCoffreValidation ? (
                // Phase 2: Waiting for coffre validation
                <>
                  <div className="p-6 rounded-full bg-amber-500/10 ring-1 ring-amber-500/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-amber-500/10 to-amber-400/5" />
                    <Clock className="w-16 h-16 text-amber-400 relative z-10 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Transfert en Attente</h2>
                    <p className="text-slate-400 max-w-md mx-auto">
                      Le transfert de <span className="text-amber-400 font-bold">{new Intl.NumberFormat('fr-FR').format(currentSession.montant_vers_coffre || 0)} FCFA</span> vers le coffre est en attente de validation.
                    </p>
                    {currentSession.montant_reporte && Number(currentSession.montant_reporte) > 0 && (
                      <p className="text-xs text-emerald-400">
                        Fonds reportés: {new Intl.NumberFormat('fr-FR').format(currentSession.montant_reporte)} FCFA
                      </p>
                    )}
                    {currentSession.count_submitted_at && (
                      <p className="text-xs text-slate-500">
                        Comptage soumis le {new Date(currentSession.count_submitted_at).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setActiveTab('rapprochement')}
                      className="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                    >
                      <Clock className="w-5 h-5 mr-2" />
                      Voir le Détail
                    </Button>
                  </div>
                </>
              ) : (
                // Phase 2: Ready to finalize
                <>
                  <div className="p-8 rounded-[2rem] bg-emerald-500/5 ring-1 ring-emerald-500/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Lock className="w-16 h-16 text-emerald-500 relative z-10" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-white tracking-tight">Vault Compté</h2>
                    <p className="text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">
                      Le rapprochement physique a été enregistré avec succès. La session est prête pour l'archivage final.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                       <Shield size={12} />
                       Comptage Physique: {new Intl.NumberFormat('fr-FR').format(currentSession.montant_physique || 0)} F
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      onClick={() => setActiveTab('rapprochement')}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 rounded-2xl font-black py-6 text-lg"
                    >
                      <Check className="w-5 h-5 mr-2" />
                      Finaliser le Protocole
                    </Button>
                  </div>
                </>
              )}

              {isAdminRole(userRole) && (
                <button
                  onClick={() => setActiveTab('supervision')}
                  className="text-sm text-slate-500 hover:text-indigo-400 underline decoration-slate-900 hover:decoration-indigo-400/50 underline-offset-4 transition-all"
                >
                  Accéder aux outils de supervision
                </button>
              )}
            </div>
          );
        }

        if (!isSessionOpen) {
           return (
             <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-6 rounded-full bg-slate-900 ring-1 ring-slate-800 shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-800/0 to-slate-700/0 group-hover:from-slate-800/20 group-hover:to-slate-700/20 transition-all duration-500" />
                  <LockKeyhole className="w-16 h-16 text-slate-500 relative z-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">Session de Caisse Fermée</h2>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Les opérations d'encaissement et de décaissement sont verrouillées. Veuillez ouvrir une session pour commencer votre journée.
                  </p>
                </div>
                <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                  {canOpenCaisse && (
                    <Button
                      size="lg"
                      onClick={() => setShowOuverture(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] font-bold py-6 text-lg"
                    >
                      <KeyRound className="w-5 h-5 mr-2" />
                      Ouvrir ma Session
                    </Button>
                  )}

                  {isAdminRole(userRole) && (
                    <button
                      onClick={() => setActiveTab('supervision')}
                      className="text-sm text-slate-500 hover:text-indigo-400 underline decoration-slate-900 hover:decoration-indigo-400/50 underline-offset-4 transition-all"
                    >
                      Accéder aux outils de supervision sans ouvrir
                    </button>
                  )}
                </div>
             </div>
           );
        }

        return (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      {currentSession && (
        <CaisseQuickActions 
          caisseId={currentSession.caisse_id || ''} 
          agenceId={currentSession.agence_id || ''} 
          onDepot={handleDepotRapide}
          onRetrait={handleRetraitRapide}
          onArrete={handleArreteCaisse}
        />
      )}
      
      {/* Top Session Stats - Mobile First Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
             title="Solde de Session" 
             value={soldeActuel}
             icon={Wallet}
             color="primary"
             subtitle={currentSession ? `Initial: ${formattedMoney(toNumber((currentSession as any).montant_ouverture || currentSession.solde_initial))} F` : "Session Fermée"}
             trend={currentSession ? `${transactions.length} Ops` : "Inactif"}
             trendUp={!!currentSession}
             className="col-span-2 shadow-xl shadow-cyan-950/20"
          />
          <StatCard
             title="Entrées" 
             value={totalEntrees}
             icon={ArrowDownRight}
             color="success"
             trend="+0%"
             trendUp={true}
          />
           <StatCard
             title="Sorties" 
             value={totalSorties}
             icon={ArrowUpRight}
             color="warning" // Warning color for money leaving
             trend="-0%"
             trendUp={false}
          />
      </div>

      {/* Quick Actions - Clean Cards */}
      <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Actions Rapides</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group"
                onClick={() => setActiveTab('especes')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                         <Wallet size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Espèces</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className={`cursor-pointer transition-all group ${!mobileMoneyEnabled ? 'opacity-50 pointer-events-none' : 'hover:border-amber-500/50 hover:bg-amber-500/5'}`}
                onClick={() => mobileMoneyEnabled && setActiveTab('mobilemoney')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                         <Smartphone size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Mobile Money</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                onClick={() => setActiveTab('transferts')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                         <ArrowRightLeft size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Transferts</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                onClick={() => setActiveTab('etats')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                         <FileText size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">États</span>
                 </div>
             </Card>
          </div>

       {/* Pending Activations Alert Card - Only show when there are pending accounts */}
       {comptesEnAttenteCount > 0 && (
         <Card
            variant="default"
            padding="sm"
            className="cursor-pointer border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 transition-all group animate-pulse"
            onClick={() => setShowActivationDrawer(true)}
         >
             <div className="flex flex-col items-center gap-3 py-2">
                 <div className="relative p-3 rounded-xl bg-orange-500/20 text-orange-400 group-hover:scale-110 transition-transform">
                     <UserCheck size={24} />
                     <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900">
                       {comptesEnAttenteCount}
                     </span>
                 </div>
                 <span className="text-sm font-bold text-orange-400 group-hover:text-orange-300">
                   Activations en attente
                 </span>
             </div>
         </Card>
       )}
  </div>

      <PendingActivationDrawer
        open={showActivationDrawer}
        onClose={() => setShowActivationDrawer(false)}
        onActivate={(compteId, montant, clientId) => {
           setShowActivationDrawer(false);
           // Ouvrir le modal de paiement avec les valeurs pré-remplies
           setInitialPaymentType('DEPOSIT_SAVINGS'); // Valeur EN pour activation
           setPreSelectedAccountId(compteId);
           setPreFilledAmount(montant);
           setPreSelectedClientId(clientId);
           setShowPaiement(true);
        }}
      />

      {/* Recent Transactions - Using new TransactionsList component */}
      <TransactionsList
        transactions={transactions.map(tx => ({
          id: tx.id,
          reference: tx.reference,
          amount: toNumber(tx.montant),
          type: tx.type_operation,
          type_operation: tx.type_operation,
          status: 'SUCCESS',
          date: tx.created_at,
          description: tx.description,
          client: tx.client_nom ? {
            name: `${tx.client_nom} ${tx.client_prenom || ''}`.trim(),
            phone: tx.client_telephone
          } : undefined,
          agent: currentSession?.caissier_nom,
          mode_paiement: tx.mode_paiement,
          created_at: tx.created_at
        }))}
        onTransactionClick={(tx) => {
          setSelectedTxDetail({
            id: tx.id,
            reference: tx.reference,
            amount: tx.amount,
            type: tx.type_operation || tx.type,
            type_operation: tx.type_operation,
            status: tx.status,
            date: tx.date,
            description: tx.description,
            client: tx.client,
            agent: tx.agent,
            mode_paiement: tx.mode_paiement
          });
          setIsTxDrawerOpen(true);
        }}
        isLoading={loadingTransactions}
        emptyMessage="Aucune transaction aujourd'hui"
        headerTitle="Transactions Récentes"
        onViewAll={() => setActiveTab('historique')}
        maxItems={5}
      />

    </div>
        );
    }
  };



  const handleShowHistoryReceipt = (tx: Transaction) => {
      // Construct receipt data from transaction
      // Note: Client details might be sparse if not included in the transaction view
      // Ideally backend view should include client info.
      
      const rData: ReceiptData = {
          title: `Reçu ${tx.type_operation}`,
          reference: tx.reference,
          date: new Date(tx.created_at),
          type: tx.type_operation,
          client: {
              nom: tx.client_nom || 'Client',
              prenom: tx.client_prenom || 'Inconnu',
              telephone: tx.client_telephone
          },
          items: [{
              description: tx.description || tx.type_operation,
              montant: toNumber(tx.montant),
              quantite: 1
          }],
          total: toNumber(tx.montant),
          modePaiement: tx.mode_paiement,
          notes: 'Duplicata issu de l\'historique',
          agent: {
              nom: currentSession?.caissier_nom || 'Caissier',
              prenom: ''
          }
      };
      
      setHistoryReceiptData(rData);
      setShowHistoryReceipt(true);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-cyan-500/30">
        <UniversalPaymentSuccessModal
            isOpen={showHistoryReceipt}
            onClose={() => {
              setShowHistoryReceipt(false);
              setHistoryFactureId(undefined);
            }}
            term="Fermer"
            data={historyReceiptData}
        />
        
      <div className="w-full min-h-screen flex flex-col p-4 md:p-6">
        {/* App Header */}
        <div className="flex items-center justify-between mb-4 pt-2">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 flex items-center justify-center text-white">
                    <Wallet size={20} strokeWidth={2.5} />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white leading-none mb-0.5">Caisse</h1>
                        {currentSession?.caisse_nom && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase tracking-wider border border-cyan-500/20">
                                {currentSession.caisse_nom}
                            </span>
                        )}
                         {hasPendingOpening && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">
                                Ouverture en cours
                            </span>
                         )}
                         {currentSession?.statut === 'OPEN' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                Session Active
                            </span>
                         )}
                         {currentSession?.statut === 'CLOSING_COUNT' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20 animate-pulse">
                                Phase: Comptage
                            </span>
                         )}
                         {currentSession?.statut === 'CLOSING_VALIDATION' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 animate-pulse">
                                Phase: Validation Coffre
                            </span>
                         )}
                    </div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Gestion Financière</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {supervisedSession && supervisionInfo && (
                   <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSupervisionEnd}
                      className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                   >
                     Quitter Supervision
                   </Button>
                 )}

                 {canCreatePayments && (
                   <button
                      onClick={() => currentSession ? setShowPaiement(true) : alert('Caisse fermée')}
                      disabled={!currentSession || currentSession.statut === 'CLOSING_COUNT' || currentSession.statut === 'CLOSING_VALIDATION'}
                      className={`w-9 h-9 rounded-full bg-[#1e293b] border border-[#334155] text-cyan-400 hover:bg-[#334155] hover:text-white flex items-center justify-center transition-all ${
                        currentSession?.statut === 'CLOSING_COUNT' || currentSession?.statut === 'CLOSING_VALIDATION'
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                      title={currentSession?.statut === 'CLOSING_COUNT' || currentSession?.statut === 'CLOSING_VALIDATION' ? 'Session gelée - Finalisez la clôture' : undefined}
                   >
                       <CreditCard size={18} />
                   </button>
                )}
                 {!currentSession ? (
                    canOpenCaisse && (
                      <Button variant="success" size="sm" icon={Unlock} onClick={() => setShowOuverture(true)} className="rounded-full shadow-lg shadow-emerald-500/20">
                          Ouvrir
                      </Button>
                    )
                 ) : currentSession.statut === 'CLOSING_COUNT' || currentSession.statut === 'CLOSING_VALIDATION' ? (
                    // Show "Continue Closing" button when in closing workflow
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setActiveTab('rapprochement')}
                      className="rounded-full shadow-lg shadow-blue-500/20"
                    >
                        <RefreshCw size={14} className="mr-1.5" />
                        Continuer
                    </Button>
                 ) : (
                    canCloseCaisse && (
                      <Button variant="danger" size="sm" onClick={handleFermetureCaisse} className="rounded-full shadow-lg shadow-red-500/20">
                          <Lock size={14} className="mr-1.5" />
                          Fermer
                      </Button>
                    )
                 )}
            </div>
        </div>

        {supervisedSession && supervisionInfo && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border-y border-amber-500/20 -mx-4 md:-mx-6 mb-4 animate-in slide-in-from-top duration-500">
            {/* Main supervision banner */}
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Left side - Info */}
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 shrink-0">
                  <Shield size={18} className="text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Mode Supervision
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      supervisionTimeRemaining <= 5
                        ? 'bg-red-500/20 text-red-400 animate-pulse'
                        : supervisionTimeRemaining <= 10
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      <Timer size={10} className="inline mr-1" />
                      {supervisionTimeRemaining} min restantes
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-amber-300/80 flex-wrap">
                    <span>
                      <strong>{supervisionInfo.targetCaisseName}</strong>
                    </span>
                    <span className="opacity-50">•</span>
                    <span>{supervisionInfo.targetCaissierName}</span>
                    <span className="opacity-50">•</span>
                    <span className="italic text-amber-300/60">{supervisionInfo.reason}</span>
                  </div>
                </div>
              </div>

              {/* Right side - Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {supervisionTimeRemaining <= 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExtendSupervision}
                    className="text-amber-400 hover:bg-amber-500/20 text-xs"
                  >
                    <Timer size={14} className="mr-1" />
                    +15 min
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSupervisionEnd}
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 text-xs"
                >
                  Quitter
                </Button>
              </div>
            </div>

            {/* Warning footer */}
            <div className="px-4 py-1.5 bg-amber-950/30 border-t border-amber-500/10 flex items-center gap-2">
              <AlertCircle size={12} className="text-amber-500/60 shrink-0" />
              <p className="text-[10px] text-amber-300/50 italic">
                Les opérations sont enregistrées au nom de <strong>{supervisionInfo.targetCaissierName}</strong> avec mention "Supervisé par {supervisionInfo.supervisorName}"
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation (Sticky) */}
        <div className="bg-[#020617]/90 backdrop-blur-xl -mx-4 px-4 py-2 mb-2 border-b border-[#1e293b]/50 sticky top-0 z-20">
          <TabGroup
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={tabs}
            variant="pills"
            size="sm"
            scrollable
            className="pb-1"
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 pb-16">
             {renderContent()}
        </div>
      </div>

       {showOuverture && (
        <CaisseOuverture
          onClose={() => setShowOuverture(false)}
          onSuccess={handleOuvertureCaisse}
          pendingSession={pendingSession || undefined}
        />
      )}

      {showPaiement && currentSession && (
        <CaissePaiementModal
          onClose={() => {
            setShowPaiement(false);
            setInitialPaymentType(undefined);
            setPreSelectedAccountId(undefined);
            setPreFilledAmount(undefined);
            setPreSelectedClientId(undefined);
            onPaiementModalClose?.();
          }}
          initialType={initialPaymentType}
          sessionId={currentSession.id}
          preSelectedAccountId={preSelectedAccountId}
          preFilledAmount={preFilledAmount}
          preSelectedClientId={preSelectedClientId}
          onSuccess={() => {
            loadTransactionsJour();
            loadSessionActive();
          }}
        />
      )}

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTxDetail}
        isOpen={isTxDrawerOpen}
        onClose={() => {
          setIsTxDrawerOpen(false);
          setTimeout(() => setSelectedTxDetail(null), 300);
        }}
      />
    </div>
  );
}
