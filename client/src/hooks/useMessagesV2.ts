import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface ConversationParticipant {
  id: string;
  nom: string;
  prenom: string | null;
  photoProfile: string | null;
  role: string | null;
  agence: string | null;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}

interface MessageSender {
  id: string;
  nom: string;
  prenom: string | null;
  photoProfile: string | null;
}

interface MessageReaction {
  emoji: string;
  count: number;
  users: Array<{ id: string; nom: string }>;
  hasReacted: boolean;
}

export interface ConversationV2 {
  id: string;
  type: "DM" | "GROUP";
  title: string | null;
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
  displayTitle: string;
}

export interface MessageV2 {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  contentType: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "SYSTEM";
  metadata: Record<string, unknown> | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  sender: MessageSender;
  reactions: MessageReaction[];
}

interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface SearchUser {
  id: string;
  username: string;
  nom: string;
  prenom: string | null;
  photoProfile: string | null;
  role: string | null;
  agence: string | null;
  agenceId: string | null;
  typeCompte: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ══════════════════════════════════════════════════════════════════════════════

export const messagesV2Keys = {
  conversations: ["v2", "conversations"] as const,
  conversation: (id: string) => ["v2", "conversations", id] as const,
  messages: (conversationId: string) => ["v2", "conversations", conversationId, "messages"] as const,
  searchUsers: (query: string) => ["v2", "users", "search", query] as const,
};

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all conversations for the current user
 */
export function useConversationsV2() {
  return useQuery<CursorPage<ConversationV2>>({
    queryKey: messagesV2Keys.conversations,
    queryFn: async () => {
      const res = await fetch("/api/v2/conversations", { credentials: "include" });
      if (res.status === 401) return { data: [], nextCursor: null, hasMore: false };
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    refetchInterval: 30000, // 30s - optimized for slow connections (was 15s)
    staleTime: 15000,
    retry: false,
  });
}

/**
 * Fetch a single conversation detail
 */
export function useConversationDetail(conversationId: string | null) {
  return useQuery<ConversationV2>({
    queryKey: messagesV2Keys.conversation(conversationId || ""),
    queryFn: async () => {
      const res = await fetch(`/api/v2/conversations/${conversationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!conversationId,
  });
}

/**
 * Fetch messages for a conversation with cursor-based infinite pagination
 */
export function useConversationMessages(conversationId: string | null) {
  return useInfiniteQuery<CursorPage<MessageV2>>({
    queryKey: messagesV2Keys.messages(conversationId || ""),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "50" });
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/v2/conversations/${conversationId}/messages?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!conversationId,
    refetchInterval: false,
  });
}

/**
 * Create or get a DM conversation
 */
export function useCreateDM() {
  const queryClient = useQueryClient();

  return useMutation<
    { conversation: ConversationV2; created: boolean },
    Error,
    { userId: string }
  >({
    mutationFn: async ({ userId }) => {
      const res = await fetch("/api/v2/conversations/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to create DM");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.conversations });
    },
  });
}

/**
 * Create a group conversation
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation<
    { conversation: ConversationV2; created: boolean },
    Error,
    { title: string; participantIds: string[] }
  >({
    mutationFn: async (payload) => {
      const res = await fetch("/api/v2/conversations/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.conversations });
    },
  });
}

/**
 * Send a message in a conversation
 */
export function useSendMessageV2() {
  const queryClient = useQueryClient();

  return useMutation<
    MessageV2,
    Error,
    {
      conversationId: string;
      content?: string;
      contentType?: "TEXT" | "IMAGE" | "FILE" | "AUDIO";
      metadata?: Record<string, unknown>;
      replyToMessageId?: string;
    }
  >({
    mutationFn: async ({ conversationId, ...payload }) => {
      const res = await fetch(`/api/v2/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.messages(variables.conversationId) });
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.conversations });
    },
  });
}

/**
 * Edit a message
 */
export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    MessageV2,
    Error,
    { messageId: string; content: string; conversationId: string }
  >({
    mutationFn: async ({ messageId, content }) => {
      const res = await fetch(`/api/v2/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to edit message");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.messages(variables.conversationId) });
    },
  });
}

/**
 * Delete a message (soft delete)
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    Error,
    { messageId: string; conversationId: string }
  >({
    mutationFn: async ({ messageId }) => {
      const res = await fetch(`/api/v2/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete message");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.messages(variables.conversationId) });
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.conversations });
    },
  });
}

/**
 * Add a reaction to a message
 */
export function useAddReaction() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    Error,
    { messageId: string; emoji: string; conversationId: string }
  >({
    mutationFn: async ({ messageId, emoji }) => {
      const res = await fetch(`/api/v2/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed to add reaction");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.messages(variables.conversationId) });
    },
  });
}

/**
 * Remove a reaction from a message
 */
export function useRemoveReaction() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    Error,
    { messageId: string; emoji: string; conversationId: string }
  >({
    mutationFn: async ({ messageId, emoji }) => {
      const res = await fetch(`/api/v2/messages/${messageId}/reactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed to remove reaction");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.messages(variables.conversationId) });
    },
  });
}

/**
 * Mark a conversation as read up to a specific message
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; lastReadAt: string; lastReadMessageId: string },
    Error,
    { conversationId: string; lastReadMessageId: string }
  >({
    mutationFn: async ({ conversationId, lastReadMessageId }) => {
      const res = await fetch(`/api/v2/conversations/${conversationId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lastReadMessageId }),
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesV2Keys.conversations });
    },
  });
}

/**
 * Search users to start a conversation
 */
export function useSearchUsersV2(query: string) {
  return useQuery<SearchUser[]>({
    queryKey: messagesV2Keys.searchUsers(query),
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const res = await fetch(
        `/api/v2/conversations/users/search?q=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to search users");
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 60000,
  });
}
