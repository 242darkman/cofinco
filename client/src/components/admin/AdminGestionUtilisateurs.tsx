import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Edit2, Trash2, Search, CheckCircle, XCircle, KeyRound, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button, IconButton, Card, ResponsiveTable } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import UserFormModal from './users/UserFormModal';
import UserPinModal from './users/UserPinModal';
import { ProtectedFeature, usePermissions } from '../auth/ProtectedFeature';
import { getRoleBadgeStyle, getStatusBadgeStyle } from '../../lib/role-utils';
import { userApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { resolveStorageUrl } from '../../lib/format';
import { StatutUser } from '@shared/enum/status-constants';
import { SystemRole } from '@shared/types/roles';

interface User {
  id: string;
  username: string;
  nom?: string;
  prenom?: string;
  name?: string;
  email?: string;
  telephone?: string;
  phone?: string;
  role: SystemRole | string;
  statut: string;
  photoProfile?: string;
  photo_profile?: string;
  createdAt?: string;
  created_at?: string;
}

export default function AdminGestionUtilisateurs() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pinUser, setPinUser] = useState<User | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateUsers = hasPermission('users', 'create');
  const canEditUsers = hasPermission('users', 'edit');
  const canDeleteUsers = hasPermission('users', 'delete');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

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

  useEffect(() => {
    loadUsers();
  }, []);

  const getDisplayName = (user: User) => {
    const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
    return fullName || user.name || user.username || 'Utilisateur';
  };

  const getPhotoUrl = (user: User) => {
    const raw = user.photoProfile || '';
    return resolveStorageUrl(raw);
  };

  const handleFormSubmit = useCallback(async (formData: any) => {
    try {
      if (editingUser) {
        await userApi.update(editingUser.id, formData);
        toast.success('Utilisateur modifié avec succès');
      } else {
        await userApi.create(formData);
        toast.success('Utilisateur créé avec succès');
      }
      loadUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'enregistrement'));
      throw error;
    }
  }, [editingUser, loadUsers]);

  const handleDelete = useCallback((id: string) => {
    openConfirm({
      title: 'Supprimer cet utilisateur ?',
      message: 'Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cet utilisateur ?',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await userApi.delete(id);
          toast.success('Utilisateur supprimé avec succès');
          loadUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  }, [openConfirm, loadUsers]);

  const toggleStatus = useCallback(async (user: User) => {
    const isActive = user.statut === StatutUser.ACTIVE;
    const newStatus = isActive ? StatutUser.INACTIVE : StatutUser.ACTIVE;
    try {
      await userApi.update(user.id, { statut: newStatus });
      toast.success(`Utilisateur ${newStatus === StatutUser.ACTIVE ? 'activé' : 'désactivé'}`);
      loadUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la modification du statut'));
    }
  }, [loadUsers]);

  const searchQuery = searchTerm.toLowerCase();
  const filteredUsers = users.filter(Boolean).filter((user) => {
    const name = String(getDisplayName(user) || '').toLowerCase();
    const username = String(user.username || '').toLowerCase();
    return name.includes(searchQuery) || username.includes(searchQuery);
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Utilisateurs</h2>
                <p className="text-xs sm:text-sm text-content-muted">Gestion des comptes ({filteredUsers.length})</p>
              </div>
            </div>
            {/* Button removed to prevent incomplete account creation. Use Profils/Personnel page instead. */}
          </div>

          {/* Search Bar */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher (nom, rôle...)"
              className="w-full pl-10 pr-4 py-2 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-content-muted text-sm mt-3">Chargement des utilisateurs...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <Users size={48} className="opacity-20 mb-4" />
            <p className="text-sm">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <>
            {/* Scrollable Table Container */}
            <div className="overflow-auto max-h-[400px] custom-scrollbar">
              <ResponsiveTable
                data={paginatedUsers}
                columns={[
                  {
                    key: 'user_info',
                    label: 'Utilisateur',
                    primary: true,
                    format: (_: any, user: User) => (
                      <div className="flex items-center gap-3 py-1">
                        {getPhotoUrl(user) ? (
                          <img src={getPhotoUrl(user)} alt={getDisplayName(user)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-edge shadow-sm" />
                        ) : (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-surface-muted rounded-full flex items-center justify-center border border-edge">
                            <Users size={18} className="text-content-muted" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content-primary truncate max-w-[120px] sm:max-w-xs">{getDisplayName(user)}</p>
                          <p className="text-[10px] text-content-muted truncate">@{user.username}</p>
                        </div>
                      </div>
                    )
                  },
                  {
                    key: 'role',
                    label: 'Rôle',
                    format: (role: string) => {
                      const style = getRoleBadgeStyle(role);
                      return (
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap w-[160px] text-center transition-colors ${style.classes}`}>
                          {style.label}
                        </span>
                      );
                    }
                  },
                  {
                    key: 'statut',
                    label: 'Statut',
                    format: (status: string) => {
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
                actions={(user: User) => (
                  <>
                    {canEditUsers && (
                      <>
                        {/* PIN Caisse - uniquement pour les non-clients (employés, caissiers, etc.) */}
                        {user.role !== SystemRole.CLIENT && user.role !== 'client' && (
                          <IconButton
                            icon={KeyRound}
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setPinUser(user); setShowPinModal(true); }}
                            className="text-warning hover:bg-warning/10"
                            title="PIN"
                            aria-label="Définir PIN Caisse"
                          />
                        )}
                        <IconButton
                          icon={Edit2}
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setEditingUser(user); setShowModal(true); }}
                          className="text-primary hover:bg-primary/10"
                          title="Modifier"
                          aria-label="Modifier utilisateur"
                        />
                      </>
                    )}
                    {canDeleteUsers && (
                      <IconButton
                        icon={Trash2}
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }}
                        className="text-danger hover:bg-danger/10"
                        title="Supprimer"
                        aria-label="Supprimer utilisateur"
                      />
                    )}
                  </>
                )}
                emptyMessage="Aucun utilisateur trouvé"
                loading={loading}
                mobileBreakpoint="md"
              />
            </div>

            {/* Pagination Controls - Mobile First */}
            <div className="p-3 sm:p-4 border-t border-edge bg-surface-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Page info & size selector */}
              <div className="flex items-center gap-3 text-xs sm:text-sm text-content-muted">
                <span className="hidden sm:inline">
                  {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredUsers.length)} sur {filteredUsers.length}
                </span>
                <span className="sm:hidden">
                  Page {currentPage}/{totalPages || 1}
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

      <UserFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleFormSubmit}
        initialData={editingUser}
      />

      {pinUser && (
        <UserPinModal
          isOpen={showPinModal}
          onClose={() => { setShowPinModal(false); setPinUser(null); }}
          userId={pinUser.id}
          userName={pinUser.name || pinUser.nom || pinUser.username || 'Utilisateur'}
        />
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
