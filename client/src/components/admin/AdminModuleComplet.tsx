import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, Key, Settings, BarChart3, Activity, Monitor, Power, Building2, MapPin, 
  MessageSquare, KeyRound, Clock, UserPlus, Award, Package, CreditCard, CalendarClock, 
  AlertTriangle, ShieldCheck, LayoutGrid, UserCog, Lock, ChevronLeft, ChevronRight 
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

// Sub-components
import AdminGestionUtilisateurs from './AdminGestionUtilisateurs';
import AdminGestionProfils from './AdminGestionProfils';
import AdminDashboard from './AdminDashboard';
import AdminActivityLogs from './AdminActivityLogs';
import AdminSessionsManager from './AdminSessionsManager';
import AdminSystemSettings from './AdminSystemSettings';
import AdminMaintenanceMode from './AdminMaintenanceMode';
import AdminTontinesGestion from './AdminTontinesGestion';
import AdminGestionAgences from './AdminGestionAgences';
import AdminGestionZones from './AdminGestionZones';
import AdminNotificationsMonitor from './AdminNotificationsMonitor';
import AdminVersionInfo from './AdminVersionInfo';
import { SystemRole } from '@shared/types/roles';
import AdminCaisseAccessCodes from './AdminCaisseAccessCodes';
import AdminGestionCaisses from './AdminGestionCaisses';
import AdminCreditsGestion from './AdminCreditsGestion';
import RolesPermissionsManager from './permissions/RolesPermissionsManager';
import ModulePermissionsView from './permissions/ModulePermissionsView';
import UserCustomPermissionsManager from './permissions/UserCustomPermissionsManager';
import RegularizationDashboard from './RegularizationDashboard';
import AdminClientCredentials from './AdminClientCredentials';

interface AdminModuleCompletProps {
  activeView?: string;
}

export default function AdminModuleComplet({ activeView }: AdminModuleCompletProps) {
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [accessViewMode, setAccessViewMode] = useState<'roles' | 'modules' | 'users'>('roles');
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

  useEffect(() => {
    if (activeView) {
      switch (activeView) {
        case 'admin-users': setActiveTab('users'); break;
        case 'admin-agences': setActiveTab('agences'); break;
        case 'admin-audit': setActiveTab('logs'); break;
        default: setActiveTab('dashboard');
      }
    }
  }, [activeView]);

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
    'Power': Power, 'Shield': Shield, 'Key': Key, 'MessageSquare': MessageSquare,
    'Settings': Settings, 'Clock': Clock, 'Award': Award, 'Package': Package,
    'CalendarClock': CalendarClock,
    'CreditCard': CreditCard,
    'AlertTriangle': AlertTriangle
  };

  const filteredPermissions = searchTerm ? searchPermissions(searchTerm) : (permissions || []);
  const activeRolePermissionsCount = (permissions || []).filter(p => singleRoleHasPermission(p.code)).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900">
      {/* TOP NAVIGATION BAR */}
      <header className="shrink-0 bg-slate-950 border-b border-slate-800 flex items-center h-14 px-4 gap-4 sticky top-0 z-20">
        {/* Title / Brand */}
        <div className="flex items-center gap-2 shrink-0 pr-4 border-r border-slate-800">
           <div className="w-8 h-8 bg-indigo-600/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-500" />
           </div>
           <div className="hidden md:block">
             <h2 className="text-sm font-bold text-slate-100 leading-none">Admin</h2>
             <p className="text-[9px] text-slate-500 uppercase tracking-wider leading-none mt-0.5">Système</p>
           </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 relative overflow-hidden flex items-center group/nav">
           
           {/* Left Shadow / Button */}
           <div className={`absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showLeftShadow && (
                <button 
                  onClick={() => scroll('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-slate-800/80 hover:bg-slate-700 text-slate-300 p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
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
                  const [module, action] = tab.permission.split('.');
                  return authService.hasPermission(module, action || 'view');
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
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20 border-indigo-500/50' 
                          : isDisabled 
                            ? 'opacity-40 cursor-not-allowed text-slate-600' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                        }
                      `}
                    >
                      <Icon size={14} className={isActive ? "text-indigo-100" : "text-slate-500"} />
                      <span>{tab.label}</span>
                      {isDisabled && <Lock size={10} className="ml-1" />}
                    </button>
                  );
                })}
            </nav>

            {/* Right Shadow / Button */}
            <div className={`absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showRightShadow && (
                <button 
                  onClick={() => scroll('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-slate-800/80 hover:bg-slate-700 text-slate-300 p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden relative bg-slate-900">
        <div className="h-full overflow-hidden p-2 md:p-3 flex flex-col">
           <div className="w-full h-full flex flex-col">
              
              {/* Optional Section Header if needed, or streamlined */}
              {activeTab !== 'dashboard' && (
                <div className="mb-3 shrink-0">
                    <h1 className="text-base font-bold text-white flex items-center gap-2">
                      {iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'] 
                         ? React.createElement(iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'], { size: 18, className: "text-indigo-500" })
                         : <Shield className="text-indigo-500" size={18} />
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
                  {activeTab === 'settings' && <AdminSystemSettings />}
                  {activeTab === 'notifications' && <AdminNotificationsMonitor />}
                  {activeTab === 'updates' && <AdminVersionInfo />}
                  {activeTab === 'regularisation' && <RegularizationDashboard />}
                  {activeTab === 'client-credentials' && <AdminClientCredentials />}

                  {activeTab === 'roles' && (
                    <div className="flex flex-col h-full overflow-hidden space-y-4">
                      <div className="border-b border-slate-800 pb-2 shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-400 font-medium">Vue :</span>
                            <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                              {[
                                { id: 'roles' as const, label: 'Par Rôle', icon: ShieldCheck },
                                { id: 'modules' as const, label: 'Vue Globale', icon: LayoutGrid },
                                { id: 'users' as const, label: 'Exceptions', icon: UserCog },
                              ].map((tab) => {
                                const isActive = accessViewMode === tab.id;
                                return (
                                  <button
                                    key={tab.id}
                                    onClick={() => setAccessViewMode(tab.id)}
                                    className={`
                                      flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                                      ${isActive 
                                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                                        : 'text-slate-500 hover:text-slate-300'
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
