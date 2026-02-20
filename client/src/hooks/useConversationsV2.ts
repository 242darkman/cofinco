/**
 * Hooks React pour le système de messagerie V2 (Conversation-centric)
 *
 * Features:
 * - Pagination cursor-based (infinite scroll)
 * - Support DM et GROUP
 * - Read receipts avec "vu à [heure]"
 * - Réactions aux messages
 * - Temps réel via WebSocket
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface ConversationParticipant {
  id: string;
  nom: string;
  prenom: string | null;
  photoProfile: string | null;
  role: string | null;
  agence: string | null;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  participantRole?: "MEMBER" | "ADMIN";
}

export interface ConversationV2 {
  id: string;
  type: "DM" | "GROUP";
  title: string | null;
  displayTitle: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  agenceId: string | null;
  isArchived: boolean;
  dmKey: string | null;
  participants: ConversationParticipant[];
  unreadCount: number;
  lastMessage: MessageV2 | null;
}

export interface MessageV2 {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  contentType: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "SYSTEM";
  metadata: MessageMetadata | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  sender: {
    id: string;
    nom: string;
    prenom: string | null;
    photoProfile: string | null;
  };
  reactions: MessageReaction[];
}

export interface MessageMetadata {
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
  waveform?: number[];
  action?: "joined" | "left" | "renamed" | "created";
  targetUserId?: string;
  oldValue?: string;
  newValue?: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: Array<{ id: string; nom: string }>;
  hasReacted: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchUser {
  id: string;
  username: string | null;
  nom: string;
  prenom: string | null;
  photoProfile: string | null;
  role: string | null;
  agence: string | null;
  agenceId: string | null;
  typeCompte: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchWithAuth<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });

  if (res.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: CONVERSATIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Liste des conversations avec pagination infinie
 */
export function useConversationsV2(options?: { limit?: number }) {
  const limit = options?.limit || 20;

  return useInfiniteQuery<PaginatedResponse<ConversationV2>>({
    queryKey: ["/api/v2/conversations"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) {
        params.set("cursor", pageParam as string);
      }
      return fetchWithAuth(`/api/v2/conversations?${params}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Détails d'une conversation
 */
export function useConversationV2(conversationId: string | null) {
  return useQuery<ConversationV2>({
    queryKey: ["/api/v2/conversations", conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");
      return fetchWithAuth(`/api/v2/conversations/${conversationId}`);
    },
    enabled: !!conversationId,
  });
}

/**
 * Créer ou récupérer une conversation DM
 */
export function useCreateDM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      return fetchWithAuth<{ conversation: ConversationV2; created: boolean }>(
        "/api/v2/conversations/dm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
    },
  });
}

/**
 * Créer une conversation de groupe
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { title: string; participantIds: string[] }) => {
      return fetchWithAuth<{ conversation: ConversationV2; created: boolean }>(
        "/api/v2/conversations/group",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
    },
  });
}

/**
 * Modifier une conversation (titre de groupe)
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      title,
    }: {
      conversationId: string;
      title: string;
    }) => {
      return fetchWithAuth<ConversationV2>(
        `/api/v2/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId],
      });
    },
  });
}

/**
 * Ajouter un participant à un groupe
 */
export function useAddParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      return fetchWithAuth(`/api/v2/conversations/${conversationId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId],
      });
    },
  });
}

/**
 * Retirer un participant ou quitter un groupe
 */
export function useRemoveParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      return fetchWithAuth(
        `/api/v2/conversations/${conversationId}/participants/${userId}`,
        { method: "DELETE" }
      );
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId],
      });
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Messages d'une conversation avec pagination infinie
 */
export function useMessagesV2(
  conversationId: string | null,
  options?: { limit?: number }
) {
  const limit = options?.limit || 50;

  return useInfiniteQuery<PaginatedResponse<MessageV2>>({
    queryKey: ["/api/v2/conversations", conversationId, "messages"],
    queryFn: async ({ pageParam }) => {
      if (!conversationId) throw new Error("No conversation ID");
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) {
        params.set("cursor", pageParam as string);
      }
      return fetchWithAuth(
        `/api/v2/conversations/${conversationId}/messages?${params}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!conversationId,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Envoyer un message
 */
export function useSendMessageV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      contentType = "TEXT",
      metadata,
      replyToMessageId,
    }: {
      conversationId: string;
      content: string;
      contentType?: "TEXT" | "IMAGE" | "FILE" | "AUDIO";
      metadata?: MessageMetadata;
      replyToMessageId?: string;
    }) => {
      return fetchWithAuth<MessageV2>(
        `/api/v2/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, contentType, metadata, replyToMessageId }),
        }
      );
    },
    onSuccess: (newMessage, { conversationId }) => {
      // Ajouter le message au cache immédiatement (optimistic update)
      queryClient.setQueryData(
        ["/api/v2/conversations", conversationId, "messages"],
        (old: any) => {
          if (!old) return old;
          // Ajouter le nouveau message à la première page
          const newPages = [...old.pages];
          if (newPages[0]) {
            newPages[0] = {
              ...newPages[0],
              data: [...newPages[0].data, newMessage],
            };
          }
          return { ...old, pages: newPages };
        }
      );

      // Invalider la liste des conversations pour mettre à jour lastMessage
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
    },
  });
}

/**
 * Modifier un message
 */
export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      content,
    }: {
      messageId: string;
      content: string;
      conversationId: string;
    }) => {
      return fetchWithAuth<MessageV2>(`/api/v2/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId, "messages"],
      });
    },
  });
}

