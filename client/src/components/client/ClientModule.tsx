import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, Upload, Users, MapPin, RefreshCw, List, Eye, Edit2, Trash2 } from 'lucide-react';
import { Button, IconButton, Card, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import ClientForm from './ClientForm';
import ClientView from './ClientView';
import ClientFilters from './ClientFilters';
import ClientStatsDashboard from './ClientStatsDashboard';
import ClientExport from './ClientExport';
import ClientImport from './ClientImport';
import ClientsMap from './ClientsMap';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';

export default function ClientModule() {
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
  const [searchFilters, setSearchFilters] = useState({});
  const [activeView, setActiveView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    loadClients();
  }, [searchFilters]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await clientService.getAll(searchFilters);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async (clientData: any) => {
    try {
      if (selectedClient) {
        await clientService.update(selectedClient.id, clientData);
        alert('Client mis à jour avec succès !');
      } else {
        await clientService.create(clientData);
        alert('Client créé avec succès !');
      }
      setShowForm(false);
      setSelectedClient(null);
      loadClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      alert('Erreur lors de la création: ' + (error.error || 'Erreur inconnue'));
    }
  };

  const handleEditClient = (client: any) => {
    setSelectedClient(client);
    setShowForm(true);
  };

  const handleViewClient = (client: any) => {
    setViewingClient(client);
  };

  const handleDeleteClient = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
      try {
        await clientService.delete(id);
        loadClients();
      } catch (error) {
        console.error('Error deleting client:', error);
      }
    }
  };

  const handleFilterChange = (filters: any) => {
    setSearchFilters(filters);
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Header Mobile-First - Ultra Compact */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent truncate">
            Gestion des Clients
          </h1>
          <p className="text-xs text-slate-500 font-medium truncate">
            {clients.length} clients
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
              icon={activeView === 'list' ? MapPin : List}
              variant="secondary"
              size="sm"
              onClick={() => setActiveView(activeView === 'list' ? 'map' : 'list')}
              title={activeView === 'list' ? 'Voir carte' : 'Voir liste'}
              aria-label={activeView === 'list' ? 'Voir carte' : 'Voir liste'}
            />
            {/* Reduced secondary actions on mobile */}
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

      {/* Stats Dashboard */}
      <ClientStatsDashboard />

      {activeView === 'map' ? (
        <Card variant="default" padding="sm" className="h-[500px]">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-3 px-1">Carte des Clients</h2>
          <ClientsMap height="100%" showStats={true} />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Inline Filters */}
          <Card variant="default" padding="sm" className="sticky top-[70px] z-20 shadow-md">
            <ClientFilters 
              onFilterChange={handleFilterChange}
              initialFilters={searchFilters as any}
            />
          </Card>
          
          {/* Table */}

          {/* Table compact */}
          {loading ? (
            <Card variant="default" padding="md">
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            </Card>
          ) : clients.length === 0 ? (
            <Card variant="default" padding="md">
              <EmptyState
                icon={Users}
                title="Aucun client"
                description="Commencez par ajouter votre premier client"
                action={{
                  label: "Ajouter un client",
                  onClick: () => setShowForm(true)
                }}
              />
            </Card>
          ) : (
            <ResponsiveTable
              data={clients}
              columns={[
                {
                  key: 'nom',
                  label: 'Nom',
                  primary: true,
                  format: (_, item) => `${item.nom} ${item.prenom}`
                },
                {
                  key: 'telephone',
                  label: 'Téléphone',
                  hideOnMobile: false
                },
                {
                  key: 'email',
                  label: 'Email',
                  format: (value) => value || '-'
                },
                {
                  key: 'status',
                  label: 'Statut',
                  badge: true
                },
                {
                  key: 'segment',
                  label: 'Segment',
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
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditClient(client)}
                      aria-label="Modifier"
                    />
                  )}
                  {canDeleteClients && (
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteClient(client.id)}
                      aria-label="Supprimer"
                    />
                  )}
                </>
              )}
              onRowClick={(client) => handleViewClient(client)}
              emptyMessage="Aucun client trouvé"
              mobileBreakpoint="lg"
            />
          )}
        </div>
      )}

      {/* Modals */}
      {viewingClient && (
        <ClientView
            client={viewingClient}
            onClose={() => setViewingClient(null)}
        />
      )}

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
    </div>
  );
}
