import { useState, useEffect, useCallback, useRef } from 'react';

export type GpsSignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number | null;
  error: GeolocationPositionError | null;
  loading: boolean;
  signalQuality: GpsSignalQuality;
  progressPercent: number;
  statusMessage: string;
  isRefining: boolean;
  initialAccuracy: number | null;
  refinementCount: number;
}

interface UseGeolocationOptions {
  desiredAccuracy?: number;      // Précision souhaitée en mètres (défaut: 30m)
  maxWait?: number;              // Temps max d'attente en ms (défaut: 20000)
  onSuccess?: (position: GeolocationCoordinates) => void;
  onError?: (error: GeolocationPositionError) => void;
}

const defaultOptions: UseGeolocationOptions = {
  desiredAccuracy: 30,  // 30 mètres = bonne précision, atteignable rapidement
  maxWait: 20000,       // 20 secondes max
};

/**
 * Évalue la qualité du signal GPS basé sur la précision
 */
export function getSignalQuality(accuracy: number | null): GpsSignalQuality {
  if (accuracy === null) return 'unknown';
  if (accuracy <= 10) return 'excellent';  // < 10m
  if (accuracy <= 30) return 'good';       // 10-30m
  if (accuracy <= 100) return 'fair';      // 30-100m
  return 'poor';                           // > 100m
}

/**
 * Retourne les informations de qualité pour l'affichage
 */
export function getSignalQualityInfo(quality: GpsSignalQuality): {
  label: string;
  color: string;
  bgColor: string;
  description: string;
  icon: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
} {
  switch (quality) {
    case 'excellent':
      return {
        label: 'Excellent',
        color: 'text-status-success',
        bgColor: 'bg-status-success-bg',
        description: 'Position très précise (< 10m)',
        icon: 'excellent',
      };
    case 'good':
      return {
        label: 'Bon',
        color: 'text-status-success',
        bgColor: 'bg-status-success-bg',
        description: 'Position fiable (10-30m)',
        icon: 'good',
      };
    case 'fair':
      return {
        label: 'Acceptable',
        color: 'text-status-warning',
        bgColor: 'bg-status-warning-bg',
        description: 'Position approximative (30-100m)',
        icon: 'fair',
      };
    case 'poor':
      return {
        label: 'Faible',
        color: 'text-status-danger',
        bgColor: 'bg-status-danger-bg',
        description: 'Signal GPS faible (> 100m)',
        icon: 'poor',
      };
    default:
      return {
        label: 'Inconnu',
        color: 'text-content-muted',
        bgColor: 'bg-surface-subtle/40',
        description: 'En attente du signal...',
        icon: 'unknown',
      };
  }
}

