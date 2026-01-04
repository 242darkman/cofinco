import React from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * StatCard Component - COFIN Platform
 * Mobile-first, theme-aware card for displaying statistics
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

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: StatCardColor;
  trend?: string;
  trendUp?: boolean;
  subtitle?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  color = 'primary',
  trend,
  trendUp,
  subtitle,
  className = '',
  onClick,
}) => {
  // Color variants - Theme-aware using CSS variables where possible
  const colorClasses = {
    primary: 'bg-accent/10 border-accent/30',
    success: 'bg-status-success/10 border-status-success/30',
    warning: 'bg-status-warning/10 border-status-warning/30',
    danger: 'bg-status-danger/10 border-status-danger/30',
    neutral: 'bg-surface-muted border-edge',
  };

  const iconColorClasses = {
    primary: 'text-accent bg-accent/20',
    success: 'text-status-success bg-status-success/20',
    warning: 'text-status-warning bg-status-warning/20',
    danger: 'text-status-danger bg-status-danger/20',
    neutral: 'text-content-muted bg-surface-subtle',
  };

  const trendColorClass = trendUp
    ? 'text-status-success'
    : trendUp === false
      ? 'text-status-danger'
      : 'text-content-muted';

  return (
    <div
      onClick={onClick}
      className={`
        ${colorClasses[color]}
        border rounded-lg p-2.5 sm:p-3
        transition-all duration-200 hover:scale-[1.02] hover:shadow-theme-md
        min-w-0
        ${onClick ? 'cursor-pointer active:scale-95' : ''}
        ${className}
      `}
    >
      {/* Header Row - Title + Icon */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-content-muted text-[10px] sm:text-xs font-medium truncate flex-1">
          {title}
        </p>
        <div className={`${iconColorClasses[color]} p-1.5 rounded-lg`}>
          <Icon size={14} className="sm:w-4 sm:h-4" />
        </div>
      </div>

      {/* Value */}
      <p className="text-xl sm:text-2xl font-bold text-content-primary truncate">
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </p>

      {/* Subtitle & Trend - Inline compact */}
      <div className="flex items-center justify-between mt-1 gap-1">
        {subtitle && (
          <p className="text-[9px] sm:text-[10px] text-content-muted truncate">
            {subtitle}
          </p>
        )}
        {trend && (
          <p className={`text-[9px] sm:text-[10px] font-medium ${trendColorClass} whitespace-nowrap`}>
            {trend}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
