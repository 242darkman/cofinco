import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, Shield, Search, CheckCircle,
  RotateCcw, Filter, Wifi, ArrowLeft, Award
} from 'lucide-react';
import { Permission } from '../../../hooks/admin/usePermissions';
import { UserPermission } from '../../../hooks/admin/useUserPermissions';
import { SearchInput, SelectableCard, Button, Badge, Switch } from '../../ui';
import { usePagination } from '../../../hooks/usePagination';
import { getRoleBadgeStyle } from '../../../lib/role-utils';

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

// Status dot component
function StatusDot({ hasExceptions, active, total }: { hasExceptions: boolean; active: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-medium">{active}/{total}</span>
      <div className={`w-2 h-2 rounded-full ${hasExceptions ? 'bg-amber-500' : active === total ? 'bg-emerald-500' : active > 0 ? 'bg-indigo-500' : 'bg-slate-500'}`} />
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
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isSelectionView, setIsSelectionView] = useState(!preselectedUserId);

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
    return users.filter(user => 
      (user.name?.toLowerCase() || '').includes(searchLower) ||
      (user.username?.toLowerCase() || '').includes(searchLower) ||
      (user.role?.toLowerCase() || '').includes(searchLower)
    );
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

    if (permSearchTerm) {
      const lower = permSearchTerm.toLowerCase();
      perms = perms.filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.code.toLowerCase().includes(lower)
      );
    }

    return perms;
  }, [activeModule, permSearchTerm, showOnlyCustom, getUserPermissionStatus]);

  // Total exceptions count
  const totalExceptions = useMemo(() => {
    return permissions.filter(p => getUserPermissionStatus(p.code).source === 'custom').length;
  }, [permissions, getUserPermissionStatus]);

  // Pagination for users
  const { currentPage, totalPages, goToPage, paginateArray } = usePagination({
    totalItems: filteredUsers.length,
    itemsPerPage: 12,
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

  // --- USER SELECTION VIEW ---
  if (isSelectionView) {
    return (
      <div className="space-y-5 animate-in fade-in duration-300">
        {/* Header with Search */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users size={22} className="text-indigo-400" />
                Gestion des Exceptions
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Sélectionnez un utilisateur pour personnaliser ses permissions
              </p>
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-4 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700">
              <div className="text-center">
                <div className="text-xs text-slate-500">Utilisateurs</div>
                <div className="text-lg font-bold text-indigo-400">{users.length}</div>
              </div>
              <div className="h-8 w-px bg-slate-700"></div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Résultats</div>
                <div className="text-lg font-bold text-slate-300">{filteredUsers.length}</div>
              </div>
            </div>
          </div>
          
          {/* Search Bar - Premium Style */}
          <div className="mt-4 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              placeholder="Rechercher un utilisateur par nom, identifiant ou rôle..."
              className="w-full h-12 pl-12 pr-4 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {userSearchTerm && (
              <button
                onClick={() => setUserSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* User List - Compact Style */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="divide-y divide-slate-800/50 max-h-[450px] overflow-y-auto">
            {paginatedUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => handleUserSelect(user.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-800/60 transition-colors text-left group"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                    {(user.name || '??').slice(0, 2).toUpperCase()}
                  </div>
                </div>
                
                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {user.name}
                    </span>
                    <span className="text-xs text-slate-500 truncate">@{user.username}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getRoleBadgeStyle(user.role).classes}`}>
                      {getRoleBadgeStyle(user.role).label}
                    </span>
                  </div>
                </div>
                
                {/* Arrow indicator */}
                <div className="text-slate-600 group-hover:text-indigo-400 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Users size={40} className="mb-4 opacity-50" />
              <p className="text-base font-medium">Aucun utilisateur trouvé</p>
              <p className="text-sm text-slate-600 mt-1">Essayez un autre terme de recherche</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-800">
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentPage === 1} 
                onClick={() => goToPage(currentPage - 1)}
                className="text-slate-400 hover:text-white disabled:opacity-30"
              >
                ← Précédent
              </Button>
              <div className="px-3 text-sm">
                <span className="text-slate-500">Page </span>
                <span className="text-white font-medium">{currentPage}</span>
                <span className="text-slate-500"> / {totalPages}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentPage === totalPages} 
                onClick={() => goToPage(currentPage + 1)}
                className="text-slate-400 hover:text-white disabled:opacity-30"
              >
                Suivant →
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- SPLIT-VIEW PERMISSIONS MANAGEMENT ---
  if (!selectedUser) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 space-y-4">
      
      {/* STICKY HEADER */}
      <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBackToSelection}
            className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base font-bold text-white shadow-lg shadow-indigo-500/20">
              {(selectedUser.name || '??').slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>
            </span>
          </div>
          
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {selectedUser.name}
              <span className={`text-xs font-normal px-2 py-0.5 rounded-full border ${getRoleBadgeStyle(selectedUser.role).classes}`}>
                {getRoleBadgeStyle(selectedUser.role).label}
              </span>
            </h3>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> En ligne • Sync active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <div className="text-xs text-slate-500">Exceptions</div>
            <div className={`text-sm font-bold ${totalExceptions > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              {totalExceptions > 0 ? `${totalExceptions} Actives` : 'Aucune'}
            </div>
          </div>
          
          <div className="hidden sm:block text-right border-l border-slate-700 pl-4">
            <div className="text-xs text-slate-500">Actives</div>
            <div className="text-sm font-bold text-indigo-400">{activePermissionsCount}</div>
          </div>
          
          <button 
            onClick={onResetPermissions}
            className="px-3 py-2 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {confirmMessage && (
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-sm text-emerald-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle size={16} /> {confirmMessage}
        </div>
      )}

      {/* SPLIT VIEW */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6 items-start flex-1 min-h-0">
        
        {/* SIDEBAR - Modules List */}
        <div className="col-span-12 lg:col-span-4 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
            <Award size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-300">Modules</span>
            <span className="ml-auto text-xs text-slate-500">{modulesList.length}</span>
          </div>
          <div className="max-h-[500px] lg:max-h-[550px] overflow-y-auto divide-y divide-slate-800/50">
            {modulesList.map(module => {
              const isActive = activeModuleId === module.id;
              
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModuleId(module.id)}
                  className={`
                    w-full flex justify-between items-center px-4 py-3 hover:bg-slate-800/70 transition-colors text-left
                    ${isActive ? 'bg-slate-800 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}
                    ${module.hasExceptions ? 'border-l-amber-500' : ''}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {module.hasExceptions && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    )}
                    <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>
                      {module.name}
                    </span>
                  </div>
                  <StatusDot hasExceptions={module.hasExceptions} active={module.activeCount} total={module.permissions.length} />
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN CONTENT - Permissions Detail */}
        <div className="col-span-12 lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col max-h-[600px] lg:max-h-[650px]">
          {/* Module Header + Search */}
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-800/30 shrink-0 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield size={18} className="text-indigo-400" />
                  {activeModule?.name || 'Sélectionnez un module'}
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  {activeModule ? `${activeModule.activeCount}/${activeModule.permissions.length} actives` : ''}
                  {activeModule?.hasExceptions && (
                    <span className="ml-2 text-amber-400">• {activeModule.exceptionCount} exception(s)</span>
                  )}
                </p>
              </div>
            </div>
            
            {/* Search & Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="text" 
                  value={permSearchTerm}
                  onChange={(e) => setPermSearchTerm(e.target.value)}
                  placeholder="Filtrer..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none text-white placeholder:text-slate-500"
                />
              </div>
              <button 
                onClick={() => setShowOnlyCustom(!showOnlyCustom)}
                className={`
                  px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 transition-all whitespace-nowrap
                  ${showOnlyCustom 
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }
                `}
              >
                <Filter size={14} />
                <span className="hidden sm:inline">Exceptions</span>
              </button>
            </div>
          </div>

          {/* Permissions List */}
          <div className="flex-1 overflow-y-auto">
            {activeModulePermissions.length > 0 ? (
              <div className="divide-y divide-slate-800/50">
                {activeModulePermissions.map(perm => {
                  const status = getUserPermissionStatus(perm.code);
                  const isCustom = status.source === 'custom';
                  
                  let statusLabel = 'Hérité';
                  let statusColor = 'text-slate-500';
                  let borderColor = 'border-transparent';
                  
                  if (isCustom) {
                    if (status.granted) {
                      statusLabel = 'Forcé (ON)';
                      statusColor = 'text-emerald-400';
                      borderColor = 'border-emerald-500';
                    } else {
                      statusLabel = 'Bloqué (OFF)';
                      statusColor = 'text-rose-400';
                      borderColor = 'border-rose-500';
                    }
                  }
                  
                  return (
                    <div 
                      key={perm.id} 
                      className={`flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors group border-l-2 ${borderColor}`}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-medium ${status.granted ? 'text-white' : 'text-slate-400'}`}>
                            {perm.name}
                          </span>
                          {isCustom && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              status.granted 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              Exception
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                          {perm.code}
                          {perm.description && (
                            <span className="hidden sm:inline text-slate-600">• {perm.description}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-xs text-right hidden sm:block font-medium ${statusColor}`}>
                          {statusLabel}
                        </span>
                        
                        <Switch 
                          checked={status.granted}
                          onChange={() => toggleUserPermission(perm.id)}
                          className={isCustom 
                            ? (status.granted ? "bg-amber-500" : "bg-rose-500") 
                            : (status.granted ? "bg-indigo-600" : "bg-slate-600")
                          }
                        />
                        
                        {isCustom && (
                          <button 
                            onClick={() => toggleUserPermission(perm.id)}
                            title="Rétablir au rôle"
                            className="p-1.5 text-slate-600 hover:text-white hover:bg-slate-700 rounded transition-colors"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Shield size={40} className="mb-4 opacity-50" />
                <p className="text-base font-medium">
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
