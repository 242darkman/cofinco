import React, { useState, useEffect } from 'react';
import { CreditCard, FileText, ClipboardCheck, BarChart3, TrendingUp, AlertCircle, Clock, CheckCircle, WifiOff, Eye, Trash2, DollarSign, XCircle, RefreshCw, Users, ArrowRight, Calendar, MapPin, Play, UserCheck } from 'lucide-react';
import { Card, Button, PageHeader, TabGroup, StatCard, ResponsiveTable, Badge, LoadingScreen, IconButton, ConfirmDialog, FeatureHeader, FEATURE_DESCRIPTIONS } from '../../ui';
import { useCreditCounts } from '../../../hooks/credits/useCreditCounts';
import { useCredits } from '../../../hooks/credits/useCredits';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { useEnquetes } from '../../../hooks/credits/useEnquetes';
import { useCreditStats } from '../../../hooks/credits/useCreditStats';
import { StatutCredit, StatutDemande } from '@shared/enum/status-constants';
import CreditDetailModal from './CreditDetailModal';
import CreditRequestForm from './CreditRequestForm';
import EnqueteCreditForm from './EnqueteCreditForm';
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
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';
import { PipelineFunnel } from './PipelineFunnel';
import EnqueteZoneAnalytics from './EnqueteZoneAnalytics';
import { differenceInDays } from 'date-fns';

type TabId = 'dashboard' | 'credits' | 'approbation' | 'commission' | 'demandes' | 'enquetes' | 'carte' | 'reevaluations' | 'remboursements' | 'echeancier' | 'archives';

// Helper to get static configuration
const getTabConfig = () => [
  { key: 'dashboard', label: 'Synthèse', icon: BarChart3 },
  { key: 'credits', label: 'Crédits', icon: CreditCard },
  { key: 'demandes', label: 'À traiter', icon: FileText, badgeColors: 'bg-blue-100 text-blue-800' }, // New demands, rejected, cancelled
  { key: 'enquetes', label: 'Enquêtes', icon: ClipboardCheck, badgeColors: 'bg-yellow-100 text-yellow-800' }, // Only "A enquêter" (ready for investigation)
  { key: 'carte', label: 'Carte', icon: MapPin }, // Geographic analysis map
  { key: 'approbation', label: 'Approbation', icon: CheckCircle, badgeColors: 'bg-red-100 text-red-800' }, // Was "Approuvées" inside Demandes, now "Enquêtes terminées" waiting for approval
  { key: 'commission', label: "Comité", icon: Users, badgeColors: 'bg-purple-100 text-purple-800' }, // Approved demands waiting for disbursement
  { key: 'reevaluations', label: 'Réévaluations', icon: RefreshCw, badgeColors: 'bg-gray-100 text-gray-800' }, // Credit reevaluation workflow
  { key: 'remboursements', label: 'Remboursements', icon: TrendingUp },
  { key: 'echeancier', label: 'Échéancier', icon: Calendar },
  { key: 'archives', label: 'Archives', icon: XCircle, badgeColors: 'bg-slate-100 text-slate-800' } // Cancelled / Rejected
];

interface CreditsProps {
  userRole?: string;
  activeView?: string;
  onModuleChange?: (module: string) => void;
}

