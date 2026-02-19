import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, Upload, Users, MapPin, RefreshCw, List, Eye, Edit2, Trash2, ChevronRight, FileText, CreditCard, Shield, BarChart3, AlertCircle, Zap, Building2, Send, DollarSign, UserPlus } from 'lucide-react';
import { Button, IconButton, Card, ResponsiveTable, Badge, ConfirmDialog, FeatureHeader, FEATURE_DESCRIPTIONS, TabGroup } from '../ui';
import { usePermissions, ProtectedFeature } from '../auth/ProtectedFeature';
import ClientForm from './ClientForm';
import CreateClientModal from './CreateClientModal';
import ClientFilters from './ClientFilters';
import ClientStatsDashboard from './ClientStatsDashboard';
import ClientExport from './ClientExport';
import ClientImport from './ClientImport';
import ClientsMap from './ClientsMap';
import ClientDetails from './ClientDetails';
import ClientAccounts from './ClientAccounts';
import ClientKYC from './ClientKYC';
import ClientNotes from './ClientNotes';
import ClientGlobalHistory from './ClientGlobalHistory';
import ClientAlerts from './ClientAlerts';
import ClientActions from './ClientActions';
import ClientBulkCommunication from './ClientBulkCommunication';
import ClientSearch from './ClientSearch';
import SelectEmployeeForConversionModal from './SelectEmployeeForConversionModal';
import type { EmployeeConversionData } from './CreateClientModal';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import { toast, handleApiError } from '../../lib/toast';
import { Pagination } from '../ui/Pagination';
import { formatClientName, resolveStorageUrl, formatPhoneNumber } from '../../lib/format';
import { StatutClient, STATUT_CLIENT_LABELS } from '@shared/enum/status-constants';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import {
  getStatusLabel,
  getStatusColor,
  CLIENT_STATUS_COLORS,
  CLIENT_SEGMENT_LABELS,
  CLIENT_SEGMENT_COLORS
} from '../../lib/status-labels';

interface ClientModuleProps {
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
  activeSubModule?: string;
}

const CLIENT_TAB_IDS = ['details', 'comptes', 'kyc', 'notes', 'analytics', 'historique', 'transactions', 'alertes', 'actions'] as const;

