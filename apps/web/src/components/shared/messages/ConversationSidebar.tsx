/**
 * Barre latérale du module de messagerie : recherche d'utilisateurs,
 * liste des conversations et bouton de création de groupe.
 */

import { Spinner } from '@/components/ui/Spinner';
import { Search, Plus, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { ConversationV2 } from '../../../hooks/useMessagesV2';
import { formatMessageTime, getInitials } from './message-utils';
import type { MessagesModuleController } from './useMessagesModule';

export function ConversationSidebar({ controller }: { controller: MessagesModuleController }) {
  const {
    selectedConversationId,
    searchQuery, setSearchQuery,
    setShowGroupModal,
    loadingConversations,
    displayItems,
    isSearchMode,
    onlineUsers,
    getConversationAvatar,
    getConversationOnlineStatus,
    handleSelectConversation,
    handleSelectSearchUser,
  } = controller;

  return (
    <div className={`
      flex-col border-r border-edge bg-surface-base w-full md:w-80 lg:w-96
      ${selectedConversationId ? 'hidden md:flex' : 'flex'}
    `}>
      {/* En-tête */}
      <div className="p-4 border-b border-edge h-20 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
          <input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-surface-base border border-edge rounded-xl pl-10 pr-4 text-sm focus:border-accent outline-none transition-all placeholder:text-content-muted"
          />
        </div>
        <button
          onClick={() => setShowGroupModal(true)}
          className="p-2.5 bg-accent hover:bg-accent-primary-hover rounded-xl text-white transition-colors shrink-0"
          title="Nouveau groupe"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        {loadingConversations && !searchQuery ? (
          <div className="flex justify-center p-8 text-content-muted">
            <Spinner size="sm" tone="current" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center p-8 text-content-muted text-sm">
            {searchQuery ? "Aucun utilisateur trouvé" : "Aucune conversation"}
          </div>
        ) : (
          displayItems.map((item: any) => {
            if (isSearchMode) {
              // Résultat de recherche : utilisateur
              const name = `${item.prenom || ''} ${item.nom || ''}`.trim() || item.username;
              const online = onlineUsers.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectSearchUser(item.id)}
                  className="w-full p-4 flex items-center gap-3 border-b border-edge transition-colors hover:bg-surface-base border-l-4 border-l-transparent"
                >
                  <div className="relative">
                    <div className="shrink-0">
                      <Avatar
                        photoUrl={item.photoProfile}
                        fullName={name}
                        initials={getInitials(name)}
                        size="md"
                      />
                    </div>
                    {online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-status-success rounded-full border-2 border-edge"></div>}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-bold text-sm text-content-secondary">{name}</span>
                    <p className="text-xs text-content-muted">{item.role || 'Utilisateur'} {item.agence ? `- ${item.agence}` : ''}</p>
                  </div>
                </button>
              );
            }
            // Élément conversation
            const conv = item as ConversationV2;
            const avatar = getConversationAvatar(conv);
            const online = getConversationOnlineStatus(conv);
            const isGroup = conv.type === 'GROUP';
            const lastMsg = conv.lastMessagePreview;
            const time = conv.lastMessageAt ? formatMessageTime(conv.lastMessageAt) : null;

            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`w-full p-4 flex items-center gap-3 border-b border-edge transition-colors hover:bg-surface-base
                  ${selectedConversationId === conv.id ? 'bg-surface-base border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}
                `}
              >
                <div className="relative">
                  {isGroup ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-status-info to-accent flex items-center justify-center border border-edge">
                      <UsersRound size={20} className="text-white" />
                    </div>
                  ) : (
                    <div className="shrink-0">
                      <Avatar
                        photoUrl={avatar}
                        fullName={conv.displayTitle}
                        initials={getInitials(conv.displayTitle)}
                        size="md"
                      />
                    </div>
                  )}
                  {online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-status-success rounded-full border-2 border-edge"></div>}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="font-bold text-sm truncate text-content-secondary">{conv.displayTitle}</span>
                    {time && <span className="text-[10px] text-content-muted shrink-0 ml-2">{time}</span>}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs truncate pr-2 ${conv.unreadCount > 0 ? 'text-content-secondary font-medium' : 'text-content-muted'}`}>
                      {lastMsg && /^https?:\/\//.test(lastMsg) ? '📎 Fichier' : lastMsg || ''}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
