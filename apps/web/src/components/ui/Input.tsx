import React, { forwardRef } from 'react';

/**
 * Input Component - MicroFlex Platform
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
          w-full px-[14px] py-[10px]
          bg-white border rounded-lg
          text-[#111827] text-[13px] sm:text-[13px]
          placeholder:text-[#9CA3AF] placeholder:font-normal
          transition-colors duration-200
          focus:outline-none focus:ring-[3px]
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error
            ? 'border-status-danger focus:border-status-danger focus:ring-status-danger/30'
            : 'border-[#E5E7EB] hover:border-gray-400 focus:border-accent focus:ring-accent/30'
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
