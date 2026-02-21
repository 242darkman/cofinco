import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, RefreshCw, ArrowRightLeft, Wallet,
  CreditCard, Lock, Unlock, FileText, TrendingUp, TrendingDown, Clock,
  PiggyBank, ArrowUpRight, ArrowDownRight, Shield, Timer, AlertCircle,
  LockKeyhole, KeyRound, Package, Check, History, ScrollText, Scale, ClipboardList
} from 'lucide-react';
import { FeatureHeader, FEATURE_DESCRIPTIONS } from '../../ui/FeatureHeader';
import { toast } from 'sonner';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { Button, Card, StatCard, TabGroup, LoadingSpinner } from '../../ui';
import { usePermissions } from '../../auth/ProtectedFeature';
import { sessionCaisseApi, caisseOperationApi, caisseSepareeApi, authApi, compteEpargneApi } from '../../../lib/api-client';
import { computeSessionStatus } from '../../../lib/format';
import { isIncomingOperation, isOutgoingOperation } from '@shared/config/caisse-operations';
import { CaisseQuickActions } from './CaisseQuickActions';
import CaisseOuverture from './CaisseOuverture';
import { useCaisseWebSocket } from '../../../hooks/useCaisseWebSocket';
import { useWebSocket } from '../../../hooks/useWebSocket';
// P2.1: Lazy load heavy tab components to reduce initial bundle size
const CaisseOperations = lazy(() => import('./CaisseOperations'));
const CaisseRapprochement = lazy(() => import('./CaisseRapprochement'));
const CaisseTransferts = lazy(() => import('./CaisseTransferts'));
const CaisseEtats = lazy(() => import('./CaisseEtats'));
const CaisseSupervision = lazy(() => import('./CaisseSupervision'));
import CaissePaiementModal from './CaissePaiementModal';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { SupervisionSession } from './shared/SupervisionConfirmModal';
import { isAdminRole } from '@shared/types/roles';

import { useSessionTimeout } from '../../../hooks/finance/useSessionTimeout';
import { usePendingSessionSync } from '../../../hooks/finance/usePendingSessionSync';
const CaisseAuditLog = lazy(() => import('./CaisseAuditLog'));
const WeightVerificationPanel = lazy(() => import('./WeightVerificationPanel'));
const CaisseAccessControl = lazy(() => import('./CaisseAccessControl'));
const CaisseHistoriqueGlobal = lazy(() => import('./CaisseHistoriqueGlobal'));
const CaisseDemandesTab = lazy(() => import('./CaisseDemandesTab'));
import { TransactionsList, TransactionDetailDrawer, TransactionHistoryPage } from '../transactions';
import type { TransactionItem, TransactionDetails } from '../transactions';


import { SessionCaisse, CaisseTransaction as Transaction } from '../../../types/finance';

// P2.1: Suspense fallback for lazy loaded components
const TabLoadingFallback = () => (
  <div className="flex items-center justify-center h-48">
    <LoadingSpinner size="md" />
  </div>
);

// P3.2: Pre-instantiated number formatter to avoid creating new Intl.NumberFormat on each render
const moneyFormatter = new Intl.NumberFormat('fr-FR');

interface CaisseProps {
  userRole?: string;
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
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
  const [activeTab, setActiveTab] = useState(activeView || 'dashboard');

