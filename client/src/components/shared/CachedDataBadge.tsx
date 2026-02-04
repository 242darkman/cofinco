/**
 * CachedDataBadge Component
 * Badge indicating data is from cache and may be outdated
 */

import { Clock, Database, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../../contexts/NetworkContext';

interface CachedDataBadgeProps {
  /** When the data was last fetched */
  lastFetchedAt?: Date | number;
  /** Force show even when online */
  forceShow?: boolean;
  /** Is the data explicitly stale */
  isStale?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
}

function formatRelativeTime(timestamp: Date | number): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "à l'instant";
  if (minutes === 1) return 'il y a 1 min';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours === 1) return 'il y a 1h';
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return 'hier';
  return `il y a ${days}j`;
}

export default function CachedDataBadge({
  lastFetchedAt,
  forceShow = false,
  isStale = false,
  size = 'sm',
  className = '',
}: CachedDataBadgeProps) {
  const status = useNetworkStatus();
  const isOffline = status === 'offline' || status === 'api_down';

  // Only show when offline, stale, or forced
  if (!forceShow && !isStale && !isOffline) {
    return null;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-sm gap-1.5',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  };

  // Determine variant based on state
  const isOfflineMode = status === 'offline';
  const variant = isOfflineMode ? 'offline' : isStale ? 'stale' : 'cached';

  const variants = {
    offline: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-300',
      icon: WifiOff,
      label: 'Hors ligne',
    },
    stale: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      icon: Clock,
      label: 'Données anciennes',
    },
    cached: {
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/30',
      text: 'text-slate-300',
      icon: Database,
      label: 'En cache',
    },
  };

  const config = variants[variant];
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center rounded-full
        border ${config.bg} ${config.border} ${config.text}
        ${sizeClasses[size]}
        ${className}
      `}
      title={
        lastFetchedAt
          ? `Dernière mise à jour: ${formatRelativeTime(lastFetchedAt)}`
          : config.label
      }
    >
      <Icon className={iconSizes[size]} />
      <span>{config.label}</span>
      {lastFetchedAt && (
        <span className="opacity-70">· {formatRelativeTime(lastFetchedAt)}</span>
      )}
    </span>
  );
}

/**
 * Minimal dot indicator for compact spaces
 */
export function CachedIndicatorDot({
  isStale = false,
  className = '',
}: {
  isStale?: boolean;
  className?: string;
}) {
  const status = useNetworkStatus();
  const isOffline = status === 'offline' || status === 'api_down';

  if (!isStale && !isOffline) {
    return null;
  }

  const color = isOffline ? 'bg-red-400' : 'bg-amber-400';

  return (
    <span
      className={`w-2 h-2 rounded-full ${color} ${className}`}
      title={isOffline ? 'Hors ligne - données en cache' : 'Données potentiellement obsolètes'}
    />
  );
}

/**
 * Last Updated timestamp display
 */
export function LastUpdatedAt({
  timestamp,
  className = '',
}: {
  timestamp?: Date | number | null;
  className?: string;
}) {
  if (!timestamp) return null;

  return (
    <span className={`text-xs text-slate-400 ${className}`}>
      Mis à jour {formatRelativeTime(timestamp)}
    </span>
  );
}
