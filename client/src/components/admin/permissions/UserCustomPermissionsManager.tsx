import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Shield, Search, CheckCircle, X, 
  ChevronDown, ChevronRight, Lock, Unlock, 
  Filter, AlertCircle, ArrowLeft 
} from 'lucide-react';
import { Permission } from '../../../hooks/admin/usePermissions';
import { UserPermission } from '../../../hooks/admin/useUserPermissions';
import { Card, SearchInput, SelectableCard, Button, Badge, Switch } from '../../ui';
import { usePagination } from '../../../hooks/usePagination';

interface UserCustomPermissionsManagerProps {
  users: any[];
  permissions: Permission[];
  selectedUserId: string;
  onUserChange: (userId: string) => void;
  userPermissions: UserPermission[];
  getUserDisplayName: (userId: string) => string;
  getUserPermissionStatus: (permCode: string) => { granted: boolean; source: 'role' | 'user' | 'none' };
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

export default function UserCustomPermissionsManager({
  users,
  permissions,
  selectedUserId,
  onUserChange,
  userPermissions, // kept for prop compatibility but unused if we use getter
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
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [isSelectionView, setIsSelectionView] = useState(!preselectedUserId);
  
  // Force update when permission count changes
  useEffect(() => {
     // This is just to trigger re-renders if needed
  }, [activePermissionsCount]);

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

  // Filter permissions
  const filteredPermissionGroups = useMemo(() => {
    let perms = permissions;
    
    if (showOnlyCustom) {
      perms = perms.filter(p => getUserPermissionStatus(p.code).source === 'user');
    }

    if (permSearchTerm) {
      const lower = permSearchTerm.toLowerCase();
      perms = perms.filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.code.toLowerCase().includes(lower) ||
        (p.moduleName || '').toLowerCase().includes(lower)
      );
    }

    return groupPermissionsByModule(perms);
  }, [permissions, permSearchTerm, showOnlyCustom, getUserPermissionStatus]);

  // Pagination for users
  const {
    currentPage,
    totalPages,
    goToPage,
    paginateArray
  } = usePagination({
    totalItems: filteredUsers.length,
    itemsPerPage: 12, // More density
    initialPage: 1
  });

  const paginatedUsers = paginateArray(filteredUsers);

  const toggleModule = (moduleName: string) => {
    setExpandedModules(prev => 
      prev.includes(moduleName) 
        ? prev.filter(m => m !== moduleName)
        : [...prev, moduleName]
    );
  };

  const handleUserSelect = (userId: string) => {
    onUserChange(userId);
    setIsSelectionView(false);
    // Expand all modules by default for better visibility
    // setExpandedModules(Array.from(new Set(permissions.map(p => p.moduleName || 'Autre'))));
    setExpandedModules([]); // Start collapsed for cleaner view
  };

  const handleBackToSelection = () => {
    setIsSelectionView(true);
    setUserSearchTerm('');
  };

  // --- RENDER SELECTION VIEW ---
  if (isSelectionView) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
        <div className="flex flex-col gap-2">
           <h3 className="text-lg font-semibold text-white">Sélectionner un utilisateur</h3>
           <SearchInput
            value={userSearchTerm}
            onChange={(e) => setUserSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, rôle..."
            className="bg-slate-800 border-slate-700"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {paginatedUsers.map((user) => (
             <SelectableCard
                key={user.id}
                selected={false}
                onClick={() => handleUserSelect(user.id)}
                className="hover:bg-slate-800/80 transition-colors h-auto"
            >
                <div className="flex flex-col items-center text-center gap-2 p-1">
                     <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
                       {(user.name || '??').slice(0, 2).toUpperCase()}
                     </div>
                     <div className="w-full">
                         <div className="font-bold text-sm text-slate-200 truncate">{user.name}</div>
                         <div className="text-xs text-slate-400 truncate">@{user.username}</div>
                         <Badge variant="outline" className="mt-1 text-[10px] py-0 h-auto opacity-70" value={user.role} />
                     </div>
                </div>
            </SelectableCard>
          ))}
        </div>
        
        {filteredUsers.length === 0 && (
             <div className="text-center py-10 text-slate-500">Aucun utilisateur trouvé</div>
        )}

        {totalPages > 1 && (
            <div className="flex justify-center mt-4">
                 <div className="flex gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={currentPage === 1}
                        onClick={() => goToPage(currentPage - 1)}
                    >
                        Précédent
                    </Button>
                    <span className="flex items-center text-xs text-slate-500">
                        Page {currentPage} / {totalPages}
                    </span>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={currentPage === totalPages}
                        onClick={() => goToPage(currentPage + 1)}
                    >
                        Suivant
                    </Button>
                 </div>
            </div>
        )}
      </div>
    );
  }

  // --- RENDER PERMISSIONS VIEW ---
  if (!selectedUser) return null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      
      {/* Detail Header */}
      <Card variant="glass" className="border-cyan-500/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                  <Button variant="ghost" onClick={handleBackToSelection} className="w-10 h-10 p-0 rounded-full shrink-0 -ml-2 text-slate-400 hover:text-white flex items-center justify-center">
                      <ArrowLeft size={20} />
                  </Button>
                  
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
                      {(selectedUser.name || '??').slice(0, 2).toUpperCase()}
                  </div>
                  