export default function ClientModule({ onModuleChange, activeSubModule }: ClientModuleProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateClients = hasPermission('clients', 'create') || hasPermission('clients', 'manage');
  const canEditClients = hasPermission('clients', 'edit') || hasPermission('clients', 'manage');
  const canDeleteClients = hasPermission('clients', 'delete') || hasPermission('clients', 'manage');
  const canImportClients = hasPermission('clients', 'import') || hasPermission('clients', 'manage');
  const canExportClients = hasPermission('clients', 'export') || hasPermission('clients', 'view');

  // URL-driven navigation
  const { currentSubModule, params, navigateToPath } = useAppNavigation();
  const activeTab = CLIENT_TAB_IDS.includes(currentSubModule as any) ? currentSubModule! : 'details';
  const clientIdFromUrl = params?.id;

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Handle initial view from URL
  useEffect(() => {
    if (currentSubModule === 'new') {
      setShowForm(true);
    }
  }, [currentSubModule]);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [viewingClient, setViewingClient] = useState<any>(null);
  const [searchFilters, setSearchFilters] = useState<any>({});
  const [activeView, setActiveView] = useState<'list' | 'map' | 'stats'>('list');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showBulkCommunication, setShowBulkCommunication] = useState(false);
  const [showSelectEmployee, setShowSelectEmployee] = useState(false);
  const [employeeToConvert, setEmployeeToConvert] = useState<EmployeeConversionData | null>(null);
  
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

  // Deep linking: load client from URL params
  useEffect(() => {
    if (clientIdFromUrl && CLIENT_TAB_IDS.includes(currentSubModule as any)) {
      // Load client if not already loaded or different client
      if (!viewingClient || viewingClient.id !== clientIdFromUrl) {
        clientService.getById(clientIdFromUrl).then(client => {
          if (client) {
            setViewingClient(client);
          } else {
            toast.error('Client introuvable');
            navigateToPath('/clients');
          }
        });
      }
    } else if (!currentSubModule || currentSubModule === 'new') {
      // Back to list or new client form — clear viewing state
      if (viewingClient) setViewingClient(null);
    }
  }, [clientIdFromUrl, currentSubModule]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const result = await clientService.getAll(searchFilters, { page: currentPage, perPage: itemsPerPage });
      setClients(result.data);
      setTotalItems(result.meta.pagination.totalItems);
      setTotalPages(result.meta.pagination.totalPages);
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
            toast.success('Client mis à jour');
            // Update viewingClient if we're editing the currently viewed client
            if (viewingClient?.id === selectedClient.id) {
              setViewingClient({ ...viewingClient, ...updated });
            }
        }
      } else {
        const newClient = await clientService.create(clientData);
        if (newClient) {
            setClients(prev => [newClient, ...prev]);
            toast.success('Client créé', { description: 'Un compte courant a été ouvert automatiquement.' });
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
    navigateToPath(`/clients/${client.id}/details`);
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
      toast.success('Client supprimé');
      if (viewingClient?.id === clientToDelete) {
        navigateToPath('/clients');
      }
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erreur lors de la suppression du client');
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
          onClick={() => navigateToPath('/clients')}
          className="flex items-center gap-2 text-accent hover:text-accent transition-colors"
        >
          <ChevronRight size={20} className="rotate-180" />
          Retour à la liste
        </button>

        {/* Client Header */}
        <Card variant="default" padding="none" className="overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-accent via-status-info to-accent" />

          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar with status ring */}
                <div className="relative shrink-0">
                  {getPhotoUrl(viewingClient) ? (
                    <img
                      src={getPhotoUrl(viewingClient)}
                      alt={viewingClient.nom || ''}
                      className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full object-cover ring-3 shadow-lg ${
                        viewingClient.statut === StatutClient.ACTIVE
                          ? 'ring-status-success/40'
                          : 'ring-edge'
                      }`}
                    />
                  ) : (
                    <div className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-br from-accent/20 to-status-info/20 flex items-center justify-center ring-3 shadow-lg ${
                      viewingClient.statut === StatutClient.ACTIVE
                        ? 'ring-status-success/40'
                        : 'ring-edge'
                    }`}>
                      <span className="text-xl sm:text-2xl font-bold text-accent">
                        {viewingClient.prenom?.charAt(0)}{viewingClient.nom?.charAt(0)}
                      </span>
                    </div>
                  )}
                  {/* Status dot */}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-[3px] border-surface ${
                    viewingClient.statut === StatutClient.ACTIVE
                      ? 'bg-status-success'
                      : viewingClient.statut === StatutClient.SUSPENDED
                        ? 'bg-status-warning'
                        : 'bg-content-muted'
                  }`} />
                </div>

                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-content-primary tracking-tight truncate">
                    {formatClientName(viewingClient.nom, viewingClient.prenom)}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge
                      value={viewingClient.statut === StatutClient.ACTIVE ? 'Actif' : (STATUT_CLIENT_LABELS[viewingClient.statut as keyof typeof STATUT_CLIENT_LABELS] || viewingClient.statut)}
                      size="sm"
                    />
                    <Badge
                      value={getStatusLabel(viewingClient.segment, CLIENT_SEGMENT_LABELS)}
                      className={getStatusColor(viewingClient.segment, CLIENT_SEGMENT_COLORS)}
                      size="sm"
                    />
                    {(viewingClient.agence || viewingClient.agenceNom) && (
                      <span className="flex items-center gap-1 text-xs text-content-muted">
                        <Building2 size={12} />
                        {viewingClient.agenceNom || viewingClient.agence_nom}
                      </span>
                    )}
                  </div>
                  {viewingClient.codeClient && (
                    <p className="text-xs text-content-muted mt-1 font-mono">
                      Réf. {viewingClient.codeClient}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <ProtectedFeature requiredPermission={{ module: 'clients', action: 'edit' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Edit2}
                    onClick={() => handleEditClient(viewingClient)}
                  >
                    <span className="hidden sm:inline">Modifier</span>
                  </Button>
                </ProtectedFeature>
                <ProtectedFeature requiredPermission={{ module: 'clients', action: 'delete' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    className="text-status-danger hover:bg-status-danger-bg hover:border-status-danger/30"
                    onClick={() => handleDeleteClick(viewingClient.id)}
                  >
                    <span className="hidden sm:inline">Supprimer</span>
                  </Button>
                </ProtectedFeature>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <TabGroup
          activeTab={activeTab}
          onTabChange={(key) => navigateToPath(`/clients/${viewingClient.id}/${key}`)}
          variant="underline"
          size="sm"
          tabs={[
            { key: 'details', label: 'Détails', icon: FileText },
            { key: 'comptes', label: 'Comptes', icon: CreditCard },
            { key: 'kyc', label: 'KYC', icon: Shield },
            { key: 'notes', label: 'Notes', icon: Edit2 },
            { key: 'transactions', label: 'Transactions', icon: DollarSign },
            { key: 'alertes', label: 'Alertes', icon: AlertCircle },
            { key: 'actions', label: 'Actions', icon: Zap },
          ]}
        />

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'details' && <ClientDetails client={viewingClient} />}
          {activeTab === 'comptes' && <ClientAccounts clientId={viewingClient.id} />}
          {activeTab === 'kyc' && <ClientKYC clientId={viewingClient.id} onUpdate={loadClients} />}
          {activeTab === 'notes' && <ClientNotes clientId={viewingClient.id} />}
          {activeTab === 'transactions' && <ClientGlobalHistory clientId={viewingClient.id} />}
          {activeTab === 'alertes' && <ClientAlerts client={viewingClient} onUpdate={loadClients} />}
          {activeTab === 'actions' && <ClientActions client={viewingClient} onActionComplete={loadClients} />}
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
            {selectedClient ? (
              <ClientForm
                client={selectedClient}
                onSave={handleSaveClient}
                onClose={() => {
                  setShowForm(false);
                  setSelectedClient(null);
                }}
              />
            ) : (
              <CreateClientModal
                isOpen={true}
                onClose={() => {
                  setShowForm(false);
                  setSelectedClient(null);
                }}
                onSave={handleSaveClient}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // List view (default)
  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Header with contextual help */}
      <FeatureHeader
        featureKey="client.list"
        title={`${FEATURE_DESCRIPTIONS['client.list'].title} (${clients.length})`}
        subtitle={FEATURE_DESCRIPTIONS['client.list'].subtitle}
        helpText={FEATURE_DESCRIPTIONS['client.list'].helpText}
        icon={<Users size={24} />}
        actions={
          <div className="flex items-center gap-1 flex-shrink-0">
            {canCreateClients && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => { setSelectedClient(null); setShowForm(true); }}
                className="shadow-sm shadow-status-info/20 h-7 text-xs px-2"
              >
                <span className="hidden sm:inline">Nouveau</span>
                <span className="sm:hidden">Nouveau</span>
              </Button>
            )}
            {canCreateClients && (
              <Button
                variant="secondary"
                size="sm"
                icon={UserPlus}
                onClick={() => setShowSelectEmployee(true)}
                className="h-7 text-xs px-2"
              >
                <span className="hidden sm:inline">Convertir employé</span>
                <span className="sm:hidden">Conv.</span>
              </Button>
            )}

            <div className="w-px h-5 bg-surface-subtle-elevated mx-0.5" />

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
                  icon={Search}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAdvancedSearch(true)}
                  title="Recherche avancée"
                  aria-label="Recherche avancée"
                  className="h-7 w-7"
                />
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
                {clients.length > 0 && (
                  <IconButton
                    icon={Send}
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowBulkCommunication(true)}
                    title="Com."
                    aria-label="Communication en masse"
                    className="h-7 w-7"
                  />
                )}
              </div>
            </div>
          </div>
        }
        className="px-1"
      />

      {/* Stats View */}
      {activeView === 'stats' && <ClientStatsDashboard />}

      {/* Map View */}
      {activeView === 'map' && (
        <Card variant="default" padding="sm" className="h-[500px]">
          <h2 className="text-sm font-semibold text-content-primary mb-3 px-1">Carte des Clients</h2>
          <ClientsMap height="100%" showStats={true} />
        </Card>
      )}

      {/* List View */}
      {activeView === 'list' && (
        <div className="space-y-0.5">
          {/* Inline Filters - No Card, Integrated background */}
          <div className="bg-surface-base/50 border-x border-t border-edge rounded-t-lg p-2 backdrop-blur-sm">
            <ClientFilters 
              onFilterChange={handleFilterChange}
              initialFilters={searchFilters}
            />
          </div>
          
          {/* Table */}
          <div className="bg-surface border border-edge rounded-b-lg overflow-hidden shadow-sm flex flex-col -mt-px">
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
                              className="w-6 h-6 rounded-full object-cover border border-edge bg-surface-muted"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-surface-muted-elevated flex items-center justify-center border border-edge-strong text-[10px] font-bold text-content-muted">
                              {`${item.prenom?.[0] || ''}${item.nom?.[0] || ''}`.toUpperCase() || '?'}
                            </div>
                          )}
                          <span className="font-medium text-content-primary text-xs">
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
                            value={item.agenceNom || item.agence_nom || 'N/A'}
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
                      format: (val) => <span className="text-xs font-mono text-content-muted">{formatPhoneNumber(val)}</span>
                    },
                    {
                      key: 'segment',
                      label: 'Segment',
                      hideOnMobile: true,
                      headerAlign: 'center',
                      align: 'center',
                      format: (_, item) => (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge
                            value={getStatusLabel(item.segment, CLIENT_SEGMENT_LABELS)}
                            className={getStatusColor(item.segment, CLIENT_SEGMENT_COLORS)}
                            size="sm"
                          />
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex items-center gap-0.5 flex-wrap justify-center">
                              {item.tags.slice(0, 2).map((tag: any) => (
                                <span
                                  key={tag.id}
                                  className="px-1.5 py-0 rounded text-[9px] font-medium leading-relaxed"
                                  style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                              {item.tags.length > 2 && (
                                <span className="text-[9px] text-content-muted font-medium">+{item.tags.length - 2}</span>
                              )}
                            </div>
                          )}
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
                            value={getStatusLabel(item.statut, STATUT_CLIENT_LABELS)} 
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
                  <div className="border-t border-edge p-4 bg-surface-muted/50/50">
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
          {selectedClient ? (
            <div className="bg-surface rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <ClientForm
                client={selectedClient}
                onSave={handleSaveClient}
                onClose={() => {
                  setShowForm(false);
                  setSelectedClient(null);
                }}
              />
            </div>
          ) : (
             <CreateClientModal
               isOpen={true}
               onClose={() => {
                 setShowForm(false);
                 setSelectedClient(null);
               }}
               onSave={handleSaveClient}
             />
          )}
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-surface rounded-xl max-w-2xl w-full">
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
          <div className="bg-surface rounded-xl max-w-md w-full">
            <ClientExport
              clients={clients}
              onClose={() => setShowExport(false)}
            />
          </div>
        </div>
      )}

      {/* Bulk Communication */}
      {showBulkCommunication && clients.length > 0 && (
        <ClientBulkCommunication
          clients={clients}
          onClose={() => setShowBulkCommunication(false)}
          onComplete={() => setShowBulkCommunication(false)}
        />
      )}

      {/* Advanced Search */}
      {showAdvancedSearch && (
        <ClientSearch
          onSearch={(filters) => {
            setSearchFilters(filters);
            setCurrentPage(1);
            setShowAdvancedSearch(false);
          }}
          onClose={() => setShowAdvancedSearch(false)}
        />
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

      {/* Employee to Client Conversion Flow */}
      {showSelectEmployee && (
        <SelectEmployeeForConversionModal
          isOpen={showSelectEmployee}
          onClose={() => setShowSelectEmployee(false)}
          onSelect={(emp) => {
            setShowSelectEmployee(false);
            setEmployeeToConvert(emp);
          }}
        />
      )}

      {employeeToConvert && (
        <CreateClientModal
          isOpen={!!employeeToConvert}
          onClose={() => setEmployeeToConvert(null)}
          onSave={async () => {
            toast.success('Employé converti en client');
            setEmployeeToConvert(null);
            loadClients();
          }}
          fromEmployee={employeeToConvert}
        />
      )}
    </div>
  );
}
