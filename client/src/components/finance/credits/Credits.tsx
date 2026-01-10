import React, { useState, useEffect } from 'react';
import { CreditCard, FileText, ClipboardCheck, BarChart3, TrendingUp, AlertCircle, Clock, CheckCircle, Wifi, WifiOff, Eye, Check, X, Trash2, DollarSign, XCircle, RefreshCw } from 'lucide-react';
import { Card, Button, PageHeader, TabGroup, StatCard, ResponsiveTable, Badge, LoadingScreen, IconButton, ConfirmDialog } from '../../ui';
import { useCredits } from '../../../hooks/credits/useCredits';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { useEnquetes } from '../../../hooks/credits/useEnquetes';
import { useCreditStats } from '../../../hooks/credits/useCreditStats';
import CreditDetailModal from './CreditDetailModal';
import CreditRequestForm from './CreditRequestForm';
import EnqueteCreditForm from './EnqueteCreditForm';
import CreditApprovalModal from './CreditApprovalModal';
import CreditDisbursementModal from './CreditDisbursementModal';
import CreditFeesPaymentModal from './CreditFeesPaymentModal';
import EnqueteDetailModal from './EnqueteDetailModal';
import ReferenceTable from './CreditRemboursement';
import { ReevaluationWorkflowPage } from './ReevaluationWorkflowPage';
import { TableColumn } from '../../ui/ResponsiveTable';
import { ProtectedFeature } from '../../auth/ProtectedFeature';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';

