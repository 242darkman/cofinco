import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Users, Shield, Search, CheckCircle, RotateCcw, Filter, Wifi, ArrowLeft, Award, Sparkles, Ban, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle, Info } from 'lucide-react';
import { Permission } from '../../../hooks/admin/usePermissions';
import { UserPermission } from '../../../hooks/admin/useUserPermissions';
import { Button, Avatar } from '../../ui';
import { usePagination } from '../../../hooks/usePagination';
import { getRoleBadgeStyle } from '../../../lib/role-utils';
import { resolveStorageUrl } from '../../../lib/format';
import { toast } from '../../../lib/toast';
import { usePermissionConflicts, type PermissionConflict } from '../../../hooks/admin/usePermissionConflicts';

interface UserCustomPermissionsManagerProps {
  users: any[];
  permissions: Permission[];
  selectedUserId: string;
  onUserChange: (userId: string) => void;
  userPermissions: UserPermission[];
  getUserDisplayName: (userId: string) => string;
  getUserPermissionStatus: (permCode: string) => { granted: boolean; source: 'role' | 'custom' | 'none' };
  toggleUserPermission: (permId: string) => Promise<void>;
  onActivateAll: () => Promise<void>;
  onBlockAll: () => Promise<void>;
  onResetPermissions: () => Promise<void>;
  activePermissionsCount: number;
  confirmMessage?: string;
  preselectedUserId?: string;
}

// Group permissions by module
const groupPermissionsByModule = (perms: Permission[]) => {
  const groups: Record<string, Permission[]> = {};
  perms.forEach(p => {
    const module = p.moduleName || 'Autre';
    if (!groups[module]) groups[module] = [];
    groups[module].push(p);
  });
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
};

// Helper to get user display name (handles both name and nom/prenom)
const getUserFullName = (user: any): string => {
  if (user.name) return user.name;
  const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return fullName || user.username || 'Utilisateur';
};

// Helper to get user initials
const getUserInitials = (user: any): string => {
  if (user.nom || user.prenom) {
    const firstInitial = (user.prenom || '').charAt(0);
    const lastInitial = (user.nom || '').charAt(0);
    return (firstInitial + lastInitial).toUpperCase() || '??';
  }
  if (user.name) {
    return user.name.slice(0, 2).toUpperCase();
  }
  return '??';
};

// Helper to get user photo URL
const getUserPhotoUrl = (user: any): string => {
  const photo = user.photoProfile;
  return photo ? resolveStorageUrl(photo) : '';
};

// Status dot component - Compact
function StatusDot({ hasExceptions, active, total }: { hasExceptions: boolean; active: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-content-muted font-medium">{active}/{total}</span>
      <div className={`w-1.5 h-1.5 rounded-full ${hasExceptions ? 'bg-status-warning' : active === total ? 'bg-status-success' : active > 0 ? 'bg-accent' : 'bg-surface-muted0'}`} />
    </div>
  );
}

