import React, { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Button Component - COFIN Platform
 * Mobile-first, accessible, theme-aware button component
 *
 * @example
 * <Button variant="primary" size="md">Enregistrer</Button>
 * <Button variant="danger" size="sm" icon={Trash2}>Supprimer</Button>
 */

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      isLoading = false,
      fullWidth = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // Base classes (mobile-first)
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-offset-surface-base';

    // Size classes (mobile-first with responsive scaling)
    const sizeClasses = {
      xs: 'px-2 py-1 text-xs',
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-sm sm:text-base',
      lg: 'px-6 py-3 text-base sm:text-lg',
    };

    // Variant classes - Theme-aware with light/dark support
    const variantClasses = {
      // Primary: Solid accent color, highly visible
      primary: `
        bg-accent text-content-inverted
        hover:bg-accent-primary-hover
        border border-accent/50
        shadow-lg shadow-accent/30 hover:shadow-xl hover:shadow-accent/40
        focus:ring-accent
        dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:border-cyan-400/60
        dark:shadow-cyan-500/40 dark:hover:shadow-cyan-400/50
      `,

      // Secondary: More visible with stronger background
      secondary: `
        bg-accent/15 hover:bg-accent/25
        text-accent border border-accent/40 hover:border-accent/60
        focus:ring-accent
        dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 dark:text-cyan-300
        dark:border-cyan-500/50 dark:hover:border-cyan-400/70
      `,

      // Success: Vibrant green
      success: `
        bg-status-success text-content-inverted
        hover:brightness-110
        border border-status-success/50
        shadow-lg shadow-status-success/30 hover:shadow-xl hover:shadow-status-success/40
        focus:ring-status-success
        dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:border-emerald-400/60
      `,

      // Danger: Vibrant red
      danger: `
        bg-status-danger text-content-inverted
        hover:brightness-110
        border border-status-danger/50
        shadow-lg shadow-status-danger/30 hover:shadow-xl hover:shadow-status-danger/40
        focus:ring-status-danger
        dark:bg-red-500 dark:hover:bg-red-400 dark:border-red-400/60
      `,

      // Warning: Vibrant amber/orange
      warning: `
        bg-amber-500 text-white
        hover:bg-amber-600
        border border-amber-600/50
        shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40
        focus:ring-amber-500
        dark:bg-amber-600 dark:hover:bg-amber-500 dark:border-amber-500/60
      `,

      // Ghost: More visible hover state
      ghost: `
        bg-transparent
        text-content-secondary hover:text-content-primary
        hover:bg-surface-muted
        border border-transparent hover:border-edge/50
        focus:ring-edge
        dark:hover:bg-slate-700/60 dark:hover:border-slate-600
      `,

      // Outline: Stronger border visibility
      outline: `
        bg-transparent border-2 border-edge-strong
        text-content-secondary hover:text-content-primary
        hover:border-accent hover:bg-surface-muted
        focus:ring-edge
        dark:border-slate-500 dark:hover:border-cyan-400 dark:hover:bg-slate-800/60
        dark:text-slate-300 dark:hover:text-white
      `,
    };

    // Width class
    const widthClass = fullWidth ? 'w-full' : '';

    // Icon size based on button size
    const iconSize = {
      xs: 14,
      sm: 16,
      md: 18,
      lg: 20,
    }[size];

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Chargement...</span>
          </>
        ) : (
          <>
            {Icon && iconPosition === 'left' && <Icon size={iconSize} />}
            {children}
            {Icon && iconPosition === 'right' && <Icon size={iconSize} />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
