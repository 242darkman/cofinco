import React, { useEffect, useMemo } from 'react';
import {
  MapPin,
  Loader2,
  CheckCircle,
  AlertCircle,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  RefreshCw,
  X,
  Navigation,
  Clock,
  Target,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { useGeolocation, GpsSignalQuality, getSignalQualityInfo } from '../../hooks/useGeolocation';

interface GpsCaptureProps {
  onCapture: (data: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: Date;
    signalQuality: GpsSignalQuality;
  }) => void;
  onAddressResolved?: (address: any) => void;
  clientCoords?: { latitude: number; longitude: number } | null;
  className?: string;
  desiredAccuracy?: number; // Précision souhaitée en mètres
  maxWait?: number; // Temps max en ms
}

/**
 * Composant d'indicateur de qualité du signal GPS
 */
function SignalQualityIndicator({
  quality,
  accuracy,
  isRefining,
  initialAccuracy,
}: {
  quality: GpsSignalQuality;
  accuracy: number | null;
  isRefining?: boolean;
  initialAccuracy?: number | null;
}) {
  const info = getSignalQualityInfo(quality);

  // Barres animées pour visualiser la qualité
  const bars = useMemo(() => {
    const activeCount = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'poor' ? 1 : 0;
    return [1, 2, 3, 4].map((bar) => ({
      height: bar * 4 + 4,
      active: bar <= activeCount,
    }));
  }, [quality]);

  // Calcul de l'amélioration
  const improvement = useMemo(() => {
    if (initialAccuracy && accuracy && initialAccuracy > accuracy) {
      const percent = Math.round(((initialAccuracy - accuracy) / initialAccuracy) * 100);
      return { percent, from: Math.round(initialAccuracy), to: Math.round(accuracy) };
    }
    return null;
  }, [initialAccuracy, accuracy]);

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${info.bgColor} ${isRefining ? 'animate-pulse' : ''}`}>
      {/* Barres de signal animées */}
      <div className="flex items-end gap-0.5 h-5">
        {bars.map((bar, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all duration-300 ${
              bar.active ? info.color.replace('text-', 'bg-') : 'bg-slate-600'
            }`}
            style={{ height: bar.height }}
          />
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
          {isRefining && (
            <span className="text-xs text-cyan-400 flex items-center gap-1">
              <TrendingUp size={10} className="animate-bounce" />
              Raffinement...
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {accuracy !== null ? (
            <span>
              Précision: <span className="text-white font-mono">±{Math.round(accuracy)}m</span>
              {improvement && (
                <span className="text-green-400 ml-2">
                  (-{improvement.percent}% depuis {improvement.from}m)
                </span>
              )}
            </span>
          ) : (
            info.description
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Barre de progression avec statut en temps réel
 */
function CaptureProgress({
  progress,
  statusMessage,
  isRefining,
  refinementCount,
  accuracy,
}: {
  progress: number;
  statusMessage: string;
  isRefining: boolean;
  refinementCount: number;
  accuracy: number | null;
}) {
  return (
    <div className="space-y-2">
      {/* Barre de progression principale */}
      <div className="relative h-2.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
            isRefining
              ? 'bg-gradient-to-r from-cyan-500 to-green-500'
              : 'bg-gradient-to-r from-green-600 to-green-400'
          }`}
          style={{ width: `${progress}%` }}
        />
        {/* Effet de brillance animé */}
        <div
          className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{
            animation: 'shimmer 1.5s infinite',
            left: `${progress - 10}%`,
          }}
        />
      </div>

      {/* Indicateurs de statut */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isRefining ? (
            <Zap size={12} className="text-cyan-400" />
          ) : (
            <Target size={12} className="text-green-400 animate-pulse" />
          )}
          <span className="text-slate-300">{statusMessage}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          {refinementCount > 0 && (
            <span className="text-cyan-400">
              {refinementCount} lecture{refinementCount > 1 ? 's' : ''}
            </span>
          )}
          {accuracy !== null && (
            <span className="font-mono text-white">±{Math.round(accuracy)}m</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Conseils contextuels selon l'état
 */
function GpsTips({ isLoading, hasError, quality }: { isLoading: boolean; hasError: boolean; quality: GpsSignalQuality }) {
  if (!isLoading && !hasError && quality !== 'unknown' && quality !== 'poor') return null;

  const tips = isLoading
    ? [
        'Placez-vous en extérieur ou près d\'une fenêtre',
        'Gardez l\'appareil immobile pour une meilleure précision',
        'Le GPS s\'améliore automatiquement en quelques secondes',
      ]
    : hasError
    ? [
        'Vérifiez les paramètres de localisation de votre appareil',
        'Autorisez l\'accès à la position dans votre navigateur',
        'Déplacez-vous vers un endroit avec un meilleur signal',
      ]
    : quality === 'poor'
    ? [
        'Le signal est faible - déplacez-vous à l\'extérieur',
        'Attendez quelques secondes pour améliorer la précision',
      ]
    : [];

  if (tips.length === 0) return null;

  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <Clock size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-blue-400 mb-1.5">
            {isLoading ? 'Conseils pour une capture rapide:' : 'Suggestions:'}
          </div>
          <ul className="text-xs text-blue-300 space-y-1">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Affichage des coordonnées capturées
 */
function CoordsDisplay({
  latitude,
  longitude,
  accuracy,
  timestamp,
  quality,
  initialAccuracy,
}: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number | null;
  quality: GpsSignalQuality;
  initialAccuracy: number | null;
}) {
  const formattedTime = timestamp ? new Date(timestamp).toLocaleTimeString('fr-FR') : null;

  // Formatage DMS (degrés, minutes, secondes) pour lisibilité
  const formatDMS = (decimal: number, isLat: boolean) => {
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = ((minutesFloat - minutes) * 60).toFixed(1);
    const direction = isLat ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'O';
    return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
  };

  return (
    <div className="space-y-3">
      {/* Badge de succès */}
      <div className="flex items-center gap-2 bg-green-500/10 px-3 py-2 rounded-lg border border-green-500/30">
        <CheckCircle size={18} className="text-green-400" />
        <div className="flex-1">
          <span className="text-sm font-medium text-green-400">Position GPS capturée</span>
          {formattedTime && <span className="text-xs text-green-300 ml-2">à {formattedTime}</span>}
        </div>
      </div>

      {/* Indicateur de qualité */}
      <SignalQualityIndicator
        quality={quality}
        accuracy={accuracy}
        initialAccuracy={initialAccuracy}
      />

      {/* Coordonnées en grille */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-slate-700/50 p-3 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Navigation size={12} className="text-cyan-400" />
            <span className="text-xs text-slate-400">Latitude</span>
          </div>
          <div className="text-white font-mono text-sm">{latitude.toFixed(6)}</div>
          <div className="text-xs text-slate-500 mt-0.5">{formatDMS(latitude, true)}</div>
        </div>

        <div className="bg-slate-700/50 p-3 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Navigation size={12} className="text-cyan-400 rotate-90" />
            <span className="text-xs text-slate-400">Longitude</span>
          </div>
          <div className="text-white font-mono text-sm">{longitude.toFixed(6)}</div>
          <div className="text-xs text-slate-500 mt-0.5">{formatDMS(longitude, false)}</div>
        </div>
      </div>

      {/* Précision visuelle */}
      <div className="bg-slate-700/30 p-3 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Rayon de précision</span>
          <span className="text-xs font-mono text-white">±{Math.round(accuracy)}m</span>
        </div>
        <div className="relative h-2 bg-slate-600 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              accuracy <= 10
                ? 'bg-green-500'
                : accuracy <= 30
                ? 'bg-emerald-500'
                : accuracy <= 100
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${Math.max(5, 100 - Math.min(accuracy, 100))}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Faible</span>
          <span>Excellente</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Composant principal de capture GPS
 */
export default function GpsCapture({
  onCapture,
  onAddressResolved,
  clientCoords,
  className = '',
  desiredAccuracy = 20,
  maxWait = 30000,
}: GpsCaptureProps) {
  const {
    latitude,
    longitude,
    accuracy,
    timestamp,
    error,
    loading,
    signalQuality,
    progressPercent,
    statusMessage,
    isRefining,
    initialAccuracy,
    refinementCount,
    getCurrentPosition,
    cancelCapture,
    reset,
    isSupported,
  } = useGeolocation({
    desiredAccuracy,
    maxWait,
  });

  // Notifier le parent quand la position est capturée
  useEffect(() => {
    if (latitude !== null && longitude !== null && accuracy !== null && !loading) {
      onCapture({
        latitude,
        longitude,
        accuracy,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        signalQuality,
      });
    }
  }, [latitude, longitude, accuracy, timestamp, loading, signalQuality, onCapture]);

  // Reverse geocoding après capture
  useEffect(() => {
    if (latitude !== null && longitude !== null && !loading && onAddressResolved) {
      fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr&addressdetails=1&zoom=18`,
        { 
          credentials: 'omit',
          headers: { 'User-Agent': 'Asset-Tracker-Microfinance-App' } 
        }
      )
        .then((res) => res.json())
        .then((data) => {
          onAddressResolved({
            road: data.address?.road,
            suburb: data.address?.suburb || data.address?.neighbourhood || data.address?.quarter,
            city: data.address?.city || data.address?.town || data.address?.village,
            state: data.address?.state,
            country: data.address?.country,
            postcode: data.address?.postcode,
            display_name: data.display_name,
          });
        })
        .catch(console.error);
    }
  }, [latitude, longitude, loading, onAddressResolved]);

  // Message d'erreur détaillé
  const errorMessage = useMemo(() => {
    if (!error) return null;

    switch (error.code) {
      case 1:
        return {
          title: 'Permission refusée',
          message: 'Autorisez l\'accès à votre position dans les paramètres du navigateur.',
          action: 'Réessayer',
        };
      case 2:
        return {
          title: 'Position non disponible',
          message: 'Le GPS de votre appareil n\'a pas pu déterminer votre position.',
          action: 'Réessayer',
        };
      case 3:
        return {
          title: 'Délai dépassé',
          message: 'La recherche du signal GPS a pris trop de temps.',
          action: 'Réessayer',
        };
      default:
        return {
          title: 'Erreur GPS',
          message: error.message || 'Une erreur inattendue s\'est produite.',
          action: 'Réessayer',
        };
    }
  }, [error]);

  if (!isSupported) {
    return (
      <div className={`bg-red-500/10 border border-red-500/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <AlertCircle className="text-red-400" size={24} />
          <div>
            <div className="text-sm font-semibold text-red-400">GPS non disponible</div>
            <div className="text-xs text-red-300">Votre navigateur ne supporte pas la géolocalisation.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 overflow-hidden ${className}`}>
      {/* En-tête */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">Géolocalisation du site</span>
          </div>
          {loading && accuracy !== null && (
            <span className="text-xs text-cyan-400 font-mono">±{Math.round(accuracy)}m</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* État initial: bouton de capture */}
        {!loading && !latitude && !error && (
          <button
            type="button"
            onClick={getCurrentPosition}
            className="w-full px-4 py-4 bg-gradient-to-r from-green-600/20 to-emerald-600/20 hover:from-green-600/30 hover:to-emerald-600/30 text-green-400 rounded-lg transition-all flex items-center justify-center gap-3 border border-green-500/30 hover:border-green-500/50 active:scale-[0.98] min-h-[56px]"
          >
            <Zap size={22} />
            <div className="text-left">
              <span className="font-semibold block">Capturer la position GPS</span>
              <span className="text-xs text-green-300">Raffinement automatique jusqu'à ±{desiredAccuracy}m</span>
            </div>
          </button>
        )}

        {/* État de chargement avec raffinement en temps réel */}
        {loading && (
          <div className="space-y-4">
            {/* En-tête avec bouton annuler */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Loader2 size={20} className="text-green-400 animate-spin" />
                </div>
                <span className="text-sm font-medium text-green-400">
                  {accuracy !== null ? 'Raffinement en cours...' : 'Acquisition GPS...'}
                </span>
              </div>
              <button
                type="button"
                onClick={cancelCapture}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Position en temps réel pendant le raffinement */}
            {latitude !== null && longitude !== null && accuracy !== null && (
              <SignalQualityIndicator
                quality={signalQuality}
                accuracy={accuracy}
                isRefining={isRefining}
                initialAccuracy={initialAccuracy}
              />
            )}

            {/* Barre de progression */}
            <CaptureProgress
              progress={progressPercent}
              statusMessage={statusMessage}
              isRefining={isRefining}
              refinementCount={refinementCount}
              accuracy={accuracy}
            />

            {/* Conseils */}
            <GpsTips isLoading={true} hasError={false} quality={signalQuality} />
          </div>
        )}

        {/* Position capturée */}
        {!loading && latitude !== null && longitude !== null && accuracy !== null && (
          <div className="space-y-4">
            <CoordsDisplay
              latitude={latitude}
              longitude={longitude}
              accuracy={accuracy}
              timestamp={timestamp}
              quality={signalQuality}
              initialAccuracy={initialAccuracy}
            />

            {/* Bouton recapturer */}
            <button
              type="button"
              onClick={getCurrentPosition}
              className="w-full px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg transition flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw size={14} />
              <span>Recapturer la position</span>
            </button>

            {/* Avertissement qualité faible */}
            {(signalQuality === 'poor' || signalQuality === 'fair') && (
              <GpsTips isLoading={false} hasError={false} quality={signalQuality} />
            )}
          </div>
        )}

        {/* Erreur */}
        {!loading && error && errorMessage && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-red-400">{errorMessage.title}</div>
                  <div className="text-xs text-red-300 mt-1">{errorMessage.message}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={getCurrentPosition}
              className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition flex items-center justify-center gap-2 border border-red-500/30"
            >
              <RefreshCw size={16} />
              <span className="font-medium">{errorMessage.action}</span>
            </button>

            <GpsTips isLoading={false} hasError={true} quality="unknown" />
          </div>
        )}
      </div>

      {/* Style pour l'animation shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

export { SignalQualityIndicator, CoordsDisplay, GpsTips };
