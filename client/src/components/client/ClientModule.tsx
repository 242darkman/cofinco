import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, Upload, Users, MapPin, RefreshCw, List, Eye, Edit2, Trash2, ChevronRight, FileText, CreditCard, Shield, Calendar, BarChart3, AlertCircle, Zap, Building2 } from 'lucide-react';
import { Button, IconButton, Card, ResponsiveTable, Badge, ConfirmDialog } from '../ui';
import { usePermissions, ProtectedFeature } from '../auth/ProtectedFeature';
import ClientForm from './ClientForm';
import ClientFilters from './ClientFilters';
import ClientStatsDashboard from './ClientStatsDashboard';
import ClientExport from './ClientExport';
import ClientImport from './ClientImport';
import ClientsMap from './ClientsMap';
import ClientDetails from './ClientDetails';
import ClientAccounts from './ClientAccounts';
import ClientKYC from './ClientKYC';
import ClientNotes from './ClientNotes';
import ClientAnalytics from './ClientAnalytics';
import ClientHistory from './ClientHistory';
import ClientAlerts from './ClientAlerts';
import ClientActions from './ClientActions';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import { toast, handleApiError } from '../../lib/toast';
import { Pagination } from '../ui/Pagination';

interface ClientModuleProps {
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
}

export default function ClientModule({ onModuleChange }: ClientModuleProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateClients = hasPermission('clients', 'create') || hasPermission('clients', 'manage');
  const canEditClients = hasPermission('clients', 'edit') || hasPermission('clients', 'manage');
  const canDeleteClients = hasPermission('clients', 'delete') || hasPermission('clients', 'manage');
  const canImportClients = hasPermission('clients', 'import') || hasPermission('clients', 'manage');
  const canExportClients = hasPermission('clients', 'export') || hasPermission('clients', 'view');

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [viewingClient, setViewingClient] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState('details');
  const [searchFilters, setSearchFilters] = useState<any>({});
  const [activeView, setActiveView] = useState<'list' | 'map' | 'stats'>('list');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadClients();
  }, []); // Load on mount

  // Reload when filters change
  useEffect(() => {
    if (Object.keys(searchFilters).length > 0) {
      loadClients();
    }
  }, [searchFilters]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilters]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await clientService.getAll(searchFilters);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async (clientData: any) => {
    try {
      if (selectedClient) {
        await clientService.update(selectedClient.id, clientData);
        toast.success('Client mis à jour avec succès !');
        // Update viewingClient if we're editing the currently viewed client
        if (viewingClient?.id === selectedClient.id) {
          setViewingClient({ ...viewingClient, ...clientData });
        }
      } else {
        await clientService.create(clientData);
        toast.success('Client créé avec succès ! Un compte courant a été automatiquement ouvert.');
      }
      setShowForm(false);
      setSelectedClient(null);
      loadClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde du client'));
    }
  };

  const handleEditClient = (client: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedClient(client);
    setShowForm(true);
  };

  const handleViewClient = (client: any) => {
    setViewingClient(client);
    setSelectedTab('details');
  };

  const handleDeleteClick = (clientId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setClientToDelete(clientId);
    setShowConfirmDelete(true);
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      await clientService.delete(clientToDelete);
      toast.success('Client supprimé avec succès');
      if (viewingClient?.id === clientToDelete) {
        setViewingClient(null);
      }
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setShowConfirmDelete(false);
      setClientToDelete(null);
    }
  };

  const handleFilterChange = (filters: any) => {
    setSearchFilters(filters);
  };

  // Pagination logic
  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const paginatedClients = clients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Profile view with tabs (when a client is selected)
  if (viewingClient) {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button 
          onClick={() => setViewingClient(null)} 
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ChevronRight size={20} className="rotate-180" />
          Retour à la liste
        </button>

        {/* Client Header */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {viewingClient.photoProfile || viewingClient.photoUrl ? (
              <div className="relative">
                <img 
                  src={viewingClient.photoProfile || viewingClient.photoUrl} 
                  alt={viewingClient.nom || ''} 
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-slate-700 shadow-lg"
                />
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-800 ${viewingClient.status === 'Actif' ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-700 flex items-center justify-center border-4 border-slate-600 shadow-lg">
                <span className="text-xl sm:text-2xl font-bold text-slate-300">
                  {viewingClient.prenom?.charAt(0)}{viewingClient.nom?.charAt(0)}
                </span>
              </div>
            )}
            
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-white mb-1">
                {viewingClient.nom} {viewingClient.prenom}
              </h1>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Badge value={viewingClient.segment} size="sm" />
                {(viewingClient.agence || viewingClient.agence_nom) && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Building2 size={12} />
                      {viewingClient.agence_nom || viewingClient.agence}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <ProtectedFeature requiredPermission={{ module: 'clients', action: 'edit' }}>
              <Button
                variant="secondary"
                size="sm"
                icon={Edit2}
                onClick={() => handleEditClient(viewingClient)}
              >
                <span className="hidden sm:inline">Modifier</span>
              </Button>
            </ProtectedFeature>
            <ProtectedFeature requiredPermission={{ module: 'clients', action: 'delete' }}>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => handleDeleteClick(viewingClient.id)}
              >
                <span className="hidden sm:inline">Supprimer</span>
              </Button>
            </ProtectedFeature>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700 overflow-x-auto pb-2 sm:pb-4 no-scrollbar">
          {[
            { id: 'details', label: 'Détails', icon: FileText },
            { id: 'comptes', label: 'Comptes', icon: CreditCard },
            { id: 'kyc', label: 'KYC', icon: Shield },
            { id: 'notes', label: 'Notes', icon: Edit2 },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'historique', label: 'Historique', icon: Calendar },
            { id: 'alertes', label: 'Alertes', icon: AlertCircle },
            { id: 'actions', label: 'Actions', icon: Zap },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 font-semibold text-xs sm:text-sm whitespace-nowrap transition rounded-t-lg flex items-center gap-1 ${
                selectedTab === tab.id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {selectedTab === 'details' && <ClientDetails client={viewingClient} />}
          {selectedTab === 'comptes' && <ClientAccounts clientId={viewingClient.id} />}
          {selectedTab === 'kyc' && <ClientKYC clientId={viewingClient.id} onUpdate={loadClients} />}
          {selectedTab === 'notes' && <ClientNotes clientId={viewingClient.id} />}
          {selectedTab === 'analytics' && <ClientAnalytics client={viewingClient} />}
          {selectedTab === 'historique' && <ClientHistory clientId={viewingClient.id} />}
          {selectedTab === 'alertes' && <ClientAlerts client={viewingClient} onUpdate={loadClients} />}
          {selectedTab === 'actions' && <ClientActions client={viewingClient} onActionComplete={loadClients} />}
        </div>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={showConfirmDelete}
          onClose={() => setShowConfirmDelete(false)}
          onConfirm={confirmDeleteClient}
          title="Confirmer la suppression"
          message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible."
          confirmText="Supprimer"
          cancelText="Annuler"
          variant="danger"
        />

        {/* Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <ClientForm
                client={selectedClient}
                onSave={handleSaveClient}
                onClose={() => {
                  setShowForm(false);
                  setSelectedClient(null);
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view (default)
  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Header Mobile-First - Ultra Compact */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent truncate">
            Gestion des Clients
          </h1>
          <p className="text-xs text-slate-500 font-medium truncate">
            {clients.length === 0 ? 'Aucun client trouvé' : 
             clients.length === 1 ? '1 client trouvé' : 
             `${clients.length} clients trouvés`}
          </p>
        </div>

        {/* Action Bar - Compact */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canCreateClients && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => { setSelectedClient(null); setShowForm(true); }}
              className="shadow-lg shadow-blue-500/20"
            >
              <span className="hidden sm:inline">Nouveau Client</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <div className="flex items-center gap-1">
            <IconButton
              icon={activeView === 'list' ? MapPin : activeView === 'map' ? BarChart3 : List}
              variant="secondary"
              size="sm"
              onClick={() => setActiveView(activeView === 'list' ? 'map' : activeView === 'map' ? 'stats' : 'list')}
              title={activeView === 'list' ? 'Voir carte' : activeView === 'map' ? 'Voir stats' : 'Voir liste'}
              aria-label={activeView === 'list' ? 'Voir carte' : activeView === 'map' ? 'Voir stats' : 'Voir liste'}
            />
            <div className="hidden sm:flex items-center gap-1">
              <IconButton
                icon={RefreshCw}
                variant="secondary"
                size="sm"
                onClick={loadClients}
                title="Actualiser"
                aria-label="Actualiser"
              />
              {canImportClients && (
                <IconButton
                  icon={Upload}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowImport(true)}
                  title="Importer CSV"
                  aria-label="Importer CSV"
                />
              )}
              {canExportClients && (
                <IconButton
                  icon={Download}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowExport(true)}
                  title="Exporter"
                  aria-label="Exporter"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats View */}
      {activeView === 'stats' && <ClientStatsDashboard />}

      {/* Map View */}
      {activeView === 'map' && (
        <Card variant="default" padding="sm" className="h-[500px]">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-3 px-1">Carte des Clients</h2>
          <ClientsMap height="100%" showStats={true} />
        </Card>
      )}

      {/* List View */}
      {activeView === 'list' && (
        <div className="space-y-4">
          {/* Inline Filters */}
          <Card variant="default" padding="sm" className="sticky top-[70px] z-20 shadow-md">
            <ClientFilters 
              onFilterChange={handleFilterChange}
              initialFilters={searchFilters}
            />
          </Card>
          
          {/* Table */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm flex flex-col">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : clients.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  icon={Users}
                  title="Aucun client"
                  description="Commencez par ajouter votre premier client"
                  action={{
                    label: "Ajouter un client",
                    onClick: () => setShowForm(true)
                  }}
                />
              </div>
            ) : (
              <>
                <ResponsiveTable
                  data={paginatedClients}
                  columns={[
                    {
                      key: 'nom',
                      label: 'Nom',
                      primary: true,
                      format: (_, item) => `${item.nom || ''} ${item.prenom || ''}`.trim() || 'Sans nom'
                    },
                    {
                      key: 'telephone',
                      label: 'Téléphone',
                      hideOnMobile: true
                    },
                    {
                      key: 'segment',
                      label: 'Segment',
                      badge: true,
                      hideOnMobile: true
                    },
                    {
                      key: 'status',
                      label: 'Statut',
                      badge: true
                    }
                  ]}
                  actions={(client) => (
                    <>
                      <IconButton
                        icon={Eye}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClient(client)}
                        aria-label="Voir"
                      />
                      {canEditClients && (
                        <IconButton
                          icon={Edit2}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEditClient(client, e)}
                          aria-label="Modifier"
                        />
                      )}
                    </>
                  )}
                  onRowClick={(client) => handleViewClient(client)}
                  emptyMessage="Aucun client trouvé"
                  mobileBreakpoint="lg"
                />
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/50">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      canGoNext={currentPage < totalPages}
                      canGoPrevious={currentPage > 1}
                      totalItems={clients.length}
                      itemsPerPage={itemsPerPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <ClientForm
              client={selectedClient}
              onSave={handleSaveClient}
              onClose={() => {
                setShowForm(false);
                setSelectedClient(null);
              }}
            />
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full">
            <ClientImport 
              onImportComplete={() => {
                setShowImport(false);
                loadClients();
              }}
              onClose={() => setShowImport(false)}
            />
          </div>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full">
            <ClientExport
              clients={clients}
              onClose={() => setShowExport(false)}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={confirmDeleteClient}
        title="Confirmer la suppression"
        message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible."
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
      />
    </div>
  );
}
