import React from 'react';

/**
 * ProgressBar Component - COFIN Platform
 * Mobile-first progress bar with label and percentage display
 *
 * @example
 * <ProgressBar
 *   value={75}
 *   max={100}
 *   label="Progression"
 *   showPercentage
 *   color="success"
 *   size="md"
 * />
 */

export type ProgressBarColor = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  showValue?: boolean;
  color?: ProgressBarColor;
  size?: ProgressBarSize;
  className?: string;
  animate?: boolean;
  striped?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = false,
  showValue = false,
  color = 'primary',
  size = 'md',
  className = '',
  animate = true,
  striped = false,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  // Color classes (mobile-first)
  const colorClasses = {
    primary: 'bg-gradient-to-r from-accent to-status-info',
    success: 'bg-gradient-to-r from-status-success to-status-success',
    warning: 'bg-gradient-to-r from-status-warning to-status-warning',
    danger: 'bg-gradient-to-r from-status-danger to-status-danger',
    neutral: 'bg-gradient-to-r from-surface-subtle to-surface-subtle',
  };

  // Size classes (mobile-first)
  const sizeClasses = {
    sm: 'h-1.5 sm:h-2',
    md: 'h-2 sm:h-3',
    lg: 'h-3 sm:h-4',
  };

  const textSizeClasses = {
    sm: 'text-[10px] sm:text-xs',
    md: 'text-xs sm:text-sm',
    lg: 'text-sm sm:text-base',
  };

  return (
    <div className={className}>
      {/* Label and percentage/value */}
      {(label || showPercentage || showValue) && (
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          {label && (
            <span className={`text-content-muted font-medium ${textSizeClasses[size]}`}>
              {label}
            </span>
          )}
          {(showPercentage || showValue) && (
            <span className={`text-content-primary font-semibold ${textSizeClasses[size]}`}>
              {showPercentage && `${percentage.toFixed(0)}%`}
              {showPercentage && showValue && ' • '}
              {showValue && `${value}/${max}`}
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div
        className={`
          w-full bg-surface-elevated rounded-full overflow-hidden
          ${sizeClasses[size]}
        `}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={`
            h-full rounded-full
            ${colorClasses[color]}
            ${animate ? 'transition-all duration-500 ease-out' : ''}
            ${striped ? 'bg-stripe' : ''}
          `}
          style={{ width: `${percentage}%` }}
        >
          {striped && (
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)',
                backgroundSize: '1rem 1rem',
                animation: animate ? 'progress-stripe 1s linear infinite' : 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