  // Sync tab changes to URL
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab === 'dashboard') {
      onModuleChange?.('caisse');
    } else {
      onModuleChange?.('caisse', tab);
    }
  }, [onModuleChange]);

  // Sync URL changes to tab
  useEffect(() => {
    if (activeView && activeView !== activeTab) {
      setActiveTab(activeView);
    } else if (!activeView && activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    }
  }, [activeView]);

  const [showOuverture, setShowOuverture] = useState(false);
  const [showRapprochement, setShowRapprochement] = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);


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
      if (!data) return null;
      // Use actual DB statut — only OPEN and closing phases are truly active sessions
      // REQUESTING_FUNDS and FUNDS_DISPATCHED are pending opening workflow
      const statut = data.statut;
      if (statut === 'OPEN' || statut === 'CLOSING_COUNT' || statut === 'CLOSING_VALIDATION') {
        return data as SessionCaisse;
      }
      return null;
    }
  });

  // Hybrid sync for pending sessions (WebSocket + Polling)
  const {
    pendingSession,
    isLoading: loadingPendingSession,
    refetch: refetchPendingSession,
    isWebSocketConnected
  } = usePendingSessionSync({
    enabled: !sessionActive && !supervisedSession,
    onStatusChange: (prevStatus, newStatus) => {
      // Handle status transitions
      if (prevStatus === 'REQUESTING_FUNDS' && newStatus === 'FUNDS_DISPATCHED') {
        // Auto-open modal for fund confirmation
        setShowOuverture(true);
      }
    }
  });

  // Query for user's assigned caisses with available balance (when no session is active)
  const {
    data: myCaisses = [],
    refetch: refetchMyCaisses
  } = useQuery({
    queryKey: ['session-caisse', 'my-caisses'],
    queryFn: async () => {
      const data = await sessionCaisseApi.getMyCaisses();
      return data || [];
    },
    // Always fetch to show available funds
    enabled: true
  });

  // Get the first non-occupied caisse for displaying available funds
  const availableCaisse = myCaisses.find((c: any) => !c.isOccupied);
  const availableBalance = availableCaisse?.availableBalance ?? 0;

  // Actual session being used (own or supervised)
  const currentSession = supervisedSession || sessionActive;

  // Determine if we have a pending opening workflow
  const hasPendingOpening = !currentSession && pendingSession &&
    (pendingSession.statut === 'REQUESTING_FUNDS' || pendingSession.statut === 'FUNDS_DISPATCHED');




  // Demandes tab total count — two sources:
  // 1. Count queries (when tab is NOT mounted) — updated via WS event listeners
  // 2. CaisseDemandesTab callback (when tab IS mounted) — authoritative, always in sync
  const [demandesCountOverride, setDemandesCountOverride] = useState<number | null>(null);

  const sessionAgenceId = currentSession?.agenceId;

  const { data: caisseRequestsCountData, refetch: refetchCaisseRequestsCount } = useQuery({
    queryKey: ['caisse-payment-requests-count', sessionAgenceId],
    queryFn: async () => {
      const params = sessionAgenceId ? `?agenceId=${sessionAgenceId}` : '';
      const res = await fetch(`/api/caisses/payment-requests/count${params}`, { credentials: 'include' });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!currentSession,
    staleTime: 10000,
  });

  const { data: pendingDisbursementsData, refetch: refetchPendingDisbursements } = useQuery({
    queryKey: ['pending-disbursements'],
    queryFn: async () => {
      const res = await fetch('/api/credits/pending-disbursements', { credentials: 'include' });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!currentSession,
    staleTime: 10000,
  });

  const { data: agentSessionsData, refetch: refetchAgentSessions } = useQuery({
    queryKey: ['agent-sessions-requesting', sessionAgenceId],
    queryFn: async () => {
      const params = new URLSearchParams({ statut: 'REQUESTING_FUNDS' });
      if (sessionAgenceId) params.set('agenceId', sessionAgenceId);
      const res = await fetch(`/api/caisse-agent/sessions?${params}`, { credentials: 'include' });
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    enabled: !!currentSession,
    staleTime: 10000,
  });

  const queryBasedCount =
    (caisseRequestsCountData?.count || 0) +
    (pendingDisbursementsData?.count || pendingDisbursementsData?.data?.length || 0) +
    (agentSessionsData?.sessions?.length || 0);

  // Use override from CaisseDemandesTab when mounted, fall back to query count
  const demandesCount = demandesCountOverride ?? queryBasedCount;

  // Reset override when navigating away from demandes tab
  useEffect(() => {
    if (activeTab !== 'demandes') setDemandesCountOverride(null);
  }, [activeTab]);

  // Listen for caisse request updates (WebSocket → DOM event)
  useEffect(() => {
    const handler = () => { refetchCaisseRequestsCount(); };
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
  }, [refetchCaisseRequestsCount]);

  // Listen for agent provisioning updates (WebSocket → DOM event)
  useEffect(() => {
    const handler = () => { refetchAgentSessions(); };
    window.addEventListener('agent-provisioning-update', handler);
    return () => window.removeEventListener('agent-provisioning-update', handler);
  }, [refetchAgentSessions]);

  // WebSocket listener for real-time loan disbursement updates
  const { socket } = useWebSocket();
  useEffect(() => {
    if (!socket || !currentSession) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype } = data.payload || {};
          if (['NEW_LOAN_DISBURSEMENT', 'LOAN_DISBURSEMENT_COMPLETED', 'LOAN_DISBURSEMENT_CANCELLED'].includes(subtype)) {
            refetchPendingDisbursements();
          }
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, currentSession, refetchPendingDisbursements]);

  // Legacy subModule aliases (for cross-module navigation from dashboard quick actions)
  useEffect(() => {
    if (activeView) {
      const legacyMap: Record<string, string> = {
        'caisse-session': 'dashboard',
        'caisse-operations': 'dashboard',
        'caisse-cloture': 'rapprochement',
      };
      if (legacyMap[activeView]) {
        setActiveTab(legacyMap[activeView]);
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
  // Enable WebSocket for both active sessions AND pending opening sessions
  const wsEnabled = !!currentSession || !!hasPendingOpening;
  const wsCaisseId = currentSession?.caisseId || pendingSession?.caisseId;
  const wsSessionId = currentSession?.id || pendingSession?.id;

  useCaisseWebSocket({
    caisseId: wsCaisseId,
    sessionId: wsSessionId,
    enabled: wsEnabled,
    onSessionUpdated: (data) => {
        refetchSession(); // To update balance
        refetchTransactions(); // To show new operation
        refetchPendingSession(); // To check pending status
        if (data.type === 'MOUVEMENT_CREE') {
            toast.info('Nouvelle opération reçue');
        }
    },
    onCaisseUpdate: (data) => {
        // Handle opening workflow events
        if (data.type === 'SESSION_OPENED') {
            refetchSession();
            refetchPendingSession();
        } else if (data.type === 'FUNDS_DISPATCHED') {
            // Funds ready - cashier can now confirm receipt
            refetchPendingSession();
        } else if (data.type === 'FUNDS_REJECTED') {
            // Request rejected - reset to initial state
            refetchPendingSession();
        } else if (data.type === 'OPENING_CANCELLED' || data.type === 'OPENING_CANCELLED_FUNDS_RETURNED') {
            // Opening cancelled - refresh pending state
            refetchPendingSession();
            refetchSession();
        } else if (data.type === 'BALANCE_UPDATED') {
            refetchSession();
        }
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
    handleTabChange('dashboard');
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
    setShowRapprochement(true);
  };

  // Session inactivity timeout
  const { isWarning: sessionTimeoutWarning, remainingSeconds: timeoutRemaining, resetTimer: resetSessionTimeout } = useSessionTimeout({
    enabled: !!currentSession && currentSession.statut === 'OPEN',
    onTimeout: () => {
      toast.warning('Session fermée pour inactivité', {
        description: 'Votre session a été redirigée vers la clôture après 15 minutes d\'inactivité.',
      });
      handleTabChange('rapprochement');
    },
  });

  const handleNouvelleOperation = () => {
    if (currentSession) {
      setInitialPaymentType(undefined); // Modal ouvert sans type pré-sélectionné
      setShowPaiement(true);
    } else {
      alert('Veuillez ouvrir une session de caisse');
    }
  };

  // Calcul des entrées/sorties en utilisant les helpers centralisés
  // Exclure les opérations REVERSED (annulées) et classifier les annulations dans le sens inverse
  const activeTransactions = transactions.filter(t => t.statut !== 'REVERSED');
  const entreesOps = activeTransactions.filter(t => {
    const isReversal = t.description?.startsWith('[ANNULATION]');
    // Reversal of incoming = outgoing, Reversal of outgoing = incoming
    return isReversal ? isOutgoingOperation(t.typeOperation) : isIncomingOperation(t.typeOperation);
  });
  const sortiesOps = activeTransactions.filter(t => {
    const isReversal = t.description?.startsWith('[ANNULATION]');
    return isReversal ? isIncomingOperation(t.typeOperation) : isOutgoingOperation(t.typeOperation);
  });

  const totalEntrees = entreesOps.reduce((sum, t) => sum + toNumber(t.montant), 0);
  const totalSorties = sortiesOps.reduce((sum, t) => sum + toNumber(t.montant), 0);
  const nbEntrees = entreesOps.length;
  const nbSorties = sortiesOps.length;

  // SINGLE SOURCE OF TRUTH: Utiliser montant_fermeture_theorique du backend (mis à jour atomiquement par le ledger)
  // Le calcul manuel (montant_ouverture + entrées - sorties) peut diverger si des opérations sont manquantes côté client
  // When no session is active, show available balance from assigned caisse
  const soldeActuel = currentSession
    ? toNumber(currentSession.montantFermetureTheorique || 0)
    : availableBalance;

  const isSessionOpen = !!currentSession;

  // Redirection automatique si on tente d'accéder à un onglet verrouillé
  useEffect(() => {
    if (!loadingSession && !isSessionOpen && activeTab !== 'dashboard' && activeTab !== 'supervision') {
      handleTabChange('dashboard');
      toast.error("Session fermée", {
        description: "Veuillez ouvrir une session pour accéder à ce module."
      });
    }
  }, [loadingSession, isSessionOpen, activeTab]);

  // Check if session is in closing workflow (frozen - no new transactions allowed)
  const isClosingWorkflow = currentSession?.statut === 'CLOSING_COUNT' || currentSession?.statut === 'CLOSING_VALIDATION';

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: Activity, disabled: false },
    { key: 'demandes', label: 'Demandes', icon: ClipboardList, disabled: !isSessionOpen, badge: demandesCount > 0 ? demandesCount : undefined, badgeClassName: 'bg-accent-secondary text-white animate-pulse' },
    { key: 'operations', label: 'Opérations', icon: ArrowRightLeft, disabled: !isSessionOpen || isClosingWorkflow },
    { key: 'historique', label: 'Historique', icon: Clock, disabled: !isSessionOpen },
    { key: 'transferts', label: 'Transferts', icon: ArrowRightLeft, disabled: !isSessionOpen || isClosingWorkflow },
    { key: 'etats', label: 'États', icon: FileText, disabled: !isSessionOpen },
    { key: 'supervision', label: 'Supervision', icon: Shield, disabled: false },
    { key: 'audit', label: 'Audit', icon: ScrollText, disabled: !isSessionOpen },
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





  // P3.2: Use pre-instantiated formatter instead of creating new one each call
  const formattedMoney = (amount: number) => moneyFormatter.format(amount);

  const renderContent = () => {
    switch (activeTab) {
      case 'demandes':
        return currentSession ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Suspense fallback={<TabLoadingFallback />}>
              <CaisseDemandesTab
                sessionCaisseId={currentSession.id}
                caisseId={currentSession.caisseId || ''}
                agenceId={currentSession.agenceId || undefined}
                onRequestProcessed={() => {
                  refetchSession();
                  refetchTransactions();
                }}
                onTotalCountChange={setDemandesCountOverride}
              />
            </Suspense>
          </div>
        ) : null;
      case 'operations':
        return currentSession ? (
          <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CaisseOperations
              sessionId={currentSession.id}
              onTransactionComplete={() => {
                loadSessionActive();
                loadTransactionsJour();
                loadCaissesSeparees();
              }}
            />
          </div>
        ) : null;
      // prets-decaissement is now integrated in the 'demandes' tab
      case 'historique':
        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 flex flex-col h-full">
            {/* Toggle between Today and Global History */}
            <div className="flex items-center justify-between mb-2 px-2 shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTabChange('dashboard')}
                  icon={ArrowRightLeft}
                  className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180 text-content-muted hover:text-content-primary"
                />
                <h2 className="text-lg font-bold text-content-primary">Historique</h2>
              </div>
              <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
                <button
                  onClick={() => setHistoriqueMode('today')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    historiqueMode === 'today'
                      ? 'bg-accent-secondary text-white shadow-lg shadow-accent/20'
                      : 'text-content-muted hover:text-content-primary'
                  }`}
                >
                  <Clock size={12} className="inline mr-1 mb-0.5" />
                  Aujourd'hui
                </button>
                <button
                  onClick={() => setHistoriqueMode('global')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    historiqueMode === 'global'
                      ? 'bg-accent-secondary text-white shadow-lg shadow-accent/20'
                      : 'text-content-muted hover:text-content-primary'
                  }`}
                >
                  <History size={12} className="inline mr-1 mb-0.5" />
                  Global
                </button>
              </div>
            </div>

            {historiqueMode === 'global' && currentSession?.caisseId ? (
              <div className="flex-1 min-h-0">
                  <CaisseHistoriqueGlobal
                    caisseId={currentSession.caisseId}
                    caisseName={currentSession.caisseNom}
                    onBack={() => handleTabChange('dashboard')}
                  />
              </div>
            ) : (
              <div className="flex-1 min-h-0 px-2">
                <TransactionHistoryPage
                  embedded
                  transactions={transactions.map(tx => ({
                    id: tx.id,
                    reference: tx.reference,
                    amount: toNumber(tx.montant),
                    type: tx.typeOperation,
                    typeOperation: tx.typeOperation,
                    status: tx.description?.startsWith('[ANNULATION]') ? 'REVERSED' : (tx.statut || tx.status || 'POSTED'),
                    date: tx.createdAt,
                    description: tx.description,
                    client: tx.clientNom ? {
                      name: `${tx.clientNom} ${tx.clientPrenom || ''}`.trim(),
                      telephone: tx.clientTelephone
                    } : undefined,
                    agent: currentSession?.caissierNom,
                    mode_paiement: tx.modePaiement,
                    created_at: tx.createdAt
                  }))}
                  isLoading={loadingTransactions}
                  onRefresh={() => refetchTransactions()}
                />
              </div>
            )}
          </div>
        );

      case 'transferts':
        return <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseTransferts session={currentSession} soldeActuel={soldeActuel} onBack={() => handleTabChange('dashboard')} /></div>;
      case 'etats':
        return <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseEtats onBack={() => handleTabChange('dashboard')} /></div>;

      case 'supervision':
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => handleTabChange('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-content-primary">Supervision</h2>
                 </div>
                 <CaisseSupervision
                    activeSupervision={supervisionInfo}
                    onTakeControl={handleSupervisionStart}
                 />
            </div>
        );
      case 'audit':
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => handleTabChange('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-content-primary">Journal d'Audit</h2>
                 </div>
                 <CaisseAuditLog />
            </div>
        );
      default:
        // Handle pending opening workflow states
        if (hasPendingOpening && pendingSession) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] sm:min-h-[50vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {pendingSession.statut === 'REQUESTING_FUNDS' ? (
                <>
                  <div className="p-8 rounded-[2rem] bg-status-warning/5 ring-1 ring-status-warning/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-status-warning-bg to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Clock className="w-16 h-16 text-status-warning relative z-10 animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-content-primary tracking-tight">Vérification Coffre</h2>
                    <p className="text-content-muted max-w-sm mx-auto font-medium leading-relaxed">
                      Votre demande de <span className="text-status-warning font-bold">{moneyFormatter.format(pendingSession.montantDemande || 0)} FCFA</span> est en cours d'examen par la supervision.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-status-warning-bg rounded-full border border-status-warning/20 text-[10px] font-black text-status-warning uppercase tracking-widest">
                       <Timer size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                       {isWebSocketConnected ? 'Temps Réel Actif' : 'Vérification Active'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setShowOuverture(true)}
                      className="w-full border-white/10 text-content-muted hover:text-content-primary hover:bg-white/5 rounded-2xl font-bold"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Gérer la Demande
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-8 rounded-[2rem] bg-status-success/5 ring-1 ring-status-success/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-status-success/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Package className="w-16 h-16 text-status-success relative z-10" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-content-primary tracking-tight">Dotation Prête</h2>
                    <p className="text-content-muted max-w-sm mx-auto font-medium leading-relaxed">
                      Le coffre a débloqué <span className="text-status-success font-bold">{moneyFormatter.format(pendingSession.montantDemande || 0)} FCFA</span>. Vous devez confirmer le comptage pour activer votre session.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-status-success-bg rounded-full border border-status-success/20 text-[10px] font-black text-status-success uppercase tracking-widest">
                       <Check size={12} />
                       Validation Coffre: Reçue
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      onClick={() => setShowOuverture(true)}
                      className="w-full bg-status-success hover:bg-status-success text-white shadow-xl shadow-status-success/20 rounded-2xl font-black py-6 text-lg"
                    >
                      <KeyRound className="w-5 h-5 mr-2" />
                      Ouvrir le Terminal
                    </Button>
                  </div>
                </>
              )}

              {isAdminRole(userRole) && (
                <button
                  onClick={() => handleTabChange('supervision')}
                  className="text-sm text-content-muted hover:text-accent underline decoration-content-primary hover:decoration-accent/50 underline-offset-4 transition-all"
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
          const isPendingCoffreValidation = isValidationPhase && currentSession.coffreValidationStatus === 'PENDING';

          return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] sm:min-h-[50vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {isCountPhase ? (
                // Phase 1: Counting in progress
                <>
                  <div className="p-6 rounded-full bg-status-info-bg ring-1 ring-status-info/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-status-info/10 to-status-info/5" />
                    <RefreshCw className="w-16 h-16 text-status-info relative z-10 animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-content-primary">Session en Fermeture</h2>
                    <p className="text-content-muted max-w-md mx-auto">
                      La session est <span className="text-status-info font-bold">gelée</span>. Veuillez compter vos billets et soumettre le comptage physique.
                    </p>
                    {currentSession.closingInitiatedAt && (
                      <p className="text-xs text-content-muted">
                        Fermeture initiée le {new Date(currentSession.closingInitiatedAt).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                    <Button
                      size="lg"
                      onClick={() => handleTabChange('rapprochement')}
                      className="w-full bg-status-info hover:bg-status-info text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] font-bold py-6 text-lg"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Soumettre le Comptage
                    </Button>
                  </div>
                </>
              ) : isPendingCoffreValidation ? (
                // Phase 2: Waiting for coffre validation
                <>
                  <div className="p-6 rounded-full bg-status-warning-bg ring-1 ring-status-warning/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-status-warning-bg to-status-warning/5" />
                    <Clock className="w-16 h-16 text-status-warning relative z-10 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-content-primary">Transfert en Attente</h2>
                    <p className="text-content-muted max-w-md mx-auto">
                      Le transfert de <span className="text-status-warning font-bold">{moneyFormatter.format(currentSession.montantVersCoffre || 0)} FCFA</span> vers le coffre est en attente de validation.
                    </p>
                    {currentSession.montantReporte && Number(currentSession.montantReporte) > 0 && (
                      <p className="text-xs text-status-success">
                        Fonds reportés: {moneyFormatter.format(currentSession.montantReporte)} FCFA
                      </p>
                    )}
                    {currentSession.countSubmittedAt && (
                      <p className="text-xs text-content-muted">
                        Comptage soumis le {new Date(currentSession.countSubmittedAt).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => handleTabChange('rapprochement')}
                      className="w-full border-status-warning/50 text-status-warning hover:bg-status-warning-bg"
                    >
                      <Clock className="w-5 h-5 mr-2" />
                      Voir le Détail
                    </Button>
                  </div>
                </>
              ) : (
                // Phase 2: Ready to finalize
                <>
                  <div className="p-8 rounded-[2rem] bg-status-success/5 ring-1 ring-status-success/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-status-success/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Lock className="w-16 h-16 text-status-success relative z-10" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-content-primary tracking-tight">Vault Compté</h2>
                    <p className="text-content-muted max-w-sm mx-auto font-medium leading-relaxed">
                      Le rapprochement physique a été enregistré La session est prête pour l'archivage final.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-status-success-bg rounded-full border border-status-success/20 text-[10px] font-black text-status-success uppercase tracking-widest">
                       <Shield size={12} />
                       Comptage Physique: {moneyFormatter.format(currentSession.montantPhysique || 0)} F
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-center w-full max-w-xs">
                    <Button
                      size="lg"
                      onClick={() => handleTabChange('rapprochement')}
                      className="w-full bg-status-success hover:bg-status-success text-white shadow-xl shadow-status-success/20 rounded-2xl font-black py-6 text-lg"
                    >
                      <Check className="w-5 h-5 mr-2" />
                      Finaliser le Protocole
                    </Button>
                  </div>
                </>
              )}

              {isAdminRole(userRole) && (
                <button
                  onClick={() => handleTabChange('supervision')}
                  className="text-sm text-content-muted hover:text-accent underline decoration-content-primary hover:decoration-accent/50 underline-offset-4 transition-all"
                >
                  Accéder aux outils de supervision
                </button>
              )}
            </div>
          );
        }

        if (!isSessionOpen) {
           return (
             <div className="flex flex-col items-center justify-center min-h-[40vh] sm:min-h-[50vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-6 rounded-full bg-surface-base ring-1 ring-edge shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-surface/0 to-surface-elevated/0 group-hover:from-surface/20 group-hover:to-surface-elevated/20 transition-all duration-500" />
                  <LockKeyhole className="w-16 h-16 text-content-muted relative z-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-content-primary">Session de Caisse Fermée</h2>
                  <p className="text-content-muted max-w-md mx-auto">
                    Les opérations d'encaissement et de décaissement sont verrouillées. Veuillez ouvrir une session pour commencer votre journée.
                  </p>
                </div>
                <div className="flex flex-col gap-3 items-center w-full max-w-sm">
                  {canOpenCaisse && (
                    <Button
                      size="lg"
                      onClick={() => setShowOuverture(true)}
                      className="w-full bg-status-success hover:bg-status-success text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] font-bold py-6 text-lg"
                    >
                      <KeyRound className="w-5 h-5 mr-2" />
                      Ouvrir ma Session
                    </Button>
                  )}

                  {isAdminRole(userRole) && (
                    <button
                      onClick={() => handleTabChange('supervision')}
                      className="text-sm text-content-muted hover:text-accent underline decoration-content-primary hover:decoration-accent/50 underline-offset-4 transition-all"
                    >
                      Accéder aux outils de supervision sans ouvrir
                    </button>
                  )}
                </div>
             </div>
           );
        }

        return (
          <div className="space-y-2 animate-in fade-in duration-500 h-full flex flex-col">
      {currentSession && (
        <CaisseQuickActions
          caisseId={currentSession.caisseId || ''}
          agenceId={currentSession.agenceId || ''}
          onNouvelleOperation={handleNouvelleOperation}
        />
      )}
      
      {/* Top Session Stats - Compact View */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatCard
             title="Solde de Session"
             value={`${formattedMoney(soldeActuel)} FCFA`}
             icon={Wallet}
             color="primary"
             subtitle={currentSession ? `Initial: ${formattedMoney(toNumber(currentSession.montantOuverture || currentSession.soldeInitial))} FCFA` : (availableBalance > 0 ? "Fonds disponibles" : "Session Fermée")}
             trend={(() => {
               if (!currentSession) return undefined;
               const initial = toNumber(currentSession.montantOuverture || currentSession.soldeInitial);
               if (initial <= 0) return undefined;
               const variation = Math.round(((soldeActuel - initial) / initial) * 100);
               return variation >= 0 ? `+${variation}%` : `${variation}%`;
             })()}
             trendUp={currentSession ? soldeActuel >= toNumber(currentSession.montantOuverture || currentSession.soldeInitial) : undefined}
             className="shadow-sm"
          />
          <StatCard
             title="Entrées"
             value={`${formattedMoney(totalEntrees)} FCFA`}
             icon={ArrowDownRight}
             color="success"
             subtitle={nbEntrees > 0 ? `${nbEntrees} opération${nbEntrees > 1 ? 's' : ''}` : undefined}
             trend={(() => {
               const totalFlux = totalEntrees + totalSorties;
               if (totalFlux <= 0) return undefined;
               return `${Math.round((totalEntrees / totalFlux) * 100)}% du flux`;
             })()}
             trendUp={totalEntrees > 0}
             className="shadow-sm"
          />
           <StatCard
             title="Sorties"
             value={`${formattedMoney(totalSorties)} FCFA`}
             icon={ArrowUpRight}
             color="warning"
             subtitle={nbSorties > 0 ? `${nbSorties} opération${nbSorties > 1 ? 's' : ''}` : undefined}
             trend={(() => {
               const totalFlux = totalEntrees + totalSorties;
               if (totalFlux <= 0) return undefined;
               return `${Math.round((totalSorties / totalFlux) * 100)}% du flux`;
             })()}
             trendUp={false}
             className="shadow-sm"
          />
      </div>

      {/* Recent Transactions - Using new TransactionsList component */}
      <TransactionsList
        transactions={transactions.map(tx => ({
          id: tx.id,
          reference: tx.reference,
          amount: toNumber(tx.montant),
          type: tx.typeOperation,
          typeOperation: tx.typeOperation,
          status: tx.description?.startsWith('[ANNULATION]') ? 'REVERSED' : (tx.statut || tx.status || 'POSTED'),
          date: tx.createdAt,
          description: tx.description,
          client: tx.clientNom ? {
            name: `${tx.clientNom} ${tx.clientPrenom || ''}`.trim(),
            telephone: tx.clientTelephone
          } : undefined,
          agent: currentSession?.caissierNom,
          modePaiement: tx.modePaiement,
          createdAt: tx.createdAt
        }))}
        onTransactionClick={(tx) => {
          setSelectedTxDetail({
            id: tx.id,
            reference: tx.reference,
            amount: tx.amount,
            type: tx.typeOperation || tx.type,
            typeOperation: tx.typeOperation,
            status: tx.status,
            date: tx.date,
            description: tx.description,
            client: tx.client,
            agent: tx.agent,
            modePaiement: tx.modePaiement
          });
          setIsTxDrawerOpen(true);
        }}
        isLoading={loadingTransactions}
        emptyMessage="Aucune opération aujourd'hui"
        headerTitle="Opérations du Jour"
        onViewAll={() => handleTabChange('historique')}
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
          title: `Reçu ${tx.typeOperation}`,
          reference: tx.reference,
          date: new Date(tx.createdAt || tx.created_at),
          type: tx.typeOperation,
          client: {
              nom: tx.clientNom || 'Client',
              prenom: tx.clientPrenom || 'Inconnu',
              telephone: tx.clientTelephone
          },
          items: [{
              description: tx.description || tx.typeOperation || tx.type_operation,
              montant: toNumber(tx.montant),
              quantite: 1
          }],
          total: toNumber(tx.montant),
          modePaiement: tx.modePaiement,
          notes: 'Duplicata issu de l\'historique',
          agent: {
              nom: currentSession?.caissierNom || 'Caissier',
              prenom: ''
          }
      };
      
      setHistoryReceiptData(rData);
      setShowHistoryReceipt(true);
  };

  return (
    <div className="min-h-full bg-surface-base text-content-primary font-sans selection:bg-accent-secondary/30">
        <UniversalPaymentSuccessModal
            isOpen={showHistoryReceipt}
            onClose={() => {
              setShowHistoryReceipt(false);
              setHistoryFactureId(undefined);
            }}
            term="Fermer"
            data={historyReceiptData}
        />

      <div className={`w-full flex flex-col p-3 md:p-4 ${activeTab === 'historique' || activeTab === 'etats' || activeTab === 'operations' ? 'h-full overflow-hidden' : 'min-h-full'}`}>
        {/* App Header with contextual help */}
        <FeatureHeader
          featureKey="finance.caisse"
          title={
            <>
              {FEATURE_DESCRIPTIONS['finance.caisse'].title}
              {currentSession?.caisseNom && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider border border-accent/20">
                  {currentSession.caisseNom}
                </span>
              )}
              {hasPendingOpening && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning text-[10px] font-black uppercase tracking-widest border border-status-warning/20">
                  Ouverture en cours
                </span>
              )}
              {currentSession?.statut === 'OPEN' && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-status-success-bg text-status-success text-[10px] font-black uppercase tracking-widest border border-status-success/20">
                  Ouverte
                </span>
              )}
              {currentSession?.statut === 'CLOSING_COUNT' && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-status-info-bg text-status-info text-[10px] font-black uppercase tracking-widest border border-status-info/20 animate-pulse">
                  Phase: Comptage
                </span>
              )}
              {currentSession?.statut === 'CLOSING_VALIDATION' && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning text-[10px] font-black uppercase tracking-widest border border-status-warning/20 animate-pulse">
                  Phase: Validation Coffre
                </span>
              )}
            </>
          }
          subtitle={FEATURE_DESCRIPTIONS['finance.caisse'].subtitle}
          helpText={FEATURE_DESCRIPTIONS['finance.caisse'].helpText}
          icon={<Wallet size={24} className="text-accent" />}
          actions={
            <div className="flex items-center gap-2">
              {supervisedSession && supervisionInfo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSupervisionEnd}
                  className="border-status-warning/50 text-status-warning hover:bg-status-warning-bg"
                >
                  Quitter Supervision
                </Button>
              )}

              {canCreatePayments && (
                <button
                  onClick={() => currentSession ? setShowPaiement(true) : alert('Caisse fermée')}
                  disabled={!currentSession || currentSession.statut === 'CLOSING_COUNT' || currentSession.statut === 'CLOSING_VALIDATION'}
                  className={`w-9 h-9 rounded-full bg-surface-raised border border-edge-subtle text-accent hover:bg-surface-hover hover:text-content-primary flex items-center justify-center transition-all ${
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
                  <Button variant="success" size="sm" icon={Unlock} onClick={() => setShowOuverture(true)} className="rounded-full shadow-lg shadow-status-success/20">
                    Ouvrir
                  </Button>
                )
              ) : currentSession.statut === 'CLOSING_COUNT' || currentSession.statut === 'CLOSING_VALIDATION' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleTabChange('rapprochement')}
                  className="rounded-full shadow-lg shadow-status-info/20"
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  Continuer
                </Button>
              ) : (
                canCloseCaisse && (
                  <Button variant="danger" size="sm" onClick={handleFermetureCaisse} className="rounded-full shadow-lg shadow-status-danger/20">
                    <Lock size={14} className="mr-1.5" />
                    Fermer
                  </Button>
                )
              )}
            </div>
          }
          className="mb-2 pt-1"
        />

        {supervisedSession && supervisionInfo && (
          <div className="bg-gradient-to-r from-status-warning-bg via-amber-500/5 to-status-warning/10 border-y border-status-warning/20 -mx-4 md:-mx-6 mb-4 animate-in slide-in-from-top duration-500">
            {/* Main supervision banner */}
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Left side - Info */}
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 rounded-lg bg-status-warning-bg shrink-0">
                  <Shield size={18} className="text-status-warning" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-status-warning">
                      Mode Supervision
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      supervisionTimeRemaining <= 5
                        ? 'bg-status-danger-bg text-status-danger animate-pulse'
                        : supervisionTimeRemaining <= 10
                          ? 'bg-status-warning-bg text-status-warning'
                          : 'bg-status-success-bg text-status-success'
                    }`}>
                      <Timer size={10} className="inline mr-1" />
                      {supervisionTimeRemaining} min restantes
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-status-warning/80 flex-wrap">
                    <span>
                      <strong>{supervisionInfo.targetCaisseName}</strong>
                    </span>
                    <span className="opacity-50">•</span>
                    <span>{supervisionInfo.targetCaissierName}</span>
                    <span className="opacity-50">•</span>
                    <span className="italic text-status-warning/60">{supervisionInfo.reason}</span>
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
                    className="text-status-warning hover:bg-status-warning-bg text-xs"
                  >
                    <Timer size={14} className="mr-1" />
                    +15 min
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSupervisionEnd}
                  className="border-status-warning/50 text-status-warning hover:bg-status-warning-bg text-xs"
                >
                  Quitter
                </Button>
              </div>
            </div>

            {/* Warning footer */}
            <div className="px-4 py-1.5 bg-status-warning-bg border-t border-status-warning/10 flex items-center gap-2">
              <AlertCircle size={12} className="text-status-warning/60 shrink-0" />
              <p className="text-[10px] text-status-warning/50 italic">
                Les opérations sont enregistrées au nom de <strong>{supervisionInfo.targetCaissierName}</strong> avec mention "Supervisé par {supervisionInfo.supervisorName}"
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation (Sticky) */}
        <div className="bg-surface-base/90 backdrop-blur-xl -mx-4 px-4 py-2 mb-2 border-b border-edge/50 sticky top-0 z-20">
          <TabGroup
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabs={tabs}
            variant="pills"
            size="sm"
            scrollable
            className="pb-1"
          />
        </div>

        {/* Main Content - P2.1: Wrapped in Suspense for lazy loaded components */}
        <div className="flex-1 min-h-0">
          <Suspense fallback={<TabLoadingFallback />}>
            {renderContent()}
          </Suspense>
        </div>
      </div>

       {showOuverture && (
        <CaisseOuverture
          onClose={() => {
            setShowOuverture(false);
            // Rafraîchir l'état de la session après fermeture du modal
            // (annulation, rejet ou simple fermeture)
            refetchSession();
            refetchPendingSession();
          }}
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

      {/* Session Inactivity Warning Modal */}
      {sessionTimeoutWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-base border border-status-warning/50 rounded-xl p-6 max-w-sm mx-4 shadow-2xl shadow-status-warning/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-status-warning-bg flex items-center justify-center">
                <Timer className="w-5 h-5 text-status-warning" />
              </div>
              <div>
                <h3 className="text-content-primary font-bold text-sm">Session inactive</h3>
                <p className="text-content-muted text-xs">Votre session sera fermée par inactivité</p>
              </div>
            </div>
            <div className="text-center mb-5">
              <div className="text-4xl font-bold text-status-warning font-mono">
                {Math.floor(timeoutRemaining / 60)}:{String(timeoutRemaining % 60).padStart(2, '0')}
              </div>
              <p className="text-xs text-content-muted mt-1">avant fermeture automatique</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRapprochement(true);
                  resetSessionTimeout();
                }}
                className="flex-1 px-4 py-2 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg text-sm font-medium transition"
              >
                Fermer la session
              </button>
              <button
                onClick={resetSessionTimeout}
                className="flex-1 px-4 py-2 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-lg text-sm font-bold transition"
              >
                Rester connecté
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rapprochement / Fermeture de caisse — modal overlay */}
      {showRapprochement && currentSession && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto p-4">
          <div className="w-full max-w-3xl my-8 animate-in slide-in-from-bottom-4 duration-200">
            <CaisseRapprochement
              session={currentSession}
              onClose={() => {
                setShowRapprochement(false);
                loadSessionActive();
                loadTransactionsJour();
              }}
              soldeTheoriqueCalcule={soldeActuel}
            />
            <WeightVerificationPanel compact />
          </div>
        </div>
      )}
    </div>
  );
}
