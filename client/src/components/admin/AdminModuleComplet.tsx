import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Shield, Users, Key, Settings, BarChart3, Activity, Monitor, Power, Building2, MapPin,
  MessageSquare, KeyRound, Clock, UserPlus, Award, Package, CreditCard, CalendarClock,
  AlertTriangle, ShieldCheck, LayoutGrid, UserCog, Lock, ChevronLeft, ChevronRight, Percent, Coins
} from 'lucide-react';
import { Button, ConfirmDialog } from '../ui';

// Hooks
import { useModules } from '../../hooks/admin/useModules';
import { usePermissions } from '../../hooks/admin/usePermissions';
import { useRolePermissions } from '../../hooks/admin/useRolePermissions';
import { useAllRolePermissions } from '../../hooks/admin/useAllRolePermissions';
import { useUserPermissions } from '../../hooks/admin/useUserPermissions';
import { useAdminUsers } from '../../hooks/admin/useAdminUsers';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

// Constants
import { ADMIN_TABS, AdminTabId } from '../../constants/admin-constants';
import { authService } from '../../lib/auth';
import { useAppNavigation } from '../../hooks/useAppNavigation';

// Sub-components
import AdminGestionUtilisateurs from './AdminGestionUtilisateurs';
import AdminGestionProfils from './AdminGestionProfils';
import AdminDashboard from './AdminDashboard';
import AdminActivityLogs from './AdminActivityLogs';
import AdminSessionsManager from './AdminSessionsManager';
import AdminMaintenanceMode from './AdminMaintenanceMode';
import AdminTontinesGestion from './AdminTontinesGestion';
import AdminGestionAgences from './AdminGestionAgences';
import AdminGestionZones from './AdminGestionZones';
import AdminNotificationsMonitor from './AdminNotificationsMonitor';
import NotificationTemplatesAdmin from './notifications/NotificationTemplatesAdmin';
import AdminVersionInfo from './AdminVersionInfo';
import { SystemRole } from '@shared/types/roles';
import AdminCaisseAccessCodes from './AdminCaisseAccessCodes';
import AdminGestionCaisses from './AdminGestionCaisses';
import AdminCreditsGestion from './AdminCreditsGestion';
import RolesPermissionsManager from './permissions/RolesPermissionsManager';
import ModulePermissionsView from './permissions/ModulePermissionsView';
import UserCustomPermissionsManager from './permissions/UserCustomPermissionsManager';
import TemporaryPermissionsManager from './permissions/TemporaryPermissionsManager';
import PermissionAnalyticsDashboard from './permissions/PermissionAnalyticsDashboard';
import RegularizationDashboard from './RegularizationDashboard';
import AdminClientCredentials from './AdminClientCredentials';
import AdminProductRates from './AdminProductRates';
import ZoneManagement from './ZoneManagement';
import AdminCurrencySettings from './AdminCurrencySettings';
import AdminBrandingSettings from './AdminBrandingSettings';


interface AdminModuleCompletProps {
  activeView?: string;
}

