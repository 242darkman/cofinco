/**
 * Composant d'avertissement d'expiration de session - Version Robuste
 *
 * Fonctionnalités:
 * - WebSocket temps réel pour détection immédiate d'expiration
 * - Polling adaptatif (accélère proche de l'expiration)
 * - Gestion visibilité onglet (vérifie au retour)
 * - Synchronisation multi-onglets via BroadcastChannel
 * - Countdown précis en secondes
 * - Redirection automatique si expiré
 * - Retry logic en cas d'erreur réseau
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { authService } from '@/lib/auth';
import { hardRedirectToLogin } from '@/lib/navigation';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Seuil d'avertissement (5 minutes avant expiration)
  WARNING_THRESHOLD_MS: 5 * 60 * 1000,

  // Intervalles de polling adaptatifs
  POLL_INTERVAL_NORMAL: 60_000,    // > 5 min → toutes les 60s
  POLL_INTERVAL_WARNING: 15_000,   // 1-5 min → toutes les 15s
  POLL_INTERVAL_CRITICAL: 5_000,   // < 1 min → toutes les 5s

  // ID unique du toast
  TOAST_ID: 'session-expiration-warning',

  // Retry config
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,

  // Auto-redirect delay après expiration
  REDIRECT_DELAY_MS: 2000,

  // BroadcastChannel name
  CHANNEL_NAME: 'microflex-session-sync',
};

// ============================================
// TYPES
// ============================================

interface SessionInfo {
  expiresAt: string;
  remainingMs: number;
  remainingMinutes: number;
  warningThresholdMs: number;
}

type SessionState =
  | 'active'      // Session normale
  | 'warning'     // Dans la zone d'avertissement
  | 'critical'    // < 1 minute
  | 'expired'     // Session expirée
  | 'error';      // Erreur réseau

interface BroadcastMessage {
  type: 'SESSION_EXTENDED' | 'SESSION_EXPIRED' | 'TOAST_DISMISSED';
  timestamp: number;
}

// ============================================
// UTILS
// ============================================

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPollingInterval(remainingMs: number): number {
  if (remainingMs <= 60_000) return CONFIG.POLL_INTERVAL_CRITICAL;
  if (remainingMs <= CONFIG.WARNING_THRESHOLD_MS) return CONFIG.POLL_INTERVAL_WARNING;
  return CONFIG.POLL_INTERVAL_NORMAL;
}

function getSessionState(remainingMs: number): SessionState {
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= 60_000) return 'critical';
  if (remainingMs <= CONFIG.WARNING_THRESHOLD_MS) return 'warning';
  return 'active';
}

// ============================================
// COMPONENT
// ============================================

export function SessionExpirationWarning() {
  // State
  const [sessionState, setSessionState] = useState<SessionState>('active');
  const [remainingMs, setRemainingMs] = useState<number>(Infinity);
  const [isExtending, setIsExtending] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toastDismissedRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const expiresAtRef = useRef<number>(0);
  const hadValidSessionRef = useRef(false); // Track if we ever had a valid session

  // WebSocket context
  const { isConnected, socket } = useWebSocketContext();

  // Memoized countdown display
  const countdownDisplay = useMemo(() => formatCountdown(remainingMs), [remainingMs]);

  // ============================================
  // BROADCAST CHANNEL (Multi-tab sync)
  // ============================================

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CONFIG.CHANNEL_NAME);
    broadcastChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      // Ignorer les messages si pas authentifié
      if (!authService.isAuthenticated()) return;

      const { type } = event.data;

      switch (type) {
        case 'SESSION_EXTENDED':
          // Un autre onglet a prolongé la session
          toastDismissedRef.current = false;
          toast.dismiss(CONFIG.TOAST_ID);
          fetchSessionInfo(); // Refresh notre état
          break;

        case 'SESSION_EXPIRED':
          // Un autre onglet a détecté l'expiration
          // Seulement si on avait une session valide
          if (hadValidSessionRef.current) {
            handleSessionExpired();
          }
          break;

        case 'TOAST_DISMISSED':
          // Un autre onglet a fermé le toast
          toastDismissedRef.current = true;
          toast.dismiss(CONFIG.TOAST_ID);
          break;
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  const broadcast = useCallback((type: BroadcastMessage['type']) => {
    broadcastChannelRef.current?.postMessage({ type, timestamp: Date.now() });
  }, []);

  // ============================================
  // FETCH SESSION INFO
  // ============================================

  const fetchSessionInfo = useCallback(async (): Promise<SessionInfo | null> => {
    // Éviter les requêtes trop rapprochées
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 2000) {
      return null;
    }
    lastFetchTimeRef.current = now;

    try {
      const response = await fetch('/api/auth/session-info', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Seulement afficher "session expirée" si on avait une session valide avant
          // Sinon, l'utilisateur n'est juste pas connecté (page login)
          if (hadValidSessionRef.current) {
            handleSessionExpired();
          }
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setRetryCount(0); // Reset retry counter on success

      // Marquer qu'on a une session valide
      hadValidSessionRef.current = true;

      // Stocker l'heure d'expiration pour le countdown local
      expiresAtRef.current = Date.now() + data.remainingMs;

      return data;
    } catch (error) {
      console.error('[SessionWarning] Fetch error:', error);

      // Retry logic
      if (retryCount < CONFIG.MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setTimeout(fetchSessionInfo, CONFIG.RETRY_DELAY_MS);
      } else {
        setSessionState('error');
      }

      return null;
    }
  }, [retryCount]);

  // ============================================
  // EXTEND SESSION
  // ============================================

  const extendSession = useCallback(async () => {
    setIsExtending(true);

    try {
      const response = await fetch('/api/auth/extend-session', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();

        // Mettre à jour l'état local
        expiresAtRef.current = Date.now() + (data.remainingMinutes * 60 * 1000);
        setRemainingMs(data.remainingMinutes * 60 * 1000);
        setSessionState('active');
        toastDismissedRef.current = false;

        // Fermer le toast
        toast.dismiss(CONFIG.TOAST_ID);

        // Notifier les autres onglets
        broadcast('SESSION_EXTENDED');

        toast.success('Session prolongée', {
          description: `Votre session a été prolongée de ${data.remainingMinutes} minutes.`,
          duration: 3000,
        });
      } else if (response.status === 401) {
        handleSessionExpired();
      } else {
        toast.error('Erreur', {
          description: 'Impossible de prolonger la session. Veuillez vous reconnecter.',
        });
      }
    } catch (error) {
      toast.error('Erreur réseau', {
        description: 'Vérifiez votre connexion internet.',
      });
    } finally {
      setIsExtending(false);
    }
  }, [broadcast]);

  // ============================================
  // HANDLE SESSION EXPIRED
  // ============================================

  const handleSessionExpired = useCallback(() => {
    setSessionState('expired');

    // Fermer le toast d'avertissement
    toast.dismiss(CONFIG.TOAST_ID);

    // Notifier les autres onglets
    broadcast('SESSION_EXPIRED');

    // Afficher toast d'expiration
    toast.error('Session expirée', {
      description: 'Votre session a expiré. Redirection vers la page de connexion...',
      duration: CONFIG.REDIRECT_DELAY_MS,
    });

    // Redirection après délai
    setTimeout(() => {
      authService.logout();
      hardRedirectToLogin('Votre session a expiré');
    }, CONFIG.REDIRECT_DELAY_MS);
  }, [broadcast]);

  // ============================================
  // DISMISS TOAST
  // ============================================

  const dismissToast = useCallback(() => {
    toast.dismiss(CONFIG.TOAST_ID);
    toastDismissedRef.current = true;
    broadcast('TOAST_DISMISSED');
  }, [broadcast]);

  // ============================================
  // CHECK EXPIRATION & UPDATE STATE
  // ============================================

  const checkExpiration = useCallback(async () => {
    // Skip si non authentifié
    if (!authService.isAuthenticated()) return;

    const info = await fetchSessionInfo();
    if (!info) return;

    const { remainingMs: serverRemainingMs } = info;
    const newState = getSessionState(serverRemainingMs);

    setRemainingMs(serverRemainingMs);
    setSessionState(newState);

    // Gérer l'expiration
    if (newState === 'expired') {
      handleSessionExpired();
      return;
    }

    // Afficher/masquer le toast selon l'état
    if ((newState === 'warning' || newState === 'critical') && !toastDismissedRef.current) {
      showWarningToast();
    } else if (newState === 'active') {
      toast.dismiss(CONFIG.TOAST_ID);
      toastDismissedRef.current = false;
    }

    // Ajuster l'intervalle de polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    const newInterval = getPollingInterval(serverRemainingMs);
    pollIntervalRef.current = setInterval(checkExpiration, newInterval);

  }, [fetchSessionInfo, handleSessionExpired]);

  // ============================================
  // SHOW WARNING TOAST
  // ============================================

  const showWarningToast = useCallback(() => {
    toast.warning(
      <WarningToastContent
        remainingMs={remainingMs}
        sessionState={sessionState}
        isExtending={isExtending}
        onExtend={extendSession}
        onDismiss={dismissToast}
      />,
      {
        id: CONFIG.TOAST_ID,
        duration: Infinity,
        closeButton: false,
      }
    );
  }, [remainingMs, sessionState, isExtending, extendSession, dismissToast]);

  // ============================================
  // WEBSOCKET LISTENER (Real-time)
  // ============================================

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleWsMessage = (event: MessageEvent) => {
      // Seulement traiter si on avait une session valide
      if (!hadValidSessionRef.current) return;

      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'SESSION_TIMEOUT':
          case 'SESSION_INVALID':
          case 'FORCE_LOGOUT':
            // Le serveur nous a notifié de l'expiration
            handleSessionExpired();
            break;

          case 'SESSION_HEARTBEAT_RESPONSE':
            if (!message.payload.valid) {
              handleSessionExpired();
            }
            break;
        }
      } catch (e) {
        // Ignorer les erreurs de parsing
      }
    };

    socket.addEventListener('message', handleWsMessage);
    return () => socket.removeEventListener('message', handleWsMessage);
  }, [socket, isConnected, handleSessionExpired]);

  // ============================================
  // LOCAL COUNTDOWN (Visual update)
  // ============================================

  useEffect(() => {
    // Countdown local pour mise à jour visuelle fluide
    if (sessionState !== 'warning' && sessionState !== 'critical') {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      const newRemaining = expiresAtRef.current - Date.now();
      setRemainingMs(Math.max(0, newRemaining));

      // Vérifier expiration locale
      if (newRemaining <= 0) {
        handleSessionExpired();
      }

      // Mettre à jour le toast si affiché
      if (!toastDismissedRef.current) {
        showWarningToast();
      }
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [sessionState, handleSessionExpired, showWarningToast]);

  // ============================================
  // TAB VISIBILITY HANDLER
  // ============================================

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Vérifier immédiatement quand l'onglet redevient actif
        checkExpiration();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkExpiration]);

  // ============================================
  // INITIAL SETUP & CLEANUP
  // ============================================

  useEffect(() => {
    // Vérification initiale après un court délai
    const initialTimeout = setTimeout(checkExpiration, 3000);

    // Démarrer le polling avec l'intervalle normal
    pollIntervalRef.current = setInterval(checkExpiration, CONFIG.POLL_INTERVAL_NORMAL);

    return () => {
      clearTimeout(initialTimeout);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      toast.dismiss(CONFIG.TOAST_ID);
    };
  }, [checkExpiration]);

  // Ce composant ne rend rien visuellement (utilise les toasts)
  return null;
}

// ============================================
// WARNING TOAST CONTENT COMPONENT
// ============================================

interface WarningToastContentProps {
  remainingMs: number;
  sessionState: SessionState;
  isExtending: boolean;
  onExtend: () => void;
  onDismiss: () => void;
}

function WarningToastContent({
  remainingMs,
  sessionState,
  isExtending,
  onExtend,
  onDismiss,
}: WarningToastContentProps) {
  const isCritical = sessionState === 'critical';
  const countdown = formatCountdown(remainingMs);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {isCritical ? (
          <AlertTriangle className="h-5 w-5 text-status-danger animate-pulse" />
        ) : (
          <Clock className="h-5 w-5 text-status-warning" />
        )}
        <span className={`font-semibold ${isCritical ? 'text-status-danger' : ''}`}>
          {isCritical ? 'Session expire très bientôt !' : 'Session expire bientôt'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-2xl font-mono font-bold ${isCritical ? 'text-status-danger' : 'text-status-warning'}`}>
          {countdown}
        </span>
        <span className="text-sm text-muted-foreground">
          restantes
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Voulez-vous prolonger votre session ?
      </p>

      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          variant={isCritical ? 'danger' : 'primary'}
          onClick={onExtend}
          disabled={isExtending}
          className="flex items-center gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${isExtending ? 'animate-spin' : ''}`} />
          {isExtending ? 'Prolongation...' : 'Prolonger'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
        >
          Ignorer
        </Button>
      </div>
    </div>
  );
}

export default SessionExpirationWarning;
