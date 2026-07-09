import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import type { NetworkStatus } from '../../../lib/networkManager';

interface Props {
  networkStatus: NetworkStatus;
  isFromCache: boolean;
  lastUpdated?: number;
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'il y a quelques secondes';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

export default function TreasuryStaleDataBanner({ networkStatus, isFromCache, lastUpdated }: Props) {
  if (networkStatus === 'online' && !isFromCache) return null;

  const isOffline = networkStatus === 'offline' || networkStatus === 'api_down';
  const timeLabel = lastUpdated ? formatRelativeTime(lastUpdated) : '';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-status-warning-bg text-status-warning text-xs font-medium">
      {isOffline ? (
        <WifiOff size={13} className="shrink-0" />
      ) : (
        <RefreshCw size={13} className="shrink-0 animate-spin" />
      )}
      <span>
        {isOffline
          ? `Hors ligne — données ${timeLabel ? `datées de ${timeLabel}` : 'en cache'}`
          : `Actualisation en cours${timeLabel ? ` — dernière mise à jour ${timeLabel}` : ''}...`
        }
      </span>
    </div>
  );
}
