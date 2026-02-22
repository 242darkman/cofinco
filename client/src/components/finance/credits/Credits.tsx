import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CreditCard, FileText, ClipboardCheck, BarChart3, TrendingUp, AlertCircle, Clock, CheckCircle, WifiOff, Eye, Trash2, DollarSign, XCircle, RefreshCw, Users, ArrowRight, Calendar, Play, UserCheck } from 'lucide-react';
import { Card, Button, PageHeader, TabGroup, StatCard, ResponsiveTable, Badge, LoadingScreen, IconButton, ConfirmDialog, FeatureHeader, FEATURE_DESCRIPTIONS } from '../../ui';
import { useCreditCounts } from '../../../hooks/credits/useCreditCounts';
import { useCredits } from '../../../hooks/credits/useCredits';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { useEnquetes } from '../../../hooks/credits/useEnquetes';
import { useCreditStats } from '../../../hooks/credits/useCreditStats';
import { StatutCredit, StatutDemande, type StatutCreditType } from '@shared/enum/status-constants';
import { CREDIT_STATUS_LABELS } from '../../../lib/status-labels';
import CreditDetailModal from './CreditDetailModal';
import CreditRequestForm from './CreditRequestForm';
import { EnqueteWizard } from './EnqueteWizard';
import EnqueteAssignModal from './EnqueteAssignModal';
import CreditApprovalModal from './CreditApprovalModal';
import CreditDisbursementModal from './CreditDisbursementModal';
import CreditCommissionRejectionModal from './CreditCommissionRejectionModal';
import CreditFeesPaymentModal from './CreditFeesPaymentModal';
import ReferenceTable from './CreditRemboursement';
import CreditEcheancier from './CreditEcheancier';
import { ReevaluationWorkflowPage } from './ReevaluationWorkflowPage';
import { formatClientName, resolveClientPhotoUrl } from '../../../lib/format';
import { TableColumn } from '../../ui/ResponsiveTable';
import { ProtectedFeature } from '../../auth/ProtectedFeature';
import { Actions, Subjects } from '../../../lib/casl';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';
import { PipelineFunnel } from './PipelineFunnel';
import { differenceInDays } from 'date-fns';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useLocation } from 'wouter';
import { useCurrency } from '../../../contexts/CurrencyContext';

type TabId = 'dashboard' | 'credits' | 'approbation' | 'commission' | 'demandes' | 'enquetes' | 'reevaluations' | 'remboursements' | 'echeancier' | 'archives';

/** Maps tab keys to URL slugs */
const TAB_TO_SLUG: Record<TabId, string> = {
  dashboard: 'synthese',
  credits: 'portefeuille',
  demandes: 'a-traiter',
  enquetes: 'enquetes',
  approbation: 'approbation',
  commission: 'comite',
  reevaluations: 'reevaluations',
  remboursements: 'remboursements',
  echeancier: 'echeancier',
  archives: 'archives',
};

/** Reverse: subModule (from URL) → tab key */
const SUBMODULE_TO_TAB: Record<string, TabId> = {
  dashboard: 'dashboard',
  credits: 'credits',
  demandes: 'demandes',
  enquetes: 'enquetes',
  approbation: 'approbation',
  commission: 'commission',
  reevaluations: 'reevaluations',
  remboursements: 'remboursements',
  echeancier: 'echeancier',
  archives: 'archives',
};

// Helper to get static configuration
const getTabConfig = () => [
  { key: 'dashboard', label: 'Synthèse', icon: BarChart3 },
  { key: 'credits', label: 'Crédits', icon: CreditCard },
  { key: 'demandes', label: 'À traiter', icon: FileText, badgeClassName: 'bg-status-warning text-white font-bold' },
  { key: 'enquetes', label: 'Enquêtes', icon: ClipboardCheck, badgeClassName: 'bg-status-warning text-white font-bold' },
  { key: 'approbation', label: 'Approbation', icon: CheckCircle, badgeClassName: 'bg-status-danger text-white font-bold' },
  { key: 'commission', label: "Comité", icon: Users, badgeClassName: 'bg-status-info text-white font-bold' },
  { key: 'reevaluations', label: 'Réévaluations', icon: RefreshCw, badgeClassName: 'bg-surface-elevated text-content-primary' },
  { key: 'remboursements', label: 'Remboursements', icon: TrendingUp },
  { key: 'echeancier', label: 'Échéancier', icon: Calendar },
  { key: 'archives', label: 'Archives', icon: XCircle, badgeClassName: 'bg-surface-muted text-content-primary' }
];

interface CreditsProps {
  userRole?: string;
  activeView?: string;
  onModuleChange?: (module: string) => void;
}

