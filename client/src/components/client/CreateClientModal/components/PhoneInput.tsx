import React from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (raw: string, full: string) => void;
  error?: string;
  onBlur?: () => void;
  disabled?: boolean;
}

/** Format brut "061234567" → "06 123 45 67" (pattern XX XXX XX XX) */
function formatPhone(raw: string): string {
  const d = raw.slice(0, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

export default function PhoneInput({ value, onChange, error, onBlur, disabled }: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 9);
    onChange(raw, `+242${raw}`);
  };

  return (
    <div>
      <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
        Téléphone <span className="text-status-danger ml-1">*</span>
      </label>
      <div
        className={`
          phone-input-group flex items-center
          bg-input border rounded-xl
          transition-all duration-200
          focus-within:border-input-focus focus-within:ring-2 focus-within:ring-input-focus/20
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${error
            ? 'border-status-danger/50 focus-within:border-status-danger focus-within:ring-status-danger/20'
            : 'border-input-border'
          }
        `}
      >
        <span className="phone-prefix shrink-0 pl-4 pr-3 text-sm text-content-muted/60 font-mono select-none flex items-center self-stretch border-r border-edge-subtle/60 bg-surface-subtle/30">
          +242
        </span>
        <input
          type="tel"
          value={formatPhone(value)}
          onChange={handleChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="06 XXX XX XX"
          className="flex-1 bg-transparent border-none px-3 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed min-w-0"
        />
      </div>
      {error && (
        <p className="mt-1.5 text-[10px] text-status-danger" role="alert">{error}</p>
      )}
    </div>
  );
}
