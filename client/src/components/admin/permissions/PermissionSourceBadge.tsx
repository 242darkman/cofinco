/**
 * Permission Source Badge Component
 * ==================================
 *
 * Displays a visual badge indicating the source of a permission:
 * - ROLE: Inherited from role (blue)
 * - TEMPORARY: Temporary permission (amber)
 * - OVERRIDE_GLOBAL: Global override (indigo) - can be + (granted) or - (denied)
 * - OVERRIDE_AGENCE: Agency-specific override (purple)
 * - NONE: Not granted (slate)
 */

import React from 'react';
import { Shield, Clock, Globe, Building2, AlertCircle } from 'lucide-react';

export type PermissionSource = 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'NONE';

export interface PermissionSourceBadgeProps {
  source: PermissionSource;
  granted?: boolean;
  sourceRole?: string;
  sourceAgenceId?: string;
  compact?: boolean;
  className?: string;
}

// Source configuration
const SOURCE_CONFIG: Record<PermissionSource, {
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  baseClasses: string;
  grantedClasses?: string;
  deniedClasses?: string;
}> = {
  ROLE: {
    label: 'Hérité du rôle',
    shortLabel: 'Rôle',
    icon: Shield,
    baseClasses: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  TEMPORARY: {
    label: 'Permission temporaire',
    shortLabel: 'Temp.',
    icon: Clock,
    baseClasses: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  OVERRIDE_GLOBAL: {
    label: 'Override global',
    shortLabel: 'Override',
    icon: Globe,
    baseClasses: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    grantedClasses: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    deniedClasses: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  OVERRIDE_AGENCE: {
    label: 'Override agence',
    shortLabel: 'Agence',
    icon: Building2,
    baseClasses: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    grantedClasses: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    deniedClasses: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  NONE: {
    label: 'Non accordé',
    shortLabel: 'Aucun',
    icon: AlertCircle,
    baseClasses: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
};

export default function PermissionSourceBadge({
  source,
  granted = true,
  sourceRole,
  sourceAgenceId,
  compact = false,
  className = '',
}: PermissionSourceBadgeProps) {
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  // Determine classes based on granted status for overrides
  let classes = config.baseClasses;
  if (source === 'OVERRIDE_GLOBAL' || source === 'OVERRIDE_AGENCE') {
    if (granted && config.grantedClasses) {
      classes = config.grantedClasses;
    } else if (!granted && config.deniedClasses) {
      classes = config.deniedClasses;
    }
  }

  // Build label with additional info
  let displayLabel = compact ? config.shortLabel : config.label;
  if (source === 'ROLE' && sourceRole) {
    displayLabel = compact ? sourceRole : `Hérité du rôle "${sourceRole}"`;
  }
  if (source === 'OVERRIDE_GLOBAL' || source === 'OVERRIDE_AGENCE') {
    const sign = granted ? '+' : '−';
    displayLabel = compact ? sign : `Override ${sign}`;
  }

  // Build title for tooltip
  let title = config.label;
  if (source === 'ROLE' && sourceRole) {
    title = `Permission héritée du rôle "${sourceRole}"`;
  } else if (source === 'TEMPORARY') {
    title = 'Permission accordée temporairement avec une date d\'expiration';
  } else if (source === 'OVERRIDE_GLOBAL') {
    title = granted
      ? 'Override global: permission explicitement accordée'
      : 'Override global: permission explicitement refusée';
  } else if (source === 'OVERRIDE_AGENCE') {
    title = granted
      ? `Override agence: permission accordée pour l'agence ${sourceAgenceId || '?'}`
      : `Override agence: permission refusée pour l'agence ${sourceAgenceId || '?'}`;
  } else if (source === 'NONE') {
    title = 'Cette permission n\'est pas accordée à l\'utilisateur';
  }

  return (
    <span
      title={title}
      className={`
        inline-flex items-center gap-1
        px-1.5 py-0.5
        rounded border
        text-[9px] font-semibold uppercase tracking-wide
        cursor-help
        ${classes}
        ${className}
      `}
    >
      <Icon size={10} className="shrink-0" />
      {!compact && <span>{displayLabel}</span>}
      {compact && (source === 'OVERRIDE_GLOBAL' || source === 'OVERRIDE_AGENCE') && (
        <span>{displayLabel}</span>
      )}
    </span>
  );
}

// Export labels for use in other components
export const PERMISSION_SOURCE_LABELS: Record<PermissionSource, string> = {
  ROLE: 'Hérité du rôle',
  TEMPORARY: 'Permission temporaire',
  OVERRIDE_GLOBAL: 'Override global',
  OVERRIDE_AGENCE: 'Override agence',
  NONE: 'Non accordé',
};

export const PERMISSION_SOURCE_COLORS: Record<PermissionSource, string> = {
  ROLE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  TEMPORARY: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  OVERRIDE_GLOBAL: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  OVERRIDE_AGENCE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  NONE: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};
