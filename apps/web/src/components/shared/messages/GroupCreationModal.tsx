/**
 * Modale de création de groupe : nom, recherche et sélection des
 * participants, validation.
 */

import { Search, X } from 'lucide-react';
import { getInitials } from './message-utils';
import type { MessagesModuleController } from './useMessagesModule';

export function GroupCreationModal({ controller }: { controller: MessagesModuleController }) {
  const {
    setShowGroupModal,
    groupTitle, setGroupTitle,
    groupParticipants, setGroupParticipants,
    groupSearchQuery, setGroupSearchQuery,
    groupSearchResults,
    conversations,
    handleCreateGroup,
  } = controller;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGroupModal(false)}>
      <div className="bg-surface-base border border-edge rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-content-primary mb-4">Nouveau groupe</h3>

        <input
          type="text"
          placeholder="Nom du groupe"
          value={groupTitle}
          onChange={(e) => setGroupTitle(e.target.value)}
          className="w-full h-10 bg-surface border border-edge rounded-xl px-4 text-sm text-content-primary focus:border-accent outline-none mb-4 placeholder:text-content-muted"
        />

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
          <input
            placeholder="Ajouter des participants..."
            value={groupSearchQuery}
            onChange={(e) => setGroupSearchQuery(e.target.value)}
            className="w-full h-10 bg-surface border border-edge rounded-xl pl-10 pr-4 text-sm text-content-primary focus:border-accent outline-none placeholder:text-content-muted"
          />
        </div>

        {/* Participants sélectionnés */}
        {groupParticipants.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {groupParticipants.map((pid) => {
              const user: { nom?: string } | undefined = (groupSearchResults || []).find((u) => u.id === pid) || conversations
                .flatMap((c) => c.participants)
                .find((p) => p.id === pid);
              return (
                <span key={pid} className="px-2 py-1 bg-accent/30 text-accent rounded-lg text-xs flex items-center gap-1">
                  {user?.nom || pid.slice(0, 8)}
                  <button onClick={() => setGroupParticipants((prev) => prev.filter((id) => id !== pid))} className="hover:text-content-primary">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Résultats de recherche */}
        {groupSearchResults && groupSearchResults.length > 0 && (
          <div className="max-h-40 overflow-y-auto mb-4 border border-edge rounded-xl">
            {groupSearchResults
              .filter((u: any) => !groupParticipants.includes(u.id))
              .map((user: any) => (
                <button
                  key={user.id}
                  onClick={() => setGroupParticipants((prev) => [...prev, user.id])}
                  className="w-full p-3 flex items-center gap-3 hover:bg-surface transition-colors border-b border-edge-subtle last:border-b-0 text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold text-content-secondary">
                    {getInitials(`${user.prenom || ''} ${user.nom || ''}`)}
                  </div>
                  <div>
                    <p className="text-sm text-content-primary">{user.prenom} {user.nom}</p>
                    <p className="text-xs text-content-muted">{user.role || ''}</p>
                  </div>
                </button>
              ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowGroupModal(false)}
            className="flex-1 py-2.5 bg-surface hover:bg-surface-elevated text-content-primary rounded-xl text-sm font-medium transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={!groupTitle.trim() || groupParticipants.length === 0}
            className="flex-1 py-2.5 bg-accent hover:bg-accent-primary-hover disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