/**
 * Hook de géolocalisation utilisant watchPosition pour un raffinement progressif
 * Inspiré de getAccurateCurrentPosition mais avec React hooks
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    timestamp: null,
    error: null,
    loading: false,
    signalQuality: 'unknown',
    progressPercent: 0,
    statusMessage: '',
    isRefining: false,
    initialAccuracy: null,
    refinementCount: 0,
  });

  // Refs pour le contrôle
  const watchIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const bestPositionRef = useRef<GeolocationPosition | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialAccuracyRef = useRef<number | null>(null);
  const refinementCountRef = useRef<number>(0);

  /**
   * Arrête tous les timers et le watch
   */
  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * Termine la capture avec la meilleure position disponible
   */
  const finishWithBestPosition = useCallback(() => {
    cleanup();

    if (bestPositionRef.current) {
      const pos = bestPositionRef.current;
      const quality = getSignalQuality(pos.coords.accuracy);

      setState(prev => ({
        ...prev,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
        error: null,
        loading: false,
        signalQuality: quality,
        progressPercent: 100,
        statusMessage: 'Position capturée!',
        isRefining: false,
      }));

      opts.onSuccess?.(pos.coords);
    }
  }, [cleanup, opts]);

  /**
   * Démarre la capture GPS avec watchPosition
   */
  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: {
          code: 2,
          message: 'Géolocalisation non supportée',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError,
        loading: false,
        statusMessage: 'GPS non disponible',
      }));
      return;
    }

    // Reset
    cleanup();
    bestPositionRef.current = null;
    initialAccuracyRef.current = null;
    refinementCountRef.current = 0;
    startTimeRef.current = Date.now();

    setState({
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      timestamp: null,
      error: null,
      loading: true,
      signalQuality: 'unknown',
      progressPercent: 0,
      statusMessage: 'Initialisation GPS...',
      isRefining: false,
      initialAccuracy: null,
      refinementCount: 0,
    });

    // Animation de progression
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const percent = Math.min((elapsed / (opts.maxWait || 20000)) * 100, 95);

      setState(prev => {
        // Messages progressifs si pas encore de position
        let message = prev.statusMessage;
        if (!prev.latitude) {
          if (elapsed < 2000) message = 'Recherche des satellites...';
          else if (elapsed < 5000) message = 'Acquisition du signal GPS...';
          else if (elapsed < 10000) message = 'Connexion aux satellites...';
          else message = 'Optimisation en cours...';
        }

        return { ...prev, progressPercent: percent, statusMessage: message };
      });
    }, 200);

    // Timeout global
    timeoutRef.current = setTimeout(() => {
      if (bestPositionRef.current) {
        finishWithBestPosition();
      } else {
        cleanup();
        setState(prev => ({
          ...prev,
          error: {
            code: 3,
            message: 'Délai dépassé - signal GPS trop faible',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError,
          loading: false,
          progressPercent: 0,
          statusMessage: 'Échec de la capture',
        }));
        opts.onError?.({
          code: 3,
          message: 'Timeout',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      }
    }, opts.maxWait);

    // Callback de succès pour chaque position
    const onSuccess = (position: GeolocationPosition) => {
      const accuracy = position.coords.accuracy;
      refinementCountRef.current += 1;

      // Sauvegarder la première précision
      if (initialAccuracyRef.current === null) {
        initialAccuracyRef.current = accuracy;
      }

      // Garder la meilleure position (précision la plus basse)
      const isBetter = !bestPositionRef.current || accuracy < bestPositionRef.current.coords.accuracy;

      if (isBetter) {
        bestPositionRef.current = position;
      }

      const quality = getSignalQuality(accuracy);
      const isRefining = refinementCountRef.current > 1 && isBetter;

      // Mettre à jour l'état avec la position actuelle
      setState(prev => ({
        ...prev,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
        signalQuality: quality,
        isRefining,
        initialAccuracy: initialAccuracyRef.current,
        refinementCount: refinementCountRef.current,
        statusMessage: isRefining
          ? `Amélioration: ±${Math.round(accuracy)}m`
          : `Précision: ±${Math.round(accuracy)}m`,
      }));

      // Vérifier si on a atteint la précision souhaitée
      if (accuracy <= (opts.desiredAccuracy || 30)) {
        finishWithBestPosition();
      }
    };

    // Callback d'erreur
    const onError = (error: GeolocationPositionError) => {
      // Si on a déjà une position, la garder malgré l'erreur
      if (bestPositionRef.current) {
        finishWithBestPosition();
        return;
      }

      cleanup();
      setState(prev => ({
        ...prev,
        error,
        loading: false,
        progressPercent: 0,
        statusMessage: 'Erreur GPS',
      }));
      opts.onError?.(error);
    };

    // Démarrer watchPosition
    // Utiliser des options moins strictes pour obtenir une position rapidement
    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        timeout: 15000,      // Timeout par position (pas global)
        maximumAge: 0,       // Toujours une position fraîche
      }
    );
  }, [cleanup, finishWithBestPosition, opts]);

  /**
   * Annule la capture en cours
   */
  const cancelCapture = useCallback(() => {
    cleanup();
    setState(prev => ({
      ...prev,
      loading: false,
      progressPercent: 0,
      statusMessage: 'Capture annulée',
      isRefining: false,
    }));
  }, [cleanup]);

  /**
   * Réinitialise l'état
   */
  const reset = useCallback(() => {
    cleanup();
    bestPositionRef.current = null;
    initialAccuracyRef.current = null;
    refinementCountRef.current = 0;

    setState({
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      timestamp: null,
      error: null,
      loading: false,
      signalQuality: 'unknown',
      progressPercent: 0,
      statusMessage: '',
      isRefining: false,
      initialAccuracy: null,
      refinementCount: 0,
    });
  }, [cleanup]);

  // Nettoyage au démontage
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  return {
    ...state,
    getCurrentPosition,
    cancelCapture,
    reset,
    isSupported,
    qualityInfo: getSignalQualityInfo(state.signalQuality),
  };
}

export default useGeolocation;
