import React, { useState } from 'react';
import { Users, UserPlus, Plus, Minus, Lock, Unlock, AlertCircle, CheckCircle, Search, X, Shield, LockKeyhole } from 'lucide-react';
import { Permission } from '../../../hooks/admin/usePermissions';
import { UserPermission } from '../../../hooks/admin/useUserPermissions';
import { AdminUser } from '../../../hooks/admin/useAdminUsers';
import { ROLE_COLORS } from '../../../constants/admin-constants';
import { Modal, Button, Pagination, Card, SearchInput, SelectableCard } from '../../ui';
import { usePagination } from '../../../hooks/usePagination';

interface UserCustomPermissionsManagerProps {
  users: AdminUser[];
  permissions: Permission[];
  selectedUserId: string;
  onUserChange: (userId: string) => void;
  userPermissions: UserPermission[];
  getUserDisplayName: (user: any) => string;
  getUserPermissionStatus: (permCode: string) => { granted: boolean; source: string };
  toggleUserPermission: (permId: string) => void;
  onActivateAll: () => void;
  onBlockAll: () => void;
  onResetPermissions: () => void;
  activePermissionsCount: number;
  getAvailablePermissionsToAdd: () => Permission[];
  getAvailablePermissionsToRemove: () => Permission[];
  confirmMessage?: string;
}

