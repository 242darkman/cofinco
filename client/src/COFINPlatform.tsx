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
import ClientModule from './components/client/ClientModule';
import AgentValidations from './components/agent/AgentValidations';

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
import ComptabiliteSageOHADA from './components/finance/accounting/ComptabiliteSageOHADA';
import GlobalSearchModal from './components/shared/GlobalSearchModal';
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

  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
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
    setBreadcrumbs([t('accueil'), moduleName]);
  }, [currentModule, language]);

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
      setCurrentModule(moduleName);
      setCurrentSubModule(subModuleName);
      if (data) setModuleData(data);
      setModuleLoading(false);
    }, 300);
  };



  const handleQuickAction = (action: string) => {
    switch (action) {

      case 'new-client':
        setCurrentModule('clients');
        setCurrentSubModule('new');
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





  const renderDashboard = () => (
    <Dashboard 
      userRole={currentUser?.role || 'Administrateur'} 
      userName={currentUser?.prenom || currentUser?.nom || currentUser?.username || 'Utilisateur'}
      onModuleChange={handleModuleChange}
      onLogout={onLogout}
      onQuickAction={handleQuickAction}
    />
  );






  const renderContent = () => {
    if (moduleLoading) {
      return <LoadingScreen message={t('chargementModule')} fullScreen={false} />;
    }

    switch (currentModule) {
      case 'dashboard':
        return renderDashboard();
      case 'clients':

        return <ClientModule onModuleChange={handleModuleChange} activeSubModule={currentSubModule} />;
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
      case 'agentValidations':
        return <AgentValidations />;
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
            
            // For other types, pass subModule
            if (itemId && (itemType === 'credit' || itemType === 'tontine' || itemType === 'agent')) {
              setCurrentSubModule(`detail-${itemId}`);
            }
          }}
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


    </>
  );
}
