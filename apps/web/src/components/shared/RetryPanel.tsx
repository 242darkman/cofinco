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
          border border-status-danger/30 bg-status-danger-bg
          ${className}
        `}
      >
        <Icon className="w-5 h-5 text-status-danger flex-shrink-0" />
        <span className="text-sm text-status-danger flex-1 min-w-0 truncate">{message}</span>
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
        border border-status-danger/30 bg-status-danger-bg
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-status-danger-bg">
          <Icon className="w-6 h-6 text-status-danger" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-status-danger">{title}</h3>
          <p className="text-sm text-content-muted mt-1">{message}</p>
        </div>
      </div>

      {/* Additional info for specific states */}
      {isOffline && (
        <div className="mb-4 p-3 rounded-lg bg-surface/50 border border-edge-subtle">
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <AlertCircle className="w-4 h-4 text-status-warning" />
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
          <span className="text-xs text-content-muted">
            Réessai automatique dans{' '}
            <CountdownTimer
              seconds={nextRetryIn}
              format="short"
              className="font-mono text-content-muted"
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
      <AlertTriangle className="w-4 h-4 text-status-danger" />
      <span className="text-content-muted">
        {isOffline ? 'Hors ligne' : 'Échec du chargement'}
      </span>
      <button
        onClick={onRetry}
        disabled={isOffline || isRetrying}
        className="text-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="w-16 h-16 rounded-2xl bg-status-danger-bg flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-status-danger" />
      </div>
      <h3 className="text-lg font-semibold text-content-secondary mb-2">{title}</h3>
      <p className="text-sm text-content-muted mb-6 max-w-md">{message}</p>
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
