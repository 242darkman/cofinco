import React, { forwardRef } from 'react';

/**
 * TextareaField Component - MicroFlex Platform
 * Mobile-first textarea with label, error, and character count
 *
 * @example
 * <TextareaField
 *   label="Description"
 *   name="description"
 *   value={formData.description}
 *   onChange={handleChange}
 *   rows={4}
 *   maxLength={500}
 *   showCharCount
 * />
 */

export interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  name: string;
  error?: string;
  helperText?: string;
  showCharCount?: boolean;
  containerClassName?: string;
}

const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    {
      label,
      name,
      error,
      helperText,
      showCharCount = false,
      containerClassName = '',
      className = '',
      required,
      disabled,
      maxLength,
      value,
      ...props
    },
    ref
  ) => {
    const currentLength = value ? String(value).length : 0;

    return (
      <div className={containerClassName}>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor={name}
            className="block text-xs sm:text-sm font-semibold text-content-secondary"
          >
            {label}
            {required && <span className="text-status-danger ml-1">*</span>}
          </label>

          {showCharCount && maxLength && (
            <span className="text-xs text-content-muted">
              {currentLength}/{maxLength}
            </span>
          )}
        </div>

        <textarea
          ref={ref}
          id={name}
          name={name}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
          className={`
            w-full px-4 py-2 sm:py-2.5
            bg-input-bg border rounded-lg
            text-input-text text-sm sm:text-base
            placeholder:text-input-placeholder
            resize-y min-h-[80px]
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

TextareaField.displayName = 'TextareaField';

export default TextareaField;
