/**
 * Hook pour compter le nombre total de messages non lus
 * Utilisé pour afficher le badge sur l'icône de messagerie
 *
 * Features:
 * - Comptage temps réel via WebSocket
 * - Son de notification pour nouveaux messages (Web Audio API)
 * - Notifications système créées côté serveur
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useRef } from "react";

interface ConversationWithUnread {
  id: string;
  unreadCount: number;
}

interface UnreadCountResponse {
  totalUnread: number;
  conversations: ConversationWithUnread[];
}

// Singleton AudioContext pour éviter les problèmes de création multiple
let audioContextInstance: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContextInstance) {
    try {
      audioContextInstance = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
      return null;
    }
  }
  return audioContextInstance;
}

/**
 * Génère un son de notification agréable avec Web Audio API
 * Son de type "ding" à deux tons
 */
function playNotificationDing() {
  const audioContext = getAudioContext();
  if (!audioContext) return;

  // Resume context if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const now = audioContext.currentTime;

  // Premier ton (plus haut)
  const osc1 = audioContext.createOscillator();
  const gain1 = audioContext.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now); // A5
  gain1.gain.setValueAtTime(0.3, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc1.connect(gain1);
  gain1.connect(audioContext.destination);
  osc1.start(now);
  osc1.stop(now + 0.3);

  // Deuxième ton (plus bas, légèrement décalé)
  const osc2 = audioContext.createOscillator();
  const gain2 = audioContext.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, now + 0.08); // E5
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0.25, now + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  osc2.connect(gain2);
  gain2.connect(audioContext.destination);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.4);
}

/**
 * Récupère le nombre total de messages non lus avec mise à jour temps réel
 */
export function useUnreadMessagesCount() {
  const queryClient = useQueryClient();
  const hasInteracted = useRef(false);

  // Track user interaction to enable sound (browser autoplay policy)
  useEffect(() => {
    const handleInteraction = () => {
      hasInteracted.current = true;
      // Initialize audio context on first interaction
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // Fonction pour jouer le son de notification
  const playNotificationSound = useCallback(() => {
    if (hasInteracted.current) {
      playNotificationDing();
    }
  }, []);


  const query = useQuery<UnreadCountResponse>({
    queryKey: ["unread-messages-count"],
    queryFn: async () => {
      const res = await fetch("/api/v2/conversations/unread-count", {
        credentials: "include",
      });

      if (!res.ok) {
        // Fallback: calculer depuis les conversations
        const convRes = await fetch("/api/v2/conversations?limit=50", {
          credentials: "include",
        });

        if (!convRes.ok) {
          return { totalUnread: 0, conversations: [] };
        }

        const convData = await convRes.json();
        const conversations = convData.data || [];
        const totalUnread = conversations.reduce(
          (acc: number, conv: ConversationWithUnread) => acc + (conv.unreadCount || 0),
          0
        );

        return { totalUnread, conversations };
      }

      return res.json();
    },
    staleTime: 10000, // 10 seconds - more frequent updates
    refetchInterval: 30000, // Refresh every 30s as backup
  });

  // Écouter l'événement custom 'new-message-received' pour les mises à jour temps réel
  useEffect(() => {
    const handleNewMessage = () => {
      // Jouer le son de notification
      playNotificationSound();

      // Invalider le cache pour forcer un refetch immédiat
      queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });

      // Les notifications sont créées côté serveur, on invalide juste le cache
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    window.addEventListener('new-message-received', handleNewMessage);

    return () => {
      window.removeEventListener('new-message-received', handleNewMessage);
    };
  }, [playNotificationSound, queryClient]);

  // Écouter aussi les événements de lecture pour mettre à jour le compteur
  useEffect(() => {
    const handleReadUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });
    };

    window.addEventListener('messages-read', handleReadUpdate);

    return () => {
      window.removeEventListener('messages-read', handleReadUpdate);
    };
  }, [queryClient]);

  return {
    totalUnread: query.data?.totalUnread || 0,
    conversations: query.data?.conversations || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    playNotificationSound,
  };
}

/**
 * Hook simplifié pour juste le compteur (sans les détails)
 */
export function useUnreadCount() {
  const { totalUnread, isLoading, refetch } = useUnreadMessagesCount();
  return { count: totalUnread, isLoading, refetch };
}