export default function UserCustomPermissionsManager({
  users = [],
  permissions = [],
  selectedUserId,
  onUserChange,
  userPermissions = [],
  getUserDisplayName,
  getUserPermissionStatus,
  toggleUserPermission,
  onActivateAll,
  onBlockAll,
  onResetPermissions,
  activePermissionsCount,
  getAvailablePermissionsToAdd,
  getAvailablePermissionsToRemove,
  confirmMessage
}: UserCustomPermissionsManagerProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedPermsToAdd, setSelectedPermsToAdd] = useState<string[]>([]);
  const [selectedPermsToRemove, setSelectedPermsToRemove] = useState<string[]>([]);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Filter users based on search term
  const filteredUsers = users.filter(user => {
      const searchLower = userSearchTerm.toLowerCase();
      return (
          (user.name?.toLowerCase() || '').includes(searchLower) ||
          (user.username?.toLowerCase() || '').includes(searchLower) ||
          (user.role?.toLowerCase() || '').includes(searchLower)
      );
  });

  const selectedUser = users.find(u => u.id === selectedUserId);

  const handleOpenAddModal = () => {
    setSelectedPermsToAdd([]);
    setModalSearchTerm('');
    setShowAddModal(true);
  };

  const handleOpenRemoveModal = () => {
    setSelectedPermsToRemove([]);
    setModalSearchTerm('');
    setShowRemoveModal(true);
  };

  const togglePermToAdd = (permCode: string) => {
    setSelectedPermsToAdd(prev =>
      prev.includes(permCode) ? prev.filter(p => p !== permCode) : [...prev, permCode]
    );
  };

  const togglePermToRemove = (permCode: string) => {
    setSelectedPermsToRemove(prev =>
      prev.includes(permCode) ? prev.filter(p => p !== permCode) : [...prev, permCode]
    );
  };

  const handleValidateAdd = async () => {
    for (const permCode of selectedPermsToAdd) {
      const perm = permissions.find(p => p.code === permCode);
      if (perm) {
        await toggleUserPermission(perm.id);
      }
    }
    setShowAddModal(false);
    setSelectedPermsToAdd([]);
  };

  const handleValidateRemove = async () => {
    for (const permCode of selectedPermsToRemove) {
      const perm = permissions.find(p => p.code === permCode);
      if (perm) {
        await toggleUserPermission(perm.id);
      }
    }
    setShowRemoveModal(false);
    setSelectedPermsToRemove([]);
  };

  const availableToAdd = getAvailablePermissionsToAdd().filter(p =>
    !modalSearchTerm || 
    p.name.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(modalSearchTerm.toLowerCase())
  );

  const availableToRemove = getAvailablePermissionsToRemove().filter(p =>
    !modalSearchTerm ||
    p.name.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(modalSearchTerm.toLowerCase())
  );

  // Pagination pour la grille utilisateurs (8 par page sur mobile, 12 sur desktop)
  const {
    currentPage,
    totalPages,
    canGoNext,
    canGoPrevious,
    goToPage,
    paginateArray
  } = usePagination({
    totalItems: filteredUsers.length,
    itemsPerPage: 8, // Compact for mobile
    initialPage: 1
  });

  const paginatedUsers = paginateArray(filteredUsers);

  return (
    <div className="space-y-4">
      {/* Search Users */}
      <SearchInput
        value={userSearchTerm}
        onChange={(e) => setUserSearchTerm(e.target.value)}
        placeholder="Rechercher un utilisateur..."
        onClear={() => setUserSearchTerm('')}
        className="bg-slate-800 border-slate-700 focus:border-cyan-500"
      />

      {/* Users Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {paginatedUsers.map((user) => {
          const isSelected = selectedUserId === user.id;
          
          return (
            <div key={user.id} className="h-full">
                <SelectableCard
                    selected={isSelected}
                    onClick={() => onUserChange(user.id)}
                    className="h-full"
                >
                    <div className="flex flex-col items-center text-center gap-2">
                         <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                              isSelected 
                                ? 'bg-cyan-500 text-white border-white/20' 
                                : 'bg-slate-700 text-slate-300 border-slate-600'
                         }`}>
                           {(user.name || '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                         </div>
                         <div className="min-w-0 w-full">
                             <div className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                 {(user.name || user.username).split(' ')[0]}
                             </div>
                             <div className="text-[10px] text-slate-400 truncate">@{user.username}</div>
                         </div>
                         <div className={`text-[10px] px-2 py-0.5 rounded-full border border-slate-600/50 bg-slate-700/50 text-slate-400 capitalize`}>
                            {user.role}
                         </div>
                    </div>
                </SelectableCard>
            </div>
          );
        })}
      </div>

       {/* Pagination */}
       {filteredUsers.length > 8 && (
          <div className="mt-2 text-center">
            <span className="text-xs text-slate-500">
                Page {currentPage} sur {totalPages} ({filteredUsers.length} utilisateurs)
            </span>
            <div className="flex justify-center mt-2">
                 <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={goToPage}
                    canGoNext={canGoNext}
                    canGoPrevious={canGoPrevious}
                    itemsPerPage={8}
                    totalItems={filteredUsers.length}
                  />
            </div>
          </div>
        )}

      {/* Selected User Details */}
      {selectedUser && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 mt-4">
            <Card variant="glass" className="border-cyan-500/30 ring-1 ring-cyan-500/20">
                <div className="flex flex-col gap-4">
                     {/* User Header */}
                    <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-cyan-500/20">
                           {(selectedUser.name || '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                           <h3 className="text-lg font-bold text-white truncate">{selectedUser.name}</h3>
                           <div className="flex items-center gap-2">
                               <p className="text-cyan-400 text-xs truncate">@{selectedUser.username}</p>
                               <span className="text-[10px] px-1.5 py-px bg-white/10 rounded text-slate-300 border border-white/10 uppercase tracking-wide">
                                   {selectedUser.role}
                               </span>
                           </div>
                        </div>
                        <div className="hidden sm:block text-right">
                           <div className="text-2xl font-bold text-cyan-400">{activePermissionsCount}</div>
                           <div className="text-[10px] text-slate-400 uppercase tracking-wider">Perms Actives</div>
                        </div>
                    </div>

                    {/* Confirmation Message */}
                    {confirmMessage && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                             <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                             <span className="text-xs font-medium text-emerald-400">{confirmMessage}</span>
                        </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex flex-wrap gap-2">
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleOpenAddModal}
                            className="bg-cyan-600 hover:bg-cyan-500 text-xs"
                        >
                            <Plus size={14} className="mr-1.5" /> Ajouter
                        </Button>
                        <Button 
                            variant="danger" 
                            size="sm" 
                            onClick={handleOpenRemoveModal}
                             className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 text-xs"
                        >
                            <Minus size={14} className="mr-1.5" /> Retirer
                        </Button>
                        <div className="w-px h-8 bg-white/10 mx-1 hidden sm:block"></div>
                        <Button variant="ghost" size="sm" onClick={onActivateAll} className="text-xs text-emerald-400 hover:bg-emerald-500/10">
                            <Unlock size={14} className="mr-1.5" /> Tout Activer
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onBlockAll} className="text-xs text-amber-400 hover:bg-amber-500/10">
                            <Lock size={14} className="mr-1.5" /> Tout Bloquer
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onResetPermissions} className="text-xs text-slate-400 hover:text-white ml-auto">
                            Réinitialiser
                        </Button>
                    </div>

                    {/* Permissions List */}
                    <div className="space-y-2 mt-2">
                       {userPermissions.length > 0 ? (
                           <div className="grid gap-2 sm:grid-cols-2">
                               {userPermissions.map((perm) => {
                                   const status = getUserPermissionStatus(perm.permission_code);
                                   const isCustom = status.source === 'custom';
                                   
                                   return (
                                       <div 
                                           key={perm.permission_code} 
                                           className={`
                                               group flex items-center justify-between p-3 rounded-xl border transition-all
                                               ${status.granted 
                                                   ? isCustom 
                                                        ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10' 
                                                        : 'bg-slate-700/30 border-slate-600/50' 
                                                   : 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                                               }
                                           `}
                                       >
                                           <div className="flex items-center gap-3 overflow-hidden">
                                               <div className={`
                                                    w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                                                    ${status.granted 
                                                        ? isCustom ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                                                        : 'bg-red-500/20 text-red-400'
                                                    }
                                               `}>
                                                   {status.granted ? <Shield size={14} /> : <LockKeyhole size={14} />}
                                               </div>
                                               <div className="min-w-0">
                                                   <div className="font-medium text-sm text-slate-200 truncate">{perm.permission_name}</div>
                                                   <div className="text-[10px] text-slate-500 font-mono truncate">{perm.permission_code}</div>
                                               </div>
                                           </div>
                                            
                                           <div className={`
                                                text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border
                                                ${status.granted 
                                                    ? isCustom 
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-slate-700 text-slate-400 border-slate-600'
                                                    : 'bg-red-500/20 text-red-400 border-red-500/20'
                                                }
                                           `}>
                                                {status.granted ? (isCustom ? 'Custom' : 'Hérité') : 'Bloqué'}
                                           </div>
                                       </div>
                                   );
                               })}
                           </div>
                       ) : (
                           <div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-xl">
                               <Shield size={32} className="mx-auto text-slate-600 mb-2" />
                               <p className="text-slate-500 text-sm">Aucune permission spécifique configurée.</p>
                               <p className="text-slate-600 text-xs mt-1">L'utilisateur utilise les permissions de son rôle.</p>
                           </div>
                       )}
                    </div>
                </div>
            </Card>
        </div>
      )}

      {/* Add Permissions Modal - Dark Theme */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Ajouter des Permissions"
        size="lg"
      >
        <div className="space-y-4">
          <SearchInput
            value={modalSearchTerm}
            onChange={(e) => setModalSearchTerm(e.target.value)}
            placeholder="Rechercher une permission..."
            className="bg-slate-900 border-slate-700"
          />

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {availableToAdd.length > 0 ? availableToAdd.map((perm) => (
              <div
                key={perm.code}
                onClick={() => togglePermToAdd(perm.code)}
                className={`
                    p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between
                    ${selectedPermsToAdd.includes(perm.code)
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                    }
                `}
              >
                <div>
                   <div className="font-semibold text-white text-sm">{perm.name}</div>
                   <code className="text-xs text-slate-500">{perm.code}</code>
                </div>
                {selectedPermsToAdd.includes(perm.code) && (
                   <CheckCircle size={20} className="text-blue-400 animate-in fade-in zoom-in" />
                )}
              </div>
            )) : (
                <p className="text-center text-slate-500 py-4">Aucune permission disponible à ajouter.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleValidateAdd} disabled={selectedPermsToAdd.length === 0}>
              Ajouter ({selectedPermsToAdd.length})
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove Permissions Modal - Dark Theme */}
      <Modal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Retirer des Permissions"
        size="lg"
      >
        <div className="space-y-4">
           <SearchInput
            value={modalSearchTerm}
            onChange={(e) => setModalSearchTerm(e.target.value)}
            placeholder="Rechercher une permission..."
            className="bg-slate-900 border-slate-700"
          />

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {availableToRemove.length > 0 ? availableToRemove.map((perm) => (
              <div
                key={perm.code}
                onClick={() => togglePermToRemove(perm.code)}
                className={`
                    p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between
                    ${selectedPermsToRemove.includes(perm.code)
                        ? 'bg-red-500/20 border-red-500/50'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                    }
                `}
              >
                <div>
                   <div className="font-semibold text-white text-sm">{perm.name}</div>
                   <code className="text-xs text-slate-500">{perm.code}</code>
                </div>
                {selectedPermsToRemove.includes(perm.code) && (
                   <X size={20} className="text-red-400 animate-in fade-in zoom-in" />
                )}
              </div>
            )) : (
                <p className="text-center text-slate-500 py-4">Aucune permission disponible à retirer.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={() => setShowRemoveModal(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handleValidateRemove} disabled={selectedPermsToRemove.length === 0}>
              Retirer ({selectedPermsToRemove.length})
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
