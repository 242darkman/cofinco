/**
 * OfflineIndicator - Real-time Sync Status Panel (Simplified)
 *
 * Displays sync status with:
 * - Connection state (connected/offline only - stable, no flickering)
 * - Latency with quality indicator (good/fair/poor via color)
 * - Last sync time with live counter
 * - Pending/synced operations queue
 * - Error display with retry button
 */

import { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
  Zap,
  AlertCircle
} from 'lucide-react';
import {
  useSyncMonitor,
  getConnectionStateLabel,
  getConnectionStateBgColor,
  getLatencyQualityColor,
  getLatencyQualityLabel
} from '../../hooks/useSyncMonitor';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import SyncQueueDrawer from './SyncQueueDrawer';

export function OfflineIndicator() {
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);

  const {
    connectionState,
    latencyQuality,
    pending,
    syncedSinceLast,
    lastSyncAt,
    isConnected,
    isOffline,
    isSyncing,
    hasError,
    lastError,
    forceRetry,
    latencyFormatted,
    lastSyncFormatted,
    timeSinceLastSyncFormatted
  } = useSyncMonitor();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showDetails && !target.closest('[data-sync-indicator]')) {
        setShowDetails(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDetails]);

  const getStatusIcon = () => {
    if (isOffline) return <WifiOff className="h-4 w-4" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (isOffline) return t('offlineMode') || 'Hors ligne';
    if (isSyncing) return t('syncing') || 'Sync...';
    if (pending > 0) return `${pending} en attente`;
    return t('online') || 'En ligne';
  };

  const handleRetry = async () => {
    await forceRetry();
  };

  return (
    <div className="relative" data-sync-indicator>
      {/* Main Button */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium
          transition-all shadow-lg hover:shadow-xl active:scale-95
          ${getConnectionStateBgColor(connectionState)}
          ${isConnected && !isSyncing ? 'animate-pulse-subtle' : ''}
        `}
        data-testid="offline-indicator-button"
      >
        {getStatusIcon()}
        <span className="hidden sm:inline">{getStatusText()}</span>
        {pending > 0 && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs font-bold shadow-sm">
            {pending}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {showDetails && (
        <div className="absolute left-0 mt-3 z-50 animate-in slide-in-from-top-2 duration-200">
          <Card className="w-80 shadow-2xl border-edge bg-surface-base/95 backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-edge">
              <h3 className="font-semibold text-content-primary flex items-center gap-2">
                {isConnected ? (
                  <Cloud className="text-accent" size={18} />
                ) : (
                  <CloudOff className="text-content-muted" size={18} />
                )}
                {t('syncStatus') || 'État de synchronisation'}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(false)}
                className="h-8 w-8 p-0 rounded-full hover:bg-surface"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Connection Status - Simplified */}
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  isConnected
                    ? 'bg-status-success-bg border-status-success/20'
                    : 'bg-status-danger-bg border-status-danger/20'
                }`}
              >
                <div
                  className={`p-2 rounded-full ${
                    isConnected ? 'bg-status-success-bg' : 'bg-status-danger-bg'
                  }`}
                >
                  {isOffline ? (
                    <WifiOff className="h-5 w-5 text-status-danger" />
                  ) : (
                    <Wifi className="h-5 w-5 text-status-success" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-bold ${isConnected ? 'text-status-success' : 'text-status-danger'}`}>
                    {getConnectionStateLabel(connectionState)}
                  </p>
                  <p className="text-xs text-content-muted">
                    {isConnected ? 'Synchronisation active' : 'Mode hors-ligne actif'}
                  </p>
                </div>
              </div>

              {/* Latency & Last Sync */}
              <div className="grid grid-cols-2 gap-3">
                {/* Latency with quality indicator */}
                <div className="bg-surface/50 rounded-xl p-3 border border-edge-subtle">
                  <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
                    <Zap size={12} />
                    <span>Latence</span>
                    {latencyQuality !== 'unknown' && (
                      <span className={`text-[10px] ${getLatencyQualityColor(latencyQuality)}`}>
                        ({getLatencyQualityLabel(latencyQuality)})
                      </span>
                    )}
                  </div>
                  <p className={`text-lg font-bold ${getLatencyQualityColor(latencyQuality)}`}>
                    {latencyFormatted}
                  </p>
                </div>

                {/* Last Sync Time */}
                <div className="bg-surface/50 rounded-xl p-3 border border-edge-subtle">
                  <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
                    <Clock size={12} />
                    <span>Dernière sync</span>
                  </div>
                  <p className="text-lg font-bold text-content-secondary">{lastSyncFormatted}</p>
                </div>
              </div>

              {/* Time Since Last Sync */}
              {lastSyncAt && (
                <div className="text-center text-sm text-content-muted">
                  <span className="text-content-muted">Il y a </span>
                  <span className="font-mono text-accent">{timeSinceLastSyncFormatted}</span>
                </div>
              )}

              {/* Sync Queue Stats */}
              <div className="bg-surface/50 rounded-xl p-4 space-y-3 border border-edge-subtle">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-content-muted">{t('pendingOperations') || 'En attente'}</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      pending > 0 ? 'bg-status-warning-bg text-status-warning' : 'text-content-secondary'
                    }`}
                  >
                    {pending}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-content-muted">{t('synced') || 'Synchronisées'}</span>
                  <span className="font-bold text-status-success flex items-center gap-1">
                    <CheckCircle size={12} /> {syncedSinceLast}
                  </span>
                </div>
              </div>

              {/* Error Display */}
              {hasError && lastError && (
                <div className="flex items-start gap-3 p-3 bg-status-danger-bg border border-status-danger/20 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-status-danger flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-status-danger">Dernière erreur</p>
                    <p className="text-xs text-status-danger/80 mt-1 break-words">{lastError}</p>
                  </div>
                </div>
              )}

              {/* Retry Button */}
              {(hasError || pending > 0) && isConnected && !isSyncing && (
                <Button
                  onClick={handleRetry}
                  variant="primary"
                  fullWidth
                  icon={RefreshCw}
                  className={hasError ? '' : 'animate-pulse'}
                >
                  {hasError ? 'Réessayer maintenant' : t('syncNow') || 'Synchroniser maintenant'}
                </Button>
              )}

              {/* Offline Notice */}
              {isOffline && (
                <div className="flex items-start gap-3 p-3 bg-status-warning-bg border border-status-warning/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-status-warning flex-shrink-0" />
                  <p className="text-xs text-status-warning-text/80 leading-relaxed">
                    {t('offlineNotice') ||
                      'Les opérations seront synchronisées automatiquement dès le retour de la connexion.'}
                  </p>
                </div>
              )}

              {/* View Queue Button */}
              <Button
                onClick={() => {
                  setShowDetails(false);
                  setShowQueueDrawer(true);
                }}
                variant="ghost"
                fullWidth
                className="text-xs text-content-muted hover:text-content-secondary"
              >
                Voir la file de synchronisation
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Sync Queue Drawer */}
      <SyncQueueDrawer
        isOpen={showQueueDrawer}
        onClose={() => setShowQueueDrawer(false)}
      />
    </div>
  );
}

export default OfflineIndicator;
