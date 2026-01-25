import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}

export default function Switch({
  checked,
  onChange,
  disabled = false,
  className = '',
  'data-testid': testId,
  ariaLabel,
  size = 'md',
}: SwitchProps) {
  const sizeClasses = {
    sm: {
      button: 'h-5 w-9',
      span: 'h-3.5 w-3.5',
      translate: 'translate-x-5',
      translateOff: 'translate-x-0.5'
    },
    md: {
      button: 'h-7 w-12',
      span: 'h-5 w-5',
      translate: 'translate-x-6',
      translateOff: 'translate-x-1'
    }
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex ${currentSize.button} items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      data-testid={testId}
    >
      <span
        className={`
          inline-block ${currentSize.span} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
          ${checked ? currentSize.translate : currentSize.translateOff}
        `}
      />
    </button>
  );
}
