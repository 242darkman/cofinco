import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck, LayoutGrid, UserCog, Clock, BarChart3,
  History, GitBranch, AlertTriangle, Braces, Eye, MessageSquarePlus,
  Settings, ChevronDown,
} from 'lucide-react';
import { ConfirmDialog } from '../ui';

// Hooks
import { useModules } from '../../hooks/admin/useModules';
import { usePermissions } from '../../hooks/admin/usePermissions';
import { useRolePermissions } from '../../hooks/admin/useRolePermissions';
import { useAllRolePermissions } from '../../hooks/admin/useAllRolePermissions';
import { useUserPermissions } from '../../hooks/admin/useUserPermissions';
import { useAdminUsers } from '../../hooks/admin/useAdminUsers';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useAbility } from '../../contexts/AbilityContext';
import { Actions, Subjects } from '@/lib/casl';
import { SystemRole } from '@shared/types/roles';

// Sub-components
import RolesPermissionsManager from './permissions/RolesPermissionsManager';
import ModulePermissionsView from './permissions/ModulePermissionsView';
import UserCustomPermissionsManager from './permissions/UserCustomPermissionsManager';
import TemporaryPermissionsManager from './permissions/TemporaryPermissionsManager';
import PermissionAnalyticsDashboard from './permissions/PermissionAnalyticsDashboard';
import RbacAuditHistoryViewer from './permissions/RbacAuditHistoryViewer';
import RoleHierarchyTree from './permissions/RoleHierarchyTree';
import CriticalPatternsManager from './permissions/CriticalPatternsManager';
import ConditionTemplatesManager from './permissions/ConditionTemplatesManager';
import PermissionSimulator from './permissions/PermissionSimulator';
import ModulePermissionsEditor from './permissions/ModulePermissionsEditor';
import PermissionRequestsManager from './permissions/PermissionRequestsManager';

type ViewMode = 'roles' | 'modules' | 'users' | 'temporary' | 'analytics' | 'historique' | 'hierarchy' | 'patterns' | 'conditions' | 'simulation' | 'demandes';

interface ViewTab {
  id: ViewMode;
  label: string;
  icon: React.ElementType;
  description: string;
}

const PRIMARY_VIEWS: ViewTab[] = [
  { id: 'roles', label: 'Par Rôle', icon: ShieldCheck, description: 'Gérez les permissions attribuées à chaque rôle. Les modifications s\'appliquent à TOUS les utilisateurs ayant ce rôle.' },
  { id: 'modules', label: 'Vue Globale', icon: LayoutGrid, description: 'Visualisez la matrice complète des permissions par module. Comparez rapidement les droits entre tous les rôles.' },
  { id: 'users', label: 'Exceptions', icon: UserCog, description: 'Accordez ou retirez des permissions spécifiques à UN utilisateur, indépendamment de son rôle.' },
  { id: 'temporary', label: 'Temporaires', icon: Clock, description: 'Attribuez des permissions à durée limitée. Parfait pour les remplacements ou accès ponctuels.' },
  { id: 'demandes', label: 'Demandes', icon: MessageSquarePlus, description: 'Gérez les demandes de permissions des utilisateurs. Approuvez ou rejetez les demandes en attente.' },
];

const ADVANCED_VIEWS: ViewTab[] = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Analysez l\'utilisation des permissions et identifiez les incohérences.' },
  { id: 'historique', label: 'Historique', icon: History, description: 'Consultez l\'historique complet des modifications de permissions.' },
  { id: 'hierarchy', label: 'Hiérarchie', icon: GitBranch, description: 'Visualisez l\'arbre d\'héritage des rôles.' },
  { id: 'patterns', label: 'Patterns Critiques', icon: AlertTriangle, description: 'Gérez les patterns de permissions nécessitant une justification.' },
  { id: 'conditions', label: 'Conditions', icon: Braces, description: 'Gérez les templates de conditions CASL (montant max, même agence, etc.).' },
  { id: 'simulation', label: 'Simulation', icon: Eye, description: 'Prévisualisez les permissions effectives d\'un utilisateur. Vue lecture seule.' },
];

const ALL_VIEWS = [...PRIMARY_VIEWS, ...ADVANCED_VIEWS];

