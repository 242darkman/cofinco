import React, { useState, useEffect } from 'react';
import { Users, DollarSign, TrendingUp, FileText, Edit2, Trash2, Plus, Download, Eye, CheckCircle, Filter, BarChart3, Phone, Mail, MapPin, User, AlertCircle, RefreshCw, Upload, CreditCard, Map, List, ChevronRight, Calendar, Search, Shield, Zap, CheckCircle2, Building2 } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import Tontines from './components/finance/tontine/Tontines';
import Credits from './components/finance/credits/Credits';
import TransfertArgent from './components/finance/transfert/TransfertArgent';
import BourseModule from './components/finance/bourse/BourseModule';
import CreditRequestForm from './components/finance/credits/CreditRequestForm';
import Epargnes from './components/finance/epargne/Epargnes';
import RessourcesHumaines from './components/hr/RessourcesHumaines';
import AgentTerrain from './components/agent/AgentTerrain';
import CaisseDashboard from './components/finance/caisse/CaisseDashboard';
import { CoffreFortDashboard } from './components/finance/caisse/CoffreFortDashboard';
import ClientForm from './components/client/ClientForm';
import ClientKYC from './components/client/ClientKYC';
import ClientNotes from './components/client/ClientNotes';
import ClientAnalytics from './components/client/ClientAnalytics';
import ClientDetails from './components/client/ClientDetails';
import ClientActions from './components/client/ClientActions';
import ClientHistory from './components/client/ClientHistory';
import ClientAlerts from './components/client/ClientAlerts';
import ClientImport from './components/client/ClientImport';
import ClientSearch, { SearchFilters } from './components/client/ClientSearch';
import ClientTags from './components/client/ClientTags';
import ClientBulkCommunication from './components/client/ClientBulkCommunication';
import ClientStatsDashboard from './components/client/ClientStatsDashboard';
import ClientExport from './components/client/ClientExport';
import ClientAccounts from './components/client/ClientAccounts';
import NotificationBadge from './components/shared/NotificationBadge';
import ReportGenerator from './components/shared/ReportGenerator';
import AdminGestionAcces from './components/admin/AdminGestionAcces';
import AdminModuleComplet from './components/admin/AdminModuleComplet';
import DashboardEnhanced from './components/dashboard/DashboardEnhanced';
import Dashboard from './components/dashboard/Dashboard';
import OfflineIndicator from './components/shared/OfflineIndicator';
import ParametresModule from './components/admin/settings/ParametresModule';
import MessagesModule from './components/shared/MessagesModule';
import ExcelModule from './components/shared/ExcelModule';
import UserProfile from './components/shared/UserProfile';
import LoadingScreen from './components/ui/LoadingScreen';
import ClientsMap from './components/client/ClientsMap';
import { type Client, type InsertClient as ClientInsert } from '@shared/schema';
type ClientUpdate = Partial<ClientInsert>;
import { clientsApi } from './lib/api';
import AppShell from './components/layout/AppShell';
import PlatformSidebarContent from './components/layout/PlatformSidebarContent';
import PlatformHeader from './components/layout/PlatformHeader';
import { PLATFORM_MENU_ITEMS } from './constants/menuItems';
import { getRouteByKey, canAccessRoute } from './lib/routes-config';
import ForcePasswordChange from './components/auth/ForcePasswordChange';
import { ProtectedFeature } from './components/auth/ProtectedFeature';
import { usePermissionsContext } from './contexts/PermissionsContext';
import { authService } from './lib/auth';
import ClientFilters from './components/client/ClientFilters';
import { Button, IconButton, Card, Badge, ConfirmDialog } from './components/ui';
import ComptabiliteSageOHADA from './components/finance/accounting/ComptabiliteSageOHADA';
import GlobalSearchModal from './components/shared/GlobalSearchModal';
import { Pagination } from './components/ui/Pagination';
import CreditRefundsPage from './pages/finance/CreditRefundsPage';


interface COFINPlatformProps {
  currentUser?: any;
  onLogout: () => void;
}

