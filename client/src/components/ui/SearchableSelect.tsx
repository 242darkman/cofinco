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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (onSearchChange) onSearchChange(e.target.value);
                }}
                placeholder="Rechercher..."
                className="w-full h-9 pl-9 pr-3 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {isLoading ? (
              <div className="p-4 flex items-center justify-center gap-2 text-slate-500">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm">Recherche en cours...</span>
              </div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full px-4 py-2.5 flex items-center gap-3
                    cursor-pointer transition-colors
                    ${option.disabled 
                      ? 'bg-slate-900/40 opacity-50 cursor-not-allowed hover:bg-slate-900/60' 
                      : 'hover:bg-slate-700/50 hover:text-white'
                    }
                    ${String(value) === String(option.value) 
                      ? 'bg-blue-600/20 text-blue-100' 
                      : 'text-slate-300'
                    }
                  `}
                >
                  {/* Optional Image/Avatar */}
                  <OptionAvatar image={option.image} label={option.label} disabled={option.disabled} />

                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate flex items-center gap-2 ${option.disabled ? 'text-slate-500' : ''}`}>
                        {option.label}
                        {option.disabled && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-wider">
                                {option.disabledReason || 'Inéligible'}
                            </span>
                        )}
                    </div>
                    {option.subLabel && (
                      <div className={`text-xs truncate ${option.disabled ? 'text-slate-600' : 'text-slate-500'}`}>
                        {option.subLabel}
                      </div>
                    )}
                  </div>

                  {String(value) === String(option.value) && (
                    <Check size={16} className="text-blue-400" />
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="mb-2 flex justify-center text-slate-600">
                  <Search size={32} opacity={0.3} />
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  {searchQuery.trim() === '' 
                    ? "Recherchez un client par son nom ou son numéro de téléphone pour commencer."
                    : "Aucun client ne correspond à votre recherche"
                  }
                </p>
                {searchQuery.trim() !== '' && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    Vérifiez l'orthographe ou essayez d'autres mots-clés
                  </p>
                )}
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
