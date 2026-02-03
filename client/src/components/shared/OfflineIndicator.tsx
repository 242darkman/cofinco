import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../ui/Button';
import Card from '../ui/Card';

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount, syncStats, forceSyncNow } = useOffline();
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);

  // Always show indicator
  // if (isOnline && !isSyncing && pendingCount === 0 && syncStats.failed === 0 && syncStats.conflicts === 0) {
  //   return null;
  // }

  const getStatusColor = () => {
    if (!isOnline) return 'bg-red-500';
    if (isSyncing) return 'bg-yellow-500';
    if (pendingCount > 0) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (pendingCount > 0) return <CloudOff className="h-4 w-4" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return t('offlineMode');
    if (isSyncing) return t('syncing');
    if (pendingCount > 0) return `${pendingCount} ${t('pendingSync')}`;
    return t('online');
  };

  const handleSync = async () => {
    if (isOnline && !isSyncing && pendingCount > 0) {
      await forceSyncNow();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium transition-all ${getStatusColor()} shadow-lg hover:shadow-xl active:scale-95`}
        data-testid="offline-indicator-button"
      >
        {getStatusIcon()}
        <span className="hidden sm:inline">{getStatusText()}</span>
        {pendingCount > 0 && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs font-bold shadow-sm">
            {pendingCount}
          </span>
        )}
      </button>

      {showDetails && (
        <div className="absolute left-0 mt-3 z-50 animate-in slide-in-from-top-2 duration-200">
          <Card className="w-72 sm:w-80 shadow-2xl border-slate-700 bg-slate-900/95 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                {isOnline ? <Cloud className="text-cyan-400" size={18} /> : <CloudOff className="text-slate-400" size={18} />}
                {t('syncStatus')}
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
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${isOnline ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                {isOnline ? (
                  <div className="p-2 bg-green-500/20 rounded-full">
                    <Wifi className="h-5 w-5 text-green-400" />
                  </div>
                ) : (
                  <div className="p-2 bg-red-500/20 rounded-full">
                    <WifiOff className="h-5 w-5 text-red-400" />
                  </div>
                )}
                <div>
                  <p className={`font-bold ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                    {isOnline ? t('connected') : t('noConnection')}
                  </p>
                  <p className="text-xs text-slate-400">
                    {isOnline ? 'Synchronisation active' : 'Mode hors-ligne actif'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-700/50">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">{t('pendingOperations')}</span>
                  <span className={`font-bold px-2 py-0.5 rounded-md ${syncStats.totalPending > 0 ? 'bg-orange-500/20 text-orange-400' : 'text-slate-200'}`}>
                    {syncStats.totalPending}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">{t('synced')}</span>
                  <span className="font-bold text-green-400 flex items-center gap-1">
                    <CheckCircle size={12} /> {syncStats.synced}
                  </span>
                </div>
                
                {(syncStats.failed > 0 || syncStats.conflicts > 0) && (
                   <div className="pt-2 border-t border-slate-700/50 mt-2 space-y-2">
                      {syncStats.failed > 0 && (
                        <div className="flex justify-between text-sm text-red-400">
                          <span>{t('failed')}</span>
                          <span className="font-bold">{syncStats.failed}</span>
                        </div>
                      )}
                      {syncStats.conflicts > 0 && (
                        <div className="flex justify-between text-sm text-orange-400">
                          <span>{t('conflicts')}</span>
                          <span className="font-bold">{syncStats.conflicts}</span>
                        </div>
                      )}
                   </div>
                )}
              </div>

              {syncStats.lastSyncAt && (
                <p className="text-xs text-center text-slate-500">
                  {t('lastSync')}: {new Date(syncStats.lastSyncAt).toLocaleTimeString()}
                </p>
              )}

              {isOnline && pendingCount > 0 && !isSyncing && (
                <Button
                  onClick={handleSync}
                  variant="primary"
                  fullWidth
                  icon={RefreshCw}
                  className="animate-pulse"
                >
                  {t('syncNow')}
                </Button>
              )}

              {!isOnline && (
                <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-xs text-yellow-200/80 leading-relaxed">
                    {t('offlineNotice')}
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