export default function COFINPlatform({ currentUser, onLogout }: COFINPlatformProps) {
  const { language, setLanguage, t } = useLanguage();
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => 
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 1023px)').matches : true
  );
  const [currentModule, setCurrentModule] = useState('dashboard');
  const [currentSubModule, setCurrentSubModule] = useState<string | undefined>();
  const [moduleData, setModuleData] = useState<any>(null);
  const { permissionsVersion } = usePermissionsContext();
  
  // Security: Check if user still has access to current module
  useEffect(() => {
    // Skip check for dashboard (always accessible)
    if (currentModule === 'dashboard') return;

    // We can use getRouteByKey logic here or direct check
    // Ideally we check if canAllAccessRoute(currentModule)
    // For simplicity, we assume module name mapping is handled or we use authService directly if we know the module name
    // But currentModule is a route key, not necessarily a module name. 
    // Let's use ROUTES config to check access.
    
    // Find the route config for currentModule
    const route = getRouteByKey(currentModule);
    
    if (route && !canAccessRoute(route, currentUser?.role || 'user')) {
       // Access revoked!
       console.warn(`[Security] Access to module ${currentModule} revoked. Redirecting...`);
       showNotification('error', "Votre accès à ce module a été révoqué.");
       setCurrentModule('dashboard');
    }
  }, [currentModule, permissionsVersion, currentUser]);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const mobile = e.matches;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedTab, setSelectedTab] = useState('details');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showBulkComm, setShowBulkComm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Client[]>([]);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedAgence, setSelectedAgence] = useState('centrale');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['Dashboard']);
  const [showClientsMap, setShowClientsMap] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showCreditRequestForm, setShowCreditRequestForm] = useState(false);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [pendingCaissePayment, setPendingCaissePayment] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);


  useEffect(() => {
    if (currentModule === 'clients') {
      fetchClients();
    }
  }, [currentModule]);

  // Handle Sub-module Navigation
  useEffect(() => {
    if (currentModule === 'clients' && currentSubModule) {
      if (currentSubModule === 'clients-list') {
        setShowClientsMap(false);
        setShowStats(false);
      } else if (currentSubModule === 'clients-map') {
        setShowClientsMap(true);
        setShowStats(false);
      } else if (currentSubModule === 'clients-stats') {
        setShowClientsMap(false);
        setShowStats(true);
      }
    }
  }, [currentModule, currentSubModule]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const menuItem = PLATFORM_MENU_ITEMS.find(item => item.key === currentModule);
    const moduleName = menuItem ? t(menuItem.labelKey) : t('menuDashboard');
    setBreadcrumbs([t('accueil'), moduleName]);
  }, [currentModule, language]);

  // Check if user must change password
  useEffect(() => {
    if (currentUser?.mustChangePassword) {
      setMustChangePassword(true);
    }
  }, [currentUser]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await clientsApi.getAll();
      if (error) {
        showNotification('error', error);
        return;
      }
      setClients(data || []);
    } catch (error: any) {
      showNotification('error', t('erreurChargementClients') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const handleModuleChange = (moduleName: string, subModuleName?: string, data?: any) => {
    setModuleLoading(true);
    setTimeout(() => {
      setCurrentModule(moduleName);
      setCurrentSubModule(subModuleName);
      if (data) setModuleData(data);
      setModuleLoading(false);
    }, 300);
  };

  const handleCreateClient = async (clientData: ClientInsert) => {
    try {
      const { data, error } = await clientsApi.create(clientData);
      if (error) {
        showNotification('error', error);
        return;
      }
      if (data) {
        setClients(prev => [data, ...prev]);
      }
      setShowClientForm(false);
      showNotification('success', t('clientCreeSucces'));
    } catch (error: any) {
      showNotification('error', t('erreurCreation') + ': ' + error.message);
    }
  };

  const handleUpdateClient = async (clientData: Partial<Client>) => {
    if (!editingClient) return;

    try {
      const { data, error } = await clientsApi.update(editingClient.id, clientData);
      if (error) {
        showNotification('error', error);
        return;
      }
      if (data) {
        setClients(prev => prev.map(c => c.id === data.id ? data : c));
        if (selectedClient?.id === data.id) {
          setSelectedClient(data);
        }
      }
      setShowClientForm(false);
      setEditingClient(null);
      showNotification('success', t('clientMisAJourSucces'));
    } catch (error: any) {
      showNotification('error', t('erreurMiseAJour') + ': ' + error.message);
    }
  };

  const handleDeleteClient = (clientId: string) => {
    setClientToDelete(clientId);
    setShowConfirmDelete(true);
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;

    try {
      const { error } = await clientsApi.delete(clientToDelete);
      if (error) {
        showNotification('error', error);
        return;
      }

      setClients(prev => prev.filter(c => c.id !== clientToDelete));
      if (selectedClient?.id === clientToDelete) {
        setSelectedClient(null);
      }
      showNotification('success', t('clientSupprimeSucces'));
    } catch (error: any) {
      showNotification('error', t('erreurSuppression') + ': ' + error.message);
    } finally {
      setShowConfirmDelete(false);
      setClientToDelete(null);
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'new-client':
        setShowClientForm(true);
        setEditingClient(null);
        break;
      case 'new-credit':
        setShowCreditRequestForm(true);
        break;
      case 'new-payment':
        setCurrentModule('caisse');
        setPendingCaissePayment(true);
        break;
      case 'new-report':
        setShowReportGenerator(true);
        break;
      default:
        break;
    }
  };

  const handleExportCSV = () => {
    const headers = [t('nom'), t('prenom'), t('email'), t('telephone'), t('adresse'), t('status'), t('segment')];
    const csvData = filteredClients.map(client => [
      client.nom,
      client.prenom || '',
      client.email,
      client.telephone,
      client.adresse || '',
      client.status,
      client.segment
    ]);

    const csv = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showNotification('success', t('exportCsvSucces'));
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = (client.nom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (client.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
                         (client.telephone || '').includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    const matchesSegment = segmentFilter === 'all' || client.segment === segmentFilter;

    let matchesAdvancedFilters = true;
    if (Object.keys(searchFilters).length > 0) {
      if (searchFilters.searchTerm) {
        const term = searchFilters.searchTerm.toLowerCase();
        matchesAdvancedFilters = matchesAdvancedFilters && (
          (client.nom || '').toLowerCase().includes(term) ||
          (client.email?.toLowerCase() || '').includes(term) ||
          (client.telephone || '').includes(term)
        );
      }
      if (searchFilters.status) {
        matchesAdvancedFilters = matchesAdvancedFilters && client.status === searchFilters.status;
      }
      if (searchFilters.segment) {
        matchesAdvancedFilters = matchesAdvancedFilters && client.segment === searchFilters.segment;
      }
      if (searchFilters.creditMin !== undefined) {
        matchesAdvancedFilters = matchesAdvancedFilters && Number(client.creditTotal || 0) >= searchFilters.creditMin;
      }
      if (searchFilters.creditMax !== undefined) {
        matchesAdvancedFilters = matchesAdvancedFilters && Number(client.creditTotal || 0) <= searchFilters.creditMax;
      }
      if (searchFilters.dateFrom) {
        matchesAdvancedFilters = matchesAdvancedFilters &&
          new Date(client.dateInscription || client.createdAt || '') >= new Date(searchFilters.dateFrom);
      }
      if (searchFilters.dateTo) {
        matchesAdvancedFilters = matchesAdvancedFilters &&
          new Date(client.dateInscription || client.createdAt || '') <= new Date(searchFilters.dateTo);
      }
      if (searchFilters.ville) {
        matchesAdvancedFilters = matchesAdvancedFilters &&
          (client.ville?.toLowerCase() || '').includes(searchFilters.ville.toLowerCase());
      }
    }

    return matchesSearch && matchesStatus && matchesSegment && matchesAdvancedFilters;
  });

  const renderDashboard = () => (
    <Dashboard 
      userRole={currentUser?.role || 'Administrateur'} 
      userName={currentUser?.prenom || currentUser?.nom || currentUser?.username || 'Utilisateur'}
      onModuleChange={handleModuleChange}
      onLogout={onLogout}
      onQuickAction={handleQuickAction}
    />
  );

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, segmentFilter, searchFilters]);

  // Pagination logic
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const renderClients = () => {
    if (selectedClient) {
      return (
        <div className="space-y-6">
          <button onClick={() => setSelectedClient(null)} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300">
            <ChevronRight size={20} className="rotate-180" /> {t('retourListe')}
          </button>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               {selectedClient.photoProfile || selectedClient.photoUrl ? (
                <div className="relative">
                  <img 
                    src={selectedClient.photoProfile || selectedClient.photoUrl || undefined} 
                    alt={selectedClient.nom || ''} 
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-slate-700 shadow-lg"
                  />
                  <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-800 ${selectedClient.status === 'Actif' ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                </div>
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-700 flex items-center justify-center border-4 border-slate-600 shadow-lg">
                  <span className="text-xl sm:text-2xl font-bold text-slate-300">
                    {selectedClient.prenom?.charAt(0)}{selectedClient.nom?.charAt(0)}
                  </span>
                </div>
              )}
              
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-white mb-1">{selectedClient.nom} {selectedClient.prenom}</h1>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Badge value={selectedClient.segment} size="sm" />
                    {selectedClient.agence && (
                      <>
                        <span>•</span>
                        <span className="text-slate-400 flex items-center gap-1">
                          <Building2 size={12} />
                          {selectedClient.agence}
                        </span>
                      </>
                    )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto ml-auto sm:ml-0">
              <ProtectedFeature requiredPermission={{ module: 'clients', action: 'edit' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={() => {
                    setEditingClient(selectedClient);
                    setShowClientForm(true);
                  }}
                  className="flex-1 sm:flex-none justify-center"
                >
                  <span className="hidden sm:inline">{t('modifier')}</span>
                </Button>
              </ProtectedFeature>
              <ProtectedFeature requiredPermission={{ module: 'clients', action: 'delete' }}>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => handleDeleteClient(selectedClient.id)}
                  className="flex-1 sm:flex-none justify-center"
                >
                   <span className="hidden sm:inline">{t('supprimer')}</span>
                </Button>
              </ProtectedFeature>
            </div>
          </div>

          <div className="flex gap-2 border-b border-slate-700 overflow-x-auto pb-2 sm:pb-4 no-scrollbar">
            {['details', 'comptes', 'kyc', 'notes', 'analytics', 'historique', 'alertes', 'actions'].map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 font-semibold text-xs sm:text-sm whitespace-nowrap transition rounded-t-lg ${
                  selectedTab === tab ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
                }`}
              >
                {tab === 'details' && <><FileText size={14} className="inline mr-1" /> {t('details')}</>}
                {tab === 'comptes' && <><CreditCard size={14} className="inline mr-1" /> {t('comptes')}</>}
                {tab === 'kyc' && <><Shield size={14} className="inline mr-1" /> {t('kyc')}</>}
                {tab === 'notes' && <><Edit2 size={14} className="inline mr-1" /> {t('notes')}</>}
                {tab === 'analytics' && <><BarChart3 size={14} className="inline mr-1" /> {t('analytics')}</>}
                {tab === 'historique' && <><Calendar size={14} className="inline mr-1" /> {t('historique')}</>}
                {tab === 'alertes' && <><AlertCircle size={14} className="inline mr-1" /> {t('alertes')}</>}
                {tab === 'actions' && <><Zap size={14} className="inline mr-1" /> {t('actions')}</>}
              </button>
            ))}
          </div>

          {selectedTab === 'details' && (
            <ClientDetails client={selectedClient} />
          )}

          {selectedTab === 'comptes' && <ClientAccounts clientId={selectedClient.id} />}

          {selectedTab === 'kyc' && <ClientKYC clientId={selectedClient.id} onUpdate={fetchClients} />}

          {selectedTab === 'notes' && <ClientNotes clientId={selectedClient.id} />}

          {selectedTab === 'historique' && <ClientHistory clientId={selectedClient.id} />}

          {selectedTab === 'alertes' && <ClientAlerts client={selectedClient} onUpdate={fetchClients} />}

          {selectedTab === 'actions' && <ClientActions client={selectedClient} onActionComplete={fetchClients} />}

          {selectedTab === 'analytics' && <ClientAnalytics client={selectedClient} />}
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-20 sm:pb-0">
        {/* Header Mobile-First - Ultra Compact */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent truncate">
              {t('gestionClients')}
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate">
              {filteredClients.length} {t('clientsTrouves')}
            </p>
          </div>

          {/* Action Bar - Compact */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ProtectedFeature requiredPermission={{ module: 'clients', action: 'create' }}>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setEditingClient(null);
                  setShowClientForm(true);
                }}
                className="shadow-lg shadow-blue-500/20"
              >
                <span className="hidden sm:inline">{t('nouveauClient')}</span>
                <span className="sm:hidden">Nouveau</span>
              </Button>
            </ProtectedFeature>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            <div className="flex items-center gap-1">
              <IconButton
                icon={showClientsMap ? List : Map}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowClientsMap(!showClientsMap);
                  setShowStats(false);
                }}
                title={showClientsMap ? t('liste') : t('carte')}
                aria-label={showClientsMap ? t('liste') : t('carte')}
              />
               <IconButton
                icon={BarChart3}
                variant={showStats ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setShowStats(!showStats);
                  setShowClientsMap(false);
                }}
                title="Statistiques"
                aria-label="Statistiques"
                className="hidden sm:inline-flex"
              />

              <div className="hidden sm:flex items-center gap-1">
                <IconButton
                  icon={RefreshCw}
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchClients()}
                  title={t('actualiser')}
                  aria-label={t('actualiser')}
                />
                <ProtectedFeature requiredPermission={{ module: 'clients', action: 'create' }}>
                  <IconButton
                    icon={Upload}
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowImportModal(true)}
                    title={t('importCsv')}
                    aria-label={t('importCsv')}
                  />
                </ProtectedFeature>
                <IconButton
                  icon={Download}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowExportModal(true)}
                  title="Exporter"
                  aria-label="Exporter"
                />
              </div>
            </div>
          </div>
        </div>

        {showClientsMap ? (
          <ClientsMap />
        ) : showStats ? (
          <ClientStatsDashboard />
        ) : (
          <div className="space-y-4">
            {/* Inline Filters */}
            <Card variant="default" padding="sm" className="sticky top-[70px] z-20 shadow-md">
              <ClientFilters 
                onFilterChange={(filters) => {
                  setSearchQuery(filters.searchTerm);
                  setStatusFilter(filters.status);
                  setSegmentFilter(filters.segment);
                }}
                initialFilters={{
                  searchTerm: searchQuery,
                  status: statusFilter,
                  segment: segmentFilter
                }}
              />
              <div className="mt-2 flex justify-end">
                 <button
                    onClick={() => setShowSearchModal(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <Filter size={12} /> Recherche avancée
                  </button>
              </div>
            </Card>

            {/* Table with internal scroll */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm flex flex-col h-[calc(100vh-220px)] sm:h-[calc(100vh-180px)]">
              <div className="overflow-auto flex-1 custom-scrollbar">
                <table className="w-full text-sm relative">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/95">Nom</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-200 hidden sm:table-cell bg-slate-50 dark:bg-slate-900/95">Téléphone</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-200 hidden sm:table-cell bg-slate-50 dark:bg-slate-900/95">Segment</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/95">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-200 hidden md:table-cell bg-slate-50 dark:bg-slate-900/95">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <RefreshCw className="animate-spin inline-block mb-2 text-cyan-500" size={24} />
                          <p className="text-slate-500 dark:text-slate-400">{t('chargementClients')}</p>
                        </td>
                      </tr>
                    ) : filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <AlertCircle className="inline-block mb-2 text-slate-400" size={24} />
                          <p className="text-slate-500 dark:text-slate-400">{t('aucunClientTrouve')}</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedClients.map((client, idx) => (
                        <tr 
                          key={client.id} 
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedClient(client)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{client.nom} {client.prenom}</div>
                            <div className="text-xs text-slate-500 sm:hidden mt-0.5">
                              {client.segment}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-slate-600 dark:text-slate-300 text-sm">
                              {client.telephone || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Badge 
                              value={client.segment}
                              size="sm" 
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Badge 
                              value={client.status}
                              variant={client.status === 'Actif' ? 'success' : client.status === 'Suspendu' ? 'warning' : 'neutral'} 
                              size="sm"
                            />
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <IconButton
                                icon={Eye}
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedClient(client)}
                                title={t('voirDetails')}
                                aria-label={t('voirDetails')}
                              />
                              <ProtectedFeature requiredPermission={{ module: 'clients', action: 'edit' }}>
                                <IconButton
                                  icon={Edit2}
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setEditingClient(client); setShowClientForm(true); }}
                                  title={t('modifier')}
                                  aria-label={t('modifier')}
                                />
                              </ProtectedFeature>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination integrated in table footer */}
              {filteredClients.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/50">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    canGoNext={currentPage < totalPages}
                    canGoPrevious={currentPage > 1}
                    totalItems={filteredClients.length}
                    itemsPerPage={itemsPerPage}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (moduleLoading) {
      return <LoadingScreen message={t('chargementModule')} fullScreen={false} />;
    }

    switch (currentModule) {
      case 'dashboard':
        return renderDashboard();
      case 'clients':
        return renderClients();
      case 'tontines':
        return <Tontines />;
      case 'credits':
        return <Credits userRole={currentUser?.role} activeView={currentSubModule} onModuleChange={handleModuleChange} />;
      case 'remboursements':
        return <CreditRefundsPage />;
      case 'epargnes':
        return <Epargnes activeView={currentSubModule} />;
      case 'agentTerrain':
        return <AgentTerrain activeView={currentSubModule} />;
      case 'caisse':
        return (
          <CaisseDashboard 
            userRole={currentUser?.role} 
            onModuleChange={handleModuleChange} 
            activeView={currentSubModule} 
            initialShowPaiement={pendingCaissePayment}
            onPaiementModalClose={() => setPendingCaissePayment(false)}
            initialState={moduleData}
          />
        );
      case 'coffre':
        return (
          <CoffreFortDashboard 
            agenceId={currentUser?.agenceId || selectedAgence || 'centrale'} 
          />
        );
      case 'transfert':
        return <TransfertArgent />;
      case 'bourse':
        return <BourseModule />;
      case 'rh':
        return <RessourcesHumaines />;
      case 'comptabilite':
        return <ComptabiliteSageOHADA activeView={currentSubModule} />;
      case 'rapports':
        return <ReportGenerator />;
      case 'parametres':
        return <ParametresModule activeView={currentSubModule} />;
      case 'administrateur':
        return <AdminModuleComplet activeView={currentSubModule} />;
      case 'profil':
        return <UserProfile />;
      case 'messages':
        return <MessagesModule />;
      case 'excel':
        return <ExcelModule />;
      default:
        return (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4">Module en développement</h2>
            <p className="text-slate-400">Cette fonctionnalité sera disponible prochainement</p>
          </div>
        );
    }
  };

  return (
    <>
      <AppShell
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        sidebarWidthOpen="w-64"
        sidebarWidthClosed="w-16"
        contentOffsetOpen="lg:ml-64"
        contentOffsetClosed="lg:ml-16"
        sidebar={
          <PlatformSidebarContent
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentModule={currentModule}
            currentSubModule={currentSubModule}
            onModuleChange={handleModuleChange}
            onLogout={onLogout}
            userRole={currentUser?.role}
          />
        }
        header={
          <PlatformHeader
            breadcrumbs={breadcrumbs}
            onGlobalSearch={() => setShowGlobalSearch(!showGlobalSearch)}
            onMessagesClick={() => setCurrentModule('messages')}
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            onProfileClick={() => setCurrentModule('profil')}
            onSettingsClick={() => setCurrentModule('parametres')}
            onLogout={onLogout}
            user={{
              nom: currentUser?.nom,
              email: currentUser?.email,
              role: currentUser?.role
            }}
          />
        }
      >
        {renderContent()}
      </AppShell>

      {showGlobalSearch && (
        <GlobalSearchModal 
          isOpen={showGlobalSearch}
          onClose={() => setShowGlobalSearch(false)}
          onNavigate={(module, itemId, itemType) => { 
            handleModuleChange(module); 
            setShowGlobalSearch(false);
            // If an item ID is provided, try to select it
            if (itemId && itemType === 'client') {
              // Find client in current list or fetch it
              const foundClient = clients.find(c => c.id === itemId);
              if (foundClient) {
                setSelectedClient(foundClient);
              } else {
                // Fetch the client if not in list
                clientsApi.getById(itemId).then(({ data }) => {
                  if (data) setSelectedClient(data);
                });
              }
            }
            // For other types (credits, tontines), the module itself handles detail views
            // via query params or state - pass subModule as item ID
            if (itemId && (itemType === 'credit' || itemType === 'tontine' || itemType === 'agent')) {
              // Set subModule to signal detail view
              setCurrentSubModule(`detail-${itemId}`);
            }
          }}
        />
      )}

      {showClientForm && (
        <ClientForm
          client={editingClient}
          onClose={() => {
            setShowClientForm(false);
            setEditingClient(null);
          }}
          onSave={(clientData) => {
            if (editingClient) {
              handleUpdateClient(clientData as Partial<Client>);
            } else {
              handleCreateClient(clientData as ClientInsert);
            }
          }}
        />
      )}

      {showImportModal && (
        <ClientImport
          onImportComplete={() => {
            setShowImportModal(false);
            fetchClients();
          }}
        />
      )}

      {showSearchModal && (
        <ClientSearch
          onSearch={(filters) => {
            setSearchFilters(filters);
            setShowSearchModal(false);
          }}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {showBulkComm && (
        <ClientBulkCommunication
          clients={selectedForBulk}
          onClose={() => {
            setShowBulkComm(false);
            setSelectedForBulk([]);
          }}
          onComplete={() => {
            fetchClients();
            setShowBulkComm(false);
            setSelectedForBulk([]);
          }}
        />
      )}

      {showExportModal && (
        <ClientExport
          clients={filteredClients}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showCreditRequestForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <CreditRequestForm 
              onClose={() => setShowCreditRequestForm(false)}
              onSuccess={() => {
                setShowCreditRequestForm(false);
                showNotification('success', t('demandeCreditEnvoyee'));
              }}
              userRole={currentUser?.role}
            />
          </div>
        </div>
      )}

      {showReportGenerator && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
               <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 <FileText className="text-blue-400" size={24} />
                 {t('generateurRapports') || 'Générateur de Rapports'}
               </h3>
               <button onClick={() => setShowReportGenerator(false)} className="text-slate-400 hover:text-white transition-colors">
                 <Zap size={24} className="rotate-45" />
               </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-64px)]">
               <ReportGenerator />
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-2xl border ${
          notification.type === 'success'
            ? 'bg-green-500/90 border-green-400 text-white'
            : 'bg-blue-500/90 border-blue-400 text-white'
        } flex items-center gap-3 animate-fade-in`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {mustChangePassword && (
        <ForcePasswordChange
          onPasswordChanged={() => {
            setMustChangePassword(false);
            showNotification('success', 'Mot de passe changé avec succès');
          }}
        />
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={confirmDeleteClient}
        title={t('confirmerSuppression')}
        message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible."
        confirmText={t('supprimer')}
        cancelText={t('annuler')}
        variant="danger"
      />
    </>
  );
}
