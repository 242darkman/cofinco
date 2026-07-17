/**
 * Hook contrôleur du module de messagerie : état, hooks serveur (V2),
 * WebSocket, effets et gestionnaires d'événements.
 */

import { useState, useEffect, useRef, useMemo, type ChangeEvent } from 'react';
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
} from '../../../hooks/useMessagesV2';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { authService } from '../../../lib/auth';

export interface MessagesModuleProps {
  initialConversationId?: string;
  initialChatUserId?: string;
  initialChatUserName?: string;
  initialChatUserPhoto?: string | null;
}

export function useMessagesModule({ initialConversationId, initialChatUserId }: MessagesModuleProps) {
  const currentUser = authService.getCurrentUser();
  const currentUserId = currentUser?.id || '';

  // État
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
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; mimeType?: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Hooks V2
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
  const { onlineUsers, sendTyping } = useWebSocket();

  // Données dérivées
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
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Conversation initiale — priorité au conversationId direct, sinon création d'un DM
  useEffect(() => {
    if (initialChatHandled.current) return;

    if (initialConversationId) {
      initialChatHandled.current = true;
      setSelectedConversationId(initialConversationId);
      setTimeout(() => messageInputRef.current?.focus(), 300);
      return;
    }

    if (initialChatUserId) {
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
  }, [initialConversationId, initialChatUserId, createDM]);

  // Défilement automatique vers le bas à chaque nouveau message
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length]);

  // Marquer comme lu à la sélection d'une conversation
  useEffect(() => {
    if (selectedConversationId && allMessages.length > 0) {
      const lastMsg = allMessages[allMessages.length - 1];
      if (lastMsg && lastMsg.senderId !== currentUserId) {
        markAsRead({ conversationId: selectedConversationId, lastReadMessageId: lastMsg.id });
      }
    }
  }, [selectedConversationId, allMessages.length]);

  // Gestionnaires
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

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
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

  // Conversation active
  const activeConv = conversations.find((c) => c.id === selectedConversationId);

  // Le message a-t-il été lu par le destinataire ?
  const isMessageRead = (msg: MessageV2): boolean => {
    if (!activeConv || msg.senderId !== currentUserId) return false;

    if (activeConv.type === 'DM') {
      // DM : le lastReadAt du partenaire est-il postérieur au createdAt du message ?
      const partner = activeConv.participants.find((p) => p.id !== currentUserId);
      if (partner?.lastReadAt) {
        return new Date(partner.lastReadAt) >= new Date(msg.createdAt);
      }
      return false;
    } else {
      // GROUPE : au moins un autre participant l'a lu
      return activeConv.participants.some(
        (p) => p.id !== currentUserId && p.lastReadAt && new Date(p.lastReadAt) >= new Date(msg.createdAt)
      );
    }
  };

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

  // Éléments affichés : résultats de recherche ou conversations
  const displayItems = searchQuery.length >= 2 ? (searchResults || []) : conversations;
  const isSearchMode = searchQuery.length >= 2;

  return {
    // Identité
    currentUserId,
    // État
    selectedConversationId, setSelectedConversationId,
    message, setMessage,
    searchQuery, setSearchQuery,
    editingMessage, setEditingMessage,
    showReactionsFor, setShowReactionsFor,
    showEmojiPicker, setShowEmojiPicker,
    showGroupModal, setShowGroupModal,
    groupTitle, setGroupTitle,
    groupParticipants, setGroupParticipants,
    groupSearchQuery, setGroupSearchQuery,
    setMenuOpenFor,
    previewFile, setPreviewFile,
    uploadingFile,
    // Données serveur
    conversations,
    allMessages,
    activeConv,
    displayItems,
    isSearchMode,
    groupSearchResults,
    loadingConversations,
    loadingMessages,
    isFetchingNextPage,
    sending,
    onlineUsers,
    // Refs
    chatBottomRef,
    messagesContainerRef,
    fileInputRef,
    messageInputRef,
    // Gestionnaires
    handleSendMessage,
    handleInputChange,
    handleSelectConversation,
    handleSelectSearchUser,
    handleCreateGroup,
    handleToggleReaction,
    handleDeleteMessage,
    handleEditMessage,
    handleScroll,
    handleFileUpload,
    // Aides d'affichage
    isMessageRead,
    getConversationAvatar,
    getConversationOnlineStatus,
  };
}

export type MessagesModuleController = ReturnType<typeof useMessagesModule>;