export default function CreditsRefactored({ userRole, activeView, onModuleChange }: CreditsProps) {
  const { currency } = useCurrency();
  const [, setLocation] = useLocation();

  // Derive active tab from URL (activeView = subModule from routes-config)
  const activeTab: TabId = useMemo(() => {
    if (activeView && SUBMODULE_TO_TAB[activeView]) {
      return SUBMODULE_TO_TAB[activeView];
    }
    return 'dashboard';
  }, [activeView]);

  // Navigate via URL when tab changes
  const setActiveTab = useCallback((tab: TabId) => {
    const slug = TAB_TO_SLUG[tab];
    setLocation(`/credits/${slug}`);
  }, [setLocation]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showEnqueteForm, setShowEnqueteForm] = useState(false);
  const [selectedDemande, setSelectedDemande] = useState<any>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showDisbursementModal, setShowDisbursementModal] = useState(false);
  const [showCommissionRejectionModal, setShowCommissionRejectionModal] = useState(false);
  const [showFeesModal, setShowFeesModal] = useState(false);
  const [creditsPage, setCreditsPage] = useState(1);
  const [demandesPage, setDemandesPage] = useState(1);
  const [demandeToDelete, setDemandeToDelete] = useState<string | null>(null);
  const [demandeToCancel, setDemandeToCancel] = useState<string | null>(null);
  const [enqueteData, setEnqueteData] = useState<any>(null); // Store fetched enquête data
  const [loadingEnquete, setLoadingEnquete] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [demandeToAssign, setDemandeToAssign] = useState<any>(null);
  const ITEMS_PER_PAGE = 15;

  // Function to fetch enquête data by demande ID
  const fetchEnqueteByDemandeId = async (demandeId: string) => {
    try {
      setLoadingEnquete(true);
      const response = await fetch(`/api/demandes-credit/${demandeId}/enquete`);
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching enquête:', error);
      return null;
    } finally {
      setLoadingEnquete(false);
    }
  };

  // Redirect bare /credits → /credits/synthese
  useEffect(() => {
    if (!activeView) {
      setLocation('/credits/synthese', { replace: true });
    }
  }, [activeView, setLocation]);

  // Hooks
  const credits = useCredits();
  const demandes = useDemandes();
  const enquetes = useEnquetes();
  const stats = useCreditStats();
  const { counts: badgeCounts } = useCreditCounts();

  // Track which PENDING_FEES demands have been sent to caisse
  const [caisseStatuses, setCaisseStatuses] = useState<Record<string, { hasPending: boolean }>>({});
  const { socket } = useWebSocket();

  const fetchCaisseStatuses = useCallback(async () => {
    const pendingFeesDemandes = demandes.demandes
      .filter(d => d.statut === StatutDemande.PENDING_FEES && !d.deletedAt);
    if (pendingFeesDemandes.length === 0) {
      setCaisseStatuses({});
      return;
    }
    try {
      const ids = pendingFeesDemandes.map(d => d.id).join(',');
      const res = await fetch(`/api/demandes-credit/caisse-statuses?ids=${ids}`, { credentials: 'include' });
      if (res.ok) {
        setCaisseStatuses(await res.json());
      }
    } catch { /* silent */ }
  }, [demandes.demandes]);

  // Fetch caisse statuses when demandes change
  const prevDemandesRef = useRef<string>('');
  useEffect(() => {
    const key = demandes.demandes
      .filter(d => d.statut === StatutDemande.PENDING_FEES && !d.deletedAt)
      .map(d => d.id).sort().join(',');
    if (key !== prevDemandesRef.current) {
      prevDemandesRef.current = key;
      if (key) fetchCaisseStatuses();
      else setCaisseStatuses({});
    }
  }, [demandes.demandes, fetchCaisseStatuses]);

  // Listen for caisse request events to re-fetch statuses in real-time
  useEffect(() => {
    const handler = () => fetchCaisseStatuses();
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
  }, [fetchCaisseStatuses]);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (['CAISSE_REQUEST_COMPLETED', 'CAISSE_REQUEST_CANCELLED', 'CAISSE_REQUEST_CREATED'].includes(data.type)) {
          fetchCaisseStatuses();
          demandes.fetchDemandes?.();
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, fetchCaisseStatuses]);

  // Real-time: refetch enquête data when the detail modal is open and a credit event arrives
  const refreshOpenEnquete = useCallback(async () => {
    if (showEnqueteForm && selectedDemande?.id) {
      const fresh = await fetchEnqueteByDemandeId(selectedDemande.id);
      if (fresh) setEnqueteData(fresh);
    }
  }, [showEnqueteForm, selectedDemande?.id]);

  useEffect(() => {
    const handler = () => { refreshOpenEnquete(); };
    window.addEventListener('credit-update', handler);
    return () => window.removeEventListener('credit-update', handler);
  }, [refreshOpenEnquete]);

  // Dynamic Tabs Configuration
  const tabs = getTabConfig().map(tab => {
    let count = 0;
    if (badgeCounts) {
      switch (tab.key) {
        case 'demandes': count = badgeCounts.toProcess; break;
        case 'enquetes': count = badgeCounts.investigation; break;
        case 'approbation': count = badgeCounts.approval; break;
        case 'commission': count = badgeCounts.commission; break;
        case 'reevaluations': count = badgeCounts.reevaluation; break;
        case 'archives': count = badgeCounts.archives; break;
      }
    }
    return { ...tab, badge: count };
  });

  // Offline Sync Logic
  const offlineItems = useLiveQuery(() => db.enquetes.where('synced').equals(0).toArray());
  const pendingCount = offlineItems?.length || 0;

  useEffect(() => {
    const syncOfflineItems = async () => {
       if (navigator.onLine && pendingCount > 0 && offlineItems) {
           toast.loading(`Synchronisation de ${pendingCount} enquêtes...`, { id: 'sync-load' });
           let successCount = 0;
           
           for (const item of offlineItems) {
               try {
                   await enquetes.createEnquete(item.data);
                   await db.enquetes.update(item.id!, { synced: 1 });
                   await db.enquetes.delete(item.id!); // Clean up after sync
                   successCount++;
               } catch (e) {
                   console.error("Sync failed for item", item.id, e);
               }
           }
           
           if (successCount > 0) {
              toast.success(`${successCount} enquêtes synchronisées !`, { id: 'sync-load' });
           } else {
              toast.dismiss('sync-load');
           }
       }
    };

    // Try sync on mount if online, or listen to online event
    syncOfflineItems();
    
    const handleOnline = () => syncOfflineItems();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [pendingCount, enquetes.createEnquete]);

  // --- KPI & Funnel Calculations ---
  const funnelData = React.useMemo(() => {
    const d = demandes.demandes || [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Demande (Pending Fees)
    const stepDemande = d.filter(i => i.statut === StatutDemande.PENDING_FEES);
    
    // 2. Frais Payés (Ready for Investigation)
    const stepFrais = d.filter(i => i.statut === StatutDemande.READY_FOR_INVESTIGATION);
    
    // 3. Enquête (Under Investigation)
    const stepEnquete = d.filter(i => i.statut === StatutDemande.UNDER_INVESTIGATION);
    const overdueEnquete = stepEnquete.filter(i => new Date(i.updatedAt || i.createdAt || new Date().toISOString()) < sevenDaysAgo).length;

    // 4. Approbation (En cours d'approbation - enquête validée, attente décision comité)
    const stepComite = d.filter(i => i.statut === StatutDemande.PENDING_APPROVAL);
    
    // 5. Décaissement (Approved, waiting for disbursement)
    const stepDecaissement = d.filter(i => i.statut === StatutDemande.APPROVED || i.statut === StatutDemande.APPROVED_AFTER_REEVALUATION);

    return {
      demandes: { 
        count: stepDemande.length, 
        amount: stepDemande.reduce((acc, curr) => acc + Number(curr.montantDemande || 0), 0) 
      },
      frais: { 
        count: stepFrais.length, 
        amount: stepFrais.reduce((acc, curr) => acc + Number(curr.montantDemande || 0), 0) 
      },
      enquetes: { 
        count: stepEnquete.length, 
        amount: stepEnquete.reduce((acc, curr) => acc + Number(curr.montantDemande || 0), 0),
        overdue: overdueEnquete
      },
      comite: { 
        count: stepComite.length, 
        amount: stepComite.reduce((acc, curr) => acc + Number(curr.montantDemande || 0), 0) 
      },
      decaissement: { 
        count: stepDecaissement.length, 
        amount: stepDecaissement.reduce((acc, curr) => acc + Number(curr.montantApprouve || curr.montantDemande || 0), 0) 
      }
    };
  }, [demandes.demandes]);

  const kpis = React.useMemo(() => {
    // Taux de Transformation: Disbursed / Total Requests (historical?)
    // This is hard with just "active" list. Let's approx with "Disbursed / (Disbursed + Rejected + Cancelled)" or just "Active Credits / Total Demandes ever"?
    // Using available loaded data: 
    const totalDemandes = demandes.demandes.length + credits.credits.length; // Approximate
    const disbursed = credits.credits.length;
    const transformationRate = totalDemandes > 0 ? (disbursed / totalDemandes) * 100 : 0;

    // Average Delay (Request Date -> Disbursed Date)
    // We only have active dates. 
    // Placeholder logic:
    const avgDelay = 4.5; // Days (Mocked for now as we need deeper data)

    // Pipeline Volume (Total potential)
    const pipelineVolume = 
      (funnelData.demandes.amount) + 
      (funnelData.frais.amount) + 
      (funnelData.enquetes.amount) + 
      (funnelData.comite.amount);

    return { transformationRate, avgDelay, pipelineVolume };
  }, [demandes.demandes, credits.credits, funnelData]);

  const actionItems = React.useMemo(() => {
    const d = demandes.demandes || [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // High Priority: En cours d'approbation & Overdue Investigations
    const high = d.filter(i =>
      i.statut === StatutDemande.PENDING_APPROVAL ||
      (i.statut === StatutDemande.UNDER_INVESTIGATION && new Date(i.updatedAt || i.createdAt || new Date().toISOString()) < sevenDaysAgo)
    ).map(i => ({
      ...i,
      priority: 'high',
      label: i.statut === StatutDemande.PENDING_APPROVAL ? 'En cours d\'approbation' : 'Enquête En Retard'
    }));

    // Medium: Enquêtes en cours (On time) & Approved waiting for disbursement
    const medium = d.filter(i => 
      (i.statut === StatutDemande.UNDER_INVESTIGATION && new Date(i.updatedAt || i.createdAt || new Date().toISOString()) >= sevenDaysAgo) ||
      i.statut === StatutDemande.READY_FOR_INVESTIGATION
    ).map(i => ({ 
      ...i, 
      priority: 'medium', 
      label: i.statut === StatutDemande.READY_FOR_INVESTIGATION ? 'À Enquêter' : 'Enquête en cours' 
    }));

    // Low: Attente Paiement Frais
    const low = d.filter(i => i.statut === StatutDemande.PENDING_FEES)
      .map(i => ({ ...i, priority: 'low', label: 'Attente Frais' }));

    return { high, medium, low };
  }, [demandes.demandes]);

  const formatMoneyPlain = (amount: number | null | undefined) => {
    const value = amount || 0;
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + currency.symbol;
  };

  const formatMoney = (amount: number | null | undefined) => {
    const value = amount || 0;
    const isLarge = value >= 1000000;

    return (
      <div className="flex items-baseline justify-end gap-1 font-mono tracking-tight leading-none group-hover:scale-105 transition-transform duration-200">
        <span className={`text-sm font-bold ${
          isLarge
            ? 'text-accent'
            : 'text-content-primary'
        }`}>
          {new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(value)}
        </span>
        <span className="text-[10px] font-semibold text-content-muted uppercase select-none">
          {currency.symbol}
        </span>
      </div>
    );
  };



  const formatCompactMoney = (amount: number | null | undefined) => {
    const value = amount || 0;
    if (value >= 1000000000) {
      return (value / 1000000000).toFixed(1).replace('.', ',') + ` Md ${currency.symbol}`;
    }
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1).replace('.', ',') + ` M ${currency.symbol}`;
    }
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + currency.symbol;
  };

  const isLoading = credits.loading || demandes.loading || enquetes.loading;

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Common renderer for client name with avatar
  const renderClientName = (item: any) => {
    const client = item.clients || item.client;
    const name = formatClientName(client?.nom, client?.prenom) || 'Client Inconnu';
    const photoUrl = resolveClientPhotoUrl(client?.photoProfile);
    const initials = ((client?.prenom?.[0] || '') + (client?.nom?.[0] || 'C')).toUpperCase();

    return (
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt={name} 
              className="w-8 h-8 rounded-full object-cover border border-edge-subtle shadow-sm"
            />
          ) : (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-content-primary border border-white/10 shadow-sm ${
              item.statut === StatutCredit.ACTIVE ? 'bg-status-success/80' :
              item.statut === StatutCredit.LATE ? 'bg-status-danger/80' : 'bg-surface-elevated'
            }`}>
              {initials}
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate text-content-secondary group-hover:text-content-primary transition-colors">
            {name}
          </span>
          {client?.telephone && (
            <span className="text-[10px] text-content-muted font-mono truncate">
              {client.telephone}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Column Definitions
  const creditColumns: TableColumn<any>[] = [
    { key: 'numeroCredit', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => renderClientName(item) },
    { key: 'montantPrincipal', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    {
      key: 'statut',
      label: 'Statut',
      align: 'center',
      format: (val) => {
        const label = CREDIT_STATUS_LABELS[val as StatutCreditType] || val;
        return <Badge value={label} rawValue className="min-w-[100px] justify-center" />;
      }
    },
    { key: 'progression', label: 'Échéances', format: (val, item) => `${item.nombreEcheancesPayees || 0}/${item.nombreEcheancesTotal || 0}` },
    { key: 'joursRetard', label: 'Retard', format: (val) => (val || 0) > 0 ? <span className="text-status-danger font-bold">{val}j</span> : <span className="text-content-muted">0j</span> }
  ];

  const demandeColumns: TableColumn<any>[] = [
    { key: 'numeroDemande', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => renderClientName(item) },
    { key: 'montantDemande', label: 'Montant Demandé', align: 'right', format: (val) => formatMoney(val) },
    { 
      key: 'statut', 
      label: 'Statut', 
      align: 'center', 
      format: (val, item) => {
        if (item.deletedAt) {
          return <Badge value="Supprimé" variant="danger" icon={<XCircle size={12} />} className="min-w-[100px] justify-center" />;
        }
        return <Badge value={val} className="min-w-[100px] justify-center" />;
      }
    },
    { key: 'createdAt', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  // Commission crédit specific columns with reevaluation indicator
  const commissionColumns: TableColumn<any>[] = [
    {
      key: 'numeroDemande',
      label: 'Numéro',
      primary: true,
      format: (val, item) => (
        <span className="flex items-center gap-2">
          {val}
          {item.statut === StatutDemande.APPROVED_AFTER_REEVALUATION && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/30">
              <RefreshCw size={10} />
              Réévalué
            </span>
          )}
        </span>
      )
    },
    { key: 'clients.nom', label: 'Client', format: (val, item) => renderClientName(item) },
    { key: 'montantApprouve', label: 'Montant Approuvé', align: 'right', format: (val, item) => formatMoney(val || item.montantDemande) },
    { key: 'createdAt', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  const enqueteColumns: TableColumn<any>[] = [
    { key: 'clients.nom', label: 'Client', primary: true, format: (val, item) => renderClientName(item) },
    { key: 'typeActivite', label: 'Activité' },
    { key: 'montantDemande', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', align: 'center', format: (val: string, item: any) => {
      // READY_FOR_INVESTIGATION can mean "unassigned" or "assigned but not started"
      const isAssigned = val === 'READY_FOR_INVESTIGATION' && enquetes.enquetes.some((e: any) => e.demandeId === item?.id);
      const effectiveStatus = isAssigned ? 'ASSIGNED' : val;
      const translations: Record<string, string> = {
        'READY_FOR_INVESTIGATION': 'En attente',
        'ASSIGNED': 'Assignée',
        'UNDER_INVESTIGATION': 'En cours',
        'INVESTIGATION_COMPLETE': 'Terminée',
      };
      const colors: Record<string, string> = {
        'READY_FOR_INVESTIGATION': 'bg-status-warning-bg text-status-warning border-status-warning/20',
        'ASSIGNED': 'bg-status-info-bg text-status-info border-status-info/20',
        'UNDER_INVESTIGATION': 'bg-accent/10 text-accent border-accent/20',
        'INVESTIGATION_COMPLETE': 'bg-status-success-bg text-status-success border-status-success/20',
      };
      const icons: Record<string, React.ReactNode> = {
        'READY_FOR_INVESTIGATION': <Clock size={10} className="text-status-warning" />,
        'ASSIGNED': <UserCheck size={10} className="text-status-info" />,
        'UNDER_INVESTIGATION': <Play size={10} className="text-accent" />,
        'INVESTIGATION_COMPLETE': <CheckCircle size={10} className="text-status-success" />,
      };
      const label = translations[effectiveStatus] || val;
      const colorClass = colors[effectiveStatus] || 'bg-surface-subtle/30 text-content-muted border-edge-strong/20';
      return (
        <span className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
          {icons[effectiveStatus]}
          {label}
        </span>
      );
    } }
  ];

  return (
    <div className="space-y-6">
      {/* Header with contextual help */}
      <FeatureHeader
        featureKey="finance.credits"
        title={FEATURE_DESCRIPTIONS['finance.credits'].title}
        subtitle={FEATURE_DESCRIPTIONS['finance.credits'].subtitle}
        helpText={FEATURE_DESCRIPTIONS['finance.credits'].helpText}
        icon={<CreditCard size={24} className="text-accent" />}
        actions={
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <Badge
                variant="warning"
                size="sm"
                className="animate-pulse flex items-center gap-1.5"
                value={
                  <span className="flex items-center gap-1.5">
                    <WifiOff size={14} />
                    <span className="hidden sm:inline">{pendingCount} Sync</span>
                  </span>
                }
              />
            )}
            <ProtectedFeature requiredAbility={{ action: Actions.CREATE, subject: Subjects.CREDIT }}>
              <Button size="sm" variant="primary" onClick={() => setShowRequestForm(true)} icon={FileText}>
                Nouvelle Demande
              </Button>
            </ProtectedFeature>
          </div>
        }
      />

      {/* Sticky Tabs Row */}
      <div className="bg-surface-base/90 backdrop-blur-xl -mx-6 px-6 py-2 mb-6 border-b border-edge-subtle sticky top-0 z-20">
         <TabGroup 
            activeTab={activeTab} 
            onTabChange={(key) => setActiveTab(key as TabId)}
            tabs={tabs} 
            variant="pills"
            size="sm"
            scrollable
            className="pb-1"
         />
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          
          {/* 1. Pipeline Funnel (Compact) */}
          <section>
            <div className="flex items-center gap-2 mb-2">
               <TrendingUp className="text-status-info" size={16} />
               <h3 className="text-sm font-bold text-content-primary uppercase tracking-wider">Pipeline Crédit</h3>
            </div>
            <PipelineFunnel steps={funnelData} />
          </section>

          {/* 2. KPIs & Action Lists split */}
          <div className="grid lg:grid-cols-3 gap-4">
            
            {/* Left Col: Actions Requises (2/3 width) - Smart Feed */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-status-warning" size={16} />
                <h3 className="text-sm font-bold text-content-primary uppercase tracking-wider">Actions & Activités</h3>
              </div>
              
              <div className="space-y-3">
                {/* Check if ANY action is required */}
                {(actionItems.high.length > 0 || actionItems.medium.length > 0) ? (
                  <>
                    {/* High Priority Group */}
                    {actionItems.high.length > 0 && (
                       <div className="space-y-2">
                          <div className="text-xs font-bold text-status-danger uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-status-danger animate-pulse"></div>
                            Priorité Haute ({actionItems.high.length})
                          </div>
                          <div className="grid gap-2">
                            {actionItems.high.map((item: any) => (
                               <div 
                                  key={item.id}
                                  onClick={() => {
                                     setSelectedDemande(item);
                                     setShowApprovalModal(true);
                                  }}
                                  className="bg-surface/50 hover:bg-surface border border-status-danger/20 hover:border-status-danger/50 rounded-lg p-3 cursor-pointer transition-all flex items-center justify-between group"
                               >
                                  <div className="flex items-center gap-3">
                                     {renderClientName({ clients: item.clients })}
                                     <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-status-warning-bg text-status-warning border border-status-warning/20">
                                        {item.label}
                                     </span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                     <div className="text-right">
                                        <div className="text-sm font-bold text-content-primary">{formatMoney(item.montantDemande)}</div>
                                        <div className="text-[10px] text-content-muted flex items-center justify-end gap-1">
                                           <Clock size={10} />
                                           {item.updatedAt ? differenceInDays(new Date(), new Date(item.updatedAt || new Date().toISOString())) + 'j' : '0j'}
                                        </div>
                                     </div>
                                     <ArrowRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors" />
                                  </div>
                               </div>
                            ))}
                          </div>
                       </div>
                    )}

                    {/* Medium Priority */}
                     {actionItems.medium.length > 0 && (
                       <div className="space-y-2 pt-2">
                          <div className="text-xs font-bold text-status-info uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-status-info"></div>
                            Priorité Moyenne ({actionItems.medium.length})
                          </div>
                          <div className="grid gap-2">
                             {actionItems.medium.slice(0, 5).map((item: any) => (
                                <div 
                                  key={item.id}
                                  onClick={() => {
                                     setSelectedDemande(item);
                                     if (item.statut === StatutDemande.READY_FOR_INVESTIGATION) setShowEnqueteForm(true);
                                  }}
                                  className="bg-surface/30 hover:bg-surface border border-edge-subtle hover:border-status-info/30 rounded-lg p-3 cursor-pointer transition-all flex items-center justify-between group"
                                >
                                   <div className="flex items-center gap-3">
                                      {renderClientName({ clients: item.clients })}
                                      <span className="text-xs text-content-muted">{item.label}</span>
                                   </div>
                                   <div className="text-right">
                                      <div className="text-sm font-medium text-content-secondary">{formatMoney(item.montantDemande)}</div>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                  </>
                ) : (
                  /* EMPTY STATE: RECENT ACTIVITY FEED */
                  <div className="bg-surface/30 border border-edge-subtle rounded-xl p-4">
                     <div className="flex items-center gap-2 mb-4 text-content-muted">
                        <CheckCircle size={18} className="text-status-success" />
                        <span className="text-sm font-medium">Aucune action requise. Voici les dernières activités :</span>
                     </div>
                     <div className="space-y-0 relative">
                        {/* Timeline line */}
                        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-surface-elevated/50"></div>

                        {demandes.demandes
                          .sort((a, b) => new Date(b.updatedAt || b.createdAt || new Date().toISOString()).getTime() - new Date(a.updatedAt || a.createdAt || new Date().toISOString()).getTime())
                          .slice(0, 3)
                          .map((item, idx) => (
                             <div key={item.id} className="relative flex gap-4 pb-4 last:pb-0 group">
                                <div className="z-10 w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-edge shadow-sm group-hover:border-edge-strong transition-colors">
                                   <Clock size={16} className="text-content-muted" />
                                </div>
                                <div className="flex-1 pt-1">
                                   <div className="text-sm text-content-secondary">
                                      <span className="font-bold text-content-primary">{formatClientName(item.clients?.nom, item.clients?.prenom)}</span>
                                      <span className="mx-1 text-content-muted">•</span>
                                      {item.deletedAt ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-danger-bg text-status-danger border border-status-danger/20">
                                            <Trash2 size={10} />
                                            Supprimé
                                        </span>
                                      ) : (
                                        <Badge value={item.statut} size="sm" variant="outline" className="border-0 bg-transparent p-0" />
                                      )}
                                   </div>
                                   <div className="text-xs text-content-muted mt-1">
                                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Date inconnue'}
                                   </div>
                                </div>
                             </div>
                          ))
                        }
                     </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Stats & KPIs - Compact & Aligned */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                 <BarChart3 className="text-status-info" size={16} />
                 <h3 className="text-sm font-bold text-content-primary uppercase tracking-wider">Performance</h3>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                 <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3 flex flex-col">
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1">Pipeline</span>
                    <div className="text-lg font-black text-content-primary">{formatCompactMoney(kpis.pipelineVolume).replace(` ${currency.symbol}`, '')}</div>
                    <span className="text-[10px] text-content-muted">Potentiel à venir</span>
                 </div>

                 <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3 flex flex-col">
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1">Transformation</span>
                    <div className="text-lg font-black text-content-primary">{kpis.transformationRate.toFixed(1)}%</div>
                    <span className="text-[10px] text-content-muted">Dossiers décaissés</span>
                 </div>

                 <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3 flex flex-col col-span-2 lg:col-span-1">
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1">Délai Moyen</span>
                    <div className="flex items-end justify-between">
                       <div className="text-lg font-black text-content-primary">{kpis.avgDelay}j</div>
                       <span className="text-[10px] text-content-muted text-right">Demande à<br/>Décaissement</span>
                    </div>
                 </div>
              </div>

              <div className="bg-gradient-to-br from-surface to-surface-base border border-edge-subtle rounded-lg p-3 mt-1">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-content-muted">Total Crédits</span>
                    <span className="text-xs font-bold text-content-primary">{formatMoneyPlain(stats.montantTotalCredits)}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] text-content-muted">Actifs</span>
                    <span className="text-xs font-bold text-status-success">{stats.creditsActifs} dossiers</span>
                 </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Credits Tab */}
      {activeTab === 'credits' && (
        <Card variant="default" padding="none" className="overflow-hidden">
          <ResponsiveTable
            data={credits.credits
              .filter(c => ([StatutCredit.ACTIVE, StatutCredit.LATE, StatutCredit.PAID] as string[]).includes(c.statut))
              .slice((creditsPage - 1) * ITEMS_PER_PAGE, creditsPage * ITEMS_PER_PAGE)}
            columns={creditColumns}
            loading={isLoading}
            onRowClick={(item) => setSelectedCredit(item.id)}
            emptyMessage="Aucun crédit trouvé"
            maxHeight="calc(100vh - 300px)"
            pagination={{
              page: creditsPage,
              totalPages: Math.ceil(credits.credits.length / ITEMS_PER_PAGE),
              onPageChange: setCreditsPage
            }}
            density="compact"
          />
        </Card>
      )}

      {/* Approbation Tab (Enquêtes terminées) */}
      {activeTab === 'approbation' && (
        <Card variant="default" padding="none" className="overflow-hidden border-edge-subtle shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => d.statut === StatutDemande.PENDING_APPROVAL)
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              setShowApprovalModal(true); // Approve logic
            }}
            emptyMessage="Aucune demande en attente d'approbation"
            maxHeight="calc(100vh - 350px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.filter(d => d.statut === StatutDemande.PENDING_APPROVAL).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            density="compact"
            actions={(item) => (
               <ProtectedFeature requiredAbility={{ action: Actions.APPROVE, subject: Subjects.CREDIT }}>
                 <Button 
                    size="sm" 
                    variant="primary"
                    onClick={(e) => { 
                      e.stopPropagation();
                      setSelectedDemande(item);
                      setShowApprovalModal(true);
                    }}
                 >
                   Analyser
                 </Button>
               </ProtectedFeature>
            )}
          />
        </Card>
      )}

      {/* Commission Crédit Tab (Approuvées -> À décaisser) */}
      {activeTab === 'commission' && (
        <Card variant="default" padding="none" className="overflow-hidden border-edge-subtle shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => d.statut === StatutDemande.APPROVED || d.statut === StatutDemande.APPROVED_AFTER_REEVALUATION)
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={commissionColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              setShowDisbursementModal(true); // Disbursement logic
            }}
            emptyMessage="Aucune demande en attente de décaissement"
            maxHeight="calc(100vh - 350px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.filter(d => d.statut === StatutDemande.APPROVED || d.statut === StatutDemande.APPROVED_AFTER_REEVALUATION).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            density="compact"
            actions={(item) => (
               <div className="flex gap-2">
                 <ProtectedFeature requiredAbility={{ action: Actions.REJECT, subject: Subjects.CREDIT }}>
                   <Button 
                      size="sm" 
                      variant="danger"
                      onClick={(e) => { 
                        e.stopPropagation();
                        setSelectedDemande(item);
                        setShowCommissionRejectionModal(true);
                      }}
                   >
                     <XCircle size={16} className="mr-1" />
                     Rejeter
                   </Button>
                 </ProtectedFeature>
                 <ProtectedFeature requiredAbility={{ action: Actions.APPROVE, subject: Subjects.CREDIT }}>
                   <Button 
                      size="sm" 
                      className="bg-status-success hover:bg-status-success text-white"
                      onClick={(e) => { 
                        e.stopPropagation();
                        setSelectedDemande(item);
                        setShowDisbursementModal(true);
                      }}
                   >
                     <DollarSign size={16} className="mr-1" />
                     Décaisser
                   </Button>
                 </ProtectedFeature>
               </div>
             )}
          />
        </Card>
      )}

      {/* Archives Tab (Rejetées, Annulées) */}
      {activeTab === 'archives' && (
        <Card variant="default" padding="none" className="overflow-hidden border-edge-subtle shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ([StatutDemande.REJECTED, StatutDemande.CANCELLED] as string[]).includes(d.statut) || !!d.deletedAt)
              // Sort by updated_at desc
              .sort((a, b) => new Date(b.updatedAt || b.createdAt || new Date().toISOString()).getTime() - new Date(a.updatedAt || a.createdAt || new Date().toISOString()).getTime())
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={[
              ...demandeColumns,
              { key: 'motifRejet', label: 'Motif', format: (val) => <span className="text-content-muted italic truncate max-w-[200px] block">{val || '-'}</span> }
            ]}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              setShowApprovalModal(true);
            }}
            emptyMessage="Aucune demande archivée"
            maxHeight="calc(100vh - 350px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.filter(d => ([StatutDemande.REJECTED, StatutDemande.CANCELLED] as string[]).includes(d.statut) || !!d.deletedAt).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            density="compact"
            actions={(item) => (
              <IconButton 
                icon={Eye} 
                size="sm" 
                variant="ghost" 
                onClick={(e) => { 
                  e.stopPropagation();
                  setSelectedDemande(item);
                  setShowApprovalModal(true);
                }}
                title="Voir Détails"
                aria-label="Voir Détails"
              />
            )}
          />
        </Card>
      )}

      {/* Demandes Tab (À traiter: En attente, Rejetée, Annulée) */}
      {activeTab === 'demandes' && (
        <Card variant="default" padding="none" className="overflow-hidden border-edge-subtle shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ([StatutDemande.PENDING_FEES] as string[]).includes(d.statut) && !d.deletedAt)
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              if (item.statut === StatutDemande.PENDING_FEES && !caisseStatuses[item.id]?.hasPending) {
                setShowFeesModal(true);
              } else {
                setShowApprovalModal(true);
              }
            }}
            emptyMessage="Aucune demande à traiter"
            maxHeight="calc(100vh - 350px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.filter(d => ([StatutDemande.PENDING_FEES] as string[]).includes(d.statut) && !d.deletedAt).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            density="compact"
            actions={(item) => (
              <div className="flex gap-1">
                 {item.statut === StatutDemande.PENDING_FEES && (
                    caisseStatuses[item.id]?.hasPending ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-status-warning-bg text-status-warning border border-status-warning/20">
                        <Clock size={11} />
                        En attente caisse
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDemande(item);
                          setShowFeesModal(true);
                        }}
                      >
                        Payer Frais
                      </Button>
                    )
                 )}
                  <IconButton 
                    icon={Eye} 
                    size="sm" 
                    variant="ghost" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setSelectedDemande(item);
                      setShowApprovalModal(true);
                    }}
                    title="Voir Détails"
                    aria-label="Voir Détails"
                  />
                 <ProtectedFeature requiredAbility={{ action: Actions.DELETE, subject: Subjects.CREDIT }}>
                   <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="ghost"
                      className="text-status-danger hover:text-status-danger hover:bg-status-danger-bg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDemandeToDelete(item.id);
                      }}
                      title="Supprimer"
                      aria-label="Supprimer"
                    />
                 </ProtectedFeature>
                  {(item.statut === StatutDemande.PENDING_FEES || item.statut === StatutDemande.READY_FOR_INVESTIGATION) && (
                     <ProtectedFeature requiredAbility={{ action: Actions.EDIT, subject: Subjects.CREDIT }}>
                       <IconButton
                          icon={XCircle}
                          size="sm"
                          variant="ghost"
                          className="text-status-warning hover:text-status-warning hover:bg-status-warning-bg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDemandeToCancel(item.id);
                          }}
                          title="Annuler"
                          aria-label="Annuler"
                        />
                     </ProtectedFeature>
                  )}
              </div>
            )}
          />
        </Card>
      )}

      {/* Enquetes Tab — Suivi des enquêtes (menées par les agents terrain) */}
      {activeTab === 'enquetes' && (
        <div className="space-y-4">
          <Card variant="default" padding="none" className="overflow-hidden">
            <ResponsiveTable
              data={demandes.demandes
                  .filter(d => ([StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION, StatutDemande.INVESTIGATION_COMPLETE] as string[]).includes(d.statut))
                  .map(d => ({
                    ...d,
                    id: d.id,
                    typeActivite: d.objetCredit || 'À définir',
                    isDemande: true
                  }))
              }
              columns={enqueteColumns}
              loading={isLoading}
              emptyMessage="Aucune enquête en cours"
              onRowClick={async (item: any) => {
                  if (item.statut === StatutDemande.INVESTIGATION_COMPLETE) {
                    const fetchedEnquete = await fetchEnqueteByDemandeId(item.id);
                    if (fetchedEnquete) {
                      setEnqueteData(fetchedEnquete);
                    }
                    setSelectedDemande(item);
                    setShowEnqueteForm(true);
                  }
              }}
              density="compact"
              actions={(item) => {
                // Check if an enquête is already assigned for this demande
                const hasEnquete = enquetes.enquetes.some((e: any) => e.demandeId === item.id);
                return (
                <div className="flex items-center gap-1.5">
                  {/* Assigner — pour les demandes sans enquête assignée */}
                  {item.statut === StatutDemande.READY_FOR_INVESTIGATION && !hasEnquete && (
                    <ProtectedFeature requiredAbility={{ action: Actions.CREATE, subject: Subjects.CREDIT }}>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDemandeToAssign(item);
                          setShowAssignModal(true);
                        }}
                        icon={UserCheck}
                      >
                        Assigner
                      </Button>
                    </ProtectedFeature>
                  )}
                  {/* Réassigner — enquête assignée mais agent n'a pas encore démarré, ou en cours */}
                  {((item.statut === StatutDemande.READY_FOR_INVESTIGATION && hasEnquete) || item.statut === StatutDemande.UNDER_INVESTIGATION) && (
                    <ProtectedFeature requiredAbility={{ action: Actions.EDIT, subject: Subjects.CREDIT }}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDemandeToAssign(item);
                          setShowAssignModal(true);
                        }}
                        icon={RefreshCw}
                      >
                        Réassigner
                      </Button>
                    </ProtectedFeature>
                  )}
                  {/* Voir — uniquement quand l'agent terrain a terminé l'enquête */}
                  {item.statut === StatutDemande.INVESTIGATION_COMPLETE && (
                    <Button
                      size="xs"
                      variant="ghost"
                      isLoading={loadingEnquete}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const fetchedEnquete = await fetchEnqueteByDemandeId(item.id);
                        if (fetchedEnquete) {
                          setEnqueteData(fetchedEnquete);
                        }
                        setSelectedDemande(item);
                        setShowEnqueteForm(true);
                      }}
                      icon={Eye}
                    >
                      Voir
                    </Button>
                  )}
                  {/* Valider — uniquement quand l'agent terrain a terminé l'enquête */}
                  {item.statut === StatutDemande.INVESTIGATION_COMPLETE && (
                    <ProtectedFeature requiredAbility={{ action: Actions.CREATE, subject: Subjects.CREDIT }}>
                      <Button
                        size="xs"
                        variant="primary"
                        isLoading={demandes.validatingInvestigation}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await demandes.validateInvestigation(item.id);
                        }}
                        icon={CheckCircle}
                      >
                        Valider
                      </Button>
                    </ProtectedFeature>
                  )}
                </div>
              );
              }}
            />
          </Card>
        </div>
      )}


      {/* Remboursements Tab */}
      {activeTab === 'remboursements' && (
        <ReferenceTable />
      )}

      {/* Échéancier Tab */}
      {activeTab === 'echeancier' && (
        <CreditEcheancier />
      )}

      {/* Réévaluations Tab */}
      {activeTab === 'reevaluations' && (
        <ReevaluationWorkflowPage 
          embedded 
          onWorkflowChange={() => {
            demandes.fetchDemandes();
            credits.fetchCredits();
          }}
        />
      )}

      {/* Modals */}
      {selectedCredit && (
        <CreditDetailModal
          creditId={selectedCredit}
          onClose={() => setSelectedCredit(null)}
        />
      )}

      {showRequestForm && (
        <CreditRequestForm
          onClose={() => setShowRequestForm(false)}
          onSuccess={() => {
            setShowRequestForm(false);
            demandes.fetchDemandes();
            toast.success('Demande créée');
          }}
        />
      )}

      {showEnqueteForm && (
        <EnqueteWizard
          onClose={() => {
            setShowEnqueteForm(false);
            setSelectedDemande(null);
            setEnqueteData(null);
          }}
          clientId={selectedDemande?.clients?.id || selectedDemande?.clientId}
          clientNom={selectedDemande ? formatClientName(selectedDemande.clients?.nom, selectedDemande.clients?.prenom) : undefined}
          readOnly={true}
          initialData={enqueteData ? {
            id: enqueteData.id,
            demandeId: enqueteData.demandeId,
            clientId: enqueteData.clientId,
            montantDemande: enqueteData.montantDemande,
            objetCredit: enqueteData.objetCredit,
            categorieActivite: enqueteData.categorieActivite,
            typeActivite: enqueteData.typeActivite,
            ancienneteActivite: enqueteData.ancienneteActivite,
            revenuMensuel: enqueteData.revenuMensuel,
            revenuJournalier: enqueteData.revenuJournalier,
            typeRevenu: enqueteData.typeRevenu,
            chargesMensuelles: enqueteData.chargesMensuelles,
            photosActivite: enqueteData.photosActivite || [],
            photosGeotagged: enqueteData.photosGeotagged || [],
            garantiesProposees: enqueteData.garantiesProposees || [],
            autresCredits: enqueteData.autresCredits || [],
            situationMatrimoniale: enqueteData.situationMatrimoniale,
            personnesCharge: enqueteData.personnesCharge,
            typeHabitation: enqueteData.typeHabitation,
            agentRecommendation: enqueteData.agentRecommendation,
            recommendedAmount: enqueteData.recommendedAmount,
            riskLevel: enqueteData.riskLevel,
            riskFactors: enqueteData.riskFactors,
            observations: enqueteData.observations,
            geoLatitude: enqueteData.geoLatitude,
            geoLongitude: enqueteData.geoLongitude,
            geoAccuracy: enqueteData.geoAccuracy,
            geoTimestamp: enqueteData.geoTimestamp,
            creditPlan: enqueteData.creditPlan || null,
            clientSituation: enqueteData.clientSituation || null,
          } : selectedDemande ? {
            demandeId: selectedDemande.id,
            clientId: selectedDemande.clientId || selectedDemande.clients?.id,
            montantDemande: selectedDemande.montantDemande?.toString(),
            objetCredit: selectedDemande.objetCredit,
            categorieActivite: selectedDemande.categorieActivite,
            typeActivite: selectedDemande.typeActivite,
            ancienneteActivite: selectedDemande.ancienneteActivite,
            revenuMensuel: selectedDemande.revenuMensuel || selectedDemande.revenusMensuels || selectedDemande.clients?.revenuMensuel,
            revenuJournalier: selectedDemande.revenuJournalier || selectedDemande.clients?.revenuJournalier,
            typeRevenu: selectedDemande.typeRevenu || selectedDemande.clients?.typeRevenu,
            chargesMensuelles: selectedDemande.chargesMensuelles,
          } : undefined}
          onSave={async (data) => {
            const success = await enquetes.createEnquete(data);
            if (success) {
              setShowEnqueteForm(false);
              setSelectedDemande(null);
              setEnqueteData(null);
              enquetes.fetchEnquetes();
              demandes.fetchDemandes();
            }
          }}
        />
      )}

      {showApprovalModal && selectedDemande && (
        <CreditApprovalModal
          demande={selectedDemande}
          onClose={() => {
            setShowApprovalModal(false);
            setSelectedDemande(null);
          }}
          onSuccess={() => {
            setShowApprovalModal(false);
            setSelectedDemande(null);
            demandes.fetchDemandes();
          }}
          onManageReevaluation={() => {
            setShowApprovalModal(false);
            setSelectedDemande(null);
            setActiveTab('reevaluations');
          }}
        />
      )}

      {showDisbursementModal && selectedDemande && (
        <CreditDisbursementModal
          demande={selectedDemande}
          onClose={() => {
            setShowDisbursementModal(false);
            setSelectedDemande(null);
          }}
          onSuccess={() => {
            setShowDisbursementModal(false);
            setSelectedDemande(null);
            demandes.fetchDemandes();
            credits.fetchCredits();
          }}
        />
      )}

      {showAssignModal && demandeToAssign && (
        <EnqueteAssignModal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setDemandeToAssign(null);
          }}
          demande={{
            id: demandeToAssign.id,
            clientNom: formatClientName(demandeToAssign.clients?.nom, demandeToAssign.clients?.prenom),
            montantDemande: demandeToAssign.montantDemande,
            objetCredit: demandeToAssign.objetCredit || demandeToAssign.objet_credit,
          }}
          onAssign={async (data) => {
            const hasExistingEnquete = enquetes.enquetes.some((e: any) => e.demandeId === demandeToAssign.id);
            const success = hasExistingEnquete
              ? await demandes.reassignInvestigation(demandeToAssign.id, data)
              : await demandes.startInvestigation(demandeToAssign.id, data);
            if (success) {
              setShowAssignModal(false);
              setDemandeToAssign(null);
              enquetes.fetchEnquetes?.();
            }
            return success;
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!demandeToDelete}
        onClose={() => setDemandeToDelete(null)}
        onConfirm={() => {
          if (demandeToDelete) {
            demandes.deleteDemande(demandeToDelete);
            setDemandeToDelete(null);
          }
        }}
        title="Confirmer la suppression"
        message="Voulez-vous supprimer cette demande ? Elle sera archivée dans l'historique du client concerné."
        variant="danger"
        confirmText="Supprimer"
        cancelText="Annuler"
      />

      <ConfirmDialog
        isOpen={!!demandeToCancel}
        onClose={() => setDemandeToCancel(null)}
        onConfirm={() => {
          if (demandeToCancel) {
            demandes.cancelDemande(demandeToCancel, "Annulé par l'utilisateur");
            setDemandeToCancel(null);
            toast.success("Demande annulée");
          }
        }}
        title="Confirmer l'annulation"
        message="Voulez-vous vraiment annuler cette demande ? Elle restera visible dans l'historique avec le statut 'Annulée'."
        variant="warning"
        confirmText="Confirmer Annulation"
        cancelText="Retour"
      />

       {selectedDemande && showFeesModal && (
        <CreditFeesPaymentModal
          demande={selectedDemande}
          onClose={() => setShowFeesModal(false)}
          onSuccess={() => {
            demandes.fetchDemandes();
            setShowFeesModal(false);
          }}
          onNavigate={onModuleChange}
        />
       )}

       {selectedDemande && showCommissionRejectionModal && (
        <CreditCommissionRejectionModal
          demande={selectedDemande}
          onClose={() => {
            setShowCommissionRejectionModal(false);
            setSelectedDemande(null);
          }}
          onSuccess={() => {
            setShowCommissionRejectionModal(false);
            setSelectedDemande(null);
            demandes.fetchDemandes();
          }}
        />
      )}
    </div>
  );
}
