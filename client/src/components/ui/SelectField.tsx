import React, { forwardRef } from 'react';
import { ChevronDown, LucideIcon, AlertCircle } from 'lucide-react';

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
  label?: string;
  name?: string;
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
    const normalizedOptions: SelectOption[] = (options || []).map((opt) =>
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    );

    return (
      <div className={`${containerClassName} mb-4`}>
        {label && (
          <label
            htmlFor={name}
            className="block font-inter font-medium text-[13px] text-[#374151] mb-[6px]"
          >
            {label}
            {required && <span className="text-[#EF4444] ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {Icon && (
            <Icon
              className="absolute left-[14px] top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              size={18}
              strokeWidth={1.5}
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
              w-full h-auto px-[14px] py-[10px] pr-[38px]
              ${Icon ? 'pl-[38px]' : ''}
              bg-white border rounded-lg
              text-[#111827] text-[13px]
              appearance-none cursor-pointer
              transition-colors duration-200
              focus:outline-none focus:ring-[3px]
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error
                ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/30'
                : 'border-[#E5E7EB] hover:border-gray-400 focus:border-[#059669] focus:ring-[#059669]/30'
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
            className="absolute right-[12px] top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            size={16}
            strokeWidth={1.5}
          />
        </div>

        {error && (
          <p
            id={`${name}-error`}
            className="absolute -bottom-5 left-0 text-[11px] text-[#EF4444] flex items-center gap-1 mt-1"
            role="alert"
          >
            <AlertCircle size={12} strokeWidth={2} className="shrink-0" />
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={`${name}-helper`} className="absolute -bottom-5 left-0 text-[11px] text-gray-500 mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';

export default SelectField;
