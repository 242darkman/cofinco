import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Send, Paperclip, MoreVertical,
  ChevronLeft, Smile, CheckCheck, Loader2,
  Edit2, Trash2, X, UsersRound, Plus,
  FileText, Image as ImageIcon, Download
} from 'lucide-react';
import {
  useConversationsV2,
  useConversationMessages,
  useSendMessageV2,
  useSearchUsersV2,
  useCreateDM,
  useCreateGroup,
  useEditMessage,
  useDeleteMessage,
  useAddReaction,
  useRemoveReaction,
  useMarkAsRead,
  type ConversationV2,
  type MessageV2,
} from '../../hooks/useMessagesV2';
import { useWebSocket } from '../../hooks/useWebSocket';
import { resolveStorageUrl } from '../../lib/format';
import { authService } from '../../lib/auth';
import { ALLOWED_REACTION_EMOJIS } from '@shared/schema';

// Emojis courants pour la composition de messages
const MESSAGE_EMOJIS = [
  // Smileys
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪', '😝',
  '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮', '😯', '😲', '😳', '🥺', '😢', '😭',
  '😤', '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
  // Gestes
  '👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊',
  '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪',
  // Coeurs & Symboles
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
  '⭐', '🌟', '✨', '💫', '🔥', '💥', '💯', '✅', '❌', '⚠️', '🎉', '🎊', '🎁', '🏆', '🥇', '🥈', '🥉',
  // Objets
  '📱', '💻', '🖥️', '📷', '🔔', '📣', '💬', '💭', '🗨️', '📝', '📋', '📌', '📎', '🔗', '💼', '📁', '📂', '🗂️', '📊', '📈', '📉',
];

interface MessagesModuleProps {
  initialChatUserId?: string;
  initialChatUserName?: string;
  initialChatUserPhoto?: string | null;
}

function formatMessageTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Hier ${time}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${time}`;
  }
  const shortDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${shortDate} ${time}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export default function MessagesModule({ initialChatUserId, initialChatUserName, initialChatUserPhoto }: MessagesModuleProps) {
  const currentUser = authService.getCurrentUser();
  const currentUserId = currentUser?.id || '';

  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  // V2 Hooks
  const { data: conversationsData, isLoading: loadingConversations } = useConversationsV2();
  const {
    data: messagesPages,
    isLoading: loadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversationMessages(selectedConversationId);
  const { mutate: sendMessageV2, isPending: sending } = useSendMessageV2();
  const { data: searchResults } = useSearchUsersV2(searchQuery);
  const { data: groupSearchResults } = useSearchUsersV2(groupSearchQuery);
  const { mutate: createDM } = useCreateDM();
  const { mutate: createGroup } = useCreateGroup();
  const { mutate: editMsg } = useEditMessage();
  const { mutate: deleteMsg } = useDeleteMessage();
  const { mutate: addReaction } = useAddReaction();
  const { mutate: removeReaction } = useRemoveReaction();
  const { mutate: markAsRead } = useMarkAsRead();
  const { onlineUsers, typingUsers, sendTyping } = useWebSocket();

  // Derived data
  const conversations = conversationsData?.data || [];
  const allMessages = useMemo(() => {
    if (!messagesPages?.pages) return [];
    return messagesPages.pages.flatMap((page) => page.data);
  }, [messagesPages]);

  // Refs
  const initialChatHandled = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  // Handle initial DM user ID (create/get DM when provided)
  useEffect(() => {
    if (initialChatUserId && !initialChatHandled.current) {
      initialChatHandled.current = true;
      createDM(
        { userId: initialChatUserId },
        {
          onSuccess: (result) => {
            setSelectedConversationId(result.conversation.id);
          },
        }
      );
    }
  }, [initialChatUserId, createDM]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length]);

  // Mark as read when selecting a conversation
  useEffect(() => {
    if (selectedConversationId && allMessages.length > 0) {
      const lastMsg = allMessages[allMessages.length - 1];
      if (lastMsg && lastMsg.senderId !== currentUserId) {
        markAsRead({ conversationId: selectedConversationId, lastReadMessageId: lastMsg.id });
      }
    }
  }, [selectedConversationId, allMessages.length]);

  // Handlers
  const handleSendMessage = () => {
    if (!message.trim() || !selectedConversationId) return;

    if (editingMessage) {
      editMsg(
        { messageId: editingMessage.id, content: message.trim(), conversationId: selectedConversationId },
        { onSuccess: () => { setMessage(''); setEditingMessage(null); } }
      );
    } else {
      sendMessageV2(
        { conversationId: selectedConversationId, content: message.trim() },
        { onSuccess: () => { setMessage(''); sendTyping(selectedConversationId, false); } }
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (selectedConversationId) {
      sendTyping(selectedConversationId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(selectedConversationId, false);
      }, 2000);
    }
  };

  const handleSelectConversation = (convId: string) => {
    setSelectedConversationId(convId);
    setEditingMessage(null);
    setMessage('');
    setMenuOpenFor(null);
    setShowReactionsFor(null);
  };

  const handleSelectSearchUser = (userId: string) => {
    createDM(
      { userId },
      {
        onSuccess: (result) => {
          setSelectedConversationId(result.conversation.id);
          setSearchQuery('');
        },
      }
    );
  };

  const handleCreateGroup = () => {
    if (!groupTitle.trim() || groupParticipants.length === 0) return;
    createGroup(
      { title: groupTitle.trim(), participantIds: groupParticipants },
      {
        onSuccess: (result) => {
          setSelectedConversationId(result.conversation.id);
          setShowGroupModal(false);
          setGroupTitle('');
          setGroupParticipants([]);
          setGroupSearchQuery('');
        },
      }
    );
  };

  const handleToggleReaction = (messageId: string, emoji: string, hasReacted: boolean) => {
    if (!selectedConversationId) return;
    if (hasReacted) {
      removeReaction({ messageId, emoji, conversationId: selectedConversationId });
    } else {
      addReaction({ messageId, emoji, conversationId: selectedConversationId });
    }
    setShowReactionsFor(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!selectedConversationId) return;
    deleteMsg({ messageId, conversationId: selectedConversationId });
    setMenuOpenFor(null);
  };

  const handleEditMessage = (msg: MessageV2) => {
    setEditingMessage({ id: msg.id, content: msg.content || '' });
    setMessage(msg.content || '');
    setMenuOpenFor(null);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversationId) return;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', file.type.startsWith('image/') ? 'profile' : 'misc');
      formData.append('entityType', 'conversation');
      formData.append('entityId', selectedConversationId);

      const uploadRes = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      const isImage = file.type.startsWith('image/');
      const fileUrl = uploadData.url || `/api/storage/files/${uploadData.key}`;

      sendMessageV2(
        {
          conversationId: selectedConversationId,
          content: fileUrl,
          contentType: isImage ? 'IMAGE' : 'FILE',
          metadata: {
            url: fileUrl,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
          },
        },
        { onSuccess: () => sendTyping(selectedConversationId, false) }
      );
    } catch (error) {
      console.error('File upload error:', error);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Active conversation info
  const activeConv = conversations.find((c) => c.id === selectedConversationId);
  const getConversationAvatar = (conv: ConversationV2) => {
    if (conv.type === 'DM') {
      const partner = conv.participants.find((p) => p.id !== currentUserId);
      return partner?.photoProfile || null;
    }
    return null;
  };
  const getConversationOnlineStatus = (conv: ConversationV2) => {
    if (conv.type === 'DM') {
      const partner = conv.participants.find((p) => p.id !== currentUserId);
      return partner ? onlineUsers.has(partner.id) : false;
    }
    return false;
  };

  // Display items: either search results or conversations
  const displayItems = searchQuery.length >= 2 ? (searchResults || []) : conversations;
  const isSearchMode = searchQuery.length >= 2;

  return (
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-120px)] bg-slate-950 overflow-hidden text-white font-sans rounded-2xl border border-slate-800 shadow-2xl">

      {/* 1. SIDEBAR */}
      <div className={`
        flex-col border-r border-slate-800 bg-slate-950 w-full md:w-80 lg:w-96
        ${selectedConversationId ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-slate-800 h-20 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={() => setShowGroupModal(true)}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white transition-colors shrink-0"
            title="Nouveau groupe"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingConversations && !searchQuery ? (
            <div className="flex justify-center p-8 text-slate-500">
              <Loader2 className="animate-spin" />
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-sm">
              {searchQuery ? "Aucun utilisateur trouvé" : "Aucune conversation"}
            </div>
          ) : (
            displayItems.map((item: any) => {
              if (isSearchMode) {
                // Search result: user
                const name = `${item.prenom || ''} ${item.nom || ''}`.trim() || item.username;
                const online = onlineUsers.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectSearchUser(item.id)}
                    className="w-full p-4 flex items-center gap-3 border-b border-slate-900 transition-colors hover:bg-slate-900 border-l-4 border-l-transparent"
                  >
                    <div className="relative">
                      {item.photoProfile ? (
                        <img src={resolveStorageUrl(item.photoProfile)} alt={name} className="w-12 h-12 rounded-full object-cover border border-slate-700" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 border border-slate-700">
                          {getInitials(name)}
                        </div>
                      )}
                      {online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950"></div>}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <span className="font-bold text-sm text-slate-200">{name}</span>
                      <p className="text-xs text-slate-500">{item.role || 'Utilisateur'} {item.agence ? `- ${item.agence}` : ''}</p>
                    </div>
                  </button>
                );
              }
              // Conversation item
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
                  className={`w-full p-4 flex items-center gap-3 border-b border-slate-900 transition-colors hover:bg-slate-900
                    ${selectedConversationId === conv.id ? 'bg-slate-900 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}
                  `}
                >
                  <div className="relative">
                    {isGroup ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center border border-slate-700">
                        <UsersRound size={20} className="text-white" />
                      </div>
                    ) : avatar ? (
                      <img src={resolveStorageUrl(avatar)} alt={conv.displayTitle} className="w-12 h-12 rounded-full object-cover border border-slate-700" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 border border-slate-700">
                        {getInitials(conv.displayTitle)}
                      </div>
                    )}
                    {online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950"></div>}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="font-bold text-sm truncate text-slate-200">{conv.displayTitle}</span>
                      {time && <span className="text-[10px] text-slate-500 shrink-0 ml-2">{time}</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs truncate pr-2 ${conv.unreadCount > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                        {lastMsg || ''}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
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

      {/* 2. MAIN CHAT AREA */}
      <div className={`
        flex-col flex-1 bg-slate-950 relative
        ${!selectedConversationId ? 'hidden md:flex' : 'flex'}
      `}>
        {!selectedConversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-950/50">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-black/20">
              <Send size={40} className="ml-2 opacity-50 text-indigo-500" />
            </div>
            <p className="text-lg font-medium text-slate-400">Sélectionnez une conversation</p>
            <p className="text-sm text-slate-600 mt-2">pour commencer à discuter</p>
          </div>
        ) : (
          <>
            {/* CHAT HEADER */}
            <header className="h-20 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 w-full">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedConversationId(null)} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white">
                  <ChevronLeft size={24} />
                </button>
                <div className="relative">
                  {activeConv?.type === 'GROUP' ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                      <UsersRound size={18} className="text-white" />
                    </div>
                  ) : (() => {
                    const avatar = activeConv ? getConversationAvatar(activeConv) : null;
                    return avatar ? (
                      <img src={resolveStorageUrl(avatar)} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-sm">
                        {getInitials(activeConv?.displayTitle || '?')}
                      </div>
                    );
                  })()}
                  {activeConv && getConversationOnlineStatus(activeConv) && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950"></div>
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm text-white">{activeConv?.displayTitle || 'Conversation'}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1 h-4">
                    {activeConv?.type === 'GROUP' ? (
                      <span>{activeConv.participants.length} participants</span>
                    ) : activeConv && getConversationOnlineStatus(activeConv) ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> En ligne
                      </span>
                    ) : (
                      <span>Hors ligne</span>
                    )}
                  </div>
                </div>
              </div>
            </header>

            {/* MESSAGES */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth bg-slate-950"
            >
              {isFetchingNextPage && (
                <div className="flex justify-center py-2">
                  <Loader2 size={16} className="animate-spin text-slate-500" />
                </div>
              )}
              {loadingMessages ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div>
              ) : (
                allMessages.map((msg, index) => {
                  const isMe = msg.senderId === currentUserId;
                  const isSystem = msg.contentType === 'SYSTEM';
                  const isDeleted = !!msg.deletedAt;

                  // Date separator
                  const showDate = index === 0 ||
                    new Date(msg.createdAt).toDateString() !== new Date(allMessages[index - 1].createdAt).toDateString();

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="text-[10px] bg-slate-900 text-slate-500 px-3 py-1 rounded-full border border-slate-800">
                            {new Date(msg.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </div>
                      )}

                      {isSystem ? (
                        <div className="flex justify-center my-2">
                          <span className="text-[11px] text-slate-500 italic">{msg.content || 'Action système'}</span>
                        </div>
                      ) : isDeleted ? (
                        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[75%] p-3 rounded-2xl text-sm bg-slate-900 border border-slate-800 text-slate-500 italic">
                            Ce message a été supprimé
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}
                          onMouseLeave={() => { setMenuOpenFor(null); setShowReactionsFor(null); }}
                        >
                          {/* Message bubble */}
                          <div className={`
                            max-w-[85%] md:max-w-[75%] lg:max-w-[60%] p-3 rounded-2xl text-sm relative shadow-md
                            ${isMe
                              ? 'bg-indigo-600 text-white rounded-tr-sm'
                              : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700'
                            }
                          `}>
                            {/* Sender name (groups only) */}
                            {!isMe && activeConv?.type === 'GROUP' && (
                              <p className="text-xs font-bold text-indigo-400 mb-1">
                                {msg.sender.prenom ? `${msg.sender.prenom} ${msg.sender.nom}` : msg.sender.nom}
                              </p>
                            )}

                            {msg.contentType === 'IMAGE' ? (
                              <div className="space-y-1">
                                <img
                                  src={resolveStorageUrl((msg.metadata as any)?.url || msg.content || '')}
                                  alt={(msg.metadata as any)?.filename || 'Image'}
                                  className="max-w-[280px] rounded-lg cursor-pointer"
                                  onClick={() => window.open(resolveStorageUrl((msg.metadata as any)?.url || msg.content || ''), '_blank')}
                                />
                                {(msg.metadata as any)?.filename && (
                                  <p className={`text-xs ${isMe ? 'text-indigo-200' : 'text-slate-500'}`}>{(msg.metadata as any).filename}</p>
                                )}
                              </div>
                            ) : msg.contentType === 'FILE' ? (
                              <a
                                href={resolveStorageUrl((msg.metadata as any)?.url || msg.content || '')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2 rounded-lg border ${
                                  isMe ? 'border-indigo-400/30 hover:bg-indigo-500/20' : 'border-slate-600 hover:bg-slate-700'
                                }`}
                              >
                                <FileText size={20} className={isMe ? 'text-indigo-200' : 'text-blue-400'} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-200'}`}>
                                    {(msg.metadata as any)?.filename || 'Fichier'}
                                  </p>
                                  {(msg.metadata as any)?.size && (
                                    <p className={`text-xs ${isMe ? 'text-indigo-200' : 'text-slate-500'}`}>
                                      {((msg.metadata as any).size / 1024).toFixed(0)} Ko
                                    </p>
                                  )}
                                </div>
                                <Download size={16} className={isMe ? 'text-indigo-200' : 'text-slate-400'} />
                              </a>
                            ) : (
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            )}

                            <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${isMe ? 'text-indigo-200' : 'text-slate-500'}`}>
                              {msg.editedAt && <span className="italic mr-1">(modifié)</span>}
                              <span>{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMe && <CheckCheck size={12} />}
                            </div>

                            {/* Reactions display */}
                            {msg.reactions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 -mb-1">
                                {msg.reactions.map((r) => (
                                  <button
                                    key={r.emoji}
                                    onClick={() => handleToggleReaction(msg.id, r.emoji, r.hasReacted)}
                                    className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 border transition-colors
                                      ${r.hasReacted
                                        ? 'bg-indigo-500/30 border-indigo-500/50 text-indigo-300'
                                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                                      }
                                    `}
                                  >
                                    <span>{r.emoji}</span>
                                    <span className="text-[10px]">{r.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Hover actions */}
                          <div className={`absolute ${isMe ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-0 hidden group-hover:flex items-start gap-0.5`}>
                            <button
                              onClick={() => setShowReactionsFor(showReactionsFor === msg.id ? null : msg.id)}
                              className="p-1 text-slate-500 hover:text-yellow-400 rounded transition-colors"
                            >
                              <Smile size={14} />
                            </button>
                            {isMe && msg.contentType === 'TEXT' && (
                              <>
                                <button
                                  onClick={() => handleEditMessage(msg)}
                                  className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Reactions picker popup */}
                          {showReactionsFor === msg.id && (
                            <div className={`absolute ${isMe ? 'right-0' : 'left-0'} -top-10 z-50 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1 flex gap-1 shadow-xl`}>
                              {ALLOWED_REACTION_EMOJIS.map((emoji) => {
                                const existing = msg.reactions.find((r) => r.emoji === emoji);
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => handleToggleReaction(msg.id, emoji, existing?.hasReacted || false)}
                                    className={`p-1 text-lg hover:scale-125 transition-transform rounded ${existing?.hasReacted ? 'bg-indigo-500/20' : ''}`}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} className="h-1" />
            </div>

            {/* INPUT AREA */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 w-full mb-0">
              {editingMessage && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-slate-800 rounded-lg text-xs text-slate-400">
                  <Edit2 size={12} className="text-indigo-400" />
                  <span className="flex-1 truncate">Modification du message</span>
                  <button onClick={() => { setEditingMessage(null); setMessage(''); }} className="text-slate-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 sm:gap-3 max-w-4xl mx-auto w-full">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50 shrink-0"
                >
                  {uploadingFile ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                </button>

                <div className="flex-1 relative">
                  {/* Emoji Picker Panel */}
                  {showEmojiPicker && (
                    <div className="absolute bottom-full mb-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
                        <span className="text-xs font-medium text-slate-400">Emojis</span>
                        <button
                          onClick={() => setShowEmojiPicker(false)}
                          className="text-slate-500 hover:text-white"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {MESSAGE_EMOJIS.map((emoji, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setMessage(prev => prev + emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-800 rounded transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-950 border border-slate-700 rounded-xl flex items-center px-3 sm:px-4 h-11 sm:h-12 focus-within:border-indigo-500 transition-colors">
                    <textarea
                      placeholder="Écrire un message..."
                      className="w-full bg-transparent border-none outline-none text-white text-sm resize-none py-2.5 max-h-32 placeholder:text-slate-600 custom-scrollbar leading-normal"
                      rows={1}
                      value={message}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      style={{ minHeight: '20px' }}
                    />
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`ml-2 transition-colors shrink-0 ${showEmojiPicker ? 'text-yellow-400' : 'text-slate-500 hover:text-yellow-400'}`}
                    >
                      <Smile size={20} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sending}
                  className="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-indigo-900/20 transition-transform active:scale-95 shrink-0"
                >
                  {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* GROUP CREATION MODAL */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Nouveau groupe</h3>

            <input
              type="text"
              placeholder="Nom du groupe"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              className="w-full h-10 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-indigo-500 outline-none mb-4 placeholder:text-slate-600"
            />

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                placeholder="Ajouter des participants..."
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full h-10 bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 text-sm text-white focus:border-indigo-500 outline-none placeholder:text-slate-600"
              />
            </div>

            {/* Selected participants */}
            {groupParticipants.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {groupParticipants.map((pid) => {
                  const user = (groupSearchResults || []).find((u: any) => u.id === pid) || conversations
                    .flatMap((c) => c.participants)
                    .find((p) => p.id === pid);
                  return (
                    <span key={pid} className="px-2 py-1 bg-indigo-600/30 text-indigo-300 rounded-lg text-xs flex items-center gap-1">
                      {(user as any)?.nom || pid.slice(0, 8)}
                      <button onClick={() => setGroupParticipants((prev) => prev.filter((id) => id !== pid))} className="hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search results */}
            {groupSearchResults && groupSearchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto mb-4 border border-slate-700 rounded-xl">
                {groupSearchResults
                  .filter((u: any) => !groupParticipants.includes(u.id))
                  .map((user: any) => (
                    <button
                      key={user.id}
                      onClick={() => setGroupParticipants((prev) => [...prev, user.id])}
                      className="w-full p-3 flex items-center gap-3 hover:bg-slate-800 transition-colors border-b border-slate-700/50 last:border-b-0 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                        {getInitials(`${user.prenom || ''} ${user.nom || ''}`)}
                      </div>
                      <div>
                        <p className="text-sm text-white">{user.prenom} {user.nom}</p>
                        <p className="text-xs text-slate-500">{user.role || ''}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowGroupModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupTitle.trim() || groupParticipants.length === 0}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
