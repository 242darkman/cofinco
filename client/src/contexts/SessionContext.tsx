/**
 * Contexte de Session avec synchronisation totale Client/Serveur
 *
 * Architecture:
 * 1. Vérification initiale au montage
 * 2. Vérification à chaque navigation (via location)
 * 3. Vérification au retour d'onglet (Page Visibility API)
 * 4. Heartbeat adaptatif (actif: 30s, inactif: 60s)
 * 5. Intégration WebSocket pour invalidation temps réel
 * 6. Cache intelligent pour éviter surcharge serveur
 * 7. Détection perte de connexion avec retry exponentiel
 * 8. WebSocket heartbeat pour prouver que le client est réactif
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  ReactNode,
} from 'react';
import { useLocation } from 'wouter';
import { authService } from '@/lib/auth';
import { useWebSocketContext } from './WebSocketContext';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Intervalles de vérification
  ACTIVE_CHECK_INTERVAL: 30 * 1000,    // 30s quand actif
  IDLE_CHECK_INTERVAL: 60 * 1000,      // 60s quand inactif
  IDLE_THRESHOLD: 2 * 60 * 1000,       // 2min pour considérer inactif

  // Cache de vérification
  CACHE_TTL: 3 * 1000,                 // 3s de cache entre vérifications

  // Retry en cas d'échec
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 1000,              // 1s, puis 2s, puis 4s (exponentiel)

  // Délai après retour d'onglet
  VISIBILITY_CHECK_DELAY: 300,         // 300ms

  // Événements d'activité à surveiller
  ACTIVITY_EVENTS: ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const,

  // Throttle pour les événements d'activité
  ACTIVITY_THROTTLE: 5000,             // 5s entre mises à jour d'activité

  // ========== REFRESH AUTOMATIQUE ==========
  // Renouveler la session automatiquement avant expiration
  SESSION_REFRESH_THRESHOLD: 10 * 60 * 1000,  // 10 minutes avant expiration
  SESSION_INFO_CHECK_INTERVAL: 5 * 60 * 1000, // Vérifier l'expiration toutes les 5 min
};

// ============================================
// TYPES
// ============================================

interface SessionState {
  isValid: boolean;
  isChecking: boolean;
  lastCheck: number;
  lastActivity: number;
  consecutiveFailures: number;
  error: string | null;
  // Session expiration info
  expiresAt: number | null;
  isRefreshing: boolean;
}

interface SessionContextValue extends SessionState {
  /** Force une vérification immédiate (bypass cache) */
  forceVerify: () => Promise<boolean>;
  /** Met à jour manuellement l'activité */
  touchActivity: () => void;
  /** Réinitialise l'état après connexion */
  resetState: () => void;
  /** Prolonge manuellement la session */
  extendSession: () => Promise<boolean>;
  /** Temps restant avant expiration (ms) */
  timeUntilExpiry: number | null;
}

const initialState: SessionState = {
  isValid: true,
  isChecking: false,
  lastCheck: 0,
  lastActivity: Date.now(),
  consecutiveFailures: 0,
  error: null,
  expiresAt: null,
  isRefreshing: false,
};

const SessionContext = createContext<SessionContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

interface SessionProviderProps {
  children: ReactNode;
  /** Callback quand la session devient invalide */
  onSessionInvalid?: (reason: string) => void;
  /** Désactive le provider (pour pages publiques) */
  disabled?: boolean;
}