export default function AdminModuleComplet({ activeView }: AdminModuleCompletProps) {
  const { currentSubModule, navigateToModule } = useAppNavigation();

  // Dérive l'onglet actif depuis l'URL (source de vérité)
  const VALID_TAB_IDS = ADMIN_TABS.map(t => t.id) as string[];
  const activeTab = useMemo<AdminTabId>(() => {
    if (currentSubModule && VALID_TAB_IDS.includes(currentSubModule)) {
      return currentSubModule as AdminTabId;
    }
    return 'dashboard';
  }, [currentSubModule]);

  const setActiveTab = useCallback((tab: AdminTabId) => {
    navigateToModule('administrateur', tab);
  }, [navigateToModule]);

  const [accessViewMode, setAccessViewMode] = useState<'roles' | 'modules' | 'users' | 'temporary' | 'analytics'>('roles');
  const [selectedRole, setSelectedRole] = useState<SystemRole>(SystemRole.ADMIN);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  
  // Navigation Scroll State
  const scrollContainerRef = useRef<HTMLElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  // Hooks
  const { modules } = useModules();
  const { permissions, searchPermissions } = usePermissions();
  const {
    rolePermissions, // eslint-disable-line @typescript-eslint/no-unused-vars
    fetchRolePermissions,
    toggleRolePermission: toggleRolePerm,
    roleHasPermission: singleRoleHasPermission
  } = useRolePermissions(selectedRole);

  // Hook pour la Vue Globale - charge les permissions de TOUS les rôles
  const {
    roleHasPermission: allRolesHasPermission,
    fetchAllRolePermissions
  } = useAllRolePermissions();
  const {
    userPermissions,
    fetchUserPermissions,
    toggleUserPermission,
    activateAllPermissions,
    blockAllPermissions,
    resetPermissions,
    getUserPermissionStatus,
    countActivePermissions,
    getAvailablePermissionsToAdd,
    getAvailablePermissionsToRemove
  } = useUserPermissions(selectedUserId);
  const { users, getUserDisplayName } = useAdminUsers();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Legacy: si activeView est passé via l'ancien système (avant URL sync), on redirige
  useEffect(() => {
    if (activeView && !currentSubModule) {
      switch (activeView) {
        case 'admin-users': navigateToModule('administrateur', 'users'); break;
        case 'admin-agences': navigateToModule('administrateur', 'agences'); break;
        case 'admin-audit': navigateToModule('administrateur', 'logs'); break;
      }
    }
  }, [activeView, currentSubModule, navigateToModule]);

  useEffect(() => {
    fetchRolePermissions();
  }, [selectedRole]);

  // Recharger les permissions globales quand on passe en mode "modules" (Vue Globale)
  useEffect(() => {
    if (accessViewMode === 'modules') {
      fetchAllRolePermissions();
    }
  }, [accessViewMode, fetchAllRolePermissions]);

  useEffect(() => {
    if (selectedUserId) {
      fetchUserPermissions(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (confirmMessage) {
      const timer = setTimeout(() => setConfirmMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmMessage]);
  
  // Scroll Management
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftShadow(scrollLeft > 0);
      setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 5); // tolerance
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  // Scroll active tab into view + Check arrows on tab change
  useEffect(() => {
    // Small delay to ensure render
    setTimeout(() => {
        checkScroll();
        const activeEl = document.getElementById(`admin-tab-${activeTab}`);
        if (activeEl && scrollContainerRef.current) {
             const container = scrollContainerRef.current;
             const { left: activeLeft, right: activeRight } = activeEl.getBoundingClientRect();
             const { left: containerLeft, right: containerRight } = container.getBoundingClientRect();
             
             // If element is out of view, scroll it in
             if (activeLeft < containerLeft) {
                 container.scrollBy({ left: activeLeft - containerLeft - 100, behavior: 'smooth' });
             } else if (activeRight > containerRight) {
                 container.scrollBy({ left: activeRight - containerRight + 100, behavior: 'smooth' });
             }
        }
    }, 100);
  }, [activeTab]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleRoleChange = (role: SystemRole) => setSelectedRole(role);
  const handleToggleRolePermission = async (_role: string, permCode: string) => {
    const perm = permissions.find(p => p.code === permCode);
    if (!perm) return;

    // Check if currently granted (for single role view)
    const isGranted = singleRoleHasPermission(perm.code);

    // toggleRolePerm now uses permissionCode
    await toggleRolePerm(permCode, isGranted);
  };
  const handleToggleUserPermission = async (permId: string) => {
    const perm = permissions.find(p => p.id === permId);
    if (!perm) return;
    const status = getUserPermissionStatus(perm.code);
    await toggleUserPermission(selectedUserId, permId, status.granted);
  };

  const handleActivateAll = async () => {
    if (!selectedUserId) return;
    openConfirm({
      title: 'Activer Toutes les Permissions',
      message: 'Voulez-vous vraiment activer toutes les permissions pour cet utilisateur ?',
      variant: 'warning',
      onConfirm: async () => {
        const success = await activateAllPermissions(selectedUserId, permissions);
        if (success) setConfirmMessage('Toutes les permissions ont été activées');
      }
    });
  };

  const handleBlockAll = async () => {
    if (!selectedUserId) return;
    openConfirm({
      title: 'Bloquer Toutes les Permissions',
      message: 'Voulez-vous vraiment bloquer toutes les permissions pour cet utilisateur ? Cette action est critique.',
      variant: 'danger',
      onConfirm: async () => {
        const success = await blockAllPermissions(selectedUserId, permissions);
        if (success) setConfirmMessage('Toutes les permissions ont été bloquées');
      }
    });
  };

  const handleResetPermissions = async () => {
    if (!selectedUserId) return;
    openConfirm({
      title: 'Réinitialiser les Permissions',
      message: 'Voulez-vous vraiment supprimer tous les overrides personnalisés ? L\'utilisateur reviendra aux permissions de son rôle.',
      variant: 'warning',
      onConfirm: async () => {
        const success = await resetPermissions(selectedUserId);
        if (success) setConfirmMessage('Permissions réinitialisées avec succès');
      }
    });
  };

  const iconMap: Record<string, any> = {
    'BarChart3': BarChart3, 'UserPlus': UserPlus, 'Users': Users, 'Building2': Building2,
    'MapPin': MapPin, 'KeyRound': KeyRound, 'Activity': Activity, 'Monitor': Monitor,
    'Power': Power, 'Shield': Shield, 'Key': Key, 'MessageSquare': MessageSquare, 'Coins': Coins,
    'Settings': Settings, 'Clock': Clock, 'Award': Award, 'Package': Package,
    'CalendarClock': CalendarClock,
    'CreditCard': CreditCard,
    'AlertTriangle': AlertTriangle
  };

  const filteredPermissions = searchTerm ? searchPermissions(searchTerm) : (permissions || []);
  const activeRolePermissionsCount = (permissions || []).filter(p => singleRoleHasPermission(p.code)).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden bg-surface-base">
      {/* TOP NAVIGATION BAR */}
      <header className="shrink-0 bg-surface-base border-b border-edge flex items-center h-14 px-4 gap-4 sticky top-0 z-20">
        {/* Title / Brand */}
        <div className="flex items-center gap-2 shrink-0 pr-4 border-r border-edge">
           <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-accent" />
           </div>
           <div className="hidden md:block">
             <h2 className="text-sm font-bold text-content-primary leading-none">Admin</h2>
             <p className="text-[9px] text-content-muted uppercase tracking-wider leading-none mt-0.5">Système</p>
           </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 relative overflow-hidden flex items-center group/nav">
           
           {/* Left Shadow / Button */}
           <div className={`absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-surface-base to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showLeftShadow && (
                <button 
                  onClick={() => scroll('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-surface/80 hover:bg-surface-elevated text-content-secondary p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
                >
                    <ChevronLeft size={16} />
                </button>
            )}

            {/* Scroll Container */}
            <nav 
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth px-2"
            >
               {ADMIN_TABS.filter(tab => {
                  if (!tab.permission) return true;
                  const parts = tab.permission.split('.');
                  const module = parts[0];
                  const action = parts.slice(1).join('.') || 'view';
                  return authService.hasPermission(module, action);
                }).map((tab) => {
                  const Icon = iconMap[tab.icon] || Shield;
                  const isActive = activeTab === tab.id;
                  const isDisabled = 'disabled' in tab && !!(tab as any).disabled;
                  
                  return (
                    <button
                      key={tab.id}
                      id={`admin-tab-${tab.id}`}
                      onClick={() => !isDisabled && setActiveTab(tab.id)}
                      disabled={isDisabled}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 border border-transparent
                        ${isActive 
                          ? 'bg-accent text-white shadow-sm shadow-accent/20 border-accent/50' 
                          : isDisabled 
                            ? 'opacity-40 cursor-not-allowed text-content-muted' 
                            : 'text-content-muted hover:text-content-secondary hover:bg-surface hover:border-edge'
                        }
                      `}
                    >
                      <Icon size={14} className={isActive ? "text-white" : "text-content-muted"} />
                      <span>{tab.label}</span>
                      {isDisabled && <Lock size={10} className="ml-1" />}
                    </button>
                  );
                })}
            </nav>

            {/* Right Shadow / Button */}
            <div className={`absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-surface-base to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showRightShadow && (
                <button 
                  onClick={() => scroll('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-surface/80 hover:bg-surface-elevated text-content-secondary p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-surface-base">
        <div className="h-full p-2 md:p-3 flex flex-col">
           <div className="w-full h-full flex flex-col">
              
              {/* Optional Section Header if needed, or streamlined */}
              {activeTab !== 'dashboard' && (
                <div className="mb-3 shrink-0">
                    <h1 className="text-base font-bold text-content-primary flex items-center gap-2">
                      {iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'] 
                         ? React.createElement(iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'], { size: 18, className: "text-accent" })
                         : <Shield className="text-accent" size={18} />
                      }
                      {ADMIN_TABS.find(t => t.id === activeTab)?.label}
                    </h1>
                </div>
              )}

              {/* Component Render */}
              <div className="flex-1 relative overflow-hidden flex flex-col">
                  {activeTab === 'dashboard' && <AdminDashboard />}
                  {activeTab === 'profils' && <AdminGestionProfils />}
                  {activeTab === 'users' && <AdminGestionUtilisateurs />}
                  {activeTab === 'logs' && <AdminActivityLogs />}
                  {activeTab === 'sessions' && <AdminSessionsManager />}
                  {activeTab === 'agences' && <AdminGestionAgences />}
                  {activeTab === 'zones' && <AdminGestionZones />}
                  {activeTab === 'tontines' && <AdminTontinesGestion />}
                  {activeTab === 'caisses' && <AdminGestionCaisses />}
                  {activeTab === 'credits' && <AdminCreditsGestion />}
                  {activeTab === 'codes' && <AdminCaisseAccessCodes onClose={() => setActiveTab('dashboard')} />}
                  {activeTab === 'maintenance' && <AdminMaintenanceMode />}
                  {activeTab === 'notifications' && (
                    <NotificationsSection />
                  )}
                  {activeTab === 'updates' && <AdminVersionInfo />}
                  {activeTab === 'regularisation' && <RegularizationDashboard />}
                  {activeTab === 'client-credentials' && <AdminClientCredentials />}
                  {activeTab === 'product-rates' && <AdminProductRates />}
                  {activeTab === 'zones-commerciales' && <ZoneManagement />}
                  {activeTab === 'currency' && <AdminCurrencySettings />}
                  {activeTab === 'branding' && <AdminBrandingSettings />}

                  {activeTab === 'roles' && (
                    <div className="flex flex-col h-full overflow-hidden space-y-2">
                      <div className="border-b border-edge pb-2 shrink-0">
                        {(() => {
                        const viewTabs = [
                          {
                            id: 'roles' as const,
                            label: 'Par Rôle',
                            icon: ShieldCheck,
                            description: 'Gérez les permissions attribuées à chaque rôle. Les modifications s\'appliquent à TOUS les utilisateurs ayant ce rôle.'
                          },
                          {
                            id: 'modules' as const,
                            label: 'Vue Globale',
                            icon: LayoutGrid,
                            description: 'Visualisez la matrice complète des permissions par module. Comparez rapidement les droits entre tous les rôles.'
                          },
                          {
                            id: 'users' as const,
                            label: 'Exceptions',
                            icon: UserCog,
                            description: 'Accordez ou retirez des permissions spécifiques à UN utilisateur, indépendamment de son rôle. Idéal pour les cas particuliers.'
                          },
                          {
                            id: 'temporary' as const,
                            label: 'Temporaires',
                            icon: Clock,
                            description: 'Attribuez des permissions à durée limitée. Parfait pour les remplacements, formations ou accès ponctuels.'
                          },
                          {
                            id: 'analytics' as const,
                            label: 'Analytics',
                            icon: BarChart3,
                            description: 'Analysez l\'utilisation des permissions, identifiez les incohérences et optimisez la configuration des accès.'
                          },
                        ];
                        const activeTab = viewTabs.find(t => t.id === accessViewMode);

                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-content-muted font-medium">Vue :</span>
                              <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
                                {viewTabs.map((tab) => {
                                  const isActive = accessViewMode === tab.id;
                                  return (
                                    <button
                                      key={tab.id}
                                      onClick={() => setAccessViewMode(tab.id)}
                                      className={`
                                        flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                                        ${isActive
                                          ? 'bg-surface text-content-primary shadow-sm border border-edge'
                                          : 'text-content-muted hover:text-content-secondary'
                                        }
                                      `}
                                    >
                                      <tab.icon size={12} />
                                      <span>{tab.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {activeTab && (
                              <p className="text-xs text-content-muted pl-12 max-w-2xl">
                                {activeTab.description}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      </div>
                      
                      <div className="flex-1 overflow-hidden relative">
                        {accessViewMode === 'roles' && (
                            <RolesPermissionsManager
                            modules={modules}
                            permissions={permissions}
                            selectedRole={selectedRole}
                            onRoleChange={handleRoleChange}
                            roleHasPermission={(_role, code) => selectedRole === SystemRole.ADMIN ? true : singleRoleHasPermission(code)}
                            toggleRolePermission={handleToggleRolePermission}
                            activePermissionsCount={selectedRole === SystemRole.ADMIN ? (permissions?.length || 0) : activeRolePermissionsCount}
                            confirmMessage={confirmMessage}
                            />
                        )}

                        {accessViewMode === 'modules' && (
                            <ModulePermissionsView
                            modules={modules}
                            permissions={permissions}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            roleHasPermission={allRolesHasPermission}
                            selectedRole={selectedRole}
                            />
                        )}

                        {accessViewMode === 'users' && (
                            <UserCustomPermissionsManager
                            users={users}
                            permissions={permissions}
                            selectedUserId={selectedUserId}
                            onUserChange={setSelectedUserId}
                            userPermissions={userPermissions}
                            getUserDisplayName={getUserDisplayName}
                            getUserPermissionStatus={getUserPermissionStatus}
                            toggleUserPermission={handleToggleUserPermission}
                            onActivateAll={handleActivateAll}
                            onBlockAll={handleBlockAll}
                            onResetPermissions={handleResetPermissions}
                            activePermissionsCount={countActivePermissions()}
                            confirmMessage={confirmMessage}
                            />
                        )}

                        {accessViewMode === 'temporary' && (
                            <TemporaryPermissionsManager
                            users={users.map(u => ({ ...u, nom: u.nom || '' }))}
                            />
                        )}

                        {accessViewMode === 'analytics' && (
                            <PermissionAnalyticsDashboard />
                        )}
                      </div>
                    </div>
                  )}
              </div>
           </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || "Confirmer l'action"}
        message={confirmState.message || "Êtes-vous sûr ?"}
        variant={confirmState.variant || 'warning'}
        confirmText={confirmState.confirmText || 'Confirmer'}
      />
    </div>
  );
}

// Internal component for notifications section with tabs
function NotificationsSection() {
  const [notifView, setNotifView] = useState<'monitor' | 'templates'>('monitor');

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Sub-tabs for notifications */}
      <div className="flex items-center gap-4 border-b border-edge pb-2 shrink-0">
        <span className="text-sm text-content-muted font-medium">Vue :</span>
        <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
          <button
            onClick={() => setNotifView('monitor')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              notifView === 'monitor'
                ? 'bg-surface text-content-primary'
                : 'text-content-muted hover:text-content-primary'
            }`}
          >
            <Activity size={14} />
            Monitoring
          </button>
          <button
            onClick={() => setNotifView('templates')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              notifView === 'templates'
                ? 'bg-surface text-content-primary'
                : 'text-content-muted hover:text-content-primary'
            }`}
          >
            <MessageSquare size={14} />
            Templates
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {notifView === 'monitor' && <AdminNotificationsMonitor />}
        {notifView === 'templates' && <NotificationTemplatesAdmin />}
      </div>
    </div>
  );
}
