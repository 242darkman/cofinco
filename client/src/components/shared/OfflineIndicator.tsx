/**
 * OfflineIndicator - Real-time Sync Status Panel
 *
 * Displays comprehensive sync status with:
 * - Connection state (connected/unstable/offline/reconnecting)
 * - Latency measurement in real-time
 * - Last sync time with live counter
 * - Pending/synced operations queue
 * - Error display with retry button
 * - Subtle pulse animation when healthy
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
  Activity,
  Clock,
  Zap,
  AlertCircle
} from 'lucide-react';
import { useSyncMonitor, getConnectionStateLabel, getConnectionStateBgColor } from '../../hooks/useSyncMonitor';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../ui/Button';
import Card from '../ui/Card';

export function OfflineIndicator() {
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);

  const {
    connectionState,
    latency,
    pending,
    syncedSinceLast,
    lastSyncAt,
    secondsSinceLastSync,
    syncState,
    lastError,
    isConnected,
    isUnstable,
    isOffline,
    isReconnecting,
    isSyncing,
    hasError,
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
    if (isReconnecting) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (isUnstable) return <Activity className="h-4 w-4" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (isOffline) return t('offlineMode') || 'Hors ligne';
    if (isReconnecting) return 'Reconnexion...';
    if (isUnstable) return 'Instable';
    if (isSyncing) return t('syncing') || 'Sync...';
    if (pending > 0) return `${pending} en attente`;
    return t('online') || 'En ligne';
  };

  const getLatencyColor = () => {
    if (latency === null) return 'text-slate-400';
    if (latency < 100) return 'text-green-400';
    if (latency < 500) return 'text-emerald-400';
    if (latency < 1000) return 'text-yellow-400';
    if (latency < 1500) return 'text-orange-400';
    return 'text-red-400';
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
          <Card className="w-80 shadow-2xl border-slate-700 bg-slate-900/95 backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                {isConnected ? (
                  <Cloud className="text-cyan-400" size={18} />
                ) : (
                  <CloudOff className="text-slate-400" size={18} />
                )}
                {t('syncStatus') || 'État de synchronisation'}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(false)}
                className="h-8 w-8 p-0 rounded-full hover:bg-slate-800"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Connection Status */}
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  isConnected
                    ? 'bg-green-500/10 border-green-500/20'
                    : isUnstable
                    ? 'bg-yellow-500/10 border-yellow-500/20'
                    : isReconnecting
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div
                  className={`p-2 rounded-full ${
                    isConnected
                      ? 'bg-green-500/20'
                      : isUnstable
                      ? 'bg-yellow-500/20'
                      : isReconnecting
                      ? 'bg-blue-500/20'
                      : 'bg-red-500/20'
                  }`}
                >
                  {isOffline ? (
                    <WifiOff
                      className={`h-5 w-5 ${
                        isConnected
                          ? 'text-green-400'
                          : isUnstable
                          ? 'text-yellow-400'
                          : isReconnecting
                          ? 'text-blue-400'
                          : 'text-red-400'
                      }`}
                    />
                  ) : isReconnecting ? (
                    <RefreshCw className="h-5 w-5 text-blue-400 animate-spin" />
                  ) : (
                    <Wifi
                      className={`h-5 w-5 ${
                        isConnected
                          ? 'text-green-400'
                          : isUnstable
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-bold ${
                      isConnected
                        ? 'text-green-400'
                        : isUnstable
                        ? 'text-yellow-400'
                        : isReconnecting
                        ? 'text-blue-400'
                        : 'text-red-400'
                    }`}
                  >
                    {getConnectionStateLabel(connectionState)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {isConnected
                      ? 'Synchronisation active'
                      : isUnstable
                      ? 'Connexion dégradée'
                      : isReconnecting
                      ? 'Tentative de reconnexion...'
                      : 'Mode hors-ligne actif'}
                  </p>
                </div>
              </div>

              {/* Latency & Last Sync */}
              <div className="grid grid-cols-2 gap-3">
                {/* Latency */}
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <Zap size={12} />
                    <span>Latence</span>
                  </div>
                  <p className={`text-lg font-bold ${getLatencyColor()}`}>
                    {latencyFormatted}
                  </p>
                </div>

                {/* Last Sync Time */}
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <Clock size={12} />
                    <span>Dernière sync</span>
                  </div>
                  <p className="text-lg font-bold text-slate-200">{lastSyncFormatted}</p>
                </div>
              </div>

              {/* Time Since Last Sync */}
              {lastSyncAt && (
                <div className="text-center text-sm text-slate-400">
                  <span className="text-slate-500">Il y a </span>
                  <span className="font-mono text-cyan-400">{timeSinceLastSyncFormatted}</span>
                </div>
              )}

              {/* Sync Queue Stats */}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-700/50">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">{t('pendingOperations') || 'En attente'}</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      pending > 0 ? 'bg-orange-500/20 text-orange-400' : 'text-slate-200'
                    }`}
                  >
                    {pending}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">{t('synced') || 'Synchronisées'}</span>
                  <span className="font-bold text-green-400 flex items-center gap-1">
                    <CheckCircle size={12} /> {syncedSinceLast}
                  </span>
                </div>
              </div>

              {/* Error Display */}
              {hasError && lastError && (
                <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-400">Dernière erreur</p>
                    <p className="text-xs text-red-300/80 mt-1 break-words">{lastError}</p>
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
                <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-xs text-yellow-200/80 leading-relaxed">
                    {t('offlineNotice') ||
                      'Les opérations seront synchronisées automatiquement dès le retour de la connexion.'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default OfflineIndicator;