export function SessionProvider({
  children,
  onSessionInvalid,
  disabled = false,
}: SessionProviderProps) {
  const [location] = useLocation();
  const [state, setState] = useState<SessionState>(initialState);

  // WebSocket pour heartbeat temps réel - use typeof to match the actual type
  let wsContext: ReturnType<typeof useWebSocketContext> | null = null;
  try {
    wsContext = useWebSocketContext();
  } catch {
    // WebSocket context not available (outside provider) - fallback to HTTP only
  }

  // Refs pour éviter les closures stales
  const stateRef = useRef(state);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const activityThrottleRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const onSessionInvalidRef = useRef(onSessionInvalid);

  // Sync state ref
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Sync callback ref (prevents verifySession identity from changing on callback change)
  useEffect(() => {
    onSessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  // ----------------------------------------
  // Fonctions utilitaires
  // ----------------------------------------

  const isUserIdle = useCallback((): boolean => {
    return (Date.now() - stateRef.current.lastActivity) > CONFIG.IDLE_THRESHOLD;
  }, []);

  const getCheckInterval = useCallback((): number => {
    return isUserIdle() ? CONFIG.IDLE_CHECK_INTERVAL : CONFIG.ACTIVE_CHECK_INTERVAL;
  }, [isUserIdle]);

  // ----------------------------------------
  // Vérification de session
  // ----------------------------------------

  const verifySession = useCallback(async (bypassCache = false): Promise<boolean> => {
    // Skip si désactivé ou déjà en cours
    if (disabled || stateRef.current.isChecking) {
      return stateRef.current.isValid;
    }

    // Utiliser cache si récent
    const now = Date.now();
    if (!bypassCache && (now - stateRef.current.lastCheck) < CONFIG.CACHE_TTL) {
      return stateRef.current.isValid;
    }

    setState(prev => ({ ...prev, isChecking: true, error: null }));

    let retries = 0;
    let lastError: Error | null = null;

    while (retries < CONFIG.MAX_RETRIES) {
      try {
        const isValid = await authService.verifySession();

        if (!isMountedRef.current) return isValid;

        setState(prev => ({
          ...prev,
          isValid,
          isChecking: false,
          lastCheck: Date.now(),
          consecutiveFailures: 0,
          error: null,
        }));

        if (!isValid) {
          onSessionInvalidRef.current?.('Session invalide ou expirée');
        }

        return isValid;
      } catch (error) {
        lastError = error as Error;
        retries++;

        if (retries < CONFIG.MAX_RETRIES) {
          // Attendre avec backoff exponentiel
          await new Promise(resolve =>
            setTimeout(resolve, CONFIG.RETRY_BASE_DELAY * Math.pow(2, retries - 1))
          );
        }
      }
    }

    if (!isMountedRef.current) return false;

    // Toutes les tentatives ont échoué
    const failures = stateRef.current.consecutiveFailures + 1;

    setState(prev => ({
      ...prev,
      isChecking: false,
      consecutiveFailures: failures,
      error: lastError?.message || 'Erreur de vérification',
    }));

    // Après trop d'échecs consécutifs, invalider la session
    if (failures >= CONFIG.MAX_RETRIES) {
      setState(prev => ({ ...prev, isValid: false }));
      onSessionInvalidRef.current?.('Impossible de vérifier la session après plusieurs tentatives');
      return false;
    }

    // Sinon, garder l'état précédent
    return stateRef.current.isValid;
  }, [disabled]);

  // ----------------------------------------
  // Mise à jour d'activité (throttled)
  // ----------------------------------------

  const touchActivity = useCallback(() => {
    const now = Date.now();
    if ((now - activityThrottleRef.current) > CONFIG.ACTIVITY_THROTTLE) {
      activityThrottleRef.current = now;
      setState(prev => ({ ...prev, lastActivity: now }));
    }
  }, []);

  // ----------------------------------------
  // Réinitialisation après connexion
  // ----------------------------------------

  const resetState = useCallback(() => {
    setState({
      ...initialState,
      lastActivity: Date.now(),
      lastCheck: Date.now(),
    });
  }, []);

  // ----------------------------------------
  // Refresh automatique de session
  // ----------------------------------------

  /**
   * Récupère les infos d'expiration de la session
   */
  const fetchSessionInfo = useCallback(async () => {
    if (disabled) return;

    try {
      const response = await fetch('/api/auth/session-info', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.expiresAt) {
          const expiresAt = new Date(data.expiresAt).getTime();
          setState(prev => ({ ...prev, expiresAt }));
        }
      }
    } catch (error) {
      console.warn('[Session] Failed to fetch session info:', error);
    }
  }, [disabled]);

  /**
   * Prolonge la session manuellement ou automatiquement
   */
  const extendSession = useCallback(async (): Promise<boolean> => {
    if (disabled || stateRef.current.isRefreshing) return false;

    setState(prev => ({ ...prev, isRefreshing: true }));

    try {
      const response = await fetch('/api/auth/extend-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        const newExpiresAt = data.newExpiresAt
          ? new Date(data.newExpiresAt).getTime()
          : null;

        setState(prev => ({
          ...prev,
          isRefreshing: false,
          expiresAt: newExpiresAt,
          error: null,
        }));

        if (import.meta.env.DEV) console.log('[Session] Extended successfully');
        return true;
      } else {
        throw new Error('Failed to extend session');
      }
    } catch (error) {
      console.warn('[Session] Failed to extend:', error);
      setState(prev => ({ ...prev, isRefreshing: false }));
      return false;
    }
  }, [disabled]);

  /**
   * Vérifie si la session doit être rafraîchie automatiquement
   */
  const checkAndRefreshSession = useCallback(async () => {
    if (disabled || !stateRef.current.expiresAt) return;

    const now = Date.now();
    const timeUntilExpiry = stateRef.current.expiresAt - now;

    // Si proche de l'expiration et utilisateur actif, rafraîchir
    if (timeUntilExpiry > 0 && timeUntilExpiry <= CONFIG.SESSION_REFRESH_THRESHOLD) {
      const timeSinceActivity = now - stateRef.current.lastActivity;

      // Ne rafraîchir que si l'utilisateur est actif (activité < 5 min)
      if (timeSinceActivity < 5 * 60 * 1000) {
        if (import.meta.env.DEV) console.log('[Session] Auto-refreshing (expires in', Math.round(timeUntilExpiry / 1000), 's)');
        await extendSession();
      }
    }
  }, [disabled, extendSession]);

  // ----------------------------------------
  // Gestion de la visibilité
  // ----------------------------------------

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible' && !disabled) {
      // Délai court pour laisser le navigateur se stabiliser
      setTimeout(() => {
        verifySession(true); // Bypass cache
      }, CONFIG.VISIBILITY_CHECK_DELAY);
    }
  }, [disabled, verifySession]);

  // ----------------------------------------
  // Gestion de l'activité utilisateur
  // ----------------------------------------

  const handleUserActivity = useCallback(() => {
    touchActivity();
  }, [touchActivity]);

  // ----------------------------------------
  // Heartbeat adaptatif
  // ----------------------------------------

  const startHeartbeat = useCallback(() => {
    if (checkIntervalRef.current) {
      clearTimeout(checkIntervalRef.current);
    }

    const scheduleNextCheck = () => {
      if (!isMountedRef.current || disabled) return;

      const interval = getCheckInterval();

      checkIntervalRef.current = setTimeout(async () => {
        await verifySession();
        scheduleNextCheck();
      }, interval);
    };

    scheduleNextCheck();
  }, [disabled, getCheckInterval, verifySession]);

  const stopHeartbeat = useCallback(() => {
    if (checkIntervalRef.current) {
      clearTimeout(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  // ----------------------------------------
  // Effet: Vérification à chaque navigation
  // ----------------------------------------

  useEffect(() => {
    if (!disabled) {
      verifySession();
    }
  }, [location, disabled, verifySession]);

  // ----------------------------------------
  // Effet: Setup des listeners
  // ----------------------------------------

  useEffect(() => {
    isMountedRef.current = true;

    if (disabled) {
      return () => {
        isMountedRef.current = false;
      };
    }

    // Page Visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Événements d'activité
    CONFIG.ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Démarrer le heartbeat
    startHeartbeat();

    // Vérification initiale
    verifySession(true);

    return () => {
      isMountedRef.current = false;

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      CONFIG.ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });

      stopHeartbeat();

      // Cleanup WebSocket heartbeat
      if (wsHeartbeatRef.current) {
        clearInterval(wsHeartbeatRef.current);
        wsHeartbeatRef.current = null;
      }
    };
  }, [disabled, handleVisibilityChange, handleUserActivity, startHeartbeat, stopHeartbeat, verifySession]);

  // ----------------------------------------
  // Effet: WebSocket Heartbeat
  // ----------------------------------------

  useEffect(() => {
    if (disabled || !wsContext?.isConnected) {
      return;
    }

    // Envoyer un SESSION_HEARTBEAT via WebSocket toutes les 30 secondes
    // Ceci prouve que le client JS est réactif (pas gelé/crashé)
    const sendWsHeartbeat = () => {
      if (wsContext?.isConnected) {
        wsContext.sendMessage('SESSION_HEARTBEAT', { timestamp: Date.now() });
      }
    };

    // Envoyer immédiatement
    sendWsHeartbeat();

    // Puis périodiquement
    wsHeartbeatRef.current = setInterval(sendWsHeartbeat, 30 * 1000);

    return () => {
      if (wsHeartbeatRef.current) {
        clearInterval(wsHeartbeatRef.current);
        wsHeartbeatRef.current = null;
      }
    };
  }, [disabled, wsContext?.isConnected, wsContext?.sendMessage]);

  // ----------------------------------------
  // Effet: Online/Offline
  // ----------------------------------------

  useEffect(() => {
    const handleOnline = () => {
      if (!disabled) {
        // Vérifier la session quand on revient en ligne
        verifySession(true);
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [disabled, verifySession]);

  // ----------------------------------------
  // Effet: Auto-refresh de session
  // ----------------------------------------

  useEffect(() => {
    if (disabled) return;

    // Récupérer les infos de session initiales
    fetchSessionInfo();

    // Vérifier périodiquement si on doit rafraîchir
    const refreshCheckInterval = setInterval(() => {
      checkAndRefreshSession();
    }, CONFIG.SESSION_INFO_CHECK_INTERVAL);

    // Aussi rafraîchir les infos de session périodiquement
    const sessionInfoInterval = setInterval(() => {
      fetchSessionInfo();
    }, CONFIG.SESSION_INFO_CHECK_INTERVAL);

    return () => {
      clearInterval(refreshCheckInterval);
      clearInterval(sessionInfoInterval);
    };
  }, [disabled, fetchSessionInfo, checkAndRefreshSession]);

  // ----------------------------------------
  // Render
  // ----------------------------------------

  // Calculer le temps restant avant expiration
  const timeUntilExpiry = state.expiresAt
    ? Math.max(0, state.expiresAt - Date.now())
    : null;

  const contextValue: SessionContextValue = {
    ...state,
    forceVerify: () => verifySession(true),
    touchActivity,
    resetState,
    extendSession,
    timeUntilExpiry,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/**
 * Hook pour accéder au contexte de session
 */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

/**
 * Hook pour vérifier si la session est valide
 * Retourne null pendant la vérification initiale
 */
export function useIsSessionValid(): boolean | null {
  const context = useContext(SessionContext);
  if (!context) return null;

  // Pendant la première vérification, retourner null
  if (context.lastCheck === 0 && context.isChecking) {
    return null;
  }

  return context.isValid;
}

/**
 * Hook pour forcer une vérification de session
 */
export function useVerifySession() {
  const context = useContext(SessionContext);
  return context?.forceVerify ?? (() => Promise.resolve(false));
}

export default SessionContext;
