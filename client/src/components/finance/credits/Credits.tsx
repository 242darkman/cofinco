import React, { useState, useEffect } from 'react';
import { CreditCard, FileText, ClipboardCheck, BarChart3, TrendingUp, AlertCircle, Clock, CheckCircle, Wifi, WifiOff, Eye, Check, X, Trash2, DollarSign, XCircle, RefreshCw, Users, ArrowRight } from 'lucide-react';
import { Card, Button, PageHeader, TabGroup, StatCard, ResponsiveTable, Badge, LoadingScreen, IconButton, ConfirmDialog } from '../../ui';
import { useCreditCounts } from '../../../hooks/credits/useCreditCounts';
import { useCredits } from '../../../hooks/credits/useCredits';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { useEnquetes } from '../../../hooks/credits/useEnquetes';
import { useCreditStats } from '../../../hooks/credits/useCreditStats';
import { StatutCredit, StatutDemande } from '@shared/enum/status-constants';
import CreditDetailModal from './CreditDetailModal';
import CreditRequestForm from './CreditRequestForm';
import EnqueteCreditForm from './EnqueteCreditForm';
import CreditApprovalModal from './CreditApprovalModal';
import CreditDisbursementModal from './CreditDisbursementModal';
import CreditCommissionRejectionModal from './CreditCommissionRejectionModal';
import CreditFeesPaymentModal from './CreditFeesPaymentModal';
import EnqueteDetailModal from './EnqueteDetailModal';
import ReferenceTable from './CreditRemboursement';
import { ReevaluationWorkflowPage } from './ReevaluationWorkflowPage';
import { formatClientName, resolveClientPhotoUrl } from '../../../lib/format';
import { TableColumn } from '../../ui/ResponsiveTable';
import { ProtectedFeature } from '../../auth/ProtectedFeature';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';
import { PipelineFunnel } from './PipelineFunnel';
import { differenceInDays } from 'date-fns';

type TabId = 'dashboard' | 'credits' | 'approbation' | 'commission' | 'demandes' | 'enquetes' | 'reevaluations' | 'remboursements' | 'archives';

