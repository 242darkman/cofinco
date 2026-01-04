import React, { useState, useEffect } from 'react';
import { CreditCard, FileText, ClipboardCheck, BarChart3, TrendingUp, AlertCircle, Clock, CheckCircle, Wifi, WifiOff, Eye, Check, X } from 'lucide-react';
import { Card, Button, PageHeader, TabGroup, StatCard, ResponsiveTable, Badge, LoadingScreen, IconButton } from '../../ui';
import { useCredits } from '../../../hooks/credits/useCredits';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { useEnquetes } from '../../../hooks/credits/useEnquetes';
import { useCreditStats } from '../../../hooks/credits/useCreditStats';
import CreditDetailModal from './CreditDetailModal';
import CreditRequestForm from './CreditRequestForm';
import EnqueteCreditForm from './EnqueteCreditForm';
import EnqueteCreditValidation from './EnqueteCreditValidation';
import ReferenceTable from './CreditRemboursement';
import { TableColumn } from '../../ui/ResponsiveTable';
import { ProtectedFeature } from '../../auth/ProtectedFeature';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';

type TabId = 'dashboard' | 'credits' | 'demandes' | 'enquetes' | 'remboursements';

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { key: 'credits', label: 'Crédits', icon: CreditCard },
  { key: 'demandes', label: 'Demandes', icon: FileText },
  { key: 'enquetes', label: 'Enquêtes', icon: ClipboardCheck },
  { key: 'remboursements', label: 'Remboursements', icon: TrendingUp }
];

interface CreditsProps {
  userRole?: string;
  activeView?: string;
}

