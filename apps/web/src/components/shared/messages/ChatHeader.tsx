/**
 * En-tête de la conversation active : avatar, titre, statut en ligne
 * ou nombre de participants, retour mobile.
 */

import { ChevronLeft, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { getInitials } from './message-utils';
import type { MessagesModuleController } from './useMessagesModule';

export function ChatHeader({ controller }: { controller: MessagesModuleController }) {
  const {
    activeConv,
    setSelectedConversationId,
    getConversationAvatar,
    getConversationOnlineStatus,
  } = controller;

  return (
    <header className="h-20 border-b border-edge flex items-center justify-between px-4 bg-surface-base/80 backdrop-blur-md sticky top-0 z-10 w-full">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedConversationId(null)} className="md:hidden p-2 -ml-2 text-content-muted hover:text-content-primary">
          <ChevronLeft size={24} />
        </button>
        <div className="relative">
          {activeConv?.type === 'GROUP' ? (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-status-info to-accent flex items-center justify-center">
              <UsersRound size={18} className="text-white" />
            </div>
          ) : (() => {
            const avatar = activeConv ? getConversationAvatar(activeConv) : null;
            return (
              <div className="shrink-0">
                <Avatar
                  photoUrl={avatar}
                  fullName={activeConv?.displayTitle || '?'}
                  initials={getInitials(activeConv?.displayTitle || '?')}
                  size="sm"
                />
              </div>
            );
          })()}
          {activeConv && getConversationOnlineStatus(activeConv) && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-success rounded-full border-2 border-edge"></div>
          )}
        </div>
        <div>
          <div className="font-bold text-sm text-content-primary">{activeConv?.displayTitle || 'Conversation'}</div>
          <div className="text-xs text-content-muted flex items-center gap-1 h-4">
            {activeConv?.type === 'GROUP' ? (
              <span>{activeConv.participants.length} participants</span>
            ) : activeConv && getConversationOnlineStatus(activeConv) ? (
              <span className="text-status-success flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success"></span> En ligne
              </span>
            ) : (
              <span>Hors ligne</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
