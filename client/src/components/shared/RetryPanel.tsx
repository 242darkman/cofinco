/**
 * RetryPanel Component
 * Panel shown when data loading fails, with retry functionality
 */

import { AlertTriangle, RefreshCw, WifiOff, ServerCrash, AlertCircle } from 'lucide-react';
import { useNetwork, useNetworkStatus, useNextRetryIn } from '../../contexts/NetworkContext';
import { getNetworkErrorMessage, isOfflineError, isApiDownError } from '../../lib/networkErrors';
import CountdownTimer from './CountdownTimer';
import Button from '../ui/Button';

interface RetryPanelProps {
  /** The error that occurred */
  error: Error | unknown;
  /** Called when retry button is clicked */
  onRetry: () => void;
  /** Is currently retrying */
  isRetrying?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

function getErrorIcon(error: unknown, status: string) {
  if (status === 'offline' || isOfflineError(error)) {
    return WifiOff;
  }
  if (status === 'api_down' || isApiDownError(error)) {
    return ServerCrash;
  }
  return AlertTriangle;
}

function getErrorTitle(error: unknown, status: string): string {
  if (status === 'offline' || isOfflineError(error)) {
    return 'Connexion perdue';
  }
  if (status === 'api_down' || isApiDownError(error)) {
    return 'Serveur indisponible';
  }
  return 'Échec du chargement';
}

export default function RetryPanel({
  error,
  onRetry,
  isRetrying = false,
  compact = false,
  className = '',
}: RetryPanelProps) {
  const status = useNetworkStatus();
  const nextRetryIn = useNextRetryIn();
  const { isChecking } = useNetwork();

  const Icon = getErrorIcon(error, status);
  const title = getErrorTitle(error, status);
  const message = getNetworkErrorMessage(error);
  const isOffline = status === 'offline';
  const canRetry = !isOffline && !isRetrying && !isChecking;

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-3 p-3 rounded-lg
          border border-red-500/30 bg-red-500/10
          ${className}
        `}
      >
        <Icon className="w-5 h-5 text-red-400 flex-shrink-0" />
        <span className="text-sm text-red-300 flex-1 min-w-0 truncate">{message}</span>
        <Button
          variant="ghost"
          size="xs"
          icon={RefreshCw}
          onClick={onRetry}
          disabled={!canRetry}
          className={isRetrying ? '[&_svg]:animate-spin' : ''}
        >
          {isRetrying ? '' : 'Réessayer'}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`
        p-6 rounded-xl
        border border-red-500/30 bg-red-500/10
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/20">
          <Icon className="w-6 h-6 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-red-300">{title}</h3>
          <p className="text-sm text-slate-400 mt-1">{message}</p>
        </div>
      </div>

      {/* Additional info for specific states */}
      {isOffline && (
        <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>
              Les données affichées peuvent être obsolètes. La synchronisation reprendra
              automatiquement une fois la connexion rétablie.
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={onRetry}
          disabled={!canRetry}
          className={isRetrying ? '[&_svg]:animate-spin' : ''}
        >
          {isRetrying ? 'Chargement...' : 'Réessayer maintenant'}
        </Button>

        {/* Auto-retry countdown */}
        {nextRetryIn !== null && nextRetryIn > 0 && (
          <span className="text-xs text-slate-500">
            Réessai automatique dans{' '}
            <CountdownTimer
              seconds={nextRetryIn}
              format="short"
              className="font-mono text-slate-400"
            />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Inline error message with retry
 */
export function InlineRetry({
  error,
  onRetry,
  isRetrying = false,
}: {
  error: Error | unknown;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  const status = useNetworkStatus();
  const isOffline = status === 'offline';

  return (
    <div className="flex items-center gap-2 text-sm">
      <AlertTriangle className="w-4 h-4 text-red-400" />
      <span className="text-slate-400">
        {isOffline ? 'Hors ligne' : 'Échec du chargement'}
      </span>
      <button
        onClick={onRetry}
        disabled={isOffline || isRetrying}
        className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRetrying ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          'Réessayer'
        )}
      </button>
    </div>
  );
}

/**
 * Empty state with retry for failed initial load
 */
export function FailedLoadState({
  error,
  onRetry,
  isRetrying = false,
  title = 'Impossible de charger les données',
}: {
  error: Error | unknown;
  onRetry: () => void;
  isRetrying?: boolean;
  title?: string;
}) {
  const message = getNetworkErrorMessage(error);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-md">{message}</p>
      <Button
        variant="primary"
        icon={RefreshCw}
        onClick={onRetry}
        disabled={isRetrying}
        className={isRetrying ? '[&_svg]:animate-spin' : ''}
      >
        {isRetrying ? 'Chargement...' : 'Réessayer'}
      </Button>
    </div>
  );
}
