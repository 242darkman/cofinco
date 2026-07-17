import React, { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

/**
 * IconButton Component - MicroFlex Platform
 * Mobile-first, theme-aware button for icon-only actions
 *
 * @example
 * <IconButton icon={Edit2} variant="ghost" size="sm" aria-label="Modifier" />
 * <IconButton icon={Trash2} variant="danger" size="md" aria-label="Supprimer" />
 */

export type IconButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isLoading?: boolean;
  'aria-label': string; // Required for accessibility
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon: Icon,
      variant = 'ghost',
      size = 'md',
      isLoading = false,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    // Base classes (mobile-first)
    const baseClasses = 'inline-flex items-center justify-center rounded-lg cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-base disabled:opacity-50 disabled:cursor-not-allowed';

    // Size classes
    const sizeClasses = {
      sm: 'p-1.5',
      md: 'p-2',
      lg: 'p-2.5',
    };

    // Icon sizes
    const iconSizes = {
      sm: 16,
      md: 18,
      lg: 20,
    };

    // Variant classes - Theme-aware
    const variantClasses = {
      primary: `
        bg-accent text-white
        hover:bg-accent-primary-hover
        shadow-md hover:shadow-lg
        focus:ring-accent
      `,

      secondary: `
        bg-accent/20 hover:bg-accent/30
        text-accent border border-accent/30 hover:border-accent/50
        focus:ring-accent
      `,

      success: `
        bg-status-success/20 hover:bg-status-success/30
        text-status-success border border-status-success/30 hover:border-status-success/50
        focus:ring-status-success
      `,

      danger: `
        bg-status-danger/20 hover:bg-status-danger/30
        text-status-danger border border-status-danger/30 hover:border-status-danger/50
        focus:ring-status-danger
      `,

      ghost: `
        bg-transparent hover:bg-surface-muted
        text-content-muted hover:text-content-primary
        focus:ring-edge
      `,
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Spinner size="xs" tone="current" />
        ) : (
          <Icon size={iconSizes[size]} />
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
