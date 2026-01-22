import { useState, useMemo, useEffect } from 'react';
import { Search, User, CheckCircle, X, Loader2, Users } from 'lucide-react';
import { resolveStorageUrl } from '../../lib/format';

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

      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* HEADER */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-start bg-slate-900/50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-white">Gérer {caisseName}</h3>
            <p className="text-xs text-slate-400 mt-1">Sélectionnez les agents autorisés sur cette caisse</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* SEARCH */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher par nom ou matricule..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-white placeholder-slate-500"
              autoFocus
            />
          </div>
          {/* Compteur de sélection */}
          {selectedUserIds.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Users size={14} className="text-indigo-400" />
              <span className="text-slate-400">
                {selectedUserIds.length} agent{selectedUserIds.length > 1 ? 's' : ''} sélectionné{selectedUserIds.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* LISTE */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 opacity-50" />
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
                      ? 'opacity-40 grayscale border-slate-800 bg-slate-900 cursor-not-allowed'
                      : isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800'
                    }
                  `}
                >
                  {/* Checkbox visuel */}
                  <div className={`
                    w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-all
                    ${isSelected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-2 border-slate-600 group-hover:border-slate-500'
                    }
                  `}>
                    {isSelected && <CheckCircle size={14} className="text-white" />}
                  </div>

                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs relative overflow-hidden flex-shrink-0 ${isSelected ? 'bg-indigo-600/30 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                    {user.photoProfile ? (
                      <img src={resolveStorageUrl(user.photoProfile)} alt={fullName} className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                    {isCurrent && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-slate-900"></span>
                      </span>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm flex items-center gap-2 ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      <span className="truncate">{fullName}</span>
                      {isCurrent && (
                        <span className="flex-shrink-0 text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Actuel
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span>@{user.username || 'N/A'}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400 text-[10px]">
                        {user.role || 'Agent'}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  {isBusyElsewhere && (
                    <span className="flex-shrink-0 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 font-medium">
                      Occupé
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            // Empty State
            <div className="text-center py-10 text-slate-500">
              <User size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">Aucun agent trouvé</p>
              {search && (
                <p className="text-xs mt-1 text-slate-600">pour "{search}"</p>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 rounded-b-2xl">
          {/* Résumé des changements */}
          {hasChanges && (
            <div className="mb-3 flex items-center gap-3 text-xs">
              {addedCount > 0 && (
                <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                  +{addedCount} ajouté{addedCount > 1 ? 's' : ''}
                </span>
              )}
              {removedCount > 0 && (
                <span className="text-red-400 bg-red-500/10 px-2 py-1 rounded">
                  -{removedCount} retiré{removedCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-slate-400 hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              onClick={() => onSave(selectedUserIds)}
              disabled={!hasChanges || isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Sauvegarde...
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
