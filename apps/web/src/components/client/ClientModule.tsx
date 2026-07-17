import React, { useState, useEffect, useMemo } from 'react';
import { useClientAlerts } from '../../hooks/useClientAlerts';
import { Plus, Search, Download, Upload, Users, MapPin, RefreshCw, List, Eye, Edit2, ChevronRight, BarChart3, Send, UserPlus, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button, IconButton, Card, ResponsiveTable, ConfirmDialog, FeatureHeader, FEATURE_DESCRIPTIONS, LoadingSpinner, EmptyState, Pagination } from '../ui';
import { usePermissions, ProtectedFeature } from '../auth/ProtectedFeature';
import ClientForm from './ClientForm';
import CreateClientModal from './CreateClientModal';
import ClientFilters from './ClientFilters';
import ClientStatsDashboard from './ClientStatsDashboard';
import ClientExport from './ClientExport';
import ClientImport from './ClientImport';
import ClientsMap from './ClientsMap';
import ClientProfileLayout from './ClientProfileLayout';
import ClientEditDrawer from './ClientEditDrawer';
import ClientProfileTabsPanel, { CLIENT_TAB_IDS } from './tabs/ClientProfileTabsPanel';
import ClientBulkCommunication from './ClientBulkCommunication';
import ClientSearch from './ClientSearch';
import SelectEmployeeForConversionModal from './SelectEmployeeForConversionModal';
import { CLIENT_LIST_COLUMNS } from './client-list-columns';
import type { EmployeeConversionData } from './CreateClientModal';
import { clientService } from '../../services/clientService';
import { toast, handleApiError } from '../../lib/toast';
import { useAppNavigation } from '../../hooks/useAppNavigation';

interface ClientModuleProps {
  onModuleChange?: (module: string, subModule?: string, data?: any) => void;
  activeSubModule?: string;
}