export default function AccessManagement() {
  const ability = useAbility();

  // State
  const [accessViewMode, setAccessViewMode] = useState<ViewMode>('roles');
  const [selectedRole, setSelectedRole] = useState<SystemRole>(SystemRole.ADMIN);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { modules, fetchModules: refreshModules } = useModules();
  const { permissions, searchPermissions, fetchPermissions: refreshPermissions } = usePermissions();
  const {
    rolePermissions,
    fetchRolePermissions,
    toggleRolePermission: toggleRolePerm,
    roleHasPermission: singleRoleHasPermission,
  } = useRolePermissions(selectedRole);
  const { roleHasPermission: allRolesHasPermission, fetchAllRolePermissions } = useAllRolePermissions();
  const {
    userPermissions,
    fetchUserPermissions,
    toggleUserPermission,
    activateAllPermissions,
    blockAllPermissions,
    resetPermissions,
    getUserPermissionStatus,
    countActivePermissions,
  } = useUserPermissions(selectedUserId);
  const { users, getUserDisplayName } = useAdminUsers();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Effects
  useEffect(() => { fetchRolePermissions(); }, [selectedRole]);
  useEffect(() => {
    if (accessViewMode === 'modules') fetchAllRolePermissions();
  }, [accessViewMode, fetchAllRolePermissions]);
  useEffect(() => {
    if (selectedUserId) fetchUserPermissions(selectedUserId);
  }, [selectedUserId]);
  useEffect(() => {
    if (confirmMessage) {
      const timer = setTimeout(() => setConfirmMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmMessage]);

  // Close advanced dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (advancedRef.current && !advancedRef.current.contains(e.target as Node)) {
        setShowAdvancedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Handlers
  const handleRoleChange = (role: SystemRole) => setSelectedRole(role);
  const handleToggleRolePermission = async (_role: string, permCode: string) => {
    const perm = permissions.find(p => p.code === permCode);
    if (!perm) return;
    const isGranted = singleRoleHasPermission(perm.code);
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
      },
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
      },
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
        if (success) setConfirmMessage('Permissions réinitialisées');
      },
    });
  };

  const activeView = ALL_VIEWS.find(v => v.id === accessViewMode);
  const isAdvancedActive = ADVANCED_VIEWS.some(v => v.id === accessViewMode);
  const activeAdvancedLabel = isAdvancedActive ? activeView?.label : null;
  const activeRolePermissionsCount = (permissions || []).filter(p => singleRoleHasPermission(p.code)).length;

  return (
    <div className="flex flex-col h-full overflow-hidden space-y-2">
      {/* Navigation Bar */}
      <div className="border-b border-edge pb-2 shrink-0">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-content-muted font-medium shrink-0">Vue :</span>
            <div className="flex items-center gap-1 flex-wrap">
              {/* Primary tabs */}
              <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
                {PRIMARY_VIEWS.map((tab) => {
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

              {/* Separator */}
              <div className="w-px h-6 bg-edge mx-1" />

              {/* Advanced dropdown */}
              <div className="relative" ref={advancedRef}>
                <button
                  onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                    ${isAdvancedActive
                      ? 'bg-accent/10 text-accent border-accent/30'
                      : 'bg-surface-base text-content-muted hover:text-content-secondary border-edge hover:border-edge-strong'
                    }
                  `}
                >
                  <Settings size={12} />
                  <span>{activeAdvancedLabel || 'Avance'}</span>
                  <ChevronDown size={12} className={`transition-transform ${showAdvancedMenu ? 'rotate-180' : ''}`} />
                </button>

                {showAdvancedMenu && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-surface-elevated border border-edge rounded-lg shadow-xl z-30 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    {ADVANCED_VIEWS.map((tab) => {
                      const isActive = accessViewMode === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => { setAccessViewMode(tab.id); setShowAdvancedMenu(false); }}
                          className={`
                            w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left
                            ${isActive
                              ? 'bg-accent/10 text-accent font-medium'
                              : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary'
                            }
                          `}
                        >
                          <tab.icon size={14} className={isActive ? 'text-accent' : 'text-content-muted'} />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {activeView && (
            <p className="text-xs text-content-muted pl-12 max-w-2xl">
              {activeView.description}
            </p>
          )}
        </div>
      </div>

      {/* Content Area */}
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
            rolePermissionsData={rolePermissions}
          />
        )}

        {accessViewMode === 'modules' && (
          ability.can(Actions.MANAGE, Subjects.RBAC) ? (
            <ModulePermissionsEditor
              modules={modules}
              permissions={permissions}
              onRefresh={() => { refreshModules(); refreshPermissions(); }}
            />
          ) : (
            <ModulePermissionsView
              modules={modules}
              permissions={permissions}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              roleHasPermission={allRolesHasPermission}
              selectedRole={selectedRole}
            />
          )
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
          <TemporaryPermissionsManager users={users.map(u => ({ ...u, nom: u.nom || '' }))} />
        )}

        {accessViewMode === 'analytics' && <PermissionAnalyticsDashboard />}
        {accessViewMode === 'historique' && <RbacAuditHistoryViewer />}
        {accessViewMode === 'hierarchy' && <RoleHierarchyTree />}
        {accessViewMode === 'patterns' && <CriticalPatternsManager />}
        {accessViewMode === 'conditions' && <ConditionTemplatesManager />}
        {accessViewMode === 'simulation' && <PermissionSimulator users={users} />}
        {accessViewMode === 'demandes' && <PermissionRequestsManager />}
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || "Confirmer l'action"}
        message={confirmState.message || "Etes-vous sur ?"}
        variant={confirmState.variant || 'warning'}
        confirmText={confirmState.confirmText || 'Confirmer'}
      />
    </div>
  );
}
