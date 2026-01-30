/**
 * Hook de protection de session avec synchronisation totale client/serveur
 *
 * Fonctionnalités:
 * - Vérification session à chaque navigation
 * - Détection retour onglet (Page Visibility API)
 * - Heartbeat adaptatif selon activité
 * - Cache intelligent pour éviter surcharge serveur
 * - Intégration WebSocket pour invalidation temps réel
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import { authService } from '@/lib/auth';

// Configuration des intervalles
const SESSION_CHECK_CONFIG = {
  // Intervalle normal quand l'utilisateur est actif
  ACTIVE_INTERVAL_MS: 30 * 1000, // 30 secondes

  // Intervalle quand l'utilisateur est inactif
  IDLE_INTERVAL_MS: 60 * 1000, // 1 minute

  // Délai avant de considérer l'utilisateur comme inactif
  IDLE_THRESHOLD_MS: 2 * 60 * 1000, // 2 minutes sans activité

  // Cache de vérification - évite les requêtes répétées
  CACHE_DURATION_MS: 5 * 1000, // 5 secondes

  // Délai après retour d'onglet caché
  VISIBILITY_DELAY_MS: 500, // 500ms après retour

  // Nombre max de vérifications ratées avant déconnexion
  MAX_FAILED_CHECKS: 2,
};

interface SessionState {
  isValid: boolean;
  isChecking: boolean;
  lastCheck: number;
  failedChecks: number;
}

interface UseSessionGuardOptions {
  // Désactive la vérification automatique (pour pages publiques)
  disabled?: boolean;
  // Callback personnalisé lors de session invalide
  onSessionInvalid?: (reason: string) => void;
  // Forcer une vérification immédiate
  forceCheck?: boolean;
}

/**
 * Hook principal de protection de session
 */
export function useSessionGuard(options: UseSessionGuardOptions = {}) {
  const { disabled = false, onSessionInvalid, forceCheck = false } = options;
  const [location] = useLocation();

  const [sessionState, setSessionState] = useState<SessionState>({
    isValid: true,
    isChecking: false,
    lastCheck: 0,
    failedChecks: 0,
  });

  // Refs pour éviter les re-renders
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingRef = useRef<boolean>(false);
  const lastCheckTimeRef = useRef<number>(0);
  const failedChecksRef = useRef<number>(0);

  /**
   * Vérifie la session auprès du serveur avec cache intelligent
   */
  const verifySession = useCallback(async (bypassCache = false): Promise<boolean> => {
    // Éviter les vérifications simultanées
    if (isCheckingRef.current) {
      return sessionState.isValid;
    }

    // Utiliser le cache si récent
    const now = Date.now();
    if (!bypassCache && (now - lastCheckTimeRef.current) < SESSION_CHECK_CONFIG.CACHE_DURATION_MS) {
      return sessionState.isValid;
    }

    isCheckingRef.current = true;
    setSessionState(prev => ({ ...prev, isChecking: true }));

    try {
      const isValid = await authService.verifySession();

      lastCheckTimeRef.current = now;
      failedChecksRef.current = 0;

      setSessionState({
        isValid,
        isChecking: false,
        lastCheck: now,
        failedChecks: 0,
      });

      if (!isValid) {
        onSessionInvalid?.('Session invalide ou expirée');
      }

      return isValid;
    } catch (error) {
      failedChecksRef.current++;

      // Après plusieurs échecs, considérer la session comme invalide
      if (failedChecksRef.current >= SESSION_CHECK_CONFIG.MAX_FAILED_CHECKS) {
        setSessionState({
          isValid: false,
          isChecking: false,
          lastCheck: now,
          failedChecks: failedChecksRef.current,
        });
        onSessionInvalid?.('Impossible de vérifier la session après plusieurs tentatives');
        return false;
      }

      setSessionState(prev => ({
        ...prev,
        isChecking: false,
        failedChecks: failedChecksRef.current,
      }));

      // En cas d'erreur réseau, on garde l'état précédent
      return sessionState.isValid;
    } finally {
      isCheckingRef.current = false;
    }
  }, [sessionState.isValid, onSessionInvalid]);

  /**
   * Met à jour le timestamp de dernière activité
   */
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Détermine si l'utilisateur est inactif
   */
  const isUserIdle = useCallback((): boolean => {
    return (Date.now() - lastActivityRef.current) > SESSION_CHECK_CONFIG.IDLE_THRESHOLD_MS;
  }, []);

  /**
   * Démarre l'intervalle de vérification adaptatif
   */
  const startAdaptiveCheck = useCallback(() => {
    // Nettoyer l'intervalle existant
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }

    const runCheck = () => {
      const interval = isUserIdle()
        ? SESSION_CHECK_CONFIG.IDLE_INTERVAL_MS
        : SESSION_CHECK_CONFIG.ACTIVE_INTERVAL_MS;

      verifySession();

      // Réajuster l'intervalle si nécessaire
      checkIntervalRef.current = setTimeout(runCheck, interval);
    };

    // Démarrer immédiatement
    checkIntervalRef.current = setTimeout(runCheck, SESSION_CHECK_CONFIG.ACTIVE_INTERVAL_MS);
  }, [verifySession, isUserIdle]);

  /**
   * Gère le changement de visibilité de l'onglet
   */
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // L'onglet redevient visible - vérifier la session après un court délai
      setTimeout(() => {
        verifySession(true); // Bypass cache car on revient d'un état caché
      }, SESSION_CHECK_CONFIG.VISIBILITY_DELAY_MS);
    }
  }, [verifySession]);

  /**
   * Gère les événements d'activité utilisateur
   */
  const handleUserActivity = useCallback(() => {
    updateActivity();
  }, [updateActivity]);

  // Effet: Vérification à chaque changement de route
  useEffect(() => {
    if (disabled) return;

    // Vérifier la session lors de la navigation
    verifySession();
  }, [location, disabled, verifySession]);

  // Effet: Vérification forcée
  useEffect(() => {
    if (forceCheck && !disabled) {
      verifySession(true);
    }
  }, [forceCheck, disabled, verifySession]);

  // Effet: Configuration des listeners
  useEffect(() => {
    if (disabled) return;

    // Page Visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Activité utilisateur (throttled par le navigateur)
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Démarrer les vérifications périodiques adaptatives
    startAdaptiveCheck();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });

      if (checkIntervalRef.current) {
        clearTimeout(checkIntervalRef.current);
      }
    };
  }, [disabled, handleVisibilityChange, handleUserActivity, startAdaptiveCheck]);

  return {
    isValid: sessionState.isValid,
    isChecking: sessionState.isChecking,
    lastCheck: sessionState.lastCheck,
    failedChecks: sessionState.failedChecks,
    verifySession,
    updateActivity,
  };
}

/**
 * Hook simplifié pour vérification unique (utile pour les composants)
 */
export function useSessionCheck() {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    authService.verifySession().then(valid => {
      if (mounted) {
        setIsValid(valid);
        setIsChecking(false);
      }
    }).catch(() => {
      if (mounted) {
        setIsValid(false);
        setIsChecking(false);
      }
    });

    return () => { mounted = false; };
  }, []);

  return { isValid, isChecking };
}

/**
 * Context pour partager l'état de session dans toute l'app
 */
export interface SessionGuardContextValue {
  isValid: boolean;
  isChecking: boolean;
  lastCheck: number;
  verifySession: (bypassCache?: boolean) => Promise<boolean>;
}

export default useSessionGuard;
