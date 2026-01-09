import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  subLabel?: string; // For additional info like score or ID
  image?: string;    // For avatar/photo
}

interface SearchableSelectProps {
  label: string;
  name: string;
  options: SearchableSelectOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * SearchableSelect Component
 * A "Pro" dropdown with search capability
 */
export default function SearchableSelect({
  label,
  name,
  options,
  value,
  onChange,
  placeholder = 'Sélectionner...',
  error,
  helperText,
  required,
  disabled,
  className = ''
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const lowerQuery = searchQuery.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(lowerQuery) || 
      (opt.subLabel && opt.subLabel.toLowerCase().includes(lowerQuery))
    );
  }, [options, searchQuery]);

  // Find selected option object
  const selectedOption = options.find(opt => String(opt.value) === String(value));

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={name} className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
          {label}
          {required && <span className="text-status-danger ml-1">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between
          w-full h-10 sm:h-11 px-4
          bg-input-bg border rounded-lg
          text-input-text text-sm sm:text-base
          cursor-pointer
          transition-colors duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-input-focus'}
          ${error
            ? 'border-status-danger/50 ring-1 ring-status-danger/30'
            : isOpen ? 'border-input-focus ring-2 ring-input-focus/30' : 'border-input-border'
          }
        `}
      >
        <span className={`block truncate ${!selectedOption ? 'text-slate-500' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        
        <div className="flex items-center gap-2">
          {selectedOption && !disabled && (
            <div 
              onClick={handleClear}
              className="p-1 hover:bg-slate-700/50 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          
          {/* Search Input */}
          <div className="p-2 border-b border-slate-700 bg-slate-800/95 sticky top-0 backdrop-blur-sm">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full h-9 pl-9 pr-3 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`
                    w-full px-4 py-2.5 flex items-center gap-3
                    cursor-pointer transition-colors
                    ${String(value) === String(option.value) 
                      ? 'bg-blue-600/20 text-blue-100' 
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    }
                  `}
                >
                  {/* Optional Image/Avatar */}
                  {option.image ? (
                    <img src={option.image} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-600" />
                  ) : (
                     // Fallback avatar if needed or just nothing
                     <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-600 flex-shrink-0">
                        {option.label.charAt(0).toUpperCase()}
                     </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{option.label}</div>
                    {option.subLabel && (
                      <div className="text-xs text-slate-500 truncate">{option.subLabel}</div>
                    )}
                  </div>

                  {String(value) === String(option.value) && (
                    <Check size={16} className="text-blue-400" />
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">
                Aucun résultat trouvé
              </div>
            )}
          </div>
        </div>
      )}

      {/* Errors */}
      {error && (
        <p className="mt-1.5 text-xs sm:text-sm text-status-danger flex items-center gap-1">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          {error}
        </p>
      )}
    </div>
  );
}