                  <div>
                      <h3 className="font-bold text-white leading-tight">{selectedUser.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                          <span>@{selectedUser.username}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                          <span className="text-cyan-400">{selectedUser.role}</span>
                      </div>
                  </div>
              </div>

              <div className="flex items-center gap-4 bg-slate-950/30 px-4 py-2 rounded-lg border border-white/5 w-full sm:w-auto">
                    <div className="text-center">
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Actives</div>
                        <div className="text-xl font-bold text-cyan-400">{activePermissionsCount}</div>
                    </div>
                     <div className="w-px h-8 bg-white/10"></div>
                     <div className="flex-1">
                        <div className="text-xs text-slate-500 mb-1">Actions rapides</div>
                        <div className="flex gap-2">
                             <Button 
                                variant="ghost" 
                                size="xs" 
                                onClick={onActivateAll} 
                                className="h-6 px-2 text-emerald-400 hover:bg-emerald-500/10"
                             >
                                Toutes
                             </Button>
                             <Button 
                                variant="ghost" 
                                size="xs" 
                                onClick={onBlockAll} 
                                className="h-6 px-2 text-amber-400 hover:bg-amber-500/10"
                             >
                                Aucune
                             </Button>
                             <Button 
                                variant="ghost" 
                                size="xs" 
                                onClick={onResetPermissions} 
                                className="h-6 px-2 text-slate-400 hover:bg-slate-800"
                              >
                                Reset
                             </Button>
                        </div>
                     </div>
              </div>
          </div>

          {/* Messages */}
          {confirmMessage && (
               <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded flex items-center gap-2 text-sm text-emerald-400 animate-in fade-in slide-in-from-top-2">
                   <CheckCircle size={16} /> {confirmMessage}
               </div>
          )}
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                  type="text" 
                  value={permSearchTerm}
                  onChange={(e) => setPermSearchTerm(e.target.value)}
                  placeholder="Filtrer les permissions..."
                  className="w-full bg-slate-800 border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none text-white placeholder:text-slate-500"
              />
          </div>
          <div className="flex items-center gap-2">
               <button 
                  onClick={() => setShowOnlyCustom(!showOnlyCustom)}
                  className={`
                      px-3 py-2 rounded-lg text-sm border flex items-center gap-2 transition-colors whitespace-nowrap
                      ${showOnlyCustom 
                          ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }
                  `}
               >
                   <Filter size={16} />
                   <span>Modifiées uniquement</span>
               </button>
          </div>
      </div>

      {/* Permission List */}
      <div className="space-y-3">
          {filteredPermissionGroups.map(([moduleName, modulePerms]) => {
              const isExpanded = expandedModules.includes(moduleName) || permSearchTerm.length > 0;
              const activeCount = modulePerms.filter(p => getUserPermissionStatus(p.code).granted).length;
              const hasCustom = modulePerms.some(p => getUserPermissionStatus(p.code).source === 'user');

              return (
                  <div key={moduleName} className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                      {/* Module Header */}
                      <div 
                          onClick={() => toggleModule(moduleName)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg ${hasCustom ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700/50 text-slate-400'}`}>
                                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </div>
                              <div>
                                  <h4 className="font-semibold text-slate-200">{moduleName}</h4>
                                  <div className="text-xs text-slate-500">
                                      {activeCount}/{modulePerms.length} actives • {modulePerms.length} permissions
                                  </div>
                              </div>
                          </div>
                          {hasCustom && (
                              <Badge variant="info" className="text-[10px] bg-cyan-900/30 text-cyan-400 border-cyan-800" value="Modifié" />
                          )}
                      </div>

                      {/* Permissions Grid */}
                      {isExpanded && (
                          <div className="border-t border-slate-700/50 bg-slate-900/20 divide-y divide-slate-700/30">
                              {modulePerms.map(perm => {
                                  // Find current status
                                  const status = getUserPermissionStatus(perm.code);
                                  const isCustom = status.source === 'user';
                                  
                                  return (
                                      <div key={perm.id} className="flex items-center justify-between p-3 sm:px-4 hover:bg-white/5 transition-colors group">
                                          <div className="flex-1 min-w-0 pr-4">
                                              <div className="flex items-center gap-2 mb-0.5">
                                                  <span className={`text-sm font-medium ${status.granted ? 'text-white' : 'text-slate-400'}`}>
                                                      {perm.name}
                                                  </span>
                                                  {isCustom && (
                                                      <span className={`text-[10px] px-1.5 rounded border ${
                                                          status.granted 
                                                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                                                      }`}>
                                                          {status.granted ? 'Accordée' : 'Bloquée'}
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
                                              <div className="hidden sm:block text-right text-xs text-slate-500 mr-2">
                                                  {status.source === 'role' ? 'Hérité' : 'Spécifique'}
                                              </div>
                                              <Switch 
                                                  checked={status.granted}
                                                  onChange={() => toggleUserPermission(perm.id)}
                                                  className={status.granted ? "bg-emerald-500" : "bg-slate-600"}
                                              />
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              );
          })}
          
          {filteredPermissionGroups.length === 0 && (
              <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl">
                  <Shield size={32} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-slate-500">Aucune permission ne correspond à votre recherche</p>
              </div>
          )}
      </div>
    </div>
  );
}