type TabId = 'dashboard' | 'credits' | 'approbation' | 'commission' | 'demandes' | 'enquetes' | 'reevaluations' | 'remboursements';

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { key: 'credits', label: 'Crédits', icon: CreditCard },
  { key: 'demandes', label: 'À traiter', icon: FileText }, // New demands, rejected, cancelled
  { key: 'enquetes', label: 'Enquêtes', icon: ClipboardCheck }, // Only "A enquêter" (ready for investigation)
  { key: 'approbation', label: 'Approbation', icon: CheckCircle }, // Was "Approuvées" inside Demandes, now "Enquêtes terminées" waiting for approval
  { key: 'commission', label: 'Commission Crédit', icon: DollarSign }, // Approved demands waiting for disbursement
  { key: 'reevaluations', label: 'Réévaluations', icon: RefreshCw }, // Credit reevaluation workflow
  { key: 'remboursements', label: 'Remboursements', icon: TrendingUp }
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
    return formatMoney(value);
  };

  const isLoading = credits.loading || demandes.loading || enquetes.loading;

  const isApprovedStatus = (status: string) => {
    const s = status.toLowerCase().trim();
    return ['approuve', 'approuvée', 'approved', 'décaissée', 'décaissé', 'decaissee', 'déboursé', 'debourse', 'déboursée', 'enquête terminée', 'enquete terminee'].includes(s);
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Column Definitions
  const creditColumns: TableColumn<any>[] = [
    { key: 'numero_credit', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => `${item.clients?.nom || 'Client'} ${item.clients?.prenom || ''}`.trim() || 'Client Inconnu' },
    { key: 'montant_principal', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'progression', label: 'Échéances', format: (val, item) => `${item.nombre_echeances_payees || 0}/${item.nombre_echeances_total || 0}` },
    { key: 'jours_retard', label: 'Retard', format: (val) => (val || 0) > 0 ? <span className="text-red-400 font-bold">{val}j</span> : <span className="text-slate-500">0j</span> }
  ];

  const demandeColumns: TableColumn<any>[] = [
    { key: 'numero_demande', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => `${item.clients?.nom || ''} ${item.clients?.prenom || ''}` },
    { key: 'montant_demande', label: 'Montant Demandé', align: 'right', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'created_at', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  const enqueteColumns: TableColumn<any>[] = [
    { key: 'clients.nom', label: 'Client', primary: true, format: (val, item) => `${item.clients?.nom || ''} ${item.clients?.prenom || ''}` },
    { key: 'type_activite', label: 'Activité' },
    { key: 'montant_demande', label: 'Montant', align: 'right', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'score_global', label: 'Score', hideOnMobile: true }
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
          tabs={TABS} 
          variant="pills"
        />
      </Card>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          {/* Primary Stats - 2x2 Grid on Mobile, 4 cols on Desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <StatCard
              title="Crédits Actifs"
              value={stats.creditsActifs || 0}
              icon={CheckCircle}
              color="success"
              subtitle={`sur ${stats.creditsTotal || 0} total`}
            />
            <StatCard
              title="En Retard"
              value={stats.creditsEnRetard || 0}
              icon={AlertCircle}
              color="danger"
              subtitle="crédits"
            />
            <StatCard
              title="Demandes"
              value={stats.demandesEnAttente || 0}
              icon={Clock}
              color="warning"
              subtitle="en attente"
            />
            <StatCard
              title="Enquêtes"
              value={stats.enquetesEnCours || 0}
              icon={ClipboardCheck}
              color="primary"
              subtitle="en cours"
            />
          </div>

          {/* Secondary Stats - Montants */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              title="Montant Crédits"
              value={formatCompactMoney(stats.montantTotalCredits)}
              icon={CreditCard}
              color="neutral"
              variant="minimal"
            />
            <StatCard
              title="Montant Demandes"
              value={formatCompactMoney(stats.montantTotalDemandes)}
              icon={FileText}
              color="neutral"
              variant="minimal"
            />
            <StatCard
              title="Montant Enquêtes"
              value={formatCompactMoney(stats.montantTotalEnquetes)}
              icon={ClipboardCheck}
              color="neutral"
              variant="minimal"
            />
          </div>
        </div>
      )}

      {/* Credits Tab */}
      {activeTab === 'credits' && (
        <Card variant="default" padding="none" className="overflow-hidden">
          <ResponsiveTable
            data={credits.credits
              .filter(c => ['Actif', 'En retard', 'Soldé'].includes(c.statut))
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
              .filter(d => ['Enquête terminée', 'En enquête'].includes(d.statut))
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
              totalPages: Math.ceil(demandes.demandes.filter(d => ['Enquête terminée', 'En enquête'].includes(d.statut)).length / ITEMS_PER_PAGE),
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
              .filter(d => d.statut === 'Approuvée')
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              setShowDisbursementModal(true); // Disbursement logic
            }}
            emptyMessage="Aucune demande en attente de décaissement"
            maxHeight="calc(100vh - 350px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.filter(d => d.statut === 'Approuvée').length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            actions={(item) => (
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
            )}
          />
        </Card>
      )}

      {/* Demandes Tab (À traiter: En attente, Rejetée, Annulée) */}
      {activeTab === 'demandes' && (
        <Card variant="default" padding="none" className="overflow-hidden border-slate-700/50 shadow-xl">
          <ResponsiveTable
            data={demandes.demandes
              .filter(d => ['En attente', 'Rejetée', 'Annulée'].includes(d.statut))
              .slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            onRowClick={(item) => {
              setSelectedDemande(item);
              if (item.statut === 'En attente') {
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
              totalPages: Math.ceil(demandes.demandes.filter(d => ['En attente', 'Rejetée', 'Annulée'].includes(d.statut)).length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            actions={(item) => (
              <div className="flex gap-1">
                 {item.statut === 'En attente' && (
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
                  {(item.statut === 'En attente' || item.statut === 'A enquêter') && (
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
                  .filter(d => d.statut === 'A enquêter')
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
              actions={() => null} 
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
        <ReevaluationWorkflowPage embedded />
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
          clientNom={selectedDemande ? `${selectedDemande.clients?.nom} ${selectedDemande.clients?.prenom || ''}` : undefined}
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
    </div>
  );
}
