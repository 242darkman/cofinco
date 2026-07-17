/**
 * Zone des messages : pagination au défilement, séparateurs de date,
 * messages système/supprimés et bulles via MessageBubble.
 */

import { Spinner } from '@/components/ui/Spinner';
import { MessageBubble } from './MessageBubble';
import type { MessagesModuleController } from './useMessagesModule';

export function MessageList({ controller }: { controller: MessagesModuleController }) {
  const {
    currentUserId,
    allMessages,
    loadingMessages,
    isFetchingNextPage,
    messagesContainerRef,
    chatBottomRef,
    handleScroll,
    setMenuOpenFor,
    setShowReactionsFor,
  } = controller;

  return (
    <div
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scroll-smooth bg-gradient-to-b from-surface-base to-surface-base messages-scrollbar"
    >
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Spinner size="xs" tone="current" className="text-content-muted" />
        </div>
      )}
      {loadingMessages ? (
        <div className="flex justify-center py-10"><Spinner size="sm" tone="accent" /></div>
      ) : (
        allMessages.map((msg, index) => {
          const isMe = msg.senderId === currentUserId;
          const isSystem = msg.contentType === 'SYSTEM';
          const isDeleted = !!msg.deletedAt;

          // Séparateur de date
          const showDate = index === 0 ||
            new Date(msg.createdAt).toDateString() !== new Date(allMessages[index - 1].createdAt).toDateString();

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] bg-surface/60 backdrop-blur-sm text-content-muted px-4 py-1.5 rounded-full font-medium shadow-sm">
                    {new Date(msg.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              )}

              {isSystem ? (
                <div className="flex justify-center my-2">
                  <span className="text-[11px] text-content-muted italic bg-surface/30 px-3 py-1 rounded-full">{msg.content || 'Action système'}</span>
                </div>
              ) : isDeleted ? (
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-[20px] text-sm text-content-muted italic ${
                    isMe
                      ? 'bg-surface/50 rounded-br-[4px]'
                      : 'bg-surface/50 rounded-bl-[4px]'
                  }`}>
                    Ce message a été supprimé
                  </div>
                </div>
              ) : (
                <div
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} group ${msg.reactions.length > 0 ? 'mb-5' : ''}`}
                  onMouseLeave={() => { setMenuOpenFor(null); setShowReactionsFor(null); }}
                >
                  <MessageBubble msg={msg} controller={controller} />
                </div>
              )}
            </div>
          );
        })
      )}
      <div ref={chatBottomRef} className="h-1" />
    </div>
  );
}