export default function CreditsRefactored({ userRole, activeView, onModuleChange }: CreditsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
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

  useEffect(() => {
    if (activeView) {
      switch (activeView) {
        case 'credits-list':
          setActiveTab('dashboard');
          break;
        case 'credits-demandes':
          setActiveTab('demandes');
          break;
        case 'credits-commission':
          setActiveTab('commission');
          break;
        case 'credits-remboursements':
          setActiveTab('remboursements');
          break;
        default:
          setActiveTab('dashboard');
      }
    }
  }, [activeView]);

  // Hooks
  const credits = useCredits();
  const demandes = useDemandes();
  const enquetes = useEnquetes();
  const stats = useCreditStats();
  const { counts: badgeCounts } = useCreditCounts();

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
    return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
  };

  const formatMoney = (amount: number | null | undefined) => {
    const value = amount || 0;
    const isLarge = value >= 1000000;
    
    return (
      <div className="flex items-baseline justify-end gap-1 font-mono tracking-tight leading-none group-hover:scale-105 transition-transform duration-200">
        <span className={`text-sm font-bold ${
          isLarge 
            ? 'text-cyan-600 dark:text-cyan-400' 
            : 'text-slate-900 dark:text-white'
        }`}>
          {new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(value)}
        </span>
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase select-none">
          FCFA
        </span>
      </div>
    );
  };



  const formatCompactMoney = (amount: number | null | undefined) => {
    const value = amount || 0;
    if (value >= 1000000000) {
      return (value / 1000000000).toFixed(1).replace('.', ',') + ' Md FCFA';
    }
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1).replace('.', ',') + ' M FCFA';
    }
    return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
  };

  const isLoading = credits.loading || demandes.loading || enquetes.loading;

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Common renderer for client name with avatar
  const renderClientName = (item: any) => {
    const client = item.clients || item.client;
    const name = formatClientName(client?.nom, client?.prenom) || 'Client Inconnu';
    const photoUrl = resolveClientPhotoUrl(client?.photoUrl || client?.photoProfile);
    const initials = ((client?.prenom?.[0] || '') + (client?.nom?.[0] || 'C')).toUpperCase();

    return (
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt={name} 
              className="w-8 h-8 rounded-full object-cover border border-slate-700/50 shadow-sm"
            />
          ) : (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border border-white/10 shadow-sm ${
              item.statut === StatutCredit.ACTIVE ? 'bg-emerald-600/80' :
              item.statut === StatutCredit.LATE ? 'bg-red-600/80' : 'bg-slate-700'
            }`}>
              {initials}
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate text-slate-200 group-hover:text-white transition-colors">
            {name}
          </span>
          {client?.phone && (
            <span className="text-[10px] text-slate-500 font-mono truncate">
              {client.phone}
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
      format: (val) => <Badge value={val} className="min-w-[100px] justify-center" />
    },
    { key: 'progression', label: 'Échéances', format: (val, item) => `${item.nombreEcheancesPayees || 0}/${item.nombreEcheancesTotal || 0}` },
    { key: 'joursRetard', label: 'Retard', format: (val) => (val || 0) > 0 ? <span className="text-red-400 font-bold">{val}j</span> : <span className="text-slate-500">0j</span> }
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
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30">
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
    { key: 'statut', label: 'Statut', align: 'center', format: (val) => {
      const translations: Record<string, string> = {
        'READY_FOR_INVESTIGATION': 'En attente',
        'UNDER_INVESTIGATION': 'En cours',
        'INVESTIGATION_COMPLETE': 'Terminée',
      };
      const colors: Record<string, string> = {
        'READY_FOR_INVESTIGATION': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'UNDER_INVESTIGATION': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        'INVESTIGATION_COMPLETE': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
      const icons: Record<string, React.ReactNode> = {
        'READY_FOR_INVESTIGATION': <Clock size={10} className="text-amber-400" />,
        'UNDER_INVESTIGATION': <Play size={10} className="text-cyan-400" />,
        'INVESTIGATION_COMPLETE': <CheckCircle size={10} className="text-emerald-400" />,
      };
      const label = translations[val] || val;
      const colorClass = colors[val] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      return (
        <span className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
          {icons[val]}
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
        icon={<CreditCard size={24} className="text-indigo-400" />}
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
            <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
              <Button size="sm" variant="primary" onClick={() => setShowRequestForm(true)} icon={FileText}>
                Nouvelle Demande
              </Button>
            </ProtectedFeature>
          </div>
        }
      />

      {/* Sticky Tabs Row */}
      <div className="bg-[#020617]/90 backdrop-blur-xl -mx-6 px-6 py-2 mb-6 border-b border-[#1e293b]/50 sticky top-0 z-20">
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
               <TrendingUp className="text-blue-400" size={16} />
               <h3 className="text-sm font-bold text-white uppercase tracking-wider">Pipeline Crédit</h3>
            </div>
            <PipelineFunnel steps={funnelData} />
          </section>

          {/* 2. KPIs & Action Lists split */}
          <div className="grid lg:grid-cols-3 gap-4">
            
            {/* Left Col: Actions Requises (2/3 width) - Smart Feed */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-amber-400" size={16} />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Actions & Activités</h3>
              </div>
              
              <div className="space-y-3">
                {/* Check if ANY action is required */}
                {(actionItems.high.length > 0 || actionItems.medium.length > 0) ? (
                  <>
                    {/* High Priority Group */}
                    {actionItems.high.length > 0 && (
                       <div className="space-y-2">
                          <div className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
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
                                  className="bg-slate-800/50 hover:bg-slate-800 border border-red-500/20 hover:border-red-500/50 rounded-lg p-3 cursor-pointer transition-all flex items-center justify-between group"
                               >
                                  <div className="flex items-center gap-3">
                                     {renderClientName({ clients: item.clients })}
                                     <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                        {item.label}
                                     </span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                     <div className="text-right">
                                        <div className="text-sm font-bold text-white">{formatMoney(item.montantDemande)}</div>
                                        <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                                           <Clock size={10} />
                                           {item.updatedAt ? differenceInDays(new Date(), new Date(item.updatedAt || new Date().toISOString())) + 'j' : '0j'}
                                        </div>
                                     </div>
                                     <ArrowRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />
                                  </div>
                               </div>
                            ))}
                          </div>
                       </div>
                    )}

                    {/* Medium Priority */}
                     {actionItems.medium.length > 0 && (
                       <div className="space-y-2 pt-2">
                          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
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
                                  className="bg-slate-800/30 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/30 rounded-lg p-3 cursor-pointer transition-all flex items-center justify-between group"
                                >
                                   <div className="flex items-center gap-3">
                                      {renderClientName({ clients: item.clients })}
                                      <span className="text-xs text-slate-500">{item.label}</span>
                                   </div>
                                   <div className="text-right">
                                      <div className="text-sm font-medium text-slate-300">{formatMoney(item.montantDemande)}</div>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                  </>
                ) : (
                  /* EMPTY STATE: RECENT ACTIVITY FEED */
                  <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
                     <div className="flex items-center gap-2 mb-4 text-slate-400">
                        <CheckCircle size={18} className="text-emerald-500" />
                        <span className="text-sm font-medium">Aucune action requise. Voici les dernières activités :</span>
                     </div>
                     <div className="space-y-0 relative">
                        {/* Timeline line */}
                        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-700/50"></div>

                        {demandes.demandes
                          .sort((a, b) => new Date(b.updatedAt || b.createdAt || new Date().toISOString()).getTime() - new Date(a.updatedAt || a.createdAt || new Date().toISOString()).getTime())
                          .slice(0, 3)
                          .map((item, idx) => (
                             <div key={item.id} className="relative flex gap-4 pb-4 last:pb-0 group">
                                <div className="z-10 w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 border border-slate-700 shadow-sm group-hover:border-slate-600 transition-colors">
                                   <Clock size={16} className="text-slate-400" />
                                </div>
                                <div className="flex-1 pt-1">
                                   <div className="text-sm text-slate-200">
                                      <span className="font-bold text-white">{formatClientName(item.clients?.nom, item.clients?.prenom)}</span>
                                      <span className="mx-1 text-slate-500">•</span>
                                      {item.deletedAt ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                            <Trash2 size={10} />
                                            Supprimé
                                        </span>
                                      ) : (
                                        <Badge value={item.statut} size="sm" variant="outline" className="border-0 bg-transparent p-0" />
                                      )}
                                   </div>
                                   <div className="text-xs text-slate-500 mt-1">
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
                 <BarChart3 className="text-purple-400" size={16} />
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider">Performance</h3>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                 <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pipeline</span>
                    <div className="text-lg font-black text-white">{formatCompactMoney(kpis.pipelineVolume).replace(' FCFA', '')}</div>
                    <span className="text-[10px] text-slate-400">Potentiel à venir</span>
                 </div>

                 <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Transformation</span>
                    <div className="text-lg font-black text-white">{kpis.transformationRate.toFixed(1)}%</div>
                    <span className="text-[10px] text-slate-400">Dossiers décaissés</span>
                 </div>

                 <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 flex flex-col col-span-2 lg:col-span-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Délai Moyen</span>
                    <div className="flex items-end justify-between">
                       <div className="text-lg font-black text-white">{kpis.avgDelay}j</div>
                       <span className="text-[10px] text-slate-400 text-right">Demande à<br/>Décaissement</span>
                    </div>
                 </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-lg p-3 mt-1">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-slate-400">Total Crédits</span>
                    <span className="text-xs font-bold text-white">{formatMoneyPlain(stats.montantTotalCredits)}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">Actifs</span>
                    <span className="text-xs font-bold text-emerald-400">{stats.creditsActifs} dossiers</span>
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
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
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
               <ProtectedFeature requiredPermission={{ module: 'credits', action: 'approve' }}>
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
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
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
                 <ProtectedFeature requiredPermission={{ module: 'credits', action: 'reject' }}>
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
                 <ProtectedFeature requiredPermission={{ module: 'credits', action: 'approve' }}>
                   <Button 
                      size="sm" 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
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
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ([StatutDemande.REJECTED, StatutDemande.CANCELLED] as string[]).includes(d.statut) || !!d.deletedAt)
              // Sort by updated_at desc
              .sort((a, b) => new Date(b.updatedAt || b.createdAt || new Date().toISOString()).getTime() - new Date(a.updatedAt || a.createdAt || new Date().toISOString()).getTime())
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={[
              ...demandeColumns,
              { key: 'motifRejet', label: 'Motif', format: (val) => <span className="text-slate-500 italic truncate max-w-[200px] block">{val || '-'}</span> }
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
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ([StatutDemande.PENDING_FEES] as string[]).includes(d.statut) && !d.deletedAt)
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              if (item.statut === StatutDemande.PENDING_FEES) {
                setShowFeesModal(true);
              } else {
                // For Rejetée, Annulée
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
                 <ProtectedFeature requiredPermission={{ module: 'credits', action: 'delete' }}>
                   <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDemandeToDelete(item.id);
                      }}
                      title="Supprimer"
                      aria-label="Supprimer"
                    />
                 </ProtectedFeature>
                  {(item.statut === StatutDemande.PENDING_FEES || item.statut === StatutDemande.READY_FOR_INVESTIGATION) && (
                     <ProtectedFeature requiredPermission={{ module: 'credits', action: 'edit' }}>
                       <IconButton
                          icon={XCircle}
                          size="sm"
                          variant="ghost"
                          className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
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
              actions={(item) => (
                <div className="flex items-center gap-1.5">
                  {/* Assigner — pour les demandes en attente d'enquête */}
                  {item.statut === StatutDemande.READY_FOR_INVESTIGATION && (
                    <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
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
                    <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
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
              )}
            />
          </Card>
        </div>
      )}

      {/* Carte Tab - Analyse Géographique */}
      {activeTab === 'carte' && (
        <EnqueteZoneAnalytics
          enquetes={enquetes.enquetes}
          loading={enquetes.loading}
          onRefresh={() => enquetes.fetchEnquetes?.()}
        />
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
            toast.success('Demande créée avec succès');
          }}
          userRole={userRole}
        />
      )}

      {showEnqueteForm && (
        <EnqueteCreditForm
          onClose={() => {
            setShowEnqueteForm(false);
            setSelectedDemande(null);
            setEnqueteData(null); // Reset enquête data on close
          }}
          clientId={selectedDemande?.clients?.id || selectedDemande?.clientId}
          clientNom={selectedDemande ? formatClientName(selectedDemande.clients?.nom, selectedDemande.clients?.prenom) : undefined}
          readOnly={true}
          initialData={enqueteData ? {
            // Use fetched enquête data if available
            id: enqueteData.id,
            demandeId: enqueteData.demandeId,
            client_id: enqueteData.clientId,
            montant_demande: enqueteData.montantDemande,
            categorie_activite: enqueteData.categorieActivite,
            type_activite: enqueteData.typeActivite,
            anciennete_activite: enqueteData.ancienneteActivite,
            description_activite: enqueteData.objetCredit,
            objet_credit: enqueteData.objetCredit,
            revenu_mensuel: enqueteData.revenuMensuel,
            revenus_mensuels: enqueteData.revenuMensuel,
            revenu_journalier: enqueteData.revenuJournalier,
            type_revenu: enqueteData.typeRevenu,
            charges_mensuelles: enqueteData.chargesMensuelles,
            photos_activite: enqueteData.photosActivite || [],
            photos_geotagged: enqueteData.photosGeotagged || [],
            garanties_proposees: enqueteData.garantiesProposees || [],
            autres_credits: enqueteData.autresCredits || [],
          } : selectedDemande ? {
            // Fallback to demande data for new enquêtes
            id: selectedDemande.id,
            demandeId: selectedDemande.id,
            client_id: selectedDemande.clientId || selectedDemande.clients?.id,
            montant_demande: selectedDemande.montantDemande?.toString(),
            type_activite: selectedDemande.typeActivite,
            categorie_activite: selectedDemande.categorieActivite,
            anciennete_activite: selectedDemande.ancienneteActivite,
            objet_credit: selectedDemande.objetCredit,
            revenus_mensuels: selectedDemande.revenusMensuels || selectedDemande.revenuMensuel || selectedDemande.clients?.revenuMensuel,
            revenu_mensuel: selectedDemande.revenuMensuel || selectedDemande.revenusMensuels || selectedDemande.clients?.revenuMensuel,
            revenu_journalier: selectedDemande.revenuJournalier || selectedDemande.clients?.revenuJournalier,
            type_revenu: selectedDemande.typeRevenu || selectedDemande.clients?.typeRevenu,
            charges_mensuelles: selectedDemande.chargesMensuelles
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
            const success = await demandes.startInvestigation(demandeToAssign.id, data);
            if (success) {
              setShowAssignModal(false);
              setDemandeToAssign(null);
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
