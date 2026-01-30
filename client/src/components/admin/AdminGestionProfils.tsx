import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Edit2, Trash2, Lock, Unlock, Eye, EyeOff, Shield, CheckCircle, XCircle, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card, Button, IconButton, ResponsiveTable } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { userApi, employeApi } from '../../lib/api-client';
import { useAgence } from '../../contexts/AgenceContext';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { SystemRole, getRoleOptions, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';
import { resolveStorageUrl } from '../../lib/format';

// Import hooks and component for permissions
import { getRoleBadgeStyle, getStatusBadgeStyle } from '../../lib/role-utils';
import { usePermissions as useAdminPermissions } from '../../hooks/admin/usePermissions';
import { useUserPermissions } from '../../hooks/admin/useUserPermissions';
import { useAdminUsers } from '../../hooks/admin/useAdminUsers';
import UserCustomPermissionsManager from './permissions/UserCustomPermissionsManager';

// Local types removed to use shared entities or any for flexibility

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

  // Agence context
  const { agences: userAgences, selectedAgence: contextAgence } = useAgence();
  
  const availableAgences = useMemo(() => 
    userAgences.filter(ua => ua.agenceId !== 'all').map(ua => ua.agence),
  [userAgences]);

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [users, setUsers] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userAccess, setUserAccess] = useState<Record<string, UserAccess>>({});
  const [allUsersAccess, setAllUsersAccess] = useState<Record<string, Record<string, UserAccess>>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<SystemRole | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [permissionFilter, setPermissionFilter] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const tempUserIdRef = React.useRef(crypto.randomUUID());

  /* Permissions Management Hooks */
  const { permissions: adminPermissions } = useAdminPermissions();
  const { getUserDisplayName } = useAdminUsers();
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
  } = useUserPermissions(selectedUser?.id || '');

  // Fetch permissions when user is selected
  useEffect(() => {
    if (showPermissionsModal && selectedUser) {
      fetchUserPermissions(selectedUser.id);
    }
  }, [showPermissionsModal, selectedUser]);

  // Wrapper to match UserCustomPermissionsManager signature
  const handleToggleUserPermission = useCallback(async (permId: string) => {
    if (!selectedUser) return;
    const perm = adminPermissions.find(p => p.id === permId);
    if (!perm) return;
    const currentStatus = getUserPermissionStatus(perm.code);
    await toggleUserPermission(selectedUser.id, permId, currentStatus.granted);
  }, [selectedUser, adminPermissions, getUserPermissionStatus, toggleUserPermission]);



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
    role: SystemRole.CAISSIER,
    agenceId: '',
    photoProfile: '',
  });

  const roleMap: Record<SystemRole, string> = {
    [SystemRole.ADMIN]: 'admin',
    [SystemRole.CHEF_AGENCE]: 'chef_agence',
    [SystemRole.COMPTABLE]: 'comptable',
    [SystemRole.CAISSIER]: 'agent_caisse',
    [SystemRole.AGENT_TERRAIN]: 'terrain',
    [SystemRole.SUPERVISEUR]: 'superviseur',
    [SystemRole.GESTIONNAIRE_CREDIT]: 'gestionnaire_credit',
    [SystemRole.CLIENT]: 'client'
  };

  const roles = getRoleOptions().filter((role) => role.value !== SystemRole.CLIENT);

  const passwordValidation = useMemo(() => {
    const pwd = formData.password;
    return {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[@$!%*?&]/.test(pwd),
      match: pwd === formData.confirmPassword && pwd !== ''
    };
  }, [formData.password, formData.confirmPassword]);

  const isPasswordSecure = passwordValidation.length && 
                          passwordValidation.uppercase && 
                          passwordValidation.number && 
                          passwordValidation.special;
  const isFormValid = isPasswordSecure && passwordValidation.match && formData.nom && formData.email;

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
    setLoading(true);
    try {
      const data = await employeApi.getAll();
      // Dédupliquer par ID d'employé (un employé peut avoir plusieurs rôles mais ne doit apparaître qu'une fois)
      const employeMap = new Map<string, any>();
      for (const emp of (data || [])) {
        if (!employeMap.has(emp.id)) {
          employeMap.set(emp.id, emp);
        }
      }
      setUsers(Array.from(employeMap.values()));
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du personnel'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordSecure) {
      toast.warning('Le mot de passe ne respecte pas la politique de sécurité');
      return;
    }

    setIsSubmitting(true);
    try {
      // Génération d'un username unique basé sur le nom
      const normalizedNom = formData.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedPrenom = (formData.prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const username = normalizedPrenom ? `${normalizedPrenom.charAt(0)}.${normalizedNom}` : normalizedNom;

      // Créer uniquement le User (pas d'employé)
      // Les données RH seront complétées dans le module RH
      const createdUser = await userApi.create({
        nom: formData.nom,
        prenom: formData.prenom,
        email: formData.email,
        telephone: formData.phone,
        password: formData.password,
        username: username,
        photoProfile: formData.photoProfile || undefined,
        typeCompte: 'employe', // Marqué comme employé potentiel
        canLogin: true,
        statut: StatutUser.ACTIVE,
        tempEntityId: tempUserIdRef.current,
      });

      // Attribuer le rôle via l'API userRoles si le user a été créé
      if (createdUser?.id && formData.role) {
        try {
          await fetch(`/api/users/${createdUser.id}/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              role: formData.role,
              agenceId: formData.agenceId || null,
              isPrimary: true,
            }),
          });
        } catch (roleError) {
          console.error('Erreur attribution rôle:', roleError);
        }
      }

      // Affecter à l'agence si spécifiée
      if (createdUser?.id && formData.agenceId) {
        try {
          await fetch(`/api/users/${createdUser.id}/agences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              agenceId: formData.agenceId,
              isPrimary: true,
            }),
          });
        } catch (agenceError) {
          console.error('Erreur affectation agence:', agenceError);
        }
      }

      toast.success(
        `Compte utilisateur ${formData.nom} ${formData.prenom} créé avec succès.\n` +
        `⚠️ Les informations RH (contrat, salaire, matricule) doivent être complétées dans le module Ressources Humaines.`,
        { duration: 6000 }
      );

      setFormData({
        nom: '',
        prenom: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        role: SystemRole.CAISSIER,
        agenceId: '',
        photoProfile: '',
      });
      setShowCreateForm(false);
      loadUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création'));
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, loadUsers]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.warning('La taille de l\'image ne doit pas dépasser 2 Mo');
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'profile');
      formData.append('entityType', 'user');
      formData.append('entityId', tempUserIdRef.current);

      const response = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload de l\'image');
      }

      const { key: objectPath } = await response.json();

      // Update State
      setFormData(prev => ({ ...prev, photoProfile: objectPath }));
      toast.success('Photo modifiée avec succès');
    } catch (error) {
      console.error(error);
      toast.error('Impossible de modifier la photo');
    } finally {
      setUploadingPhoto(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getDefaultAccessForRole = (role: string): Record<string, UserAccess> => {
    const defaults: Record<string, UserAccess> = {};
    const normalizedRole = normalizeRole(role);

    if (normalizedRole === SystemRole.CAISSIER) {
      defaults['Caisse'] = { module_name: 'Caisse', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: true, peut_exporter: false };
      defaults['Clients'] = { module_name: 'Clients', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Épargnes'] = { module_name: 'Épargnes', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Crédits'] = { module_name: 'Crédits', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: false };
    } else if (normalizedRole === SystemRole.AGENT_TERRAIN) {
      defaults['Clients'] = { module_name: 'Clients', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Crédits'] = { module_name: 'Crédits', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
      defaults['Tontines'] = { module_name: 'Tontines', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: false };
    } else if (normalizedRole === SystemRole.CHEF_AGENCE) {
      modules.forEach(mod => {
        defaults[mod] = { module_name: mod, peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: true, peut_exporter: true };
      });
    } else if (normalizedRole === SystemRole.COMPTABLE) {
      defaults['Comptabilité'] = { module_name: 'Comptabilité', peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: false, peut_valider: false, peut_exporter: true };
      defaults['Caisse'] = { module_name: 'Caisse', peut_voir: true, peut_creer: false, peut_modifier: false, peut_supprimer: false, peut_valider: false, peut_exporter: true };
    } else if (normalizedRole === SystemRole.ADMIN) {
      modules.forEach(mod => {
        defaults[mod] = { module_name: mod, peut_voir: true, peut_creer: true, peut_modifier: true, peut_supprimer: true, peut_valider: true, peut_exporter: true };
      });
    }

    return defaults;
  };

  const toggleUserStatus = useCallback(async (emp: any) => {
    const user = emp.user || emp;
    const isActive = user.statut === StatutUser.ACTIVE;
    const newStatus = isActive ? StatutUser.INACTIVE : StatutUser.ACTIVE;

    openConfirm({
      title: isActive ? 'Désactiver le profil ?' : 'Activer le profil ?',
      message: isActive 
        ? `Êtes-vous sûr de vouloir désactiver le profil de ${user.nom} ${user.prenom} ? L'utilisateur ne pourra plus se connecter.`
        : `Voulez-vous réactiver le profil de ${user.nom} ${user.prenom} ?`,
      variant: isActive ? 'warning' : 'info',
      confirmText: isActive ? 'Désactiver' : 'Activer',
      onConfirm: async () => {
        try {
          await userApi.update(user.id, { statut: newStatus });
          toast.success(`Profil ${newStatus === StatutUser.ACTIVE ? 'activé' : 'désactivé'} avec succès`);
          loadUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors du changement de statut'));
        }
      },
    });
  }, [openConfirm, loadUsers]);

  const deleteUser = useCallback((emp: any) => {
    const user = emp.user || emp;
    openConfirm({
      title: 'Supprimer ce profil ?',
      message: `Êtes-vous sûr de vouloir supprimer ${user.nom} ${user.prenom} ? Cette action est irréversible.`,
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          // Utiliser employeApi.delete si c'est un employé pour un soft delete propre
          if (emp.id && emp.userId) {
            await employeApi.delete(emp.id);
          } else {
            await userApi.delete(user.id);
          }
          toast.success('Profil supprimé avec succès');
          loadUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  }, [openConfirm, loadUsers]);

  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const openPermissionsModal = useCallback((emp: any) => {
    const user = emp.user || emp;
    setSelectedUser(user);
    setShowPermissionsModal(true);
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(emp => {
      const user = emp.user || emp;
      const fullName = `${user.nom} ${user.prenom}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const phone = (user.telephone || user.phone || '').toLowerCase();
      // Architecture V3: utiliser user.role depuis userRoles
      const userRole = normalizeRole(user.role);

      const matchesSearch = fullName.includes(searchQuery.toLowerCase()) ||
                          email.includes(searchQuery.toLowerCase()) ||
                          phone.includes(searchQuery.toLowerCase());

      const matchesRole =
        roleFilter === 'all' ||
        (userRole ? userRole === roleFilter : false);

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

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
    <div className="h-full flex flex-col space-y-2">
      <Card variant="default" padding="none" className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Mobile-First Header */}
        <div className="p-4 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Personnel</h2>
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
                    nom: '', prenom: '', email: '', phone: '', password: '', confirmPassword: '', role: SystemRole.CAISSIER,
                    agenceId: (contextAgence && contextAgence.id !== 'all') ? contextAgence.id : '',
                    photoProfile: '',
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
              onChange={(e) => setRoleFilter(e.target.value as SystemRole | 'all')}
              className="px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary text-sm focus:border-primary outline-none"
            >
              <option value="all">Tous les rôles</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-content-muted text-sm mt-3">Chargement du personnel...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <Users size={48} className="opacity-20 mb-4" />
            <p className="text-sm">Aucun membre trouvé</p>
          </div>
        ) : (
          <>
            {/* Scrollable Table Container */}
            <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
              <ResponsiveTable
                data={paginatedUsers}
                columns={[
                  {
                    key: 'identity',
                    label: 'Identité',
                    primary: true,
                    format: (_, emp) => {
                      const user = emp.user || emp;
                      return (
                        <div className="flex items-center gap-3 py-1">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shrink-0 overflow-hidden">
                            {user.photoProfile ? (
                              <img
                                src={resolveStorageUrl(user.photoProfile)}
                                alt={`${user.nom} ${user.prenom}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs sm:text-sm font-bold text-primary max-w-full truncate px-1">
                                {getInitials(user.nom, user.prenom)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-content-primary truncate max-w-[140px] sm:max-w-xs">{user.nom} {user.prenom}</p>
                            <p className="text-[10px] text-content-muted truncate">{user.email}</p>
                          </div>
                        </div>
                      );
                    }
                  },
                  {
                    key: 'agence',
                    label: 'Agence',
                    format: (_, emp) => {
                      if (!emp.agenceId) return <span className="text-content-muted text-[10px]">Aucune</span>;
                      const agence = availableAgences.find(a => a.id === emp.agenceId);
                      return (
                        <span className="text-xs font-medium text-content-secondary">
                          {agence ? agence.nom : 'Inconnue'}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'roleSystem',
                    label: 'Rôle',
                    format: (_role, emp) => {
                      // Utiliser user.role depuis userRoles (Architecture V3)
                      const userRole = emp.user?.role;
                      const style = getRoleBadgeStyle(userRole);
                      return (
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap w-[160px] text-center transition-colors ${style.classes}`}>
                          {style.label}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'status',
                    label: 'Statut',
                    format: (_, emp) => {
                      const status = emp.user ? emp.user.statut : emp.statut;
                      const style = getStatusBadgeStyle(status);
                      const isActif = status === StatutUser.ACTIVE;
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border min-w-[90px] justify-center transition-colors ${style.classes}`}>
                          {isActif ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {style.label}
                        </span>
                      );
                    }
                  }
                ]}
                actions={(emp) => {
                  const user = emp.user || emp;
                  const isActive = user.statut === StatutUser.ACTIVE;
                  return (
                    <div className="flex items-center gap-1">
                      {canEditUsers && (
                        <IconButton
                          icon={isActive ? XCircle : CheckCircle}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); toggleUserStatus(emp); }}
                          className={isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-success hover:bg-success/10'}
                          title={isActive ? 'Désactiver' : 'Activer'}
                          aria-label={isActive ? 'Désactiver' : 'Activer'}
                        />
                      )}
                      {canManageUsers && (
                        <IconButton
                          icon={Shield}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openPermissionsModal(emp); }}
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
                          onClick={(e) => { e.stopPropagation(); deleteUser(emp); }}
                          className="text-red-400 hover:bg-red-500/10"
                          title="Supprimer"
                          aria-label="Supprimer le profil"
                        />
                      )}
                    </div>
                  );
                }}
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

              {/* Photo Section - Centered & Professional */}
              <div className="flex flex-col items-center justify-center -mt-2 mb-6">
                <div className="relative group">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-surface-muted overflow-hidden shadow-lg bg-surface-muted flex items-center justify-center relative">
                    {uploadingPhoto ? (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      </div>
                    ) : null}
                    
                    {formData.photoProfile ? (
                      <img
                        src={resolveStorageUrl(formData.photoProfile)}
                        alt="Profil"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={40} className="text-content-muted opacity-50" />
                    )}
                  </div>
                  
                  {/* Overlay Actions */}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 flex justify-center gap-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200 rounded-b-full z-20">
                    <button 
                         type="button"
                         onClick={() => fileInputRef.current?.click()}
                         className="text-white hover:text-primary transition-colors p-1 flex items-center justify-center"
                         title="Changer la photo"
                         disabled={uploadingPhoto}
                       >
                         <Upload size={16} />
                    </button>

                    {formData.photoProfile && (
                       <button 
                         type="button"
                         onClick={() => setFormData({ ...formData, photoProfile: '' })}
                         className="text-white hover:text-red-400 transition-colors p-1 flex items-center justify-center"
                         title="Supprimer la photo"
                       >
                         <Trash2 size={16} />
                       </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                  />
                </div>
                <p className="text-[10px] text-content-muted mt-2">Format recommandé: carré, max 2Mo</p>
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
                    onChange={(e) => setFormData({...formData, role: e.target.value as SystemRole})}
                    className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-content-secondary">Agence d'affectation</label>
                <select
                  value={formData.agenceId}
                  onChange={(e) => setFormData({...formData, agenceId: e.target.value})}
                  className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                >
                  <option value="">-- Sélectionner une agence --</option>
                  {availableAgences.map(agence => (
                    <option key={agence.id} value={agence.id}>{agence.nom}</option>
                  ))}
                </select>
                <p className="text-[10px] text-content-muted">L'employé sera rattaché à cette agence pour ses opérations.</p>
              </div>

              {/* Note: Agent Terrain config et données RH seront gérées dans le module RH */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Les données RH (salaire, contrat, matricule) seront à compléter dans le module <strong>Ressources Humaines</strong>.</span>
                </p>
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
                    className={`w-full px-3 py-2 bg-surface-muted border rounded-lg text-sm text-content-primary outline-none focus:ring-1 ${
                      formData.confirmPassword && !passwordValidation.match ? 'border-red-500 focus:ring-red-500' : 'border-edge focus:border-primary focus:ring-primary'
                    }`}
                    required
                  />
                  {formData.confirmPassword && !passwordValidation.match && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                      <XCircle size={10} /> Les mots de passe ne correspondent pas
                    </p>
                  )}
                </div>
              </div>

              {/* Politique de sécurité */}
              <div className="bg-surface-muted/50 rounded-lg p-3 space-y-2 border border-edge/50">
                <p className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Politique de sécurité</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`flex items-center gap-1.5 text-[10px] ${passwordValidation.length ? 'text-success' : 'text-content-muted'}`}>
                    {passwordValidation.length ? <CheckCircle size={10} /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                    <span>Min. 8 caractères</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] ${passwordValidation.uppercase ? 'text-success' : 'text-content-muted'}`}>
                    {passwordValidation.uppercase ? <CheckCircle size={10} /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                    <span>Une majuscule</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] ${passwordValidation.number ? 'text-success' : 'text-content-muted'}`}>
                    {passwordValidation.number ? <CheckCircle size={10} /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                    <span>Un chiffre</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] ${passwordValidation.special ? 'text-success' : 'text-content-muted'}`}>
                    {passwordValidation.special ? <CheckCircle size={10} /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                    <span>Caractère spécial (@$!%*?&)</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreateForm(false)}>
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  className="flex-1"
                  disabled={isSubmitting || !isFormValid}
                  icon={isSubmitting ? undefined : Plus}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Création...</span>
                    </div>
                  ) : (
                    'Créer Profil'
                  )}
                </Button>
              </div>
            </form>
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
      {/* Permissions Modal - Embedded Manager */}
      {showPermissionsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Permissions Spécifiques</h3>
                <p className="text-xs text-content-muted">Gérer les exceptions pour {selectedUser.prenom} {selectedUser.nom}</p>
              </div>
              <button 
                onClick={() => setShowPermissionsModal(false)}
                className="text-content-muted hover:text-content-primary p-1 rounded-lg hover:bg-surface-muted transition-colors"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
               <UserCustomPermissionsManager
                users={[selectedUser]} // Pass only selected user content context
                permissions={adminPermissions}
                selectedUserId={selectedUser.id}
                onUserChange={(id) => { /* No-op, locked to selected user */ }}
                preselectedUserId={selectedUser.id}
                userPermissions={userPermissions}
                getUserDisplayName={() => `${selectedUser.nom} ${selectedUser.prenom}`}
                getUserPermissionStatus={getUserPermissionStatus}
                toggleUserPermission={handleToggleUserPermission}
                onActivateAll={async () => { await activateAllPermissions(selectedUser.id, adminPermissions); }}
                onBlockAll={async () => { await blockAllPermissions(selectedUser.id, adminPermissions); }}
                onResetPermissions={async () => { await resetPermissions(selectedUser.id); }}
                activePermissionsCount={countActivePermissions()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
