/**
 * NetworkBanner Component
 * Discreet top banner showing network status (online/unstable/offline/api_down)
 */

import { useCallback } from 'react';
import { Wifi, WifiOff, WifiLow, ServerCrash, RefreshCw, X } from 'lucide-react';
import { useNetwork, useNetworkStatus, useLastSyncAt, useNextRetryIn } from '../../contexts/NetworkContext';
import CountdownTimer from './CountdownTimer';

interface NetworkBannerProps {
  /** Allow dismissing the banner temporarily */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
}

const STATUS_CONFIG = {
  online: {
    show: false,
    bg: '',
    border: '',
    text: '',
    icon: Wifi,
    message: '',
  },
  unstable: {
    show: true,
    bg: 'bg-status-warning-bg',
    border: 'border-status-warning/30',
    text: 'text-status-warning',
    icon: WifiLow,
    message: 'Connexion instable',
  },
  offline: {
    show: true,
    bg: 'bg-status-danger-bg',
    border: 'border-status-danger/30',
    text: 'text-status-danger',
    icon: WifiOff,
    message: 'Hors ligne - Mode local',
  },
  api_down: {
    show: true,
    bg: 'bg-status-danger-bg',
    border: 'border-status-danger/30',
    text: 'text-status-danger',
    icon: ServerCrash,
    message: 'Serveur indisponible',
  },
} as const;

function formatRelativeTime(date: Date | null): string {
  if (!date) return '';

  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "à l'instant";
  if (minutes === 1) return 'il y a 1 min';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours === 1) return 'il y a 1h';
  if (hours < 24) return `il y a ${hours}h`;

  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function NetworkBanner({ dismissible = false, onDismiss }: NetworkBannerProps) {
  const status = useNetworkStatus();
  const lastSyncAt = useLastSyncAt();
  const nextRetryIn = useNextRetryIn();
  const { forceRetry, isChecking } = useNetwork();

  const config = STATUS_CONFIG[status];

  const handleRetry = useCallback(async () => {
    await forceRetry();
  }, [forceRetry]);

  // Don't show banner if online
  if (!config.show) {
    return null;
  }

  const Icon = config.icon;

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-[60] px-4 py-2
        flex items-center justify-between gap-4
        border-b backdrop-blur-sm
        transition-all duration-300 ease-in-out
        ${config.bg} ${config.border}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Left: Status indicator */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`
            flex items-center justify-center w-8 h-8 rounded-lg
            bg-surface-base/50 ${config.text}
          `}
        >
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium ${config.text}`}>
            {config.message}
          </span>

          {/* Last sync time */}
          {lastSyncAt && (
            <span className="text-xs text-content-muted truncate">
              Dernière synchro: {formatRelativeTime(lastSyncAt)}
            </span>
          )}
        </div>
      </div>

      {/* Right: Retry info and actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Countdown for retry */}
        {nextRetryIn !== null && nextRetryIn > 0 && (
          <span className="text-xs text-content-muted">
            Réessai dans{' '}
            <CountdownTimer
              seconds={nextRetryIn}
              format="short"
              className="font-mono text-content-secondary"
            />
          </span>
        )}

        {/* Manual retry button */}
        <button
          onClick={handleRetry}
          disabled={isChecking}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            text-xs font-medium transition-colors
            bg-surface/50 hover:bg-surface-elevated/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${config.text}
          `}
          title="Réessayer maintenant"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {isChecking ? 'Vérification...' : 'Réessayer'}
          </span>
        </button>

        {/* Dismiss button */}
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-surface-elevated/50 text-content-muted hover:text-content-secondary"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for inline use
 */
export function NetworkStatusIndicator() {
  const status = useNetworkStatus();
  const config = STATUS_CONFIG[status];

  if (status === 'online') {
    return (
      <div className="flex items-center gap-1.5 text-status-success">
        <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
        <span className="text-xs">En ligne</span>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs">{config.message}</span>
    </div>
  );
}
