import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { resolveStorageUrl } from '../../lib/format';

/** Génère les initiales à partir d'un label (ex: "MALONGA Herve" -> "MH") */
function getInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/** Composant Avatar avec fallback initiales */
function OptionAvatar({ image, label, disabled }: { image?: string; label: string; disabled?: boolean }) {
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = image ? resolveStorageUrl(image) : null;

  // Reset error state when image changes
  useEffect(() => {
    setHasError(false);
  }, [image]);

  const showImage = resolvedUrl && !hasError;

  return (
    <div className={`relative ${disabled ? 'grayscale opacity-70' : ''}`}>
      {showImage ? (
        <img
          src={resolvedUrl}
          alt=""
          className="w-8 h-8 rounded-full object-cover border border-slate-600"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xs font-bold text-white border border-slate-600 flex-shrink-0">
          {getInitials(label)}
        </div>
      )}
    </div>
  );
}

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  subLabel?: string; // For additional info like score or ID
  image?: string;    // For avatar/photo
  disabled?: boolean;
  disabledReason?: string;
}

interface SearchableSelectProps {
  label: string;
  name: string;
  options: SearchableSelectOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  onDisabledClick?: (option: SearchableSelectOption) => void;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Variant: "default" uses theme colors, "dark" uses slate colors for dark modals/POS */
  variant?: 'default' | 'dark';
  /** Show avatar in trigger when option is selected */
  showAvatarInTrigger?: boolean;
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
  onDisabledClick,
  onSearchChange,
  isLoading,
  placeholder = 'Sélectionner...',
  error,
  helperText,
  required,
  disabled,
  className = '',
  variant = 'default',
  showAvatarInTrigger = true
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


  // Filter options based on search query with flexible name matching
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    
    const lowerQuery = searchQuery.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    
    return options.filter(opt => {
      const lowerLabel = opt.label.toLowerCase();
      const lowerSubLabel = opt.subLabel?.toLowerCase() || '';
      
      // Simple case: direct substring match
      if (lowerLabel.includes(lowerQuery) || lowerSubLabel.includes(lowerQuery)) {
        return true;
      }
      
      // Flexible matching: check if all query words are present (any order)
      // This allows "jean dupont" or "dupont jean" to both match "DUPONT Jean"
      if (queryWords.length > 1) {
        const allWordsMatch = queryWords.every(word => 
          lowerLabel.includes(word) || lowerSubLabel.includes(word)
        );
        return allWordsMatch;
      }
      
      return false;
    });
  }, [options, searchQuery]);

  // Find selected option object
  const selectedOption = options.find(opt => String(opt.value) === String(value));

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) {
      if (onDisabledClick) onDisabledClick(option);
      return;
    }
    onChange(option.value);
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
          flex items-center gap-3
          w-full h-full min-h-[2.75rem] px-4
          border rounded-xl
          text-sm sm:text-base
          cursor-pointer
          transition-all duration-200
          ${variant === 'dark'
            ? 'bg-slate-900 border-slate-700 text-white hover:border-slate-500'
            : 'bg-input-bg border-input-border text-input-text hover:border-input-focus'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${error
            ? 'border-red-500/50 ring-1 ring-red-500/30'
            : isOpen
              ? variant === 'dark'
                ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                : 'border-input-focus ring-2 ring-input-focus/30'
              : ''
          }
        `}
      >
        {/* Avatar when selected */}
        {showAvatarInTrigger && selectedOption && (
          <OptionAvatar image={selectedOption.image} label={selectedOption.label} />
        )}

        {/* Placeholder icon when not selected */}
        {showAvatarInTrigger && !selectedOption && (
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
            <Search size={14} className="text-slate-500" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {selectedOption ? (
            <div>
              <div className="font-medium truncate">{selectedOption.label}</div>
              {selectedOption.subLabel && (
                <div className="text-xs text-slate-500 truncate">{selectedOption.subLabel}</div>
              )}
            </div>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedOption && !disabled && (
            <div
              onClick={handleClear}
              className="p-1.5 hover:bg-slate-700/50 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

          {/* Search Input */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/95 sticky top-0 backdrop-blur-sm">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (onSearchChange) onSearchChange(e.target.value);
                }}
                placeholder="Rechercher par nom ou téléphone..."
                className="w-full h-10 pl-10 pr-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-72 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {isLoading ? (
              <div className="p-6 flex items-center justify-center gap-3 text-slate-500">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium">Recherche en cours...</span>
              </div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full px-4 py-3 flex items-center gap-3
                    cursor-pointer transition-all duration-150
                    ${option.disabled
                      ? 'bg-slate-900/40 opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-800'
                    }
                    ${String(value) === String(option.value)
                      ? 'bg-indigo-600/20 border-l-2 border-indigo-500'
                      : 'border-l-2 border-transparent'
                    }
                  `}
                >
                  {/* Optional Image/Avatar */}
                  <OptionAvatar image={option.image} label={option.label} disabled={option.disabled} />

                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate flex items-center gap-2 ${option.disabled ? 'text-slate-500' : 'text-white'}`}>
                        {option.label}
                        {option.disabled && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-wider">
                                {option.disabledReason || 'Inéligible'}
                            </span>
                        )}
                    </div>
                    {option.subLabel && (
                      <div className={`text-xs truncate ${option.disabled ? 'text-slate-600' : 'text-slate-400'}`}>
                        {option.subLabel}
                      </div>
                    )}
                  </div>

                  {String(value) === String(option.value) && (
                    <Check size={16} className="text-indigo-400 flex-shrink-0" />
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                  <Search size={28} className="text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 font-medium mb-1">
                  {searchQuery.trim() === ''
                    ? "Commencez votre recherche"
                    : "Aucun résultat trouvé"
                  }
                </p>
                <p className="text-xs text-slate-500">
                  {searchQuery.trim() === ''
                    ? "Tapez un nom ou un numéro de téléphone"
                    : "Vérifiez l'orthographe ou essayez d'autres mots-clés"
                  }
                </p>
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
