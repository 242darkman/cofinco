import React, { useState, useEffect } from 'react';
import { Shield, Users, Key, Settings, BarChart3, Activity, Monitor, Power, Building2, MapPin, MessageSquare, KeyRound, Clock, UserPlus, Award, Package, CreditCard } from 'lucide-react';
import { Button, Card, ConfirmDialog } from '../ui';

// Hooks
import { useModules } from '../../hooks/admin/useModules';
import { usePermissions } from '../../hooks/admin/usePermissions';
import { useRolePermissions } from '../../hooks/admin/useRolePermissions';
import { useUserPermissions } from '../../hooks/admin/useUserPermissions';
import { useAdminUsers } from '../../hooks/admin/useAdminUsers';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

// Constants
import { ADMIN_TABS, AdminTabId } from '../../constants/admin-constants';

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
import AdminSmsSettings from './AdminSmsSettings';
import AdminVersionInfo from './AdminVersionInfo';
import { SystemRole } from '@shared/types/roles';
import AdminCaisseAccessCodes from './AdminCaisseAccessCodes';
import AdminGestionCaisses from './AdminGestionCaisses';
import AdminCreditsGestion from './AdminCreditsGestion';
import RolesPermissionsManager from './permissions/RolesPermissionsManager';
import ModulePermissionsView from './permissions/ModulePermissionsView';
import UserCustomPermissionsManager from './permissions/UserCustomPermissionsManager';

interface AdminModuleCompletProps {
  activeView?: string;
}

export default function AdminModuleComplet({ activeView }: AdminModuleCompletProps) {
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [selectedRole, setSelectedRole] = useState<SystemRole>(SystemRole.ADMIN);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');

  // Hooks
  const { modules } = useModules();
  const { permissions, searchPermissions } = usePermissions();
  const {
    rolePermissions, // eslint-disable-line @typescript-eslint/no-unused-vars
    fetchRolePermissions,
    toggleRolePermission: toggleRolePerm,
    roleHasPermission
  } = useRolePermissions(selectedRole);
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

  const handleRoleChange = (role: SystemRole) => setSelectedRole(role);
  const handleToggleRolePermission = async (_role: string, permCode: string) => {
    const perm = permissions.find(p => p.code === permCode);
    if (!perm) return;

    // Check if currently granted
    const isGranted = roleHasPermission(perm.code);

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
    'CreditCard': CreditCard
  };

  const filteredPermissions = searchTerm ? searchPermissions(searchTerm) : (permissions || []);
  const activeRolePermissionsCount = (permissions || []).filter(p => roleHasPermission(p.code)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card variant="default" padding="none" className="overflow-hidden">
        {/* Header - Compact & Mobile-First */}
        <div className="bg-surface-muted/50 p-4 border-b border-edge">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-content-primary">Administration</h2>
              <p className="text-xs sm:text-sm text-content-muted line-clamp-1">Gestion complète système</p>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-4">
          {/* Navigation Grid - Compact on Mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
            {ADMIN_TABS.map((tab) => {
              const Icon = iconMap[tab.icon] || Shield;
              const isActive = activeTab === tab.id;
              const isDisabled = 'disabled' in tab && tab.disabled;
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
                  disabled={isDisabled}
                  title={isDisabled ? 'Fonctionnalité bientôt disponible' : tab.label}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 h-20 sm:h-24 relative overflow-hidden group ${
                    isDisabled
                      ? 'bg-surface-muted/50 text-content-muted border-edge opacity-50 cursor-not-allowed'
                      : isActive
                      ? 'bg-primary text-white border-primary shadow-lg shadow-primary/25 scale-[1.02] ring-2 ring-primary/20 ring-offset-2 ring-offset-surface-base'
                      : 'bg-surface-base text-content-secondary border-edge hover:border-primary/50 hover:bg-surface-muted'
                  }`}
                >
                  {isActive && !isDisabled && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
                  )}
                  {isDisabled && (
                    <div className="absolute top-1 right-1 text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded">Bientôt</div>
                  )}
                  <Icon 
                    size={20} 
                    className={`transition-transform duration-300 ${isDisabled ? 'text-content-muted' : isActive ? 'text-white scale-110' : 'text-primary/70 group-hover:scale-110 group-hover:text-primary'}`} 
                  />
                  <span className={`text-[10px] sm:text-xs font-semibold text-center leading-tight ${isActive && !isDisabled ? 'text-blue-50' : ''}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Pro Separator */}
          <div className="relative py-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-edge"></div>
            </div>
            <div className="relative flex justify-center">
               <span className="bg-surface-base px-3 text-xs font-medium text-content-muted uppercase tracking-widest border border-edge rounded-full py-0.5">
                 {ADMIN_TABS.find(t => t.id === activeTab)?.label || 'Module'}
               </span>
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-surface-base rounded-xl border border-edge p-0 sm:p-1 min-h-[400px]">
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
            {activeTab === 'sms' && <AdminSmsSettings />}
            {activeTab === 'updates' && <AdminVersionInfo />}

            {activeTab === 'roles' && (
              <RolesPermissionsManager
                modules={modules}
                permissions={permissions}
                selectedRole={selectedRole}
                onRoleChange={handleRoleChange}
                roleHasPermission={(_role, code) => selectedRole === SystemRole.ADMIN ? true : roleHasPermission(code)}
                toggleRolePermission={handleToggleRolePermission}
                activePermissionsCount={selectedRole === SystemRole.ADMIN ? (permissions?.length || 0) : activeRolePermissionsCount}
                confirmMessage={confirmMessage}
              />
            )}
          </div>
        </div>
      </Card>

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
