import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

interface Conversation {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
  partnerStatus?: string;
  unreadCount?: number;
}

interface SendMessagePayload {
  receiverId: string;
  content: string;
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/messages/conversations", { credentials: 'include' });
      // Return empty array if not authenticated (avoid console errors)
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    refetchInterval: 10000,
    retry: false, // Don't retry on 401
  });
}

export function useChat(userId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["/api/messages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/messages/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!userId,
    // Polling disabled as we use WebSockets now
    refetchInterval: false, 
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: (newMessage, variables) => {
      // Invalidate chat history with this user
      queryClient.invalidateQueries({ queryKey: ["/api/messages", variables.receiverId] });
      // Invalidate conversations list to update last message/order
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
  });
}

export function useSearchUsers(query: string) {
    return useQuery({
        queryKey: ["/api/messages/users/search", query],
        queryFn: async () => {
            if (!query || query.length < 2) return [];
            const res = await fetch(`/api/messages/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
            if (!res.ok) throw new Error("Failed to search users");
            return res.json();
        },
        enabled: query.length >= 2,
        staleTime: 60000
    });
}
