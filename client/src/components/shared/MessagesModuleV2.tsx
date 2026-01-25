/**
 * MessagesModule V2 - Système de messagerie conversation-centric
 *
 * Features:
 * - Support DM (1-to-1) et GROUP conversations
 * - Pagination infinie des messages
 * - Indicateur "vu à [heure]" (read receipts)
 * - Réactions aux messages
 * - Création de groupes
 * - Temps réel via WebSocket
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MessageCircle,
  Send,
  Search,
  CheckCheck,
  Check,
  Paperclip,
  Smile,
  MoreVertical,
  ArrowLeft,
  Loader2,
  Users,
  Plus,
  X,
  UserPlus,
  LogOut,
  Edit2,
  Trash2,
  Reply,
} from "lucide-react";
import { Card, Badge, SearchInput, IconButton, Button } from "../ui";
import {
  useConversationsV2,
  useConversationV2,
  useMessagesV2,
  useSendMessageV2,
  useCreateDM,
  useCreateGroup,
  useMarkAsReadV2,
  useSearchUsersV2,
  useConversationRealtime,
  useConversationsRealtime,
  useAddReaction,
  useRemoveReaction,
  useSeenAt,
  ALLOWED_EMOJIS,
  type ConversationV2,
  type MessageV2,
  type SearchUser,
} from "../../hooks/useConversationsV2";
import { useWebSocketContext } from "../../contexts/WebSocketContext";
import { authService } from "../../lib/auth";

// ══════════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════════

function formatMessageTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.floor(
    (today.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    return time;
  } else if (diffDays === 1) {
    return `Hier ${time}`;
  } else if (diffDays < 7) {
    const dayName = date.toLocaleDateString("fr-FR", { weekday: "short" });
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${time}`;
  } else {
    const shortDate = date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
    return `${shortDate} ${time}`;
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <div className="absolute bottom-full mb-2 left-0 bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-xl z-50">
      <div className="flex gap-1">
        {ALLOWED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="text-xl hover:bg-slate-700 rounded p-1 transition"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: MessageV2;
  isOwn: boolean;
  conversationId: string;
  showSender?: boolean;
}

function MessageBubble({
  message,
  isOwn,
  conversationId,
  showSender,
}: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

  const handleReaction = (emoji: string) => {
    const existingReaction = message.reactions.find(
      (r) => r.emoji === emoji && r.hasReacted
    );

    if (existingReaction) {
      removeReaction.mutate({ messageId: message.id, emoji, conversationId });
    } else {
      addReaction.mutate({ messageId: message.id, emoji, conversationId });
    }
  };

  // System message
  if (message.contentType === "SYSTEM") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
          {message.metadata?.action === "joined" && "a rejoint le groupe"}
          {message.metadata?.action === "left" && "a quitté le groupe"}
          {message.metadata?.action === "renamed" &&
            `Groupe renommé en "${message.metadata.newValue}"`}
          {message.metadata?.action === "created" && "Groupe créé"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-[85%] sm:max-w-[70%]`}>
        {/* Sender name for group messages */}
        {showSender && !isOwn && (
          <p className="text-xs text-slate-500 mb-1 ml-1">
            {message.sender.nom} {message.sender.prenom || ""}
          </p>
        )}

        <div className="flex items-end gap-2">
          {!isOwn && (
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {getInitials(
                `${message.sender.nom} ${message.sender.prenom || ""}`
              )}
            </div>
          )}

          <div className="relative">
            <div
              className={`rounded-2xl px-4 py-2 shadow-sm ${
                isOwn
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-none"
                  : "bg-slate-700 text-slate-100 rounded-bl-none"
              }`}
            >
              {message.editedAt && (
                <span className="text-[10px] opacity-60 mr-1">(modifié)</span>
              )}
              <p className="text-sm leading-relaxed">{message.content}</p>
            </div>

            {/* Reactions */}
            {message.reactions.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    onClick={() => handleReaction(reaction.emoji)}
                    className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 transition ${
                      reaction.hasReacted
                        ? "bg-blue-600/30 border border-blue-500"
                        : "bg-slate-700/50 border border-slate-600 hover:bg-slate-600"
                    }`}
                  >
                    {reaction.emoji}
                    <span className="text-slate-300">{reaction.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reaction picker trigger */}
            <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="bg-slate-700 hover:bg-slate-600 rounded-full p-1.5 shadow-lg"
              >
                <Smile size={14} className="text-slate-300" />
              </button>

              {showReactions && (
                <EmojiPicker
                  onSelect={handleReaction}
                  onClose={() => setShowReactions(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Time and read status */}
        <div
          className={`flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-slate-500 ${
            isOwn ? "justify-end pr-2" : "justify-start pl-10"
          }`}
        >
          <span>{formatMessageTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const [title, setTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<SearchUser[]>([]);

  const { data: searchResults } = useSearchUsersV2(searchQuery);
  const createGroup = useCreateGroup();

  const handleSubmit = () => {
    if (title.trim() && selectedUsers.length > 0) {
      createGroup.mutate(
        {
          title: title.trim(),
          participantIds: selectedUsers.map((u) => u.id),
        },
        {
          onSuccess: () => {
            setTitle("");
            setSelectedUsers([]);
            onClose();
          },
        }
      );
    }
  };

  const toggleUser = (user: SearchUser) => {
    setSelectedUsers((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-md border border-slate-700 shadow-2xl">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Créer un groupe
          </h3>
          <IconButton
            icon={X}
            variant="ghost"
            onClick={onClose}
            aria-label="Fermer"
          />
        </div>

        <div className="p-4 space-y-4">
          <input
            type="text"
            placeholder="Nom du groupe"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />

          <SearchInput
            placeholder="Rechercher des participants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
          />

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <span
                  key={user.id}
                  className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full text-sm flex items-center gap-1"
                >
                  {user.nom}
                  <button onClick={() => toggleUser(user)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search results */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {searchResults?.map((user) => (
              <button
                key={user.id}
                onClick={() => toggleUser(user)}
                className={`w-full p-2 rounded-lg flex items-center gap-3 text-left transition ${
                  selectedUsers.find((u) => u.id === user.id)
                    ? "bg-blue-600/20"
                    : "hover:bg-slate-700"
                }`}
              >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  {getInitials(`${user.nom} ${user.prenom || ""}`)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {user.nom} {user.prenom || ""}
                  </p>
                  {user.role && (
                    <p className="text-xs text-slate-500">{user.role}</p>
                  )}
                </div>
                {selectedUsers.find((u) => u.id === user.id) && (
                  <Check size={16} className="text-blue-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || selectedUsers.length === 0 || createGroup.isPending}
          >
            {createGroup.isPending ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Users size={16} className="mr-2" />
            )}
            Créer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function MessagesModuleV2() {
  const currentUser = authService.getCurrentUser();
  const currentUserId = currentUser?.id || "";

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // WebSocket context
  const { onlineUsers } = useWebSocketContext();

  // Conversations hooks
  const {
    data: conversationsData,
    isLoading: loadingConversations,
    fetchNextPage: fetchMoreConversations,
    hasNextPage: hasMoreConversations,
  } = useConversationsV2();

  // Selected conversation
  const { data: selectedConversation } = useConversationV2(selectedConversationId);

  // Messages for selected conversation
  const {
    data: messagesData,
    isLoading: loadingMessages,
    fetchNextPage: fetchMoreMessages,
    hasNextPage: hasMoreMessages,
    isFetchingNextPage: fetchingMoreMessages,
  } = useMessagesV2(selectedConversationId);

  // Actions
  const sendMessage = useSendMessageV2();
  const createDM = useCreateDM();
  const markAsRead = useMarkAsReadV2();
  const { data: searchResults } = useSearchUsersV2(searchQuery);

  // Real-time for selected conversation
  const { typingUsers, sendTyping } = useConversationRealtime(selectedConversationId);

  // Real-time for conversations list
  useConversationsRealtime();

  // Flatten conversations pages
  const conversations = useMemo(
    () => conversationsData?.pages.flatMap((page) => page.data) || [],
    [conversationsData]
  );

  // Flatten messages pages
  const messages = useMemo(
    () => messagesData?.pages.flatMap((page) => page.data) || [],
    [messagesData]
  );

  // Seen at indicator
  const seenAt = useSeenAt(selectedConversation || null, currentUserId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark as read when viewing conversation
  useEffect(() => {
    if (selectedConversationId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.senderId !== currentUserId) {
        markAsRead.mutate({
          conversationId: selectedConversationId,
          lastReadMessageId: lastMessage.id,
        });
      }
    }
  }, [selectedConversationId, messages, currentUserId]);

  // Handlers
  const handleSendMessage = () => {
    if (messageInput.trim() && selectedConversationId) {
      sendMessage.mutate(
        {
          conversationId: selectedConversationId,
          content: messageInput.trim(),
        },
        {
          onSuccess: () => {
            setMessageInput("");
            sendTyping(false);
          },
        }
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);

    if (selectedConversationId) {
      sendTyping(true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 2000);
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setSearchQuery("");
    setShowMobileChat(true);
  };

  const handleStartDM = (user: SearchUser) => {
    createDM.mutate(user.id, {
      onSuccess: (result) => {
        setSelectedConversationId(result.conversation.id);
        setSearchQuery("");
        setShowMobileChat(true);
      },
    });
  };

  const handleBackToMessages = () => {
    setShowMobileChat(false);
    setSelectedConversationId(null);
  };

  // Handle scroll for infinite loading
  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop < 100 && hasMoreMessages && !fetchingMoreMessages) {
      fetchMoreMessages();
    }
  };

  // Get display name for conversation
  const getConversationName = (conv: ConversationV2): string => {
    if (conv.type === "GROUP") {
      return conv.title || "Groupe sans nom";
    }
    const partner = conv.participants.find((p) => p.id !== currentUserId);
    return partner ? `${partner.nom} ${partner.prenom || ""}`.trim() : "Conversation";
  };

  // Sidebar items (search results or conversations)
  const sidebarItems =
    searchQuery.length >= 2
      ? searchResults || []
      : conversations;

  return (
    <div className="h-[calc(100vh-12rem)] relative md:flex md:gap-4">
      {/* Conversation List */}
      <Card
        className={`w-full md:w-80 flex flex-col h-full bg-slate-800/50 backdrop-blur-sm border-slate-700/50 ${
          showMobileChat ? "hidden md:flex" : "flex"
        }`}
        padding="none"
      >
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <MessageCircle className="text-blue-400" />
              Messages
            </h2>
            <IconButton
              icon={Plus}
              variant="ghost"
              onClick={() => setShowCreateGroup(true)}
              aria-label="Créer un groupe"
              className="text-blue-400"
            />
          </div>
          <SearchInput
            placeholder="Rechercher (min 2 car.)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            className="w-full"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations && !searchQuery ? (
            <div className="p-4 text-center text-slate-400">
              <Loader2 className="animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : sidebarItems.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              {searchQuery ? "Aucun utilisateur trouvé" : "Aucune conversation"}
            </div>
          ) : searchQuery.length >= 2 ? (
            // Search results (users)
            (searchResults || []).map((user: SearchUser) => (
              <button
                key={user.id}
                onClick={() => handleStartDM(user)}
                className="w-full p-4 border-b border-slate-700/50 transition text-left hover:bg-slate-700/30"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-white">
                      {getInitials(`${user.nom} ${user.prenom || ""}`)}
                    </div>
                    {onlineUsers.has(user.id) && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-white truncate">
                      {user.nom} {user.prenom || ""}
                    </h3>
                    <p className="text-sm text-slate-500 truncate">
                      {user.role && user.agence
                        ? `${user.role} - ${user.agence}`
                        : user.role || "Démarrer une discussion"}
                    </p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            // Conversations
            conversations.map((conv) => {
              const isOnline =
                conv.type === "DM"
                  ? conv.participants
                      .filter((p) => p.id !== currentUserId)
                      .some((p) => onlineUsers.has(p.id))
                  : false;

              const typingInConv = typingUsers.some(
                (t) => conv.id === selectedConversationId
              );

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full p-4 border-b border-slate-700/50 transition text-left group ${
                    selectedConversationId === conv.id
                      ? "bg-blue-600/20 border-l-2 border-l-blue-500"
                      : "hover:bg-slate-700/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      {conv.type === "GROUP" ? (
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg">
                          <Users size={20} />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                          {getInitials(getConversationName(conv))}
                        </div>
                      )}
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full shadow-sm"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3
                          className={`font-semibold text-sm truncate ${
                            selectedConversationId === conv.id
                              ? "text-blue-400"
                              : "text-white"
                          }`}
                        >
                          {getConversationName(conv)}
                        </h3>
                        {conv.lastMessageAt && (
                          <span className="text-xs text-slate-400">
                            {formatMessageTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        {typingInConv ? (
                          <p className="text-sm text-blue-400 italic animate-pulse">
                            En train d'écrire...
                          </p>
                        ) : conv.lastMessagePreview ? (
                          <p className="text-sm text-slate-400 truncate flex-1">
                            {conv.lastMessagePreview}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500 truncate">
                            {conv.type === "GROUP"
                              ? `${conv.participants.length} participants`
                              : "Démarrer une discussion"}
                          </p>
                        )}

                        {conv.unreadCount > 0 && (
                          <Badge
                            variant="primary"
                            size="sm"
                            value={conv.unreadCount}
                            className="ml-2"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {/* Load more conversations */}
          {hasMoreConversations && (
            <button
              onClick={() => fetchMoreConversations()}
              className="w-full p-3 text-sm text-blue-400 hover:bg-slate-700/30"
            >
              Charger plus...
            </button>
          )}
        </div>
      </Card>

      {/* Chat Area */}
      <Card
        className={`flex-1 flex flex-col h-full bg-slate-800/50 backdrop-blur-sm border-slate-700/50 ${
          showMobileChat ? "flex" : "hidden md:flex"
        }`}
        padding="none"
      >
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-3 sm:p-4 border-b border-slate-700/50 flex items-center justify-between bg-gradient-to-r from-slate-800/90 to-slate-800/70">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <IconButton
                  icon={ArrowLeft}
                  variant="ghost"
                  className="md:hidden text-slate-400 -ml-2 flex-shrink-0"
                  onClick={handleBackToMessages}
                  aria-label="Retour aux messages"
                />

                <div className="relative flex-shrink-0">
                  {selectedConversation.type === "GROUP" ? (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg">
                      <Users size={20} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                      {getInitials(getConversationName(selectedConversation))}
                    </div>
                  )}
                  {selectedConversation.type === "DM" &&
                    selectedConversation.participants
                      .filter((p) => p.id !== currentUserId)
                      .some((p) => onlineUsers.has(p.id)) && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full"></div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white text-sm sm:text-base truncate">
                    {getConversationName(selectedConversation)}
                  </h3>
                  <div className="h-4 flex items-center">
                    {typingUsers.length > 0 ? (
                      <p className="text-xs text-blue-400 animate-pulse flex items-center gap-1">
                        <span className="flex gap-0.5">
                          <span
                            className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          ></span>
                          <span
                            className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          ></span>
                          <span
                            className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          ></span>
                        </span>
                        écrit...
                      </p>
                    ) : seenAt ? (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <CheckCheck size={12} className="text-blue-400" />
                        {seenAt}
                      </p>
                    ) : selectedConversation.type === "DM" ? (
                      selectedConversation.participants
                        .filter((p) => p.id !== currentUserId)
                        .some((p) => onlineUsers.has(p.id)) ? (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                          En ligne
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Hors ligne</p>
                      )
                    ) : (
                      <p className="text-xs text-slate-500">
                        {selectedConversation.participants.length} participants
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <IconButton
                icon={MoreVertical}
                variant="ghost"
                className="text-slate-400 flex-shrink-0"
                aria-label="Options"
              />
            </div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/20 scroll-smooth"
            >
              {/* Load more indicator */}
              {fetchingMoreMessages && (
                <div className="flex justify-center p-2">
                  <Loader2 className="animate-spin text-blue-500" size={20} />
                </div>
              )}

              {hasMoreMessages && !fetchingMoreMessages && (
                <button
                  onClick={() => fetchMoreMessages()}
                  className="w-full text-center text-sm text-blue-400 py-2 hover:bg-slate-700/30 rounded"
                >
                  Charger les messages précédents
                </button>
              )}

              {loadingMessages ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isOwn = msg.senderId === currentUserId;
                  const showSender =
                    selectedConversation.type === "GROUP" &&
                    (index === 0 ||
                      messages[index - 1].senderId !== msg.senderId);

                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={isOwn}
                      conversationId={selectedConversation.id}
                      showSender={showSender}
                    />
                  );
                })
              )}
            </div>

            {/* Input */}
            <div className="p-3 sm:p-4 border-t border-slate-700/50 bg-slate-800/80">
              <div className="flex items-center gap-2">
                <IconButton
                  icon={Paperclip}
                  variant="ghost"
                  className="text-slate-400 hidden sm:flex"
                  aria-label="Joindre un fichier"
                />
                <IconButton
                  icon={Smile}
                  variant="ghost"
                  className="text-slate-400 hidden sm:flex"
                  aria-label="Insérer un emoji"
                />

                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Écrire un message..."
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                  />
                </div>

                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessage.isPending}
                  className="rounded-xl px-3 sm:px-4"
                >
                  {sendMessage.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} className="sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">Envoyer</span>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/10">
                <MessageCircle size={40} className="text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Sélectionnez une conversation
              </h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">
                Choisissez une conversation dans la liste pour commencer à
                discuter ou rechercher un contact.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
      />
    </div>
  );
}
