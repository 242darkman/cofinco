import React from 'react';
import { AlertCircle } from 'lucide-react';

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
    <div className="mb-4 relative">
      <label className="block font-inter font-medium text-[13px] text-[#374151] mb-[6px]">
        Téléphone <span className="text-[#EF4444] ml-1">*</span>
      </label>
      <div
        className={`
          phone-input-group flex items-center
          bg-white border rounded-lg
          transition-all duration-200 overflow-hidden
          focus-within:border-[#059669] focus-within:ring-[3px] focus-within:ring-[#059669]/30
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'}
          ${error
            ? 'border-[#EF4444] focus-within:border-[#EF4444] focus-within:ring-[#EF4444]/30'
            : 'border-[#E5E7EB]'
          }
        `}
      >
        <span className="phone-prefix shrink-0 pl-[14px] pr-3 py-[10px] text-[13px] text-gray-500 font-mono select-none flex items-center self-stretch border-r border-[#E5E7EB] bg-[#F9FAFB]">
          +242
        </span>
        <input
          type="tel"
          value={formatPhone(value)}
          onChange={handleChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="06 XXX XX XX"
          className="flex-1 bg-transparent border-none px-3 py-[10px] text-[13px] text-[#111827] placeholder:text-[#9CA3AF] placeholder:font-normal focus:outline-none focus:ring-0 disabled:cursor-not-allowed min-w-0"
        />
      </div>
      {error && (
        <p className="absolute -bottom-5 left-0 text-[11px] text-[#EF4444] flex items-center gap-1 mt-1" role="alert">
          <AlertCircle size={12} strokeWidth={2} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
