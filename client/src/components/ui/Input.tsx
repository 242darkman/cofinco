import React, { forwardRef } from 'react';

/**
 * Input Component - COFIN Platform
 * Basic theme-aware input component
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        disabled={disabled}
        className={`
          w-full px-4 py-2 sm:py-2.5
          bg-input-bg border rounded-lg
          text-input-text text-sm sm:text-base
          placeholder:text-input-placeholder
          transition-colors duration-200
          focus:outline-none focus:ring-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error
            ? 'border-status-danger/50 focus:border-status-danger focus:ring-status-danger/30'
            : 'border-input-border focus:border-input-focus focus:ring-input-focus/30'
          }
          ${className}
        `}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;