// Helper to get static configuration
const getTabConfig = () => [
  { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { key: 'credits', label: 'Crédits', icon: CreditCard },
  { key: 'demandes', label: 'À traiter', icon: FileText, badgeColors: 'bg-blue-100 text-blue-800' }, // New demands, rejected, cancelled
  { key: 'enquetes', label: 'Enquêtes', icon: ClipboardCheck, badgeColors: 'bg-yellow-100 text-yellow-800' }, // Only "A enquêter" (ready for investigation)
  { key: 'approbation', label: 'Approbation', icon: CheckCircle, badgeColors: 'bg-red-100 text-red-800' }, // Was "Approuvées" inside Demandes, now "Enquêtes terminées" waiting for approval
  { key: 'commission', label: "Comité d'Approbation", icon: Users, badgeColors: 'bg-purple-100 text-purple-800' }, // Approved demands waiting for disbursement
  { key: 'reevaluations', label: 'Réévaluations', icon: RefreshCw, badgeColors: 'bg-gray-100 text-gray-800' }, // Credit reevaluation workflow
  { key: 'remboursements', label: 'Remboursements', icon: TrendingUp },
  { key: 'archives', label: 'Archives', icon: XCircle, badgeColors: 'bg-slate-100 text-slate-800' } // Cancelled / Rejected
];

interface CreditsProps {
  userRole?: string;
  activeView?: string;
  onModuleChange?: (module: string) => void;
}

export default function CreditsRefactored({ userRole, activeView, onModuleChange }: CreditsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [demandeSubTab, setDemandeSubTab] = useState<'to_process' | 'approved'>('to_process');
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showEnqueteForm, setShowEnqueteForm] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [selectedEnquete, setSelectedEnquete] = useState<string | null>(null);
  const [selectedDemande, setSelectedDemande] = useState<any>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showDisbursementModal, setShowDisbursementModal] = useState(false); // New modal state
  const [showCommissionRejectionModal, setShowCommissionRejectionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFeesModal, setShowFeesModal] = useState(false);
  const [creditsPage, setCreditsPage] = useState(1);
  const [demandesPage, setDemandesPage] = useState(1);
  const [demandeToDelete, setDemandeToDelete] = useState<string | null>(null);
  const [demandeToCancel, setDemandeToCancel] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 10;

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
  const offlineItems = useLiveQuery(() => db.enquetes_offline.where('synced').equals(0).toArray());
  const pendingCount = offlineItems?.length || 0;

  useEffect(() => {
    const syncOfflineItems = async () => {
       if (navigator.onLine && pendingCount > 0 && offlineItems) {
           toast.loading(`Synchronisation de ${pendingCount} enquêtes...`, { id: 'sync-load' });
           let successCount = 0;
           
           for (const item of offlineItems) {
               try {
                   await enquetes.createEnquete(item.data);
                   await db.enquetes_offline.update(item.id!, { synced: 1 });
                   await db.enquetes_offline.delete(item.id!); // Clean up after sync
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
    const overdueEnquete = stepEnquete.filter(i => new Date(i.updated_at || i.created_at || new Date().toISOString()) < sevenDaysAgo).length;

    // 4. Comité (Investigation Complete + Approved waiting for disbursement?)
    // Actually Approved items are waiting for Disbursement, so they might belong to "Decaissement" pipeline or "Comité" output?
    // Let's put Investigation Complete AND Approved here as "Comité / Validés"
    const stepComite = d.filter(i => i.statut === StatutDemande.INVESTIGATION_COMPLETE);
    
    // 5. Décaissement (Approved, waiting for disbursement)
    const stepDecaissement = d.filter(i => i.statut === StatutDemande.APPROVED || i.statut === StatutDemande.APPROVED_AFTER_REEVALUATION);

    return {
      demandes: { 
        count: stepDemande.length, 
        amount: stepDemande.reduce((acc, curr) => acc + Number(curr.montant_demande || 0), 0) 
      },
      frais: { 
        count: stepFrais.length, 
        amount: stepFrais.reduce((acc, curr) => acc + Number(curr.montant_demande || 0), 0) 
      },
      enquetes: { 
        count: stepEnquete.length, 
        amount: stepEnquete.reduce((acc, curr) => acc + Number(curr.montant_demande || 0), 0),
        overdue: overdueEnquete
      },
      comite: { 
        count: stepComite.length, 
        amount: stepComite.reduce((acc, curr) => acc + Number(curr.montant_demande || 0), 0) 
      },
      decaissement: { 
        count: stepDecaissement.length, 
        amount: stepDecaissement.reduce((acc, curr) => acc + Number(curr.montant_approuve || curr.montant_demande || 0), 0) 
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

    // High Priority: Comité de Crédit (Investigation Complete) & Overdue Investigations
    const high = d.filter(i => 
      i.statut === StatutDemande.INVESTIGATION_COMPLETE || 
      (i.statut === StatutDemande.UNDER_INVESTIGATION && new Date(i.updated_at || i.created_at || new Date().toISOString()) < sevenDaysAgo)
    ).map(i => ({ 
      ...i, 
      priority: 'high', 
      label: i.statut === StatutDemande.INVESTIGATION_COMPLETE ? 'Prêt pour Comité' : 'Enquête En Retard' 
    }));

    // Medium: Enquêtes en cours (On time) & Approved waiting for disbursement
    const medium = d.filter(i => 
      (i.statut === StatutDemande.UNDER_INVESTIGATION && new Date(i.updated_at || i.created_at || new Date().toISOString()) >= sevenDaysAgo) ||
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

  const isApprovedStatus = (status: string) => {
    const s = status.toLowerCase().trim();
    return ['approuve', 'approuvée', 'approved', 'décaissée', 'décaissé', 'decaissee', 'déboursé', 'debourse', 'déboursée', 'enquête terminée', 'enquete terminee'].includes(s);
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Common renderer for client name with avatar
  const renderClientName = (item: any) => {
    const client = item.clients || item.client;
    const name = formatClientName(client?.nom, client?.prenom) || 'Client Inconnu';
    const photoUrl = resolveClientPhotoUrl(client?.photo_url || client?.photoProfile);
    const initials = (client?.nom?.[0] || 'C').toUpperCase();

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
    { key: 'numero_credit', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => renderClientName(item) },
    { key: 'montant_principal', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    { 
      key: 'statut', 
      label: 'Statut', 
      align: 'center', 
      format: (val) => <Badge value={val} className="min-w-[100px] justify-center" />
    },
    { key: 'progression', label: 'Échéances', format: (val, item) => `${item.nombre_echeances_payees || 0}/${item.nombre_echeances_total || 0}` },
    { key: 'jours_retard', label: 'Retard', format: (val) => (val || 0) > 0 ? <span className="text-red-400 font-bold">{val}j</span> : <span className="text-slate-500">0j</span> }
  ];

  const demandeColumns: TableColumn<any>[] = [
    { key: 'numero_demande', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => renderClientName(item) },
    { key: 'montant_demande', label: 'Montant Demandé', align: 'right', format: (val) => formatMoney(val) },
    { 
      key: 'statut', 
      label: 'Statut', 
      align: 'center', 
      format: (val, item) => {
        if (item.deleted_at) {
          return <Badge value="Supprimé" variant="danger" icon={<XCircle size={12} />} className="min-w-[100px] justify-center" />;
        }
        return <Badge value={val} className="min-w-[100px] justify-center" />;
      }
    },
    { key: 'created_at', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  // Commission crédit specific columns with reevaluation indicator
  const commissionColumns: TableColumn<any>[] = [
    {
      key: 'numero_demande',
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
    { key: 'montant_approuve', label: 'Montant Approuvé', align: 'right', format: (val, item) => formatMoney(val || item.montant_demande) },
    { key: 'created_at', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  const enqueteColumns: TableColumn<any>[] = [
    { key: 'clients.nom', label: 'Client', primary: true, format: (val, item) => renderClientName(item) },
    { key: 'type_activite', label: 'Activité' },
    { key: 'montant_demande', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true, align: 'center', badgeClassName: 'min-w-[100px]' }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Gestion des Crédits" 
        description="Crédits, demandes et enquêtes"
        icon={CreditCard}
        actions={
          <div className="flex gap-2 items-center">
            {pendingCount > 0 && (
              <Badge 
                variant="warning" 
                size="lg" 
                className="animate-pulse flex items-center gap-2"
                value={
                  <span className="flex items-center gap-2">
                    <WifiOff size={16} />
                    {pendingCount} En attente de synchro
                  </span>
                }
              />
            )}
            <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
              <Button variant="primary" onClick={() => setShowRequestForm(true)} icon={FileText}>
                Nouvelle Demande
              </Button>
            </ProtectedFeature>
          </div>
        }
      />

      <Card variant="default" padding="sm" className="sticky top-0 z-10 backdrop-blur-md bg-slate-900/80 mb-6">
        <TabGroup 
          activeTab={activeTab} 
          onTabChange={(key) => setActiveTab(key as TabId)}
          tabs={tabs} 
          variant="pills"
        />
      </Card>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          {/* 1. Pipeline Funnel */}
          <section>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="text-blue-400" />
              Pipeline Crédit
            </h3>
            <PipelineFunnel steps={funnelData} />
          </section>

          {/* 2. KPIs & Action Lists split */}
          <div className="grid lg:grid-cols-3 gap-6">
            
            {/* Left Col: Actions Requises (2/3 width) - Smart Feed */}
            <div className="lg:col-span-2 space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="text-amber-400" />
                Actions & Activités
              </h3>
              
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
                                     if (item.statut === StatutDemande.INVESTIGATION_COMPLETE) {
                                        setShowApprovalModal(true);
                                     } else {
                                        setShowDetailModal(true);
                                     }
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
                                        <div className="text-sm font-bold text-white">{formatMoney(item.montant_demande)}</div>
                                        <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                                           <Clock size={10} />
                                           {item.updated_at ? differenceInDays(new Date(), new Date(item.updated_at || new Date().toISOString())) + 'j' : '0j'}
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
                                      <div className="text-sm font-medium text-slate-300">{formatMoney(item.montant_demande)}</div>
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
                          .sort((a, b) => new Date(b.updated_at || b.created_at || new Date().toISOString()).getTime() - new Date(a.updated_at || a.created_at || new Date().toISOString()).getTime())
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
                                      {item.deleted_at ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                            <Trash2 size={10} />
                                            Supprimé
                                        </span>
                                      ) : (
                                        <Badge value={item.statut} size="sm" variant="outline" className="border-0 bg-transparent p-0" />
                                      )}
                                   </div>
                                   <div className="text-xs text-slate-500 mt-1">
                                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Date inconnue'}
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

            {/* Right Col: Stats & KPIs - Aligned top */}
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <BarChart3 className="text-purple-400" />
                 Performance
              </h3>
              
              <div className="grid gap-3">
                 <StatCard
                    title="Volume Pipeline"
                    value={formatCompactMoney(kpis.pipelineVolume).replace(' FCFA', '')}
                    color="primary"
                    icon={TrendingUp}
                    subtitle="Potentiel à venir"
                 />
                 <StatCard
                    title="Transformation"
                    value={`${kpis.transformationRate.toFixed(1)}%`}
                    color="neutral"
                    icon={RefreshCw}
                    subtitle="Dossiers décaissés"
                 />
                 <StatCard
                    title="Délai Moyen"
                    value={`${kpis.avgDelay}j`}
                    color="neutral"
                    icon={Clock}
                    subtitle="Demande à Décaissement"
                 />
              </div>

              <Card variant="glass" padding="sm">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Volume Global traité</h4>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-sm text-slate-400">Total Crédits</span>
                       <span className="text-white font-bold">{formatMoneyPlain(stats.montantTotalCredits)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-sm text-slate-400">Actifs</span>
                       <span className="text-emerald-400 font-bold">{stats.creditsActifs} dossiers</span>
                    </div>
                 </div>
              </Card>
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
          />
        </Card>
      )}

      {/* Approbation Tab (Enquêtes terminées) */}
      {activeTab === 'approbation' && (
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ([StatutDemande.INVESTIGATION_COMPLETE, StatutDemande.UNDER_INVESTIGATION] as string[]).includes(d.statut))
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
              totalPages: Math.ceil(demandes.demandes.filter(d => ([StatutDemande.INVESTIGATION_COMPLETE, StatutDemande.UNDER_INVESTIGATION] as string[]).includes(d.statut)).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
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
              .filter(d => ([StatutDemande.REJECTED, StatutDemande.CANCELLED] as string[]).includes(d.statut) || !!d.deleted_at)
              // Sort by updated_at desc
              .sort((a, b) => new Date(b.updated_at || b.created_at || new Date().toISOString()).getTime() - new Date(a.updated_at || a.created_at || new Date().toISOString()).getTime())
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={[
              ...demandeColumns,
              { key: 'motif_rejet', label: 'Motif', format: (val) => <span className="text-slate-500 italic truncate max-w-[200px] block">{val || '-'}</span> }
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
              totalPages: Math.ceil(demandes.demandes.filter(d => ([StatutDemande.REJECTED, StatutDemande.CANCELLED] as string[]).includes(d.statut) || !!d.deleted_at).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
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
              .filter(d => ([StatutDemande.PENDING_FEES] as string[]).includes(d.statut) && !d.deleted_at)
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
              totalPages: Math.ceil(demandes.demandes.filter(d => ([StatutDemande.PENDING_FEES] as string[]).includes(d.statut) && !d.deleted_at).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
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

      {/* Enquetes Tab (A enquêter) */}
      {activeTab === 'enquetes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
              <Button variant="primary" onClick={() => setShowEnqueteForm(true)} icon={TrendingUp}>
                Nouvelle Enquête
              </Button>
            </ProtectedFeature>
          </div>
          <Card variant="default" padding="none" className="overflow-hidden">
            <ResponsiveTable
              data={demandes.demandes
                  .filter(d => d.statut === StatutDemande.READY_FOR_INVESTIGATION)
                  .map(d => ({
                    ...d,
                    id: d.id, 
                    type_activite: d.objet_credit || 'À définir',
                    statut: 'Prêt pour enquête', 
                    isDemande: true
                  }))
              }
              columns={enqueteColumns}
              loading={isLoading}
              emptyMessage="Aucune enquête en attente"
              onRowClick={(item: any) => {
                  setSelectedDemande(item);
                  setShowEnqueteForm(true);
              }}
              actions={(item) => (
                <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
                   <Button 
                      size="sm" 
                      variant="primary"
                      onClick={(e) => { 
                        e.stopPropagation();
                        setSelectedDemande(item);
                        setShowEnqueteForm(true);
                      }}
                      icon={ClipboardCheck}
                   >
                     Enquêter
                   </Button>
                </ProtectedFeature>
              )} 
            />
          </Card>
        </div>
      )}

      {/* Remboursements Tab */}
      {activeTab === 'remboursements' && (
        <ReferenceTable />
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
          }}
          clientId={selectedDemande?.clients?.id}
          clientNom={selectedDemande ? formatClientName(selectedDemande.clients?.nom, selectedDemande.clients?.prenom) : undefined}
          initialData={selectedDemande ? {
            client_id: selectedDemande.client_id || selectedDemande.clients?.id,
            montant_demande: selectedDemande.montant_demande?.toString(),
            type_activite: selectedDemande.type_activite,
            objet_credit: selectedDemande.objet_credit
          } : undefined}
          onSave={async (data) => {
            await enquetes.createEnquete({ ...data, demande_id: selectedDemande?.id });
            setShowEnqueteForm(false);
            setSelectedDemande(null);
            enquetes.fetchEnquetes();
            demandes.fetchDemandes();
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

      {selectedEnquete && showDetailModal && (
        <EnqueteDetailModal
          enquete={enquetes.enquetes.find(e => e.id === selectedEnquete) as any}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedEnquete(null);
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
