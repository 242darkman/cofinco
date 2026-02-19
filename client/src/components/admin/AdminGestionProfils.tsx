import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Edit2, Trash2, Lock, Unlock, Eye, EyeOff, Shield, CheckCircle, XCircle, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Upload, Image as ImageIcon, Loader2, User, Briefcase, Check, Save, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import CreateClientModal from '../client/CreateClientModal';

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
  const [createStep, setCreateStep] = useState(1);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userAccess, setUserAccess] = useState<Record<string, UserAccess>>({});
  const [allUsersAccess, setAllUsersAccess] = useState<Record<string, Record<string, UserAccess>>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<SystemRole | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [permissionFilter, setPermissionFilter] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [convertToClientUser, setConvertToClientUser] = useState<any>(null);
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
    roles: [] as SystemRole[],
    agenceId: '',
    photoProfile: '',
  });

  // Defensive: ensure roles is always an array (HMR may preserve stale state)
  const selectedRoles: SystemRole[] = Array.isArray(formData.roles) ? formData.roles : [];

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

  const isCreateStepValid = (s: number): boolean => {
    switch (s) {
      case 1:
        return formData.nom.trim().length > 0
          && formData.prenom.trim().length > 0
          && formData.email.trim().length > 0
          && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
      case 2:
        return selectedRoles.length > 0;
      case 3:
        return !!(isPasswordSecure && passwordValidation.match);
      default:
        return true;
    }
  };

  const isFormValid = isCreateStepValid(1) && isCreateStepValid(2) && isCreateStepValid(3);

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

  const handleCreateUser = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

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

      // Attribuer les rôles via l'API userRoles si le user a été créé
      if (createdUser?.id && selectedRoles.length > 0) {
        for (let i = 0; i < selectedRoles.length; i++) {
          try {
            await fetch(`/api/users/${createdUser.id}/roles`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                role: selectedRoles[i],
                agenceId: formData.agenceId || null,
                isPrimary: i === 0,
              }),
            });
          } catch (roleError) {
            console.error('Erreur attribution rôle:', roleError);
          }
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

      // Show success animation then auto-close
      setShowCreateSuccess(true);
      toast.success(
        `Compte utilisateur ${formData.nom} ${formData.prenom} créé`,
        { duration: 4000 }
      );

      setTimeout(() => {
        setShowCreateSuccess(false);
        setCreateStep(1);
        setFormData({
          nom: '',
          prenom: '',
          email: '',
          phone: '',
          password: '',
          confirmPassword: '',
          roles: [],
          agenceId: '',
          photoProfile: '',
        });
        setShowCreateForm(false);
        loadUsers();
      }, 2000);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création du profil'));
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
      toast.success('Photo modifiée');
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
          toast.success(`Profil ${newStatus === StatutUser.ACTIVE ? 'activé' : 'désactivé'}`);
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
          toast.success('Profil supprimé');
          loadUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression du profil'));
        }
      },
    });
  }, [openConfirm, loadUsers]);

  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Role management modal
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [rolesModalUser, setRolesModalUser] = useState<any>(null);
  const [userCurrentRoles, setUserCurrentRoles] = useState<Array<{ id: string; role: string; agenceId: string | null; isPrimary: boolean }>>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const openPermissionsModal = useCallback((emp: any) => {
    const user = emp.user || emp;
    setSelectedUser(user);
    setShowPermissionsModal(true);
  }, []);

  const fetchUserRoles = useCallback(async (userId: string) => {
    setLoadingRoles(true);
    try {
      const res = await fetch(`/api/users/${userId}/roles`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserCurrentRoles(data);
      }
    } catch (err) {
      console.error('Erreur chargement rôles:', err);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const openRolesModal = useCallback((emp: any) => {
    const user = emp.user || emp;
    setRolesModalUser({ ...user, empAgenceId: emp.agenceId });
    setShowRolesModal(true);
    fetchUserRoles(user.id);
  }, [fetchUserRoles]);

  const addRoleToUser = useCallback(async (role: SystemRole) => {
    if (!rolesModalUser) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/users/${rolesModalUser.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role,
          agenceId: rolesModalUser.empAgenceId || null,
          isPrimary: userCurrentRoles.length === 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erreur ajout rôle');
      } else {
        toast.success(`Rôle ajouté`);
        await fetchUserRoles(rolesModalUser.id);
        loadUsers();
      }
    } catch (err) {
      toast.error('Erreur ajout rôle');
    } finally {
      setSavingRole(false);
    }
  }, [rolesModalUser, userCurrentRoles, fetchUserRoles, loadUsers]);

  const removeRoleFromUser = useCallback(async (roleId: string) => {
    if (!rolesModalUser) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/users/${rolesModalUser.id}/roles/${roleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erreur retrait rôle');
      } else {
        toast.success(`Rôle retiré`);
        await fetchUserRoles(rolesModalUser.id);
        loadUsers();
      }
    } catch (err) {
      toast.error('Erreur retrait rôle');
    } finally {
      setSavingRole(false);
    }
  }, [rolesModalUser, fetchUserRoles, loadUsers]);

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
        <div className="p-2 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-status-info-bg rounded-lg flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-status-info" />
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
                    nom: '', prenom: '', email: '', phone: '', password: '', confirmPassword: '',
                    roles: [],
                    agenceId: (contextAgence && contextAgence.id !== 'all') ? contextAgence.id : '',
                    photoProfile: '',
                  });
                  setCreateStep(1);
                  setShowCreateSuccess(false);
                  setShowCreateForm(true);
                }}
                className="w-full sm:w-auto justify-center shadow-lg shadow-primary/20"
              >
                Nouveau
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
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
                        <div className="flex items-center gap-2 py-0.5">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shrink-0 overflow-hidden">
                            {user.photoProfile ? (
                              <img
                                src={resolveStorageUrl(user.photoProfile)}
                                alt={`${user.nom} ${user.prenom}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-primary max-w-full truncate px-1">
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
                          icon={Edit2}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openRolesModal(emp); }}
                          className="text-accent hover:bg-accent/10"
                          title="Gérer les rôles"
                          aria-label="Gérer les rôles"
                        />
                      )}
                      {canEditUsers && (
                        <IconButton
                          icon={isActive ? XCircle : CheckCircle}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); toggleUserStatus(emp); }}
                          className={isActive ? 'text-status-warning hover:bg-status-warning-bg' : 'text-success hover:bg-success/10'}
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
                          className="text-status-info hover:bg-status-info-bg"
                          title="Permissions"
                          aria-label="Gérer les permissions"
                        />
                      )}
                      {canEditUsers && (user.typeCompte === 'employe') && (
                        <IconButton
                          icon={CreditCard}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setConvertToClientUser(emp); }}
                          className="text-status-success hover:bg-status-success-bg"
                          title="Convertir en client"
                          aria-label="Convertir en client"
                        />
                      )}
                      {canDeleteUsers && (
                        <IconButton
                          icon={Trash2}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); deleteUser(emp); }}
                          className="text-status-danger hover:bg-status-danger-bg"
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
                  <option value={7}>7 / page</option>
                  <option value={8}>8 / page</option>
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
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
                            ? 'bg-primary text-content-primary'
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

      {/* Create User Modal - Stepper Wizard */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl sm:rounded-2xl border border-edge w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">

            {/* HEADER — Title + Stepper */}
            <div className="bg-surface-base border-b border-edge px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
              <div className="flex justify-between items-center mb-4 sm:mb-5">
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Nouveau Profil</h2>
                <button
                  onClick={() => { setShowCreateForm(false); setCreateStep(1); setShowCreateSuccess(false); }}
                  className="p-1 text-content-muted hover:text-content-primary transition-colors"
                >
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              {/* Progress Steps */}
              <div className="flex justify-between relative px-2 sm:px-8">
                <div className="absolute top-1/2 left-2 right-2 sm:left-8 sm:right-8 h-0.5 bg-surface -z-0" />
                <CreateStepItem num={1} icon={User} label="Identité" current={createStep} />
                <CreateStepItem num={2} icon={Briefcase} label="Affectation" current={createStep} />
                <CreateStepItem num={3} icon={Shield} label="Sécurité" current={createStep} />
              </div>
            </div>

            {/* BODY — Step Content or Success */}
            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              <AnimatePresence mode="wait">
                {showCreateSuccess ? (
                  <motion.div
                    key="success"
                    className="py-12 sm:py-16 flex flex-col items-center justify-center relative"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <CreateSuccessParticles />
                    <CreateAnimatedCheckmark />
                    <motion.p
                      className="mt-6 text-lg font-bold text-status-success"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      Profil créé
                    </motion.p>
                    <motion.p
                      className="mt-1.5 text-sm text-content-muted text-center px-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                    >
                      {formData.prenom} {formData.nom} peut maintenant se connecter
                    </motion.p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`step-${createStep}`}
                    className="p-4 sm:p-6 space-y-5"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                  >
                    {/* STEP 1 — Identité */}
                    {createStep === 1 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                            <User size={14} className="text-accent" />
                          </div>
                          <h4 className="text-sm font-bold text-content-primary">Informations Personnelles</h4>
                        </div>

                        {/* Photo */}
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative group">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-surface-muted overflow-hidden shadow-lg bg-surface-muted flex items-center justify-center relative">
                              {uploadingPhoto && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                                </div>
                              )}
                              {formData.photoProfile ? (
                                <img src={resolveStorageUrl(formData.photoProfile)} alt="Profil" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={32} className="text-content-muted opacity-50" />
                              )}
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 flex justify-center gap-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200 rounded-b-full z-20">
                              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-content-primary hover:text-accent transition-colors p-1" title="Changer la photo" disabled={uploadingPhoto}>
                                <Upload size={14} />
                              </button>
                              {formData.photoProfile && (
                                <button type="button" onClick={() => setFormData({ ...formData, photoProfile: '' })} className="text-content-primary hover:text-status-danger transition-colors p-1" title="Supprimer">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleFileUpload} />
                          </div>
                          <p className="text-[10px] text-content-muted mt-2">Photo optionnelle (max 2Mo)</p>
                        </div>

                        {/* Nom / Prénom */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Nom <span className="text-status-danger">*</span></label>
                            <input
                              type="text"
                              value={formData.nom}
                              onChange={(e) => setFormData({...formData, nom: e.target.value})}
                              placeholder="Ex: Mbemba"
                              className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Prénom <span className="text-status-danger">*</span></label>
                            <input
                              type="text"
                              value={formData.prenom}
                              onChange={(e) => setFormData({...formData, prenom: e.target.value})}
                              placeholder="Ex: Patrick"
                              className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Email / Téléphone */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Email <span className="text-status-danger">*</span></label>
                            <input
                              type="email"
                              value={formData.email}
                              onChange={(e) => setFormData({...formData, email: e.target.value})}
                              placeholder="email@exemple.com"
                              className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Téléphone</label>
                            <input
                              type="tel"
                              value={formData.phone}
                              onChange={(e) => setFormData({...formData, phone: e.target.value})}
                              placeholder="06 000 0000"
                              className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 2 — Affectation */}
                    {createStep === 2 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                            <Briefcase size={14} className="text-accent" />
                          </div>
                          <h4 className="text-sm font-bold text-content-primary">Rôle & Affectation</h4>
                        </div>

                        {/* Role Chips */}
                        <div className="space-y-2">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                            Rôle{selectedRoles.length > 1 ? 's' : ''} <span className="text-status-danger">*</span>
                            {selectedRoles.length > 0 && (
                              <span className="ml-1.5 text-[10px] font-normal text-accent normal-case">
                                {selectedRoles.length} sélectionné{selectedRoles.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {roles.map((role) => {
                              const isSelected = selectedRoles.includes(role.value);
                              const badge = getRoleBadgeStyle(role.value);
                              return (
                                <button
                                  key={role.value}
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => {
                                      const current = Array.isArray(prev.roles) ? prev.roles : [];
                                      return {
                                        ...prev,
                                        roles: isSelected
                                          ? current.filter(r => r !== role.value)
                                          : [...current, role.value],
                                      };
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                    isSelected
                                      ? `${badge.classes} ring-1 ring-current/20 shadow-sm scale-[1.02]`
                                      : 'bg-surface-muted border-edge text-content-muted hover:border-content-muted hover:text-content-secondary'
                                  }`}
                                >
                                  {isSelected && <CheckCircle size={13} />}
                                  {role.label}
                                </button>
                              );
                            })}
                          </div>
                          {selectedRoles.length === 0 && (
                            <p className="text-[10px] text-status-danger mt-0.5">Sélectionnez au moins un rôle</p>
                          )}
                          {selectedRoles.length > 0 && (
                            <p className="text-[10px] text-content-muted">Le premier rôle sélectionné sera le rôle principal.</p>
                          )}
                        </div>

                        {/* Separator */}
                        <div className="border-t border-edge/50" />

                        {/* Agence */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Agence d'affectation</label>
                          <select
                            value={formData.agenceId}
                            onChange={(e) => setFormData({...formData, agenceId: e.target.value})}
                            className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary focus:ring-2 focus:ring-accent outline-none appearance-none cursor-pointer"
                          >
                            <option value="">-- Sélectionner une agence --</option>
                            {availableAgences.map(agence => (
                              <option key={agence.id} value={agence.id}>{agence.nom}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-content-muted">L'employé sera rattaché à cette agence pour ses opérations.</p>
                        </div>

                        {/* RH Warning */}
                        <div className="p-3 bg-status-warning-bg border border-status-warning/30 rounded-xl">
                          <p className="text-xs text-status-warning flex items-start gap-2">
                            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>Les données RH (salaire, contrat, matricule) seront à compléter dans le module <strong>Ressources Humaines</strong>.</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* STEP 3 — Sécurité */}
                    {createStep === 3 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                            <Shield size={14} className="text-accent" />
                          </div>
                          <h4 className="text-sm font-bold text-content-primary">Mot de Passe & Sécurité</h4>
                        </div>

                        {/* Password fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Mot de passe <span className="text-status-danger">*</span></label>
                            <input
                              type="password"
                              value={formData.password}
                              onChange={(e) => setFormData({...formData, password: e.target.value})}
                              placeholder="Min. 8 caractères"
                              className="w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Confirmer <span className="text-status-danger">*</span></label>
                            <input
                              type="password"
                              value={formData.confirmPassword}
                              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                              placeholder="Retapez le mot de passe"
                              className={`w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border rounded-xl text-sm text-content-primary placeholder:text-content-muted outline-none transition-all focus:ring-2 ${
                                formData.confirmPassword && !passwordValidation.match
                                  ? 'border-status-danger focus:ring-status-danger'
                                  : 'border-edge focus:ring-accent focus:border-accent'
                              }`}
                            />
                            {formData.confirmPassword && !passwordValidation.match && (
                              <p className="text-[10px] text-status-danger mt-1 flex items-center gap-1">
                                <XCircle size={10} /> Les mots de passe ne correspondent pas
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Password Policy */}
                        <div className="bg-surface-muted/50 rounded-xl p-3 sm:p-4 space-y-2.5 border border-edge/50">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Politique de sécurité</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { check: passwordValidation.length, label: 'Min. 8 caractères' },
                              { check: passwordValidation.uppercase, label: 'Une majuscule' },
                              { check: passwordValidation.number, label: 'Un chiffre' },
                              { check: passwordValidation.special, label: 'Caractère spécial (@$!%*?&)' },
                            ].map((item) => (
                              <div key={item.label} className={`flex items-center gap-1.5 text-[10px] sm:text-[11px] ${item.check ? 'text-status-success' : 'text-content-muted'}`}>
                                {item.check ? <CheckCircle size={11} /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                                <span>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recap Card */}
                        <div className="bg-surface-muted/30 border border-edge/50 rounded-xl p-3 sm:p-4 space-y-2.5">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Récapitulatif</p>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-content-muted">Nom complet</span>
                              <span className="text-content-primary font-medium">{formData.prenom} {formData.nom}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-content-muted">Email</span>
                              <span className="text-content-primary font-medium truncate ml-4">{formData.email}</span>
                            </div>
                            {formData.phone && (
                              <div className="flex justify-between items-center">
                                <span className="text-content-muted">Téléphone</span>
                                <span className="text-content-primary">{formData.phone}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-start">
                              <span className="text-content-muted mt-0.5">Rôle{selectedRoles.length > 1 ? 's' : ''}</span>
                              <div className="flex flex-wrap justify-end gap-1 ml-4">
                                {selectedRoles.map(r => {
                                  const badge = getRoleBadgeStyle(r);
                                  const roleLabel = roles.find(rl => rl.value === r)?.label || r;
                                  return <span key={r} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${badge.classes}`}>{roleLabel}</span>;
                                })}
                              </div>
                            </div>
                            {formData.agenceId && (
                              <div className="flex justify-between items-center">
                                <span className="text-content-muted">Agence</span>
                                <span className="text-content-primary font-medium">{availableAgences.find(a => a.id === formData.agenceId)?.nom}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* FOOTER — Navigation (hidden during success) */}
            {!showCreateSuccess && (
              <div className="p-3 sm:p-4 bg-surface-base border-t border-edge flex justify-between items-center flex-shrink-0">
                {/* Previous */}
                <button
                  type="button"
                  onClick={() => createStep > 1 && setCreateStep(createStep - 1)}
                  className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl border border-edge text-content-secondary hover:text-content-primary hover:bg-surface transition-colors flex items-center gap-1.5 text-sm ${
                    createStep === 1 ? 'invisible' : ''
                  }`}
                >
                  <ChevronLeft size={16} /> <span className="hidden sm:inline">Précédent</span><span className="sm:hidden">Retour</span>
                </button>

                {/* Right side: Cancel + Next/Create */}
                <div className="flex gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setCreateStep(1); setShowCreateSuccess(false); }}
                    className="px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-content-muted hover:text-content-primary hover:bg-surface transition-colors text-sm font-medium"
                  >
                    Annuler
                  </button>

                  {createStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => isCreateStepValid(createStep) && setCreateStep(createStep + 1)}
                      disabled={!isCreateStepValid(createStep)}
                      className={`px-5 sm:px-7 py-2 sm:py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-lg text-sm ${
                        isCreateStepValid(createStep)
                          ? 'bg-accent text-white shadow-accent/20 hover:shadow-accent/30'
                          : 'bg-surface-elevated text-content-muted cursor-not-allowed shadow-none'
                      }`}
                    >
                      Suivant <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateUser()}
                      disabled={isSubmitting || !isFormValid}
                      className={`px-5 sm:px-7 py-2 sm:py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-lg text-sm ${
                        isFormValid && !isSubmitting
                          ? 'bg-status-success text-white shadow-status-success/20 hover:shadow-status-success/30'
                          : 'bg-surface-elevated text-content-muted cursor-not-allowed shadow-none'
                      } ${isSubmitting ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      {isSubmitting ? (
                        <><Loader2 size={16} className="animate-spin" /> Création...</>
                      ) : (
                        <><Save size={16} /> Créer Profil</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

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
      {/* Role Management Modal */}
      {showRolesModal && rolesModalUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Gestion des Rôles</h3>
                <p className="text-xs text-content-muted">
                  {rolesModalUser.prenom} {rolesModalUser.nom}
                  {!loadingRoles && (
                    <span className="ml-1.5">
                      — {userCurrentRoles.length} rôle{userCurrentRoles.length > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowRolesModal(false)}
                className="text-content-muted hover:text-content-primary p-1 rounded-lg hover:bg-surface-muted transition-colors"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {loadingRoles ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span className="text-xs text-content-muted">Chargement des rôles...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-content-secondary">Cliquez pour activer ou retirer un rôle</label>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => {
                      const existing = userCurrentRoles.find(ur => ur.role === role.value);
                      const isSelected = !!existing;
                      const badge = getRoleBadgeStyle(role.value);
                      return (
                        <button
                          key={role.value}
                          type="button"
                          disabled={savingRole}
                          onClick={() => {
                            if (isSelected) {
                              removeRoleFromUser(existing!.id);
                            } else {
                              addRoleToUser(role.value);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${
                            isSelected
                              ? `${badge.classes} ring-1 ring-current/20 shadow-sm`
                              : 'bg-surface-muted border-edge text-content-muted hover:border-content-muted hover:text-content-secondary'
                          }`}
                        >
                          {isSelected && <CheckCircle size={12} />}
                          {role.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-edge">
              <Button
                variant="secondary"
                onClick={() => setShowRolesModal(false)}
                className="w-full"
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Convert Employee to Client Modal */}
      {convertToClientUser && (
        <CreateClientModal
          isOpen={!!convertToClientUser}
          onClose={() => setConvertToClientUser(null)}
          onSave={async () => {
            toast.success('Profil client créé');
            setConvertToClientUser(null);
            loadUsers();
          }}
          fromEmployee={{
            userId: convertToClientUser.user?.id || convertToClientUser.userId,
            nom: convertToClientUser.user?.nom || convertToClientUser.nom || '',
            prenom: convertToClientUser.user?.prenom || convertToClientUser.prenom || '',
            email: convertToClientUser.user?.email || convertToClientUser.email || null,
            telephone: convertToClientUser.user?.telephone || convertToClientUser.phone || null,
            sexe: (convertToClientUser.user?.sexe || convertToClientUser.sexe || null) as 'M' | 'F' | null,
            dateNaissance: convertToClientUser.user?.dateNaissance || convertToClientUser.dateNaissance || null,
            adresse: convertToClientUser.user?.adresse || convertToClientUser.adresse || null,
            ville: convertToClientUser.user?.ville || convertToClientUser.ville || null,
            agenceId: convertToClientUser.agenceId || null,
          }}
        />
      )}
    </div>
  );
}

// --- Stepper Sub-Components ---

function CreateStepItem({ num, icon: Icon, label, current }: { num: number; icon: React.ElementType; label: string; current: number }) {
  const active = current >= num;
  const isCurrent = current === num;
  return (
    <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-2 w-14 sm:w-20">
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
        active
          ? 'bg-accent text-white shadow-lg shadow-accent/30'
          : 'bg-surface text-content-muted border border-edge'
      } ${isCurrent ? 'ring-2 sm:ring-4 ring-accent/20 scale-105 sm:scale-110' : ''}`}>
        <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
      </div>
      <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-center leading-tight ${
        active ? 'text-content-primary' : 'text-content-muted'
      }`}>{label}</span>
    </div>
  );
}

function CreateSuccessParticles() {
  const particles = React.useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.4,
      size: 4 + Math.random() * 8,
      color: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#14b8a6', '#5eead4'][Math.floor(Math.random() * 6)],
    }))
  , []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: '50%', width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ y: 0, opacity: 1, scale: 0 }}
          animate={{ y: [-20, -150 - Math.random() * 100], x: [0, (Math.random() - 0.5) * 100], opacity: [1, 1, 0], scale: [0, 1, 0.5], rotate: [0, 360] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function CreateAnimatedCheckmark() {
  return (
    <motion.div className="relative flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
      <motion.div className="absolute w-24 h-24 rounded-full bg-status-success-bg" initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 1] }} transition={{ duration: 0.6 }} />
      <motion.div className="absolute w-20 h-20 rounded-full bg-status-success/30" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.5, delay: 0.1 }} />
      <motion.div
        className="w-16 h-16 rounded-full bg-gradient-to-br from-status-success to-status-success flex items-center justify-center shadow-lg shadow-status-success/50"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <motion.div initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Check className="w-8 h-8 text-white" strokeWidth={3} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
