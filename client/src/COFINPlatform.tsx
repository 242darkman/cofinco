import React, { useState, useEffect, lazy, Suspense } from 'react';
import { FileText, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import { useAppNavigation } from './hooks/useAppNavigation';

// ========== LAZY LOADED MODULES (Code Splitting) ==========
// Each module is loaded only when needed, reducing initial bundle by ~70%
// Critical for 3G/slow network performance

// Finance modules (heaviest - load on demand)
const Tontines = lazy(() => import('./components/finance/tontine/Tontines'));
const Credits = lazy(() => import('./components/finance/credits/Credits'));
const TransfertArgent = lazy(() => import('./components/finance/transfert/TransfertArgent'));
const CreditRequestForm = lazy(() => import('./components/finance/credits/CreditRequestForm'));
const Comptes = lazy(() => import('./components/finance/compte/Comptes'));
const CaisseDashboard = lazy(() => import('./components/finance/caisse/CaisseDashboard'));
const CoffreFortDashboard = lazy(() => import('./components/finance/caisse/CoffreFortDashboard').then(m => ({ default: m.CoffreFortDashboard })));
const ComptabiliteSageOHADA = lazy(() => import('./components/finance/accounting/ComptabiliteSageOHADA'));
const CreditRefundsPage = lazy(() => import('./pages/finance/CreditRefundsPage'));
const TresoreriePage = lazy(() => import('./pages/finance/TresoreriePage'));
const ReconciliationPage = lazy(() => import('./pages/finance/ReconciliationPage'));

// Client module
const ClientModule = lazy(() => import('./components/client/ClientModule'));

// HR module
const RessourcesHumaines = lazy(() => import('./components/hr/RessourcesHumaines'));

// Agent modules
const AgentTerrain = lazy(() => import('./components/agent/AgentTerrain'));
const AgentTerrainPortail = lazy(() => import('./components/agent/AgentTerrainPortail'));
const ValidationsCenter = lazy(() => import('./components/validations/ValidationsCenter'));

// Admin modules
const AdminModuleComplet = lazy(() => import('./components/admin/AdminModuleComplet'));
const AdminVirementsProgrammes = lazy(() => import('./components/admin/AdminVirementsProgrammes'));

// KPI module
const KpiDashboard = lazy(() => import('./components/kpi/KpiDashboard'));

// Shared modules
const ReportGenerator = lazy(() => import('./components/shared/ReportGenerator'));
const MessagesModule = lazy(() => import('./components/shared/MessagesModule'));
const UserProfile = lazy(() => import('./components/shared/UserProfile'));
const GlobalSearchModal = lazy(() => import('./components/shared/GlobalSearchModal'));

// Register search providers (side-effect import — runs once at module load)
import './search';

// Dashboard - slightly larger but loads first
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));

// 404 page
const NotFoundPage = lazy(() => import('./components/shared/NotFoundPage'));

// Non-lazy imports (small, always needed)
import LoadingScreen from './components/ui/LoadingScreen';
import AppShell from './components/layout/AppShell';
import PlatformSidebarContent from './components/layout/PlatformSidebarContent';
import PlatformHeader from './components/layout/PlatformHeader';
import MobileBottomNav from './components/layout/MobileBottomNav';
import { PLATFORM_MENU_ITEMS } from './constants/menuItems';
import { getRouteByKey, canAccessRoute } from './lib/routes-config';
import ForcePasswordChange from './components/auth/ForcePasswordChange';
import { usePermissionsContext } from './contexts/PermissionsContext';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import ActiveSessionsModal from './components/shared/ActiveSessionsModal';

// ========== MODULE LOADING FALLBACK ==========
// Skeleton loader shown while modules are being fetched
const ModuleLoadingFallback = ({ moduleName }: { moduleName?: string }) => (
  <LoadingScreen
    showLogo={false}
    message={moduleName ? `Chargement de ${moduleName}...` : 'Chargement du module...'}
    fullScreen={false}
  />
);


interface COFINPlatformProps {
  currentUser?: any;
  onLogout: () => void;
  onUserUpdate?: () => void;
}

