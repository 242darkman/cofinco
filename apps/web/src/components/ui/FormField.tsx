import React, { forwardRef } from 'react';
import { LucideIcon, AlertCircle } from 'lucide-react';

/**
 * FormField Component - MicroFlex Platform
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
      <div className={`${containerClassName} mb-4`}>
        <label
          htmlFor={name}
          className="block font-inter font-medium text-[13px] text-content-secondary mb-[6px]"
        >
          {label}
          {required && <span className="text-status-danger ml-1">*</span>}
        </label>

        <div className="relative">
          {Icon && (
            <Icon
              className="absolute left-[14px] top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
              size={18}
              strokeWidth={1.5}
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
              w-full px-[14px] py-[10px]
              ${Icon ? 'pl-[38px]' : ''}
              ${RightIcon ? 'pr-[38px]' : ''}
              bg-input-bg border rounded-lg
              text-input-text text-[13px]
              placeholder:text-input-placeholder placeholder:font-normal
              transition-colors duration-200
              focus:outline-none focus:ring-[3px]
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error
                ? 'border-status-danger focus:border-status-danger focus:ring-status-danger/30'
                : 'border-input-border hover:border-content-muted focus:border-accent focus:ring-accent/30'
              }
              ${className}
            `}
            {...props}
          />

          {RightIcon && (
            <button
              type="button"
              onClick={onRightIconClick}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary transition-colors"
              tabIndex={-1}
            >
              <RightIcon size={18} strokeWidth={1.5} />
            </button>
          )}
          {error && (
            <p
              id={`${name}-error`}
              className="absolute -bottom-5 left-0 text-[11px] text-status-danger flex items-center gap-1 mt-1"
              role="alert"
            >
              <AlertCircle size={12} strokeWidth={2} className="shrink-0" />
              {error}
            </p>
          )}

          {helperText && !error && (
            <p id={`${name}-helper`} className="absolute -bottom-5 left-0 text-[11px] text-content-muted mt-1">
              {helperText}
            </p>
          )}
        </div>
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export default FormField;