// CLIENT_TAB_IDS vit désormais dans ./tabs/ClientProfileTabsPanel (source de vérité).

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
  const activeTab = (CLIENT_TAB_IDS as readonly string[]).includes(currentSubModule ?? '') ? currentSubModule! : 'overview';
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
  const [showEditDrawer, setShowEditDrawer] = useState(false);
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
    // Redirect unknown/missing sub-routes to overview (e.g. old /details URL)
    if (clientIdFromUrl && !(CLIENT_TAB_IDS as readonly string[]).includes(currentSubModule ?? '') && currentSubModule !== 'new') {
      navigateToPath(`/clients/${clientIdFromUrl}/overview`);
      return;
    }

    if (clientIdFromUrl && (CLIENT_TAB_IDS as readonly string[]).includes(currentSubModule ?? '')) {
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

  // Alert count from shared React Query cache (no duplicate fetch)
  const { data: alertsData } = useClientAlerts(viewingClient?.id ?? '');
  const alertCount = useMemo(() => alertsData?.active?.length ?? 0, [alertsData]);

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
    navigateToPath(`/clients/${client.id}/overview`);
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
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => navigateToPath('/clients')}
          className="flex items-center gap-2 text-accent hover:text-accent transition-colors"
        >
          <ChevronRight size={20} className="rotate-180" />
          Retour à la liste
        </button>

        {/* Two-column layout: Identity sidebar + Tabbed content */}
        <ClientProfileLayout
          client={viewingClient}
          onEdit={() => setShowEditDrawer(true)}
          onDelete={() => handleDeleteClick(viewingClient.id)}
        >
          {/* Onglets + contenu (extraits — voir ClientProfileTabsPanel) */}
          <ClientProfileTabsPanel
            client={viewingClient}
            activeTab={activeTab}
            alertCount={alertCount}
            onNavigateToTab={(tab) => navigateToPath(`/clients/${viewingClient.id}/${tab}`)}
            onClientsReload={loadClients}
          />
        </ClientProfileLayout>

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

        {/* Edit Drawer */}
        <ClientEditDrawer
          client={viewingClient}
          isOpen={showEditDrawer}
          onClose={() => setShowEditDrawer(false)}
          onSave={async (data) => {
            await handleSaveClient(data);
            setShowEditDrawer(false);
          }}
        />
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

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-muted/40 p-0.5 rounded-lg border border-edge shadow-sm">
                <Button
                  icon={activeView === 'list' ? MapPin : activeView === 'map' ? BarChart3 : List}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveView(activeView === 'list' ? 'map' : activeView === 'map' ? 'stats' : 'list')}
                  className="h-7 text-xs px-2.5 bg-surface shadow-sm text-content-primary border border-edge/50"
                >
                  <span className="hidden sm:inline">{activeView === 'list' ? 'Voir sur la carte' : activeView === 'map' ? 'Statistiques' : 'Vue Liste'}</span>
                </Button>
              </div>

              <div className="hidden md:flex items-center bg-surface-muted/40 p-0.5 rounded-lg border border-edge shadow-sm">
                <Button
                  icon={Search}
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedSearch(true)}
                  className="h-7 text-xs px-3 text-content-secondary hover:text-content-primary hover:bg-surface"
                >
                  Rechercher
                </Button>
                <div className="w-px h-4 bg-edge mx-1" />
                <Button
                  icon={RefreshCw}
                  variant="ghost"
                  size="sm"
                  onClick={loadClients}
                  className="h-7 text-xs px-3 text-content-secondary hover:text-content-primary hover:bg-surface"
                >
                  Actualiser
                </Button>
                
                {canImportClients && (
                  <>
                    <div className="w-px h-4 bg-edge mx-1" />
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button
                          icon={ChevronDown}
                          iconPosition="right"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-3 text-content-secondary hover:text-content-primary hover:bg-surface"
                        >
                          Actions
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content 
                          className="min-w-[180px] bg-surface-base border border-edge rounded-xl shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                          sideOffset={5}
                          align="end"
                        >
                          <DropdownMenu.Item
                            onSelect={() => setShowImport(true)}
                            className="group flex items-center px-2 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                          >
                            <Upload className="mr-2 h-4 w-4 text-content-muted group-hover:text-content-primary" />
                            Importer
                          </DropdownMenu.Item>
                          
                          {canExportClients && (
                            <DropdownMenu.Item
                              onSelect={() => setShowExport(true)}
                              className="group flex items-center px-2 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                            >
                              <Download className="mr-2 h-4 w-4 text-content-muted group-hover:text-content-primary" />
                              Exporter
                            </DropdownMenu.Item>
                          )}
                          
                          {clients.length > 0 && (
                            <>
                              <DropdownMenu.Separator className="h-px bg-surface my-1" />
                              <DropdownMenu.Item
                                onSelect={() => setShowBulkCommunication(true)}
                                className="group flex items-center px-2 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                              >
                                <Send className="mr-2 h-4 w-4 text-content-muted group-hover:text-content-primary" />
                                Communication
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </>
                )}
                
                {/* Fallback if no import permission but export/comm exists */}
                {!canImportClients && canExportClients && (
                  <>
                    <div className="w-px h-4 bg-edge mx-1" />
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button
                          icon={ChevronDown}
                          iconPosition="right"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-3 text-content-secondary hover:text-content-primary hover:bg-surface"
                        >
                          Actions
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content 
                          className="min-w-[180px] bg-surface-base border border-edge rounded-xl shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                          sideOffset={5}
                          align="end"
                        >
                          <DropdownMenu.Item
                            onSelect={() => setShowExport(true)}
                            className="group flex items-center px-2 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                          >
                            <Download className="mr-2 h-4 w-4 text-content-muted group-hover:text-content-primary" />
                            Exporter
                          </DropdownMenu.Item>
                          
                          {clients.length > 0 && (
                            <>
                              <DropdownMenu.Separator className="h-px bg-surface my-1" />
                              <DropdownMenu.Item
                                onSelect={() => setShowBulkCommunication(true)}
                                className="group flex items-center px-2 py-2 text-sm text-content-secondary hover:text-content-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                              >
                                <Send className="mr-2 h-4 w-4 text-content-muted group-hover:text-content-primary" />
                                Communication
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </>
                )}

                {/* Fallback if no import/export but comm exists */}
                {!canImportClients && !canExportClients && clients.length > 0 && (
                  <>
                    <div className="w-px h-4 bg-edge mx-1" />
                    <Button
                      icon={Send}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowBulkCommunication(true)}
                      className="h-7 text-xs px-3 text-content-secondary hover:text-content-primary hover:bg-surface"
                    >
                      Communication
                    </Button>
                  </>
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
                  columns={CLIENT_LIST_COLUMNS}
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