export default function COFINPlatform({ currentUser, onLogout, onUserUpdate }: COFINPlatformProps) {
  const { language, setLanguage, t } = useLanguage();
  const { currentModule, currentSubModule, navigateToModule } = useAppNavigation();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 1023px)').matches : true
  );
  const [moduleData, setModuleData] = useState<any>(null);
  const { permissionsVersion } = usePermissionsContext();
  const normalizedRole = normalizeRole(currentUser?.role) || SystemRole.CLIENT;
  
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

    if (route && !canAccessRoute(route, normalizedRole)) {
       // Access revoked!
       console.warn(`[Security] Access to module ${currentModule} revoked. Redirecting...`);
       
       // Get human readable module name
       const menuItem = PLATFORM_MENU_ITEMS.find(item => item.key === currentModule);
       const moduleName = menuItem ? t(menuItem.labelKey) : currentModule;
       
       showNotification('error', `Votre accès au module "${moduleName}" a été révoqué.`);
       navigateToModule('dashboard');
    }
  }, [currentModule, permissionsVersion, currentUser, normalizedRole, navigateToModule]);
  
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

  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch((prev: boolean) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [selectedAgence, setSelectedAgence] = useState('centrale');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['Dashboard']);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showCreditRequestForm, setShowCreditRequestForm] = useState(false);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [pendingCaissePayment, setPendingCaissePayment] = useState(false);





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

    // Build breadcrumbs with sub-module if present
    const crumbs = [t('accueil'), moduleName];

    // Add sub-module to breadcrumb if present
    if (currentSubModule) {
      const route = getRouteByKey(currentModule);
      const subRoute = route?.subRoutes?.find(sr => sr.subModule === currentSubModule);
      crumbs.push(subRoute?.label ?? currentSubModule);
    }

    setBreadcrumbs(crumbs);
  }, [currentModule, currentSubModule, language, t]);

  // Check if user must change password
  useEffect(() => {
    if (currentUser?.mustChangePassword) {
      setMustChangePassword(true);
    }
  }, [currentUser]);



  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const handleModuleChange = (moduleName: string, subModuleName?: string, data?: any) => {
    setModuleLoading(true);
    setTimeout(() => {
      if (data) setModuleData(data);
      navigateToModule(moduleName, subModuleName, data);
      setModuleLoading(false);
    }, 300);
  };

  // Global navigation event listener (cross-module navigation)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.module) {
        handleModuleChange(detail.module, detail.subModule, detail.data);
      }
    };
    window.addEventListener('navigate-module', handler);
    return () => window.removeEventListener('navigate-module', handler);
  }, []);

  // Module data update listener
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.data) {
        setModuleData(detail.data);
      }
    };
    window.addEventListener('module-data-update', handler);
    return () => window.removeEventListener('module-data-update', handler);
  }, []);



  const handleQuickAction = (action: string) => {
    switch (action) {

      case 'new-client':
        navigateToModule('clients', 'new');
        break;

      case 'new-credit':
        setShowCreditRequestForm(true);
        break;
      case 'new-payment':
        navigateToModule('caisse');
        setPendingCaissePayment(true);
        break;
      case 'new-report':
        setShowReportGenerator(true);
        break;
      default:
        break;
    }
  };





  const renderDashboard = () => (
    <Suspense fallback={<ModuleLoadingFallback moduleName="Tableau de bord" />}>
      <Dashboard
        userRole={normalizedRole}
        userName={currentUser?.prenom || currentUser?.nom || currentUser?.username || 'Utilisateur'}
        onModuleChange={handleModuleChange}
        onLogout={onLogout}
        onQuickAction={handleQuickAction}
      />
    </Suspense>
  );






  const renderContent = () => {
    if (moduleLoading) {
      return <LoadingScreen message={t('chargementModule')} fullScreen={false} />;
    }

    // All modules wrapped in Suspense for code splitting
    switch (currentModule) {
      case 'dashboard':
        return renderDashboard();
      case 'clients':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Clients" />}>
            <ClientModule onModuleChange={handleModuleChange} activeSubModule={currentSubModule} />
          </Suspense>
        );
      case 'tontines':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Tontines" />}>
            <Tontines />
          </Suspense>
        );
      case 'credits':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Crédits" />}>
            <Credits userRole={normalizedRole} activeView={currentSubModule} onModuleChange={handleModuleChange} />
          </Suspense>
        );
      case 'remboursements':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Remboursements" />}>
            <CreditRefundsPage />
          </Suspense>
        );
      case 'comptes':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Comptes" />}>
            <Comptes activeView={currentSubModule} />
          </Suspense>
        );
      case 'agentTerrain':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Agent Terrain" />}>
            <AgentTerrain activeView={currentSubModule} />
          </Suspense>
        );
      case 'agentModules':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Gestion Agent" />}>
            <AgentTerrainPortail
              activeView={currentSubModule}
              onModuleChange={handleModuleChange}
            />
          </Suspense>
        );
      case 'caisse':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Caisse" />}>
            <CaisseDashboard
              userRole={normalizedRole}
              onModuleChange={handleModuleChange}
              activeView={currentSubModule}
              initialShowPaiement={pendingCaissePayment}
              onPaiementModalClose={() => setPendingCaissePayment(false)}
              initialState={moduleData}
            />
          </Suspense>
        );
      case 'coffre':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Coffre-Fort" />}>
            <CoffreFortDashboard
              agenceId={currentUser?.agenceId || selectedAgence || 'centrale'}
            />
          </Suspense>
        );
      case 'transfert':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Transferts" />}>
            <TransfertArgent />
          </Suspense>
        );
      case 'virements_programmes':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Virements Programmés" />}>
            <AdminVirementsProgrammes />
          </Suspense>
        );
      case 'rh':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Ressources Humaines" />}>
            <RessourcesHumaines />
          </Suspense>
        );
      case 'comptabilite':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Comptabilité" />}>
            <ComptabiliteSageOHADA activeView={currentSubModule} />
          </Suspense>
        );
      case 'rapports':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Rapports" />}>
            <ReportGenerator />
          </Suspense>
        );
      case 'kpi':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="KPI & Pilotage" />}>
            <KpiDashboard />
          </Suspense>
        );
      case 'administrateur':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Administration" />}>
            <AdminModuleComplet activeView={currentSubModule} />
          </Suspense>
        );
      case 'profil':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Profil" />}>
            <UserProfile onUserUpdate={onUserUpdate} />
          </Suspense>
        );
      case 'messages':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Messages" />}>
            <MessagesModule initialConversationId={moduleData?.conversationId} initialChatUserId={moduleData?.chatUserId} initialChatUserName={moduleData?.chatUserName} initialChatUserPhoto={moduleData?.chatUserPhoto} />
          </Suspense>
        );
      case 'validations':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Validations" />}>
            <ValidationsCenter activeView={currentSubModule} />
          </Suspense>
        );
      case 'tresorerie':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Trésorerie" />}>
            <TresoreriePage />
          </Suspense>
        );
      case 'reconciliation':
        return (
          <Suspense fallback={<ModuleLoadingFallback moduleName="Réconciliation MM" />}>
            <ReconciliationPage />
          </Suspense>
        );
      case '__not_found__':
        return (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <NotFoundPage />
          </Suspense>
        );
      default:
        return (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <NotFoundPage />
          </Suspense>
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
        bottomNav={
          <MobileBottomNav
            currentModule={currentModule}
            onModuleChange={(module) => {
              handleModuleChange(module);
              setSidebarOpen(false);
            }}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
            menuOpen={sidebarOpen}
          />
        }
        sidebar={
          <PlatformSidebarContent
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentModule={currentModule}
            currentSubModule={currentSubModule}
            onModuleChange={handleModuleChange}
            onLogout={onLogout}
            userRole={normalizedRole}
          />
        }
        header={
          <PlatformHeader
            breadcrumbs={breadcrumbs}
            onGlobalSearch={() => setShowGlobalSearch(!showGlobalSearch)}
            onMessagesClick={() => navigateToModule('messages')}
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            onProfileClick={() => navigateToModule('profil')}
            onSessionsClick={() => setShowSessionsModal(true)}
            onLogout={onLogout}
            user={{
              nom: currentUser?.nom,
              prenom: currentUser?.prenom,
              email: currentUser?.email,
              role: currentUser?.role,
              photoProfile: currentUser?.photoProfile,
              agence: currentUser?.agence
            }}
          />
        }
      >
        {renderContent()}
      </AppShell>

      {showGlobalSearch && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            isOpen={showGlobalSearch}
            onClose={() => setShowGlobalSearch(false)}
            onNavigate={(module, itemId, itemType) => {
              if (module === 'clients' && itemId) {
                // Navigate directly to client detail via URL routing
                navigateToModule('clients', 'details', undefined, { id: itemId });
              } else {
                const subModule = itemId && (itemType === 'credit' || itemType === 'tontine' || itemType === 'agent')
                  ? `detail-${itemId}`
                  : undefined;
                handleModuleChange(module, subModule);
              }
              setShowGlobalSearch(false);
            }}
          />
        </Suspense>
      )}

      {/* Sessions actives modal */}
      <ActiveSessionsModal
        isOpen={showSessionsModal}
        onClose={() => setShowSessionsModal(false)}
      />


      {showCreditRequestForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-base border border-edge rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <Suspense fallback={<ModuleLoadingFallback moduleName="Formulaire Crédit" />}>
              <CreditRequestForm
                onClose={() => setShowCreditRequestForm(false)}
                onSuccess={() => {
                  setShowCreditRequestForm(false);
                  showNotification('success', t('demandeCreditEnvoyee'));
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {showReportGenerator && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-base border border-edge rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-edge flex justify-between items-center bg-surface/50">
               <h3 className="text-xl font-bold text-content-primary flex items-center gap-2">
                 <FileText className="text-status-info" size={24} />
                 {t('generateurRapports') || 'Générateur de Rapports'}
               </h3>
               <button onClick={() => setShowReportGenerator(false)} className="text-content-muted hover:text-content-primary transition-colors">
                 <Zap size={24} className="rotate-45" />
               </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-64px)]">
              <Suspense fallback={<ModuleLoadingFallback moduleName="Rapports" />}>
                <ReportGenerator />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-2xl border ${
          notification.type === 'success'
            ? 'bg-status-success border-status-success text-white'
            : 'bg-status-info border-status-info text-white'
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


    </>
  );
}
