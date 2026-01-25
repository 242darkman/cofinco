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
import { formatClientName, resolveStorageUrl, formatPhoneNumber } from '../../lib/format';
import { StatutClient } from '@shared/enum/status-constants';
import { 
  getStatusLabel, 
  getStatusColor, 
  CLIENT_STATUS_LABELS, 
  CLIENT_STATUS_COLORS,
  CLIENT_SEGMENT_LABELS,
  CLIENT_SEGMENT_COLORS
} from '../../lib/status-labels';

interface ClientModuleProps {
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
  activeSubModule?: string;
}

export default function ClientModule({ onModuleChange, activeSubModule }: ClientModuleProps) {
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

  // Handle initial view
  useEffect(() => {
    if (activeSubModule === 'new') {
      setShowForm(true);
    }
  }, [activeSubModule]);
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadClients();
  }, []); // Load on mount

  // Reload when filters change
  useEffect(() => {
    loadClients();
  }, [searchFilters, currentPage]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const result = await clientService.getAll(searchFilters, { page: currentPage, perPage: itemsPerPage });
      setClients(result.data);
      setTotalItems(result.meta.pagination.total_items);
      setTotalPages(result.meta.pagination.total_pages);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const getPhotoUrl = (client: any) => {
    const raw = client.photoProfile || client.photoUrl || '';
    return resolveStorageUrl(raw);
  };

  const handleSaveClient = async (clientData: any) => {
    try {
      if (selectedClient) {
        const updated = await clientService.update(selectedClient.id, clientData);
        if (updated) {
            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            toast.success('Client mis à jour avec succès !');
            // Update viewingClient if we're editing the currently viewed client
            if (viewingClient?.id === selectedClient.id) {
              setViewingClient({ ...viewingClient, ...updated });
            }
        }
      } else {
        const newClient = await clientService.create(clientData);
        if (newClient) {
            setClients(prev => [newClient, ...prev]);
            toast.success('Client créé avec succès ! Un compte courant a été automatiquement ouvert.');
        }
      }
      setShowForm(false);
      setSelectedClient(null);
      // No need to reload all clients, we have the fresh data with agency name from backend fix
      // loadClients();
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
    setCurrentPage(1);
  };

  const paginatedClients = clients;

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
            {getPhotoUrl(viewingClient) ? (
              <div className="relative">
                <img 
                  src={getPhotoUrl(viewingClient)} 
                  alt={viewingClient.nom || ''} 
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-slate-700 shadow-lg"
                />
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-800 ${viewingClient.statut === StatutClient.ACTIVE ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
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
                {formatClientName(viewingClient.nom, viewingClient.prenom)}
              </h1>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Badge 
                  value={getStatusLabel(viewingClient.segment?.toUpperCase(), CLIENT_SEGMENT_LABELS)} 
                  className={getStatusColor(viewingClient.segment?.toUpperCase(), CLIENT_SEGMENT_COLORS)}
                  size="sm" 
                />
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
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex flex-col min-w-0">
          <h1 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent truncate leading-tight">
            Gestion des Clients
          </h1>
          <p className="text-[10px] text-slate-500 font-medium truncate">
            {clients.length === 0 ? 'Aucun client' : 
             clients.length === 1 ? '1 client' : 
             `${clients.length} clients`}
          </p>
        </div>

        {/* Action Bar - Compact */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canCreateClients && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => { setSelectedClient(null); setShowForm(true); }}
              className="shadow-sm shadow-blue-500/20 h-7 text-xs px-2"
            >
              <span className="hidden sm:inline">Nouveau</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <div className="flex items-center gap-0.5">
            <IconButton
              icon={activeView === 'list' ? MapPin : activeView === 'map' ? BarChart3 : List}
              variant="secondary"
              size="sm"
              onClick={() => setActiveView(activeView === 'list' ? 'map' : activeView === 'map' ? 'stats' : 'list')}
              title={activeView === 'list' ? 'Carte' : activeView === 'map' ? 'Stats' : 'Liste'}
              aria-label={activeView === 'list' ? 'Carte' : activeView === 'map' ? 'Stats' : 'Liste'}
              className="h-7 w-7"
            />
            <div className="hidden sm:flex items-center gap-0.5">
              <IconButton
                icon={RefreshCw}
                variant="secondary"
                size="sm"
                onClick={loadClients}
                title="Actualiser"
                aria-label="Actualiser"
                className="h-7 w-7"
              />
              {canImportClients && (
                <IconButton
                  icon={Upload}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowImport(true)}
                  title="Imp."
                  aria-label="Importer"
                  className="h-7 w-7"
                />
              )}
              {canExportClients && (
                <IconButton
                  icon={Download}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowExport(true)}
                  title="Exp."
                  aria-label="Exporter"
                  className="h-7 w-7"
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
        <div className="space-y-0.5">
          {/* Inline Filters - No Card, Integrated background */}
          <div className="bg-slate-900/50 border-x border-t border-slate-800 rounded-t-lg p-2 backdrop-blur-sm">
            <ClientFilters 
              onFilterChange={handleFilterChange}
              initialFilters={searchFilters}
            />
          </div>
          
          {/* Table */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-b-lg overflow-hidden shadow-sm flex flex-col -mt-px">
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
                />
              </div>
            ) : (
              <>
                <ResponsiveTable
                  data={paginatedClients}
                  density="compact"
                  columns={[
                    {
                      key: 'nom',
                      label: 'Nom',
                      primary: true,
                      format: (_, item) => (
                        <div className="flex items-center gap-2">
                          {getPhotoUrl(item) ? (
                            <img 
                              src={getPhotoUrl(item)} 
                              alt="" 
                              className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              {`${item.prenom?.[0] || ''}${item.nom?.[0] || ''}`.toUpperCase() || '?'}
                            </div>
                          )}
                          <span className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                            {formatClientName(item.nom, item.prenom) || 'Sans nom'}
                          </span>
                        </div>
                      )
                    },
                    {
                      key: 'agence',
                      label: 'Agence',
                      hideOnMobile: true,
                      headerAlign: 'center',
                      align: 'center',
                      format: (_, item) => (
                        <div className="w-24 mx-auto">
                          <Badge 
                            value={item.agence_nom || item.agence || 'N/A'} 
                            variant="neutral"
                            size="sm"
                            className="w-full justify-center text-[10px] font-medium py-0 h-5"
                          />
                        </div>
                      )
                    },
                    {
                      key: 'telephone',
                      label: 'Téléphone',
                      hideOnMobile: true,
                      headerAlign: 'center',
                      align: 'center',
                      format: (val) => <span className="text-xs font-mono text-slate-400">{formatPhoneNumber(val)}</span>
                    },
                    {
                      key: 'segment',
                      label: 'Segment',
                      hideOnMobile: true,
                      headerAlign: 'center',
                      align: 'center',
                      format: (_, item) => (
                        <div className="flex justify-center">
                          <Badge 
                            value={getStatusLabel(item.segment?.toUpperCase(), CLIENT_SEGMENT_LABELS)} 
                            className={getStatusColor(item.segment?.toUpperCase(), CLIENT_SEGMENT_COLORS)}
                            size="sm"
                          />
                        </div>
                      )
                    },
                    {
                      key: 'statut',
                      label: 'Statut',
                      headerAlign: 'center',
                      align: 'center',
                      format: (_, item) => (
                        <div className="flex justify-center">
                          <Badge 
                            value={getStatusLabel(item.statut, CLIENT_STATUS_LABELS)} 
                            className={getStatusColor(item.statut, CLIENT_STATUS_COLORS)}
                            size="sm"
                          />
                        </div>
                      )
                    }
                  ]}
                  actions={(client) => (
                    <div className="flex items-center gap-1">
                      <IconButton
                        icon={Eye}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClient(client)}
                        aria-label="Voir"
                        className="h-6 w-6"
                      />
                      {canEditClients && (
                        <IconButton
                          icon={Edit2}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEditClient(client, e)}
                          aria-label="Modifier"
                          className="h-6 w-6"
                        />
                      )}
                    </div>
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
                      totalItems={totalItems}
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
