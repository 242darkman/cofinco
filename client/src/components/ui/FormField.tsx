import React, { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * FormField Component - COFIN Platform
 * Mobile-first, theme-aware form input
 *
 * @example
 * <FormField
 *   label="Nom complet"
 *   name="name"
 *   value={formData.name}
 *   onChange={handleChange}
 *   required
 *   error={errors.name}
 *   helperText="Prénom et nom de famille"
 * />
 */

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  helperText?: React.ReactNode;
  icon?: LucideIcon;
  rightIcon?: LucideIcon;
  onRightIconClick?: () => void;
  containerClassName?: string;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      name,
      error,
      helperText,
      icon: Icon,
      rightIcon: RightIcon,
      onRightIconClick,
      containerClassName = '',
      className = '',
      required,
      disabled,
      children, // Explicitly destructure to exclude from props spread
      ...props
    },
    ref
  ) => {
    return (
      <div className={containerClassName}>
        <label
          htmlFor={name}
          className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2"
        >
          {label}
          {required && <span className="text-status-danger ml-1">*</span>}
        </label>

        <div className="relative">
          {Icon && (
            <Icon
              className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
              size={18}
            />
          )}

          <input
            ref={ref}
            id={name}
            name={name}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
            className={`
              w-full px-4 py-2 sm:py-2.5
              ${Icon ? 'pl-10' : ''}
              ${RightIcon ? 'pr-10' : ''}
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

          {RightIcon && (
            <button
              type="button"
              onClick={onRightIconClick}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary transition-colors"
              tabIndex={-1}
            >
              <RightIcon size={18} />
            </button>
          )}
        </div>

        {error && (
          <p
            id={`${name}-error`}
            className="mt-1.5 text-xs sm:text-sm text-status-danger flex items-center gap-1"
            role="alert"
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={`${name}-helper`} className="mt-1.5 text-xs sm:text-sm text-content-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export default FormField;
