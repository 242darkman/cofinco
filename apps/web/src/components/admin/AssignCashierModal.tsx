import { useState, useMemo, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Search, User, CheckCircle, X, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { resolveStorageUrl } from '../../lib/format';
import { getRoleLabel } from '@shared/types/roles';

interface AssignableUser {
  id: string;
  nom: string;
  prenom: string | null;
  username: string | null;
  role: string;
  photoProfile?: string | null;
  isBusy?: boolean; // Occupé sur une AUTRE caisse
}

interface AssignCashierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userIds: string[]) => void;
  users: AssignableUser[];
  caisseName: string;
  currentAssigneeIds?: string[];
  isLoading?: boolean;
  isSaving?: boolean;
}

export default function AssignCashierModal({
  isOpen,
  onClose,
  onSave,
  users,
  caisseName,
  currentAssigneeIds = [],
  isLoading = false,
  isSaving = false
}: AssignCashierModalProps) {

  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(currentAssigneeIds);

  // Reset state quand la modale s'ouvre
  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds(currentAssigneeIds);
      setSearch('');
    }
  }, [isOpen, currentAssigneeIds]);

  // Filtrage intelligent (Garde toujours les assignés actuels visibles même si filtre)
  const filteredUsers = useMemo(() => {
    const searchLower = search.toLowerCase();
    return users.filter(u =>
      currentAssigneeIds.includes(u.id) || // Toujours montrer les actuels
      (u.nom?.toLowerCase() || '').includes(searchLower) ||
      (u.prenom?.toLowerCase() || '').includes(searchLower) ||
      (u.username?.toLowerCase() || '').includes(searchLower)
    );
  }, [users, search, currentAssigneeIds]);

  // Compter les changements
  const addedCount = selectedUserIds.filter(id => !currentAssigneeIds.includes(id)).length;
  const removedCount = currentAssigneeIds.filter(id => !selectedUserIds.includes(id)).length;
  const hasChanges = addedCount > 0 || removedCount > 0;

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">

      <div className="w-full max-w-md bg-surface-base border border-edge rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* HEADER */}
        <div className="p-5 border-b border-edge flex justify-between items-start bg-surface-base/50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-content-primary">Agents habilités - {caisseName}</h3>
            <p className="text-xs text-content-muted mt-1">Ces agents pourront ouvrir une session sur cette caisse</p>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-primary transition-colors p-1 hover:bg-surface rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* SEARCH */}
        <div className="p-4 border-b border-edge bg-surface-base/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher par nom ou matricule..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-accent focus:border-accent transition-all text-content-primary placeholder-content-muted"
              autoFocus
            />
          </div>
          {/* Compteur de sélection */}
          {selectedUserIds.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Users size={14} className="text-accent" />
              <span className="text-content-muted">
                {selectedUserIds.length} agent{selectedUserIds.length > 1 ? 's' : ''} habilité{selectedUserIds.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* LISTE */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
              <Spinner size="md" tone="current" className="mb-3 opacity-50" />
              <p className="text-sm">Chargement des agents...</p>
            </div>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((user) => {
              const isCurrent = currentAssigneeIds.includes(user.id);
              const isSelected = selectedUserIds.includes(user.id);
              const isBusyElsewhere = user.isBusy && !isCurrent;
              const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || 'Sans nom';
              const initials = fullName.charAt(0).toUpperCase();

              return (
                <button
                  key={user.id}
                  disabled={isBusyElsewhere}
                  onClick={() => !isBusyElsewhere && toggleUser(user.id)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all relative group
                    ${isBusyElsewhere
                      ? 'opacity-40 grayscale border-edge bg-surface-base cursor-not-allowed'
                      : isSelected
                        ? 'border-accent bg-accent/10 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'border-edge bg-surface-base/40 hover:border-edge-strong hover:bg-surface'
                    }
                  `}
                >
                  {/* Checkbox visuel */}
                  <div className={`
                    w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-all
                    ${isSelected
                      ? 'bg-accent border-accent'
                      : 'border-2 border-edge-strong group-hover:border-edge-strong'
                    }
                  `}>
                    {isSelected && <CheckCircle size={14} className="text-content-primary" />}
                  </div>

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <Avatar
                      photoUrl={user.photoProfile}
                      fullName={fullName}
                      initials={initials}
                      size="sm"
                    />
                    {isCurrent && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-success border border-edge"></span>
                      </span>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm flex items-center gap-2 ${isSelected ? 'text-content-primary' : 'text-content-secondary'}`}>
                      <span className="truncate">{fullName}</span>
                      {isCurrent && (
                        <span className="flex-shrink-0 text-[9px] bg-status-success-bg text-status-success px-1.5 py-0.5 rounded border border-status-success/20">
                          Déjà habilité
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-content-muted flex items-center gap-1.5">
                      <span>@{user.username || 'N/A'}</span>
                      <span className="text-content-muted">•</span>
                      <span className="text-content-muted text-[10px]">
                        {getRoleLabel(user.role)}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  {isBusyElsewhere && (
                    <span className="flex-shrink-0 text-[10px] text-status-warning bg-status-warning-bg px-2 py-1 rounded border border-status-warning/20 font-medium">
                      Occupé
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            // Empty State
            <div className="text-center py-10 text-content-muted">
              <User size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">Aucun agent trouvé</p>
              {search && (
                <p className="text-xs mt-1 text-content-muted">pour "{search}"</p>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-edge bg-surface-base rounded-b-2xl">
          {/* Résumé des changements */}
          {hasChanges && (
            <div className="mb-3 flex items-center gap-3 text-xs">
              {addedCount > 0 && (
                <span className="text-status-success bg-status-success-bg px-2 py-1 rounded">
                  +{addedCount} ajouté{addedCount > 1 ? 's' : ''}
                </span>
              )}
              {removedCount > 0 && (
                <span className="text-status-danger bg-status-danger-bg px-2 py-1 rounded">
                  -{removedCount} retiré{removedCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-content-muted hover:text-content-primary transition-colors text-sm font-medium disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              onClick={() => onSave(selectedUserIds)}
              disabled={!hasChanges || isSaving}
              className="px-6 py-2.5 bg-accent hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
            >
              {isSaving ? (
                <>
                  <Spinner size="xs" tone="current" /> Sauvegarde...
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Sauvegarder
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
