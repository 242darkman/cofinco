import React from 'react';

/**
 * Badge Component - COFIN Platform
 * Mobile-first badge for status indicators with auto color detection
 *
 * @example
 * <Badge value="Actif" />
 * <Badge value="En attente" variant="warning" />
 * <Badge value="Rejeté" size="lg" />
 */

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  value: string | React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  icon?: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({
  value,
  variant,
  size = 'md',
  className = '',
  icon,
}) => {
  // Auto-detect variant from value if not provided
  const getVariantFromValue = (val: string | React.ReactNode): BadgeVariant => {
    if (variant) return variant;

    const str = String(val).toLowerCase();

    // Success states
    if (['actif', 'active', 'validé', 'approuvé', 'approuvée', 'soldé', 'déboursé', 'validée'].includes(str)) {
      return 'success';
    }

    // Warning states
    if (['en attente', 'suspendu', 'en cours', "en cours d'analyse", 'pending'].includes(str)) {
      return 'warning';
    }

    // Danger states
    if (['rejeté', 'rejetée', 'inactif', 'inactive', 'annulé', 'en retard', 'contentieux', 'bloqué'].includes(str)) {
      return 'danger';
    }

    // Info states
    if (['réduite', 'restructuré', 'en révision'].includes(str)) {
      return 'info';
    }

    // Primary states (Premium)
    if (['premium', 'gold', 'pro'].includes(str)) {
      return 'primary';
    }

    // Warning states (VIP uses warning for Gold color)
    if (['vip', 'platinum'].includes(str)) {
      return 'warning';
    }

    return 'neutral';
  };

  const detectedVariant = getVariantFromValue(value);

  // Variant color classes (mobile-first)
  const variantClasses = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    danger: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    primary: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    outline: 'bg-transparent text-slate-600 border-slate-300',
  };

  // Size classes (mobile-first)
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] sm:text-xs',
    md: 'px-2 py-1 text-[11px] sm:text-xs',
    lg: 'px-3 py-1.5 text-xs sm:text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded border font-semibold
        transition-colors duration-200
        ${variantClasses[detectedVariant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{value}</span>
    </span>
  );
};

export default Badge;
