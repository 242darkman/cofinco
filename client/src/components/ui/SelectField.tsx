import React, { forwardRef } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

/**
 * SelectField Component - COFIN Platform
 * Mobile-first select dropdown with label and error handling
 *
 * @example
 * <SelectField
 *   label="Rôle"
 *   name="role"
 *   value={formData.role}
 *   onChange={handleChange}
 *   options={roles.map(r => ({ value: r, label: r }))}
 *   required
 * />
 */

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  name: string;
  options: SelectOption[] | string[];
  error?: string;
  helperText?: string;
  placeholder?: string;
  icon?: LucideIcon;
  containerClassName?: string;
}

const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      label,
      name,
      options,
      error,
      helperText,
      placeholder = 'Sélectionner...',
      icon: Icon,
      containerClassName = '',
      className = '',
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    // Normalize options to SelectOption format
    const normalizedOptions: SelectOption[] = options.map((opt) =>
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    );

    return (
      <div className={containerClassName}>
        {label && (
          <label
            htmlFor={name}
            className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2"
          >
            {label}
            {required && <span className="text-status-danger ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {Icon && (
            <Icon
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              size={18}
            />
          )}

          <select
            ref={ref}
            id={name}
            name={name}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
            className={`
              w-full h-10 sm:h-11 px-4 pr-10
              ${Icon ? 'pl-10' : ''}
              bg-input-bg border rounded-lg
              text-input-text text-sm sm:text-base
              appearance-none cursor-pointer
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
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {normalizedOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            size={18}
          />
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

SelectField.displayName = 'SelectField';

export default SelectField;
