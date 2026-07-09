import React from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * StatCard Component - MicroFlex Platform
 * Mobile-first, clean & minimal card for displaying statistics
 *
 * @example
 * <StatCard
 *   title="Total Clients"
 *   value={8031}
 *   icon={Users}
 *   color="primary"
 *   trend="+12% ce mois"
 * />
 */

export type StatCardColor = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
export type StatCardVariant = 'default' | 'minimal' | 'glass';

export interface StatCardProps {
  title: string;
  value: string | number | React.ReactNode;
  icon?: LucideIcon;
  color?: StatCardColor;
  variant?: StatCardVariant;
  trend?: string;
  trendUp?: boolean;
  subtitle?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  color = 'primary',
  variant = 'default',
  trend,
  trendUp,
  subtitle,
  className = '',
  onClick,
}) => {
  // Accent colors for the left border indicator
  const accentColors = {
    primary: 'border-l-accent',
    success: 'border-l-status-success',
    warning: 'border-l-status-warning',
    danger: 'border-l-status-danger',
    neutral: 'border-l-content-muted',
  };

  const iconColors = {
    primary: 'text-accent',
    success: 'text-status-success',
    warning: 'text-status-warning',
    danger: 'text-status-danger',
    neutral: 'text-content-muted',
  };

  const trendColorClass = trendUp
    ? 'text-status-success'
    : trendUp === false
      ? 'text-status-danger'
      : 'text-content-muted';

  // Variant styles
  const variantStyles = {
    default: `
      bg-surface/60 backdrop-blur-sm
      border border-edge-subtle border-l-[3px] ${accentColors[color]}
      rounded-lg
    `,
    minimal: `
      bg-transparent
      border-l-2 ${accentColors[color]}
      pl-3
    `,
    glass: `
      bg-white/5 backdrop-blur-md
      border border-white/10 border-l-[3px] ${accentColors[color]}
      rounded-xl
    `,
  };

  return (
    <div
      onClick={onClick}
      className={`
        ${variantStyles[variant]}
        p-3 sm:p-4
        transition-all duration-200
        min-w-0
        ${onClick ? 'cursor-pointer hover:bg-surface-elevated/40 active:scale-[0.98]' : ''}
        ${className}
      `}
    >
      {/* Title Row */}
      <div className="flex items-center gap-2 mb-1.5">
        {Icon && (
          <Icon size={14} className={`${iconColors[color]} opacity-70`} />
        )}
        <p className="text-content-muted text-[11px] sm:text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
      </div>

      {/* Value - Clean & Bold */}
      <div className="text-content-primary text-lg sm:text-xl font-semibold tracking-tight">
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>

      {/* Subtitle & Trend */}
      {(subtitle || trend) && (
        <div className="flex items-center justify-between mt-1.5 gap-2">
          {subtitle && (
            <span className="text-[10px] sm:text-xs text-content-muted truncate">
              {subtitle}
            </span>
          )}
          {trend && (
            <span className={`text-[10px] sm:text-xs font-medium ${trendColorClass} whitespace-nowrap`}>
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
