import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Edit2, Trash2, Lock, Unlock, Eye, EyeOff, Shield, CheckCircle, XCircle, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Card, Button, IconButton, ResponsiveTable } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { userApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  phone: string;
  role: string;
  statut: 'Actif' | 'Inactif' | 'Suspendu';
  created_at: string;
}

interface ModulePermission {
  id: string;
  module_name: string;
  permission_name: string;
  permission_code: string;
  description: string;
}

interface UserAccess {
  module_name: string;
  peut_voir: boolean;
  peut_creer: boolean;
  peut_modifier: boolean;
  peut_supprimer: boolean;
  peut_valider: boolean;
  peut_exporter: boolean;
}

export default function AdminGestionProfils() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateUsers = hasPermission('users', 'create');
  const canEditUsers = hasPermission('users', 'edit');
  const canDeleteUsers = hasPermission('users', 'delete');
  const canManageUsers = hasPermission('users', 'manage');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userAccess, setUserAccess] = useState<Record<string, UserAccess>>({});
  const [allUsersAccess, setAllUsersAccess] = useState<Record<string, Record<string, UserAccess>>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [permissionFilter, setPermissionFilter] = useState<string>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const permissionTypes = [
    { key: 'peut_voir', label: 'Voir', icon: '👁️' },
    { key: 'peut_creer', label: 'Créer', icon: '➕' },
    { key: 'peut_modifier', label: 'Modifier', icon: '✏️' },
    { key: 'peut_supprimer', label: 'Supprimer', icon: '🗑️' },
    { key: 'peut_valider', label: 'Valider', icon: '✅' },
    { key: 'peut_exporter', label: 'Exporter', icon: '📥' }
  ];

  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'Caissier'
  });

  const roles = [
    'Caissier',
    'Agent Terrain',
    'Agent Caisse',
    'Chef Agence',
    'Comptable',
    'Superviseur',
    'Administrateur'
  ];

  const modules = [
    'Caisse',
    'Clients',
    'Épargnes',
    'Crédits',
    'Tontines',
    'Comptabilité',
    'Administration'
  ];

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await userApi.getAll();
      setUsers(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des utilisateurs'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.warning('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 6) {
      toast.warning('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    try {
      await userApi.create({
        nom: formData.nom,
        prenom: formData.prenom,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role,
        statut: 'Actif'
      });

      toast.success(`Utilisateur ${formData.nom} ${formData.prenom} créé avec succès`);

      setFormData({
        nom: '',
        prenom: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        role: 'Caissier'
      });
      setShowCreateForm(false);
      loadUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création'));
    }
  }, [formData, loadUsers]);

  const getDefaultAccessForRole = (role: string): Record<string, UserAccess> => {
    const defaults: Record<string, UserAccess> = {};

    if (role === 'Caissier' || role === 'Agent Caisse') {
      defaults['Caisse'] = { module_name: 'Caisse', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: true, peut_exporter: false };
      defaults['Clients'] = { module_name: 'Clients', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Épargnes'] = { module_name: 'Épargnes', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Crédits'] = { module_name: 'Crédits', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
    } else if (role === 'Agent Terrain') {
      defaults['Clients'] = { module_name: 'Clients', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Crédits'] = { module_name: 'Crédits', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Tontines'] = { module_name: 'Tontines', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
    } else if (role === 'Chef Agence') {
      modules.forEach(mod => {
        defaults[mod] = { module_name: mod, peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: true, peut_exporter: true };
      });
    } else if (role === 'Comptable') {
      defaults['Comptabilité'] = { module_name: 'Comptabilité', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: true };
      defaults['Caisse'] = { module_name: 'Caisse', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: true };
    } else if (role === 'Administrateur') {
      modules.forEach(mod => {
        defaults[mod] = { module_name: mod, peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: true, peut_valider: true, peut_exporter: true };
      });
    }

    return defaults;
  };

  const toggleUserStatus = useCallback(async (user: User) => {
    const newStatus = user.statut === 'Actif' ? 'Inactif' : 'Actif';

    try {
      await userApi.update(user.id, { statut: newStatus });
      toast.success(`Utilisateur ${newStatus === 'Actif' ? 'activé' : 'désactivé'}`);
      loadUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du changement de statut'));
    }
  }, [loadUsers]);

  const deleteUser = useCallback((user: User) => {
    openConfirm({
      title: 'Supprimer cet utilisateur ?',
      message: `Êtes-vous sûr de vouloir supprimer ${user.nom} ${user.prenom} ? Cette action est irréversible.`,
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await userApi.delete(user.id);
          toast.success('Utilisateur supprimé avec succès');
          loadUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  }, [openConfirm, loadUsers]);

  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const openPermissionsModal = useCallback(async (user: User) => {
    setSelectedUser(user);
    setPermissionsLoading(true);
    setShowPermissionsModal(true);

    try {
      const savedPermissions = await userApi.getPermissions(user.id);

      if (Object.keys(savedPermissions).length > 0) {
        setUserAccess(savedPermissions);
      } else {
        const defaultAccess = getDefaultAccessForRole(user.role);
        setUserAccess(defaultAccess);
      }
    } catch (error) {
      const defaultAccess = getDefaultAccessForRole(user.role);
      setUserAccess(defaultAccess);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  const savePermissions = useCallback(async () => {
    if (!selectedUser) return;

    setSavingPermissions(true);
    try {
      const result = await userApi.updatePermissions(selectedUser.id, userAccess);
      toast.success(`Permissions sauvegardées avec succès (${result.count} modules)`);
      setShowPermissionsModal(false);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde des permissions'));
    } finally {
      setSavingPermissions(false);
    }
  }, [selectedUser, userAccess]);

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.nom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (u.prenom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (u.phone || '').includes(searchQuery);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  // ... (keeping state and logic)

  // Helper to get initials
  const getInitials = (firstName: string = '', lastName: string = '') => {
    return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
  };

  return (
    <div className="space-y-4">
      <Card variant="default" padding="none" className="overflow-hidden">
        {/* Mobile-First Header */}
        <div className="p-4 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Profils</h2>
                <p className="text-xs sm:text-sm text-content-muted">Gestion des accès ({filteredUsers.length})</p>
              </div>
            </div>
            {canCreateUsers && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setFormData({
                    nom: '', prenom: '', email: '', phone: '', password: '', confirmPassword: '', role: 'Caissier'
                  });
                  setShowCreateForm(true);
                }}
                className="w-full sm:w-auto justify-center shadow-lg shadow-primary/20"
              >
                Nouveau
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-10 pr-4 py-2 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary text-sm focus:border-primary outline-none"
            >
              <option value="all">Tous les rôles</option>
              {roles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-content-muted text-sm mt-3">Chargement des profils...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <Users size={48} className="opacity-20 mb-4" />
            <p className="text-sm">Aucun profil trouvé</p>
          </div>
        ) : (
          <>
            {/* Scrollable Table Container */}
            <div className="overflow-auto max-h-[400px] custom-scrollbar">
              <ResponsiveTable
                data={paginatedUsers}
                columns={[
                  {
                    key: 'identity',
                    label: 'Identité',
                    primary: true,
                    format: (_, user) => (
                      <div className="flex items-center gap-3 py-1">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shrink-0">
                          <span className="text-xs sm:text-sm font-bold text-primary max-w-full truncate px-1">
                            {getInitials(user.nom, user.prenom)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content-primary truncate max-w-[140px] sm:max-w-xs">{user.nom} {user.prenom}</p>
                          <p className="text-[10px] text-content-muted truncate">{user.email}</p>
                        </div>
                      </div>
                    )
                  },
                  {
                    key: 'role',
                    label: 'Rôle',
                    format: (role) => (
                      <span className="px-2 py-1 rounded-md bg-surface-muted border border-edge text-[10px] sm:text-xs font-medium text-content-secondary whitespace-nowrap">
                        {role}
                      </span>
                    )
                  },
                  {
                    key: 'status',
                    label: 'Statut',
                    format: (_, user) => (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        user.statut === 'Actif'
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-content-muted/10 text-content-muted border-edge'
                      }`}>
                        {user.statut === 'Actif' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {user.statut}
                      </span>
                    )
                  }
                ]}
                actions={(user) => (
                  <>
                    {canEditUsers && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleUserStatus(user); }}
                        className={`p-2 rounded-lg transition-colors ${
                          user.statut === 'Actif'
                            ? 'text-amber-400 hover:bg-amber-500/10'
                            : 'text-success hover:bg-success/10'
                        }`}
                        title={user.statut === 'Actif' ? 'Désactiver' : 'Activer'}
                        aria-label={user.statut === 'Actif' ? 'Désactiver' : 'Activer'}
                      >
                        {user.statut === 'Actif' ? <XCircle size={18} /> : <CheckCircle size={18} />}
                      </button>
                    )}
                    {canManageUsers && (
                      <IconButton
                        icon={Shield}
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openPermissionsModal(user); }}
                        className="text-blue-400 hover:bg-blue-500/10"
                        title="Permissions"
                        aria-label="Gérer les permissions"
                      />
                    )}
                    {canDeleteUsers && (
                      <IconButton
                        icon={Trash2}
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); deleteUser(user); }}
                        className="text-red-400 hover:bg-red-500/10"
                        title="Supprimer"
                        aria-label="Supprimer le profil"
                      />
                    )}
                  </>
                )}
                mobileBreakpoint="md"
              />
            </div>

            {/* Pagination Controls */}
            <div className="p-3 sm:p-4 border-t border-edge bg-surface-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Page info & size selector */}
              <div className="flex items-center gap-3 text-xs sm:text-sm text-content-muted">
                <span className="hidden sm:inline">
                  {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredUsers.length)} sur {filteredUsers.length}
                </span>
                <span className="sm:hidden">
                  Page {currentPage}/{totalPages}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-primary outline-none"
                >
                  <option value={5}>5 / page</option>
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1">
                <IconButton
                  icon={ChevronsLeft}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 text-content-muted disabled:opacity-30"
                  aria-label="Première page"
                />
                <IconButton
                  icon={ChevronLeft}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 text-content-muted disabled:opacity-30"
                  aria-label="Page précédente"
                />
                
                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-primary text-white'
                            : 'text-content-muted hover:bg-surface-muted'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <IconButton
                  icon={ChevronRight}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="w-8 h-8 text-content-muted disabled:opacity-30"
                  aria-label="Page suivante"
                />
                <IconButton
                  icon={ChevronsRight}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="w-8 h-8 text-content-muted disabled:opacity-30"
                  aria-label="Dernière page"
                />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Create User Modal - Improved UI */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex justify-between items-center">
              <h3 className="text-lg font-bold text-content-primary">Nouveau Profil</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-content-muted hover:text-content-primary">
                <XCircle size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-4 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Nom *</label>
                  <input
                    type="text"
                    value={formData.nom}
                    onChange={(e) => setFormData({...formData, nom: e.target.value})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Prénom *</label>
                  <input
                    type="text"
                    value={formData.prenom}
                    onChange={(e) => setFormData({...formData, prenom: e.target.value})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-content-secondary">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Rôle *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-slate-400"
                    required
                  >
                    {roles.map(role => (
                      <option key={role} value={role} className="bg-slate-800 text-white py-2">{role}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Mot de passe *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-secondary">Confirmer *</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreateForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                  Créer Profil
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal - Improved UI */}
      {showPermissionsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-edge flex justify-between items-center bg-surface-muted/30">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Permissions</h3>
                <p className="text-xs text-content-muted">{selectedUser.nom} ({selectedUser.role})</p>
              </div>
              <button onClick={() => setShowPermissionsModal(false)} className="text-content-muted hover:text-content-primary">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              {permissionsLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-content-muted text-sm mt-3">Chargement des permissions...</p>
                </div>
              ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-base border-b border-edge shadow-sm z-10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-bold text-content-secondary uppercase tracking-wider">Module</th>
                    {permissionTypes.map(perm => (
                      <th key={perm.key} className="text-center py-3 px-1 text-[10px] font-bold text-content-secondary uppercase w-12" title={perm.label}>
                        <span className="text-lg block mb-1">{perm.icon}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {modules.map(mod => {
                    const access = userAccess[mod] || {
                      module_name: mod, peut_voir: false, peut_creer: false, peut_modifier: false, 
                      peut_supprimer: false, peut_valider: false, peut_exporter: false
                    };
                    return (
                      <tr key={mod} className="hover:bg-surface-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-content-primary">{mod}</td>
                        {permissionTypes.map(perm => (
                          <td key={perm.key} className="text-center py-3 px-1">
                            <input
                              type="checkbox"
                              checked={(access as any)[perm.key] || false}
                              onChange={(e) => {
                                setUserAccess(prev => ({
                                  ...prev,
                                  [mod]: { ...access, [perm.key]: e.target.checked }
                                }));
                              }}
                              className="w-4 h-4 rounded border-edge bg-surface-muted text-primary cursor-pointer focus:ring-primary/50"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>

            <div className="p-4 border-t border-edge flex justify-end gap-3 bg-surface-muted/30">
              <Button size="sm" variant="secondary" onClick={() => setShowPermissionsModal(false)}>
                Fermer
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={savePermissions}
                disabled={savingPermissions}
              >
                {savingPermissions ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