/**
 * Supprimer un message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      return fetchWithAuth(`/api/v2/messages/${messageId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId, "messages"],
      });
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: READ RECEIPTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Marquer une conversation comme lue
 */
export function useMarkAsReadV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      lastReadMessageId,
    }: {
      conversationId: string;
      lastReadMessageId: string;
    }) => {
      return fetchWithAuth(`/api/v2/conversations/${conversationId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastReadMessageId }),
      });
    },
    onSuccess: (_, { conversationId }) => {
      // Invalider pour mettre à jour le unreadCount
      queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });

      // Dispatch event for real-time badge update
      window.dispatchEvent(new CustomEvent('messages-read', {
        detail: { conversationId }
      }));
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: REACTIONS
// ══════════════════════════════════════════════════════════════════════════════

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🙏", "👏", "🔥"];

/**
 * Ajouter une réaction
 */
export function useAddReaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      emoji,
    }: {
      messageId: string;
      emoji: string;
      conversationId: string;
    }) => {
      if (!ALLOWED_EMOJIS.includes(emoji)) {
        throw new Error("Emoji non autorisé");
      }
      return fetchWithAuth(`/api/v2/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId, "messages"],
      });
    },
  });
}

/**
 * Retirer une réaction
 */
export function useRemoveReaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      emoji,
    }: {
      messageId: string;
      emoji: string;
      conversationId: string;
    }) => {
      return fetchWithAuth(`/api/v2/messages/${messageId}/reactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v2/conversations", conversationId, "messages"],
      });
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: USER SEARCH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Rechercher des utilisateurs pour démarrer une conversation
 */
export function useSearchUsersV2(query: string, options?: { agenceOnly?: boolean }) {
  return useQuery<SearchUser[]>({
    queryKey: ["/api/v2/conversations/users/search", query, options?.agenceOnly],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const params = new URLSearchParams({ q: query });
      if (options?.agenceOnly) {
        params.set("agenceOnly", "true");
      }
      return fetchWithAuth(`/api/v2/conversations/users/search?${params}`);
    },
    enabled: query.length >= 2,
    staleTime: 60000, // 1 minute
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS: WEBSOCKET INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Hook pour la gestion temps réel d'une conversation
 * - Subscribe/Unsubscribe automatique
 * - Gestion typing
 * - Écoute des événements WS
 */
export function useConversationRealtime(conversationId: string | null) {
  const { socket, isConnected, sendMessage } = useWebSocketContext();
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState<Map<string, { userId: string; timestamp: number }>>(
    new Map()
  );
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Subscribe à la conversation
  useEffect(() => {
    if (!conversationId || !isConnected || !socket) return;

    // Subscribe
    sendMessage("SUBSCRIBE_CONVERSATION", { conversationId });

    // Handler pour les messages WS
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Nouveau message
        if (message.type === "CHAT_MESSAGE_V2" && message.payload.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId, "messages"],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
        }

        // Typing
        if (message.type === "TYPING_V2" && message.payload.conversationId === conversationId) {
          const { userId, isTyping } = message.payload;

          setTypingUsers((prev) => {
            const newMap = new Map(prev);
            if (isTyping) {
              newMap.set(userId, { userId, timestamp: Date.now() });

              // Clear existing timeout
              if (typingTimeoutRef.current.has(userId)) {
                clearTimeout(typingTimeoutRef.current.get(userId));
              }

              // Auto-clear after 3 seconds
              const timeout = setTimeout(() => {
                setTypingUsers((p) => {
                  const m = new Map(p);
                  m.delete(userId);
                  return m;
                });
                typingTimeoutRef.current.delete(userId);
              }, 3000);
              typingTimeoutRef.current.set(userId, timeout);
            } else {
              newMap.delete(userId);
              if (typingTimeoutRef.current.has(userId)) {
                clearTimeout(typingTimeoutRef.current.get(userId));
                typingTimeoutRef.current.delete(userId);
              }
            }
            return newMap;
          });
        }

        // Read update
        if (message.type === "READ_UPDATE" && message.payload.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
        }

        // Reaction
        if (message.type === "MESSAGE_REACTION" && message.payload.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId, "messages"],
          });
        }

        // Message deleted
        if (message.type === "MESSAGE_DELETED" && message.payload.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId, "messages"],
          });
        }

        // Message edited
        if (message.type === "MESSAGE_EDITED" && message.payload.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId, "messages"],
          });
        }

        // Conversation update
        if (
          message.type === "CONVERSATION_UPDATE" &&
          (message.payload.conversationId === conversationId ||
            message.payload.conversation?.id === conversationId)
        ) {
          queryClient.invalidateQueries({
            queryKey: ["/api/v2/conversations", conversationId],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
        }
      } catch {
        // Ignore parse errors
      }
    };

    socket.addEventListener("message", handleWsMessage);

    return () => {
      // Unsubscribe
      if (socket.readyState === WebSocket.OPEN) {
        sendMessage("UNSUBSCRIBE_CONVERSATION", { conversationId });
      }
      socket.removeEventListener("message", handleWsMessage);

      // Clear typing timeouts
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutRef.current.clear();
    };
  }, [conversationId, isConnected, socket, sendMessage, queryClient]);

  // Fonction pour envoyer un indicateur de typing
  const sendTypingV2 = useCallback(
    (isTyping: boolean) => {
      if (!conversationId || !isConnected) return;
      sendMessage("TYPING_V2", { conversationId, isTyping });
    },
    [conversationId, isConnected, sendMessage]
  );

  return {
    typingUsers: Array.from(typingUsers.values()),
    sendTyping: sendTypingV2,
  };
}

/**
 * Hook pour écouter les mises à jour de conversations globalement
 * (nouveaux messages, nouvelles conversations)
 */
export function useConversationsRealtime() {
  const { socket, isConnected } = useWebSocketContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !socket) return;

    const handleWsMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Nouvelle conversation
        if (message.type === "CONVERSATION_UPDATE" && message.payload.action === "created") {
          queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
        }

        // Nouveau message dans n'importe quelle conversation
        if (message.type === "CHAT_MESSAGE_V2") {
          queryClient.invalidateQueries({ queryKey: ["/api/v2/conversations"] });
        }
      } catch {
        // Ignore parse errors
      }
    };

    socket.addEventListener("message", handleWsMessage);

    return () => {
      socket.removeEventListener("message", handleWsMessage);
    };
  }, [isConnected, socket, queryClient]);
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY HOOKS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Hook pour obtenir le nom d'affichage d'une conversation
 */
export function useConversationDisplayName(
  conversation: ConversationV2 | null,
  currentUserId: string | null
): string {
  if (!conversation) return "";

  if (conversation.type === "GROUP") {
    return conversation.title || "Groupe sans nom";
  }

  // DM: Trouver le partenaire
  const partner = conversation.participants.find((p) => p.id !== currentUserId);
  if (partner) {
    return `${partner.nom} ${partner.prenom || ""}`.trim();
  }

  return conversation.displayTitle || "Conversation";
}

/**
 * Hook pour formater "vu à [heure]"
 */
export function useSeenAt(
  conversation: ConversationV2 | null,
  currentUserId: string | null
): string | null {
  if (!conversation || !currentUserId) return null;

  // Pour DM: Trouver le lastReadAt du partenaire
  if (conversation.type === "DM") {
    const partner = conversation.participants.find((p) => p.id !== currentUserId);
    if (partner?.lastReadAt) {
      const date = new Date(partner.lastReadAt);
      return `Vu à ${date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return null;
  }

  // Pour GROUP: Compter le nombre de personnes qui ont lu
  const readCount = conversation.participants.filter(
    (p) => p.id !== currentUserId && p.lastReadAt
  ).length;

  if (readCount === 0) return null;

  const totalOthers = conversation.participants.filter(
    (p) => p.id !== currentUserId
  ).length;

  if (readCount === totalOthers) {
    return "Vu par tous";
  }

  return `Vu par ${readCount}`;
}

/**
 * Liste des emojis autorisés pour les réactions
 */
export { ALLOWED_EMOJIS };