export default function CreditsRefactored({ userRole, activeView }: CreditsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showEnqueteForm, setShowEnqueteForm] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [selectedEnquete, setSelectedEnquete] = useState<string | null>(null);
  const [selectedDemande, setSelectedDemande] = useState<any>(null);
  const [creditsPage, setCreditsPage] = useState(1);
  const [demandesPage, setDemandesPage] = useState(1);
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

  const formatMoney = (amount: number | null | undefined) => {
    const value = amount || 0;
    return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Column Definitions
  const creditColumns: TableColumn<any>[] = [
    { key: 'numero_credit', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => `${item.clients?.nom || 'Client'} ${item.clients?.prenom || ''}`.trim() || 'Client Inconnu' },
    { key: 'montant_principal', label: 'Montant', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'progression', label: 'Échéances', format: (val, item) => `${item.nombre_echeances_payees || 0}/${item.nombre_echeances_total || 0}` },
    { key: 'jours_retard', label: 'Retard', format: (val) => (val || 0) > 0 ? <span className="text-red-400 font-bold">{val}j</span> : '-' }
  ];

  const demandeColumns: TableColumn<any>[] = [
    { key: 'numero_demande', label: 'Numéro', primary: true },
    { key: 'clients.nom', label: 'Client', format: (val, item) => `${item.clients?.nom || ''} ${item.clients?.prenom || ''}` },
    { key: 'montant_demande', label: 'Montant Demandé', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'created_at', label: 'Date', format: (val) => new Date(val).toLocaleDateString('fr-FR'), hideOnMobile: true }
  ];

  const enqueteColumns: TableColumn<any>[] = [
    { key: 'clients.nom', label: 'Client', primary: true, format: (val, item) => `${item.clients?.nom || ''} ${item.clients?.prenom || ''}` },
    { key: 'type_activite', label: 'Activité' },
    { key: 'montant_demande', label: 'Montant', format: (val) => formatMoney(val) },
    { key: 'statut', label: 'Statut', badge: true },
    { key: 'score_final', label: 'Score', hideOnMobile: true }
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
        <div className="space-y-6">
          {/* Top Stats - Horizontal Scroll on Mobile */}
          <div className="flex overflow-x-auto pb-4 gap-4 snap-x md:grid md:grid-cols-4 md:gap-4 md:pb-0 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="min-w-[240px] snap-center">
              <StatCard
                title="Crédits Actifs"
                value={stats.creditsActifs || 0}
                icon={CheckCircle}
                color="success"
                subtitle={`sur ${stats.creditsTotal || 0} total`}
              />
            </div>
            <div className="min-w-[240px] snap-center">
              <StatCard
                title="En Retard"
                value={stats.creditsEnRetard || 0}
                icon={AlertCircle}
                color="danger"
                subtitle="crédits"
              />
            </div>
            <div className="min-w-[240px] snap-center">
              <StatCard
                title="Demandes"
                value={stats.demandesEnAttente || 0}
                icon={Clock}
                color="warning"
                subtitle="en attente"
              />
            </div>
            <div className="min-w-[240px] snap-center">
              <StatCard
                title="Enquêtes"
                value={stats.enquetesEnCours || 0}
                icon={ClipboardCheck}
                color="primary"
                subtitle="en cours"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Montant Crédits" value={formatCompactMoney(stats.montantTotalCredits)} icon={CreditCard} color="neutral" />
            <StatCard 
              title="Montant Demandes" 
              value={formatCompactMoney(stats.montantTotalDemandes)} 
              icon={FileText} 
              color="neutral" 
              subtitle={
                <span className="flex gap-1.5 flex-wrap">
                  <span className="text-amber-400">Att: {formatCompactMoney(stats.montantDemandesEnAttente)}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-emerald-400">Acc: {formatCompactMoney(stats.montantDemandesAccorde)}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-red-400">Rej: {formatCompactMoney(stats.montantDemandesRejete)}</span>
                </span>
              }
            />
            <StatCard title="Montant Enquêtes" value={formatCompactMoney(stats.montantTotalEnquetes)} icon={ClipboardCheck} color="neutral" />
          </div>

          {/* Recent List Previews could go here if needed, but keeping it simple for now */}
        </div>
      )}

      {/* Credits Tab */}
      {activeTab === 'credits' && (
        <Card variant="default" padding="none" className="overflow-hidden">
          <ResponsiveTable
            data={credits.credits.slice((creditsPage - 1) * ITEMS_PER_PAGE, creditsPage * ITEMS_PER_PAGE)}
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

      {/* Demandes Tab */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <ResponsiveTable
            data={demandes.demandes.slice((demandesPage - 1) * ITEMS_PER_PAGE, demandesPage * ITEMS_PER_PAGE)}
            columns={demandeColumns}
            loading={isLoading}
            emptyMessage="Aucune demande trouvée"
            maxHeight="calc(100vh - 300px)"
            pagination={{
              page: demandesPage,
              totalPages: Math.ceil(demandes.demandes.length / ITEMS_PER_PAGE),
              onPageChange: setDemandesPage
            }}
            actions={(item) => (
              <div className="flex gap-1">
                 <IconButton 
                    icon={Eye} 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { setSelectedDemande(item); setShowEnqueteForm(true); }}
                    title="Voir Détails"
                    aria-label="Voir Détails"
                  />
                  {item.statut === 'en_attente' && (
                    <ProtectedFeature requiredPermission={{ module: 'credits', action: 'approve' }}>
                      <>
                        <IconButton 
                          icon={Check} 
                          size="sm" 
                          variant="success" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if(confirm('Approuver cette demande ?')) {
                                demandes.approuverDemande(item.id, item.montant_demande);
                            }
                          }}
                          title="Approuver"
                          aria-label="Approuver"
                        />
                        <IconButton 
                          icon={X} 
                          size="sm" 
                          variant="danger" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if(confirm('Rejeter cette demande ?')) {
                                demandes.rejeterDemande(item.id, 'Rejetée par gestionnaire');
                            }
                          }}
                          title="Rejeter"
                          aria-label="Rejeter"
                        />
                      </>
                    </ProtectedFeature>
                  )}
              </div>
            )}
          />
        </Card>

      {/* Enquetes Tab */}
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
              data={enquetes.enquetes}
              columns={enqueteColumns}
              loading={isLoading}
              emptyMessage="Aucune enquête trouvée"
              actions={(item) => (
                item.statut === 'en_attente' ? (
                  <ProtectedFeature requiredPermission={{ module: 'credits', action: 'approve' }}>
                    <Button variant="primary" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEnquete(item.id);
                        setShowValidationModal(true);
                      }}>
                        Valider
                      </Button>
                  </ProtectedFeature>
                ) : null
              )}
            />
          </Card>
        </div>
      )}

      {/* Remboursements Tab */}
      {activeTab === 'remboursements' && (
        <ReferenceTable />
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

      {showValidationModal && selectedEnquete && enquetes.enquetes.find(e => e.id === selectedEnquete) && (
        <EnqueteCreditValidation
          enquete={enquetes.enquetes.find(e => e.id === selectedEnquete)!}
          onClose={() => {
            setShowValidationModal(false);
            setSelectedEnquete(null);
          }}
          onValidate={async (decision, montant, commentaire, raison) => {
            if (selectedEnquete) {
              await enquetes.validateEnquete(selectedEnquete, decision, montant, commentaire, raison);
              setShowValidationModal(false);
              setSelectedEnquete(null);
            }
          }}
        />
      )}
    </div>
  );
}
