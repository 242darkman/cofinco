import React from 'react';

/**
 * Card Component - MicroFlex Platform
 * Mobile-first, theme-aware card container
 *
 * @example
 * <Card>
 *   <Card.Header>Title</Card.Header>
 *   <Card.Content>Content here</Card.Content>
 * </Card>
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', children, ...props }, ref) => {
    // Base classes (mobile-first, theme-aware)
    const baseClasses = 'rounded-lg border transition-all duration-200';

    // Variant classes - Theme-aware with RGAA compliant contrast
    // Light mode: fond blanc pur + bordure fine + ombre légère
    // Dark mode: fond surface + bordure rgba blanc + ombre profonde
    const variantClasses = {
      default: 'bg-surface border-card-border shadow-card',
      glass: 'bg-surface/80 border-card-border backdrop-blur-sm shadow-card',
      elevated: 'bg-surface-elevated border-card-border shadow-theme-lg',
    };

    // Padding classes (mobile-first responsive)
    const paddingClasses = {
      none: '',
      sm: 'p-3 sm:p-4',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header subcomponent
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ as: Component = 'h3', className = '', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={`font-bold text-content-primary mb-4 text-lg sm:text-xl ${className}`}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

CardHeader.displayName = 'Card.Header';

// Card Content subcomponent
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div ref={ref} className={`text-content-secondary ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'Card.Content';

// Card Footer subcomponent
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`mt-4 pt-4 border-t border-edge flex gap-2 flex-wrap ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'Card.Footer';

// Attach subcomponents
export default Object.assign(Card, {
  Header: CardHeader,
  Content: CardContent,
  Footer: CardFooter,
});