export default function UserCustomPermissionsManager({
  users,
  permissions,
  selectedUserId,
  onUserChange,
  userPermissions,
  getUserPermissionStatus,
  toggleUserPermission,
  onActivateAll,
  onBlockAll,
  onResetPermissions,
  activePermissionsCount,
  confirmMessage,
  preselectedUserId
}: UserCustomPermissionsManagerProps) {
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [permSearchTerm, setPermSearchTerm] = useState('');
  const [showOnlyCustom, setShowOnlyCustom] = useState(false);
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isSelectionView, setIsSelectionView] = useState(!preselectedUserId);

  // Conflict detection
  const { conflicts, summary: conflictSummary, refresh: refreshConflicts } = usePermissionConflicts(
    selectedUserId || null
  );
  const conflictMap = useMemo(() => {
    const map = new Map<string, PermissionConflict>();
    for (const c of conflicts) map.set(c.permissionCode, c);
    return map;
  }, [conflicts]);

  // Loading states for better UX
  const [loadingPermId, setLoadingPermId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [recentlyToggled, setRecentlyToggled] = useState<string | null>(null);

  // Enhanced toggle with loading and feedback
  const handleTogglePermission = useCallback(async (permId: string, permName: string, currentStatus: boolean) => {
    setLoadingPermId(permId);
    try {
      await toggleUserPermission(permId);
      setRecentlyToggled(permId);
      setTimeout(() => setRecentlyToggled(null), 1500);
      refreshConflicts();

      toast.success(
        currentStatus
          ? `Permission "${permName}" désactivée`
          : `Permission "${permName}" activée`,
        { duration: 2000 }
      );
    } catch (error) {
      toast.error('Erreur lors de la modification');
    } finally {
      setLoadingPermId(null);
    }
  }, [toggleUserPermission, refreshConflicts]);

  // Enhanced reset with loading
  const handleReset = useCallback(async () => {
    setIsResetting(true);
    try {
      await onResetPermissions();
      refreshConflicts();
      toast.success('Permissions réinitialisées aux valeurs du rôle', { duration: 3000 });
    } catch (error) {
      toast.error('Erreur lors de la réinitialisation');
    } finally {
      setIsResetting(false);
    }
  }, [onResetPermissions, refreshConflicts]);

  useEffect(() => {
    if (preselectedUserId) {
      onUserChange(preselectedUserId);
      setIsSelectionView(false);
    }
  }, [preselectedUserId]);

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Filter users
  const filteredUsers = useMemo(() => {
    const searchLower = userSearchTerm.toLowerCase();
    return users.filter(user => {
      const fullName = getUserFullName(user).toLowerCase();
      return fullName.includes(searchLower) ||
        (user.username?.toLowerCase() || '').includes(searchLower) ||
        (user.role?.toLowerCase() || '').includes(searchLower);
    });
  }, [users, userSearchTerm]);

  // Group permissions with stats
  const modulesList = useMemo(() => {
    const grouped = groupPermissionsByModule(permissions);
    return grouped.map(([moduleName, modulePerms]) => {
      const exceptionCount = modulePerms.filter(p => getUserPermissionStatus(p.code).source === 'custom').length;
      const activeCount = modulePerms.filter(p => getUserPermissionStatus(p.code).granted).length;
      return {
        id: moduleName,
        name: moduleName,
        permissions: modulePerms,
        exceptionCount,
        activeCount,
        hasExceptions: exceptionCount > 0
      };
    });
  }, [permissions, getUserPermissionStatus]);

  // Auto-select first module
  useEffect(() => {
    if (!activeModuleId && modulesList.length > 0 && selectedUser) {
      setActiveModuleId(modulesList[0].id);
    }
  }, [activeModuleId, modulesList, selectedUser]);

  // Get active module permissions
  const activeModule = modulesList.find(m => m.id === activeModuleId);
  const activeModulePermissions = useMemo(() => {
    if (!activeModule) return [];

    let perms = activeModule.permissions;

    if (showOnlyCustom) {
      perms = perms.filter(p => getUserPermissionStatus(p.code).source === 'custom');
    }

    if (showOnlyConflicts) {
      perms = perms.filter(p => conflictMap.has(p.code));
    }

    if (permSearchTerm) {
      const lower = permSearchTerm.toLowerCase();
      perms = perms.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.code.toLowerCase().includes(lower)
      );
    }

    return perms;
  }, [activeModule, permSearchTerm, showOnlyCustom, showOnlyConflicts, getUserPermissionStatus, conflictMap]);

  // Total exceptions count
  const totalExceptions = useMemo(() => {
    return permissions.filter(p => getUserPermissionStatus(p.code).source === 'custom').length;
  }, [permissions, getUserPermissionStatus]);

  // Pagination for users
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const { currentPage, totalPages, goToPage, paginateArray } = usePagination({
    totalItems: filteredUsers.length,
    itemsPerPage,
    initialPage: 1
  });

  const paginatedUsers = paginateArray(filteredUsers);

  const handleUserSelect = (userId: string) => {
    onUserChange(userId);
    setIsSelectionView(false);
    setActiveModuleId(null);
  };

  const handleBackToSelection = () => {
    setIsSelectionView(true);
    setUserSearchTerm('');
  };

  // --- USER SELECTION VIEW - Compact ---
  if (isSelectionView) {
    return (
      <div className="flex flex-col h-full space-y-2 animate-in fade-in duration-300">
        {/* Header with Search - Compact */}
        <div className="bg-surface-base rounded-lg border border-edge px-3 py-2 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
                <Users size={14} className="text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-content-primary">Gestion des Exceptions</h2>
                <p className="text-[10px] text-content-muted">Personnalisez les permissions utilisateur</p>
              </div>
            </div>

            {/* Stats - Compact */}
            <div className="flex items-center gap-3 bg-surface/50 px-2.5 py-1.5 rounded-lg border border-edge">
              <div className="text-center">
                <div className="text-[9px] text-content-muted uppercase">Utilisateurs</div>
                <div className="text-sm font-bold text-accent">{users.length}</div>
              </div>
              <div className="h-6 w-px bg-surface-elevated"></div>
              <div className="text-center">
                <div className="text-[9px] text-content-muted uppercase">Résultats</div>
                <div className="text-sm font-bold text-content-secondary">{filteredUsers.length}</div>
              </div>
            </div>
          </div>

          {/* Search Bar - Compact */}
          <div className="mt-2 relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              placeholder="Rechercher par nom, identifiant ou rôle..."
              className="w-full h-8 pl-8 pr-8 bg-surface-base border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
            />
            {userSearchTerm && (
              <button
                onClick={() => setUserSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors text-sm"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* User List - Compact */}
        <div className="bg-surface-base rounded-lg border border-edge overflow-hidden flex-1 min-h-0">
          <div className="divide-y divide-edge/50 max-h-[calc(100vh-320px)] overflow-y-auto">
            {paginatedUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => handleUserSelect(user.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface/60 transition-colors text-left group"
              >
                {/* Avatar - Compact */}
                <div className="relative shrink-0">
                  <Avatar
                    photoUrl={user.photoProfile}
                    fullName={getUserFullName(user)}
                    initials={getUserInitials(user)}
                    size="sm"
                    className="shadow-lg shadow-accent/20 group-hover:scale-105 transition-transform"
                  />
                </div>

                {/* User Info - Compact */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-content-primary group-hover:text-accent transition-colors truncate">
                      {getUserFullName(user)}
                    </span>
                    <span className="text-[10px] text-content-muted truncate">@{user.username}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border mt-0.5 inline-block ${getRoleBadgeStyle(user.role).classes}`}>
                    {getRoleBadgeStyle(user.role).label}
                  </span>
                </div>

                {/* Arrow indicator */}
                <div className="text-content-muted group-hover:text-accent transition-colors shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-content-muted">
              <Users size={28} className="mb-2 opacity-50" />
              <p className="text-xs font-medium">Aucun utilisateur trouvé</p>
              <p className="text-[10px] text-content-muted mt-0.5">Essayez un autre terme de recherche</p>
            </div>
          )}
        </div>

        {/* Pagination - Compact */}
        {/* Pagination - Compact & Advanced */}
        <div className="p-3 bg-surface-base border border-edge rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            {/* Page info & size selector */}
            <div className="flex items-center gap-3 text-xs text-content-muted">
              <span className="hidden sm:inline">
                {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredUsers.length)} sur {filteredUsers.length}
              </span>
              <span className="sm:hidden">
                Page {currentPage}/{totalPages || 1}
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  goToPage(1);
                }}
                className="px-2 py-1 bg-surface-base border border-edge rounded text-xs text-content-secondary focus:border-accent outline-none"
              >
                <option value={6}>6 / page</option>
                <option value={8}>8 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
              </select>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              
              <div className="flex items-center gap-1 mx-1">
                 {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage === 1) {
                      pageNum = i + 1;
                    } else if (currentPage === totalPages) {
                      pageNum = totalPages - 2 + i;
                    } else {
                      pageNum = currentPage - 1 + i;
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-accent text-white'
                            : 'text-content-muted hover:bg-surface hover:text-content-primary'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
      </div>
    );
  }

  // --- SPLIT-VIEW PERMISSIONS MANAGEMENT - Compact ---
  if (!selectedUser) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 space-y-2">

      {/* STICKY HEADER - Compact */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-base border border-edge rounded-lg shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToSelection}
            className="w-6 h-6 rounded bg-surface/80 border border-edge flex items-center justify-center text-content-muted hover:text-content-primary hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft size={12} />
          </button>

          <div className="relative">
            <Avatar
              photoUrl={selectedUser.photoProfile}
              fullName={getUserFullName(selectedUser)}
              initials={getUserInitials(selectedUser)}
              size="sm"
              className="w-7 h-7 shadow-lg shadow-accent/20"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-status-success border border-edge rounded-full"></span>
          </div>

          <div className="min-w-0">
            <h3 className="text-xs font-bold text-content-primary flex items-center gap-1.5 truncate">
              {getUserFullName(selectedUser)}
              <span className={`text-[9px] font-normal px-1 py-0 rounded-full border shrink-0 ${getRoleBadgeStyle(selectedUser.role).classes}`}>
                {getRoleBadgeStyle(selectedUser.role).label}
              </span>
            </h3>
            <p className="text-[9px] text-status-success flex items-center gap-1">
              <Wifi className="w-2 h-2" /> Sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-right">
            <div className="px-2 py-0.5 bg-surface/50 rounded border border-edge">
              <div className="text-[8px] text-content-muted uppercase">Exc.</div>
              <div className={`text-[10px] font-bold ${totalExceptions > 0 ? 'text-status-warning' : 'text-content-muted'}`}>
                {totalExceptions}
              </div>
            </div>
            <div className="px-2 py-0.5 bg-surface/50 rounded border border-edge">
              <div className="text-[8px] text-content-muted uppercase">Actives</div>
              <div className="text-[10px] font-bold text-accent">{activePermissionsCount}</div>
            </div>
          </div>

          <button
            onClick={handleReset}
            disabled={isResetting}
            className="px-1.5 py-1 border border-edge rounded text-[10px] text-content-secondary hover:bg-surface transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResetting ? (
              <Spinner size="xs" tone="current" />
            ) : (
              <RotateCcw size={10} />
            )}
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {confirmMessage && (
        <div className="px-2 py-1 bg-status-success-bg border border-status-success/20 rounded flex items-center gap-1.5 text-[10px] text-status-success animate-in fade-in slide-in-from-top-2 shrink-0">
          <CheckCircle size={10} /> {confirmMessage}
        </div>
      )}

      {/* Conflict banner */}
      {conflictSummary.denyOverrides > 0 && (
        <div className="px-2 py-1.5 bg-status-warning-bg border border-status-warning/20 rounded flex items-center gap-1.5 text-[10px] text-status-warning shrink-0">
          <AlertTriangle size={10} />
          <span className="font-medium">{conflictSummary.denyOverrides} conflit{conflictSummary.denyOverrides > 1 ? 's' : ''}</span>
          <span className="text-content-muted">— des overrides contredisent les permissions de rôle</span>
          {conflictSummary.redundant > 0 && (
            <span className="ml-auto text-content-muted flex items-center gap-1">
              <Info size={8} />
              {conflictSummary.redundant} redondant{conflictSummary.redundant > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
      {conflictSummary.denyOverrides === 0 && conflictSummary.redundant > 0 && (
        <div className="px-2 py-1.5 bg-surface-subtle/30 border border-edge-subtle rounded flex items-center gap-1.5 text-[10px] text-content-muted shrink-0">
          <Info size={10} />
          {conflictSummary.redundant} override{conflictSummary.redundant > 1 ? 's' : ''} redondant{conflictSummary.redundant > 1 ? 's' : ''}
        </div>
      )}

      {/* SPLIT VIEW - Compact */}
      <div className="grid grid-cols-12 gap-2 items-start flex-1 min-h-0">

        {/* SIDEBAR - Modules List - Compact */}
        <div className="col-span-12 lg:col-span-3 bg-surface-base rounded-lg border border-edge overflow-hidden flex flex-col max-h-[350px] lg:max-h-[calc(100vh-280px)]">
          <div className="px-2.5 py-1.5 bg-surface/50 border-b border-edge flex items-center gap-1.5 shrink-0">
            <Award size={12} className="text-content-muted" />
            <span className="font-semibold text-content-secondary text-[11px]">Modules</span>
            <span className="ml-auto text-[9px] text-content-muted">{modulesList.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-edge/50">
            {modulesList.map(module => {
              const isActive = activeModuleId === module.id;

              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModuleId(module.id)}
                  className={`
                    w-full flex justify-between items-center px-2.5 py-1.5 hover:bg-surface/70 transition-colors text-left
                    ${isActive ? 'bg-surface border-l-2 border-accent' : 'border-l-2 border-transparent'}
                    ${module.hasExceptions && !isActive ? 'border-l-status-warning' : ''}
                  `}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {module.hasExceptions && (
                      <div className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0"></div>
                    )}
                    <span className={`text-[11px] font-medium truncate ${isActive ? 'text-content-primary' : 'text-content-secondary'}`}>
                      {module.name}
                    </span>
                  </div>
                  <StatusDot hasExceptions={module.hasExceptions} active={module.activeCount} total={module.permissions.length} />
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN CONTENT - Permissions Detail - Compact */}
        <div className="col-span-12 lg:col-span-9 bg-surface-base rounded-lg border border-edge overflow-hidden flex flex-col max-h-[400px] lg:max-h-[calc(100vh-280px)]">
          {/* Module Header + Search - Compact */}
          <div className="px-2.5 py-2 border-b border-edge bg-surface/30 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 bg-accent/10 rounded flex items-center justify-center shrink-0">
                  <Shield size={10} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-bold text-content-primary truncate">
                    {activeModule?.name || 'Sélectionnez un module'}
                  </h3>
                  <p className="text-[9px] text-content-muted">
                    {activeModule ? `${activeModule.activeCount}/${activeModule.permissions.length} actives` : ''}
                    {activeModule?.hasExceptions && (
                      <span className="ml-1 text-status-warning">• {activeModule.exceptionCount} exc.</span>
                    )}
                  </p>
                </div>
              </div>
              {/* Filter toggles */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setShowOnlyCustom(!showOnlyCustom); if (!showOnlyCustom) setShowOnlyConflicts(false); }}
                  className={`
                    px-1.5 py-1 rounded text-[9px] border flex items-center gap-1 transition-all whitespace-nowrap
                    ${showOnlyCustom
                      ? 'bg-status-warning-bg border-status-warning/40 text-status-warning'
                      : 'bg-surface-base border-edge text-content-muted hover:bg-surface'
                    }
                  `}
                >
                  <Filter size={9} />
                  Exc.
                </button>
                {conflictSummary.total > 0 && (
                  <button
                    onClick={() => { setShowOnlyConflicts(!showOnlyConflicts); if (!showOnlyConflicts) setShowOnlyCustom(false); }}
                    className={`
                      px-1.5 py-1 rounded text-[9px] border flex items-center gap-1 transition-all whitespace-nowrap
                      ${showOnlyConflicts
                        ? 'bg-status-warning-bg border-status-warning/40 text-status-warning'
                        : 'bg-surface-base border-edge text-content-muted hover:bg-surface'
                      }
                    `}
                  >
                    <AlertTriangle size={9} />
                    {conflictSummary.total}
                  </button>
                )}
              </div>
            </div>

            {/* Search - Compact */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-content-muted" size={10} />
              <input
                type="text"
                value={permSearchTerm}
                onChange={(e) => setPermSearchTerm(e.target.value)}
                placeholder="Filtrer permissions..."
                className="w-full bg-surface-base border border-edge rounded pl-6 pr-2 py-1 text-[10px] focus:ring-1 focus:ring-accent outline-none text-content-primary placeholder:text-content-muted"
              />
            </div>
          </div>

          {/* Permissions List - Compact */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {activeModulePermissions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {activeModulePermissions.map(perm => {
                  const status = getUserPermissionStatus(perm.code);
                  const isCustom = status.source === 'custom';
                  const conflict = conflictMap.get(perm.code);

                  let statusLabel = 'Hérité';
                  let borderColor = 'border-edge/50';
                  let bgHover = 'hover:bg-surface/40';

                  if (isCustom) {
                    if (status.granted) {
                      statusLabel = 'Forcé';
                      borderColor = 'border-status-success/30';
                      bgHover = 'bg-status-success/5 hover:bg-status-success-bg';
                    } else {
                      statusLabel = 'Bloqué';
                      borderColor = 'border-status-danger/30';
                      bgHover = 'bg-status-danger/5 hover:bg-status-danger/10';
                    }
                  }

                  const isLoading = loadingPermId === perm.id;
                  const wasRecentlyToggled = recentlyToggled === perm.id;

                  return (
                    <div
                      key={perm.id}
                      className={`
                        flex items-center justify-between px-2 py-1.5 rounded border transition-all duration-200 group
                        ${borderColor} ${bgHover}
                        ${wasRecentlyToggled ? 'bg-accent/10 scale-[1.01]' : ''}
                        ${isLoading ? 'opacity-70' : ''}
                      `}
                    >
                      <div className="flex-1 min-w-0 pr-1.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-medium transition-colors truncate ${status.granted ? 'text-content-primary' : 'text-content-muted'}`}>
                            {perm.name}
                          </span>
                          {wasRecentlyToggled && (
                            <Sparkles size={8} className="text-accent animate-pulse shrink-0" />
                          )}
                          {isCustom && (
                            <span className={`text-[8px] px-1 py-0 rounded font-bold uppercase tracking-wide shrink-0 ${
                              status.granted
                                ? 'bg-status-success-bg text-status-success'
                                : 'bg-status-danger/10 text-status-danger'
                            }`}>
                              {statusLabel}
                            </span>
                          )}
                          {conflict && conflict.conflictType === 'DENY_OVERRIDE' && (
                            <span title="Override contredit le rôle" className="shrink-0">
                              <AlertTriangle size={9} className="text-status-warning" />
                            </span>
                          )}
                          {conflict && (conflict.conflictType === 'REDUNDANT_GRANT' || conflict.conflictType === 'REDUNDANT_DENY') && (
                            <span title="Override redondant" className="shrink-0">
                              <Info size={9} className="text-content-muted" />
                            </span>
                          )}
                        </div>
                        <code className="text-[8px] text-content-muted font-mono block truncate">
                          {perm.code}
                        </code>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isLoading ? (
                          <div className="w-7 h-4 flex items-center justify-center">
                            <Spinner size="xs" tone="accent" />
                          </div>
                        ) : (
                          <div
                            onClick={() => handleTogglePermission(perm.id, perm.name, status.granted)}
                            className={`
                              w-7 h-3.5 rounded-full relative cursor-pointer transition-colors
                              ${isCustom
                                ? (status.granted ? 'bg-status-warning' : 'bg-status-danger')
                                : (status.granted ? 'bg-accent' : 'bg-surface-subtle/50')
                              }
                            `}
                          >
                            <div
                              className="absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all shadow-sm"
                              style={{ left: status.granted ? 'calc(100% - 12px)' : '2px' }}
                            />
                          </div>
                        )}

                        {isCustom && !isLoading && (
                          <button
                            onClick={() => handleTogglePermission(perm.id, perm.name, status.granted)}
                            title="Rétablir au rôle"
                            className="p-0.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated/50 rounded transition-colors"
                          >
                            <RotateCcw size={9} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-content-muted py-6">
                <Shield size={24} className="mb-2 opacity-50" />
                <p className="text-[10px] font-medium">
                  {permSearchTerm || showOnlyCustom ? 'Aucun résultat' : 'Aucune permission'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
