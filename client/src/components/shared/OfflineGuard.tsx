/**
 * OfflineGuard Component
 * Wrapper to block/disable critical actions when offline
 */

import { ReactNode, useState, useCallback } from 'react';
import { WifiOff, AlertTriangle, ServerCrash } from 'lucide-react';
import { useNetworkStatus, useNetwork } from '../../contexts/NetworkContext';
import Tooltip from '../ui/Tooltip';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

type BlockMode = 'disable' | 'hide' | 'warn' | 'dialog';

interface OfflineGuardProps {
  children: ReactNode;
  /** How to handle offline state */
  blockMode?: BlockMode;
  /** Custom message to show */
  offlineMessage?: string;
  /** Only block on complete offline (not on api_down) */
  offlineOnly?: boolean;
  /** Dialog title (for dialog mode) */
  dialogTitle?: string;
  /** Allow bypassing the dialog (for non-critical actions) */
  allowBypass?: boolean;
  /** Callback when action is blocked */
  onBlocked?: () => void;
  /** Additional class names for the wrapper */
  className?: string;
}

const DEFAULT_MESSAGE = 'Cette action nécessite une connexion internet';
const DEFAULT_DIALOG_TITLE = 'Action impossible hors ligne';

export default function OfflineGuard({
  children,
  blockMode = 'disable',
  offlineMessage = DEFAULT_MESSAGE,
  offlineOnly = false,
  dialogTitle = DEFAULT_DIALOG_TITLE,
  allowBypass = false,
  onBlocked,
  className = '',
}: OfflineGuardProps) {
  const status = useNetworkStatus();
  const { forceRetry, isChecking } = useNetwork();
  const [showDialog, setShowDialog] = useState(false);

  // Determine if we should block
  const isBlocked = offlineOnly
    ? status === 'offline'
    : status === 'offline' || status === 'api_down';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isBlocked && blockMode === 'dialog') {
        e.preventDefault();
        e.stopPropagation();
        setShowDialog(true);
        onBlocked?.();
      }
    },
    [isBlocked, blockMode, onBlocked]
  );

  // If not blocked, render children normally
  if (!isBlocked) {
    return <>{children}</>;
  }

  // Block mode: hide
  if (blockMode === 'hide') {
    return null;
  }

  // Block mode: disable (with tooltip)
  if (blockMode === 'disable') {
    return (
      <Tooltip content={offlineMessage}>
        <div
          className={`
            opacity-50 cursor-not-allowed select-none
            [&_*]:pointer-events-none
            ${className}
          `}
          aria-disabled="true"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBlocked?.();
          }}
        >
          {children}
        </div>
      </Tooltip>
    );
  }

  // Block mode: warn (overlay on content)
  if (blockMode === 'warn') {
    const Icon = status === 'offline' ? WifiOff : ServerCrash;

    return (
      <div className={`relative ${className}`}>
        {children}
        <div
          className="
            absolute inset-0 z-10
            bg-slate-900/70 backdrop-blur-sm
            flex flex-col items-center justify-center
            rounded-lg p-4
          "
        >
          <Icon className="w-8 h-8 text-slate-400 mb-2" />
          <p className="text-sm text-slate-300 text-center">{offlineMessage}</p>
          <button
            onClick={() => forceRetry()}
            disabled={isChecking}
            className="
              mt-3 px-3 py-1.5 text-xs font-medium
              bg-slate-800 hover:bg-slate-700
              rounded-lg text-slate-300
              disabled:opacity-50
            "
          >
            {isChecking ? 'Vérification...' : 'Réessayer'}
          </button>
        </div>
      </div>
    );
  }

  // Block mode: dialog
  return (
    <>
      <div
        className={className}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowDialog(true);
            onBlocked?.();
          }
        }}
      >
        {children}
      </div>

      <OfflineDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        title={dialogTitle}
        message={offlineMessage}
        status={status}
        allowBypass={allowBypass}
        onRetry={forceRetry}
        isChecking={isChecking}
      />
    </>
  );
}

/**
 * Dialog shown when action is blocked
 */
function OfflineDialog({
  isOpen,
  onClose,
  title,
  message,
  status,
  allowBypass,
  onRetry,
  isChecking,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  status: string;
  allowBypass: boolean;
  onRetry: () => Promise<void>;
  isChecking: boolean;
}) {
  const Icon = status === 'offline' ? WifiOff : ServerCrash;

  const handleRetry = async () => {
    await onRetry();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} variant="warning">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20">
            <Icon className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-slate-300">{message}</p>
            <p className="text-sm text-slate-400 mt-2">
              {status === 'offline'
                ? 'Vérifiez votre connexion internet et réessayez.'
                : 'Le serveur est temporairement indisponible. Réessayez dans quelques instants.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="primary"
            onClick={handleRetry}
            disabled={isChecking}
            className="flex-1"
          >
            {isChecking ? 'Vérification...' : 'Vérifier la connexion'}
          </Button>

          <Button variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>

          {allowBypass && (
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-xs text-slate-500"
            >
              Continuer quand même (risqué)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Hook to check if an action should be blocked
 */
export function useOfflineBlock(offlineOnly = false): {
  isBlocked: boolean;
  status: string;
  checkConnection: () => Promise<boolean>;
} {
  const status = useNetworkStatus();
  const { checkHealth } = useNetwork();

  const isBlocked = offlineOnly
    ? status === 'offline'
    : status === 'offline' || status === 'api_down';

  return {
    isBlocked,
    status,
    checkConnection: checkHealth,
  };
}

/**
 * HOC to wrap components with offline guard
 */
export function withOfflineGuard<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<OfflineGuardProps, 'children'> = {}
) {
  return function OfflineGuardedComponent(props: P) {
    return (
      <OfflineGuard {...options}>
        <Component {...props} />
      </OfflineGuard>
    );
  };
}
