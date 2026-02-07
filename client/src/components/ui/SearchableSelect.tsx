import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Check, AlertCircle } from 'lucide-react';
import { resolveStorageUrl } from '../../lib/format';
import * as Popover from '@radix-ui/react-popover';

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
  /** Custom icon to display in the trigger (overrides default Search icon) */
  icon?: React.ElementType;
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
  showAvatarInTrigger = true,
  icon: Icon
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);




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

      {/* Main Container - Acts as both Trigger and Input */}
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <div
            onClick={() => {
               if (!disabled && !isOpen) {
                 setIsOpen(true);
               }
            }}
            className={`
              relative flex items-center
              w-full h-full min-h-[3rem]
              border rounded-xl px-2
              text-sm sm:text-base
              transition-all duration-200
              ${variant === 'dark'
                ? 'bg-slate-900 border-slate-700 text-white'
                : 'bg-input-bg border-input-border text-input-text'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-500'}
              ${isOpen ? 'ring-2 ring-indigo-500/30 border-indigo-500' : ''}
              ${error ? 'border-red-500/50 ring-1 ring-red-500/30' : ''}
            `}
          >
              {/* Left Icon / Avatar */}
               <div className="shrink-0 mr-3 pl-1">
                 {showAvatarInTrigger && selectedOption ? (
                    <OptionAvatar image={selectedOption.image} label={selectedOption.label} />
                 ) : (
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center ${isOpen ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                       {Icon ? <Icon size={14} /> : <Search size={14} />}
                    </div>
                 )}
               </div>

               {/* Content Area: Either Display Value or Search Input */}
               <div className="flex-1 min-w-0 py-2">
                  {isOpen ? (
                     <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                           setSearchQuery(e.target.value);
                           if (onSearchChange) onSearchChange(e.target.value);
                        }}
                        placeholder="Tapez pour rechercher..."
                        className="w-full bg-transparent border-none p-0 text-white placeholder:text-slate-500 focus:ring-0 focus:outline-none text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                        // Prevent Popover from closing when clicking input
                        onKeyDown={(e) => e.stopPropagation()}
                     />
                  ) : selectedOption ? (
                    <div>
                      <div className="font-medium truncate leading-tight">{selectedOption.label}</div>
                      {selectedOption.subLabel && <div className="text-xs text-slate-500 truncate">{selectedOption.subLabel}</div>}
                    </div>
                  ) : (
                     <span className="text-slate-500 block py-1">{placeholder}</span>
                  )}
               </div>

               {/* Right Actions */}
               <div className="flex items-center gap-2 pl-2 pr-1">
                  {(selectedOption || (isOpen && searchQuery)) && (
                     <div
                       onClick={(e) => {
                          e.stopPropagation();
                          if (isOpen) {
                              setSearchQuery('');
                              if (onSearchChange) onSearchChange('');
                              searchInputRef.current?.focus();
                          } else {
                              handleClear(e);
                          }
                       }}
                       className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
                     >
                       <X size={14} />
                     </div>
                  )}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) {
                        setIsOpen(!isOpen);
                      }
                    }}
                    className="p-1 cursor-pointer hover:bg-slate-800 rounded-full transition-colors"
                  >
                    <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
               </div>
          </div>
        </Popover.Trigger>

        {/* Dropdown Menu - Portal to avoid overflow/scroll issues */}
        <Popover.Portal>
            <Popover.Content 
                className="z-[9999] w-[var(--radix-popover-trigger-width)] bg-slate-900 border border-indigo-500 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                sideOffset={4}
                align="start"
            >
               <div className="max-h-64 overflow-y-auto overflow-x-hidden custom-scrollbar">
                 {isLoading ? (
                   <div className="p-8 flex flex-col items-center justify-center gap-3 text-slate-500">
                     <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                     <span className="text-xs font-medium uppercase tracking-wider">Chargement...</span>
                   </div>
                 ) : filteredOptions.length > 0 ? (
                    <div className="py-1">
                      {filteredOptions.map((option) => (
                         <div
                           key={option.value}
                           onClick={() => handleSelect(option)}
                           className={`
                             w-full px-4 py-2.5 flex items-center gap-3
                             cursor-pointer transition-colors border-l-2
                             ${option.disabled ? 'opacity-50 cursor-not-allowed bg-slate-900/50 border-transparent' : 'hover:bg-slate-800/80'}
                             ${String(value) === String(option.value)
                               ? 'bg-indigo-500/10 border-indigo-500'
                               : 'border-transparent'
                             }
                           `}
                         >
                           <OptionAvatar image={option.image} label={option.label} disabled={option.disabled} />
                           <div className="flex-1 min-w-0">
                             <div className={`text-sm font-medium truncate flex items-center gap-2 ${option.disabled ? 'text-slate-500' : 'text-slate-200'}`}>
                                 {option.label}
                                 {option.disabled && (
                                     <Badge value={option.disabledReason || "Indisponible"} variant="danger" className="text-[9px] py-0 px-1.5 h-4" />
                                 )}
                             </div>
                             {option.subLabel && <div className="text-xs text-slate-500 truncate">{option.subLabel}</div>}
                           </div>
                           {String(value) === String(option.value) && (
                             <Check size={14} className="text-indigo-400" />
                           )}
                         </div>
                      ))}
                    </div>
                 ) : (
                   <div className="p-6 text-center">
                      <p className="text-sm text-slate-400 mb-1">Aucun résultat</p>
                      <p className="text-xs text-slate-600">"{searchQuery}"</p>
                   </div>
                 )}
                </div>
                
                {/* Footer Hint */}
                <div className="bg-slate-950/50 py-1.5 px-3 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between items-center">
                    <span>{filteredOptions.length} résultats</span>
                    {searchQuery && <span>Entrée pour valider</span>}
                </div>
            </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Errors */}
      {error && (
        <p className="mt-1.5 text-xs text-status-danger flex items-center gap-1 animate-in slide-in-from-top-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

// Add simple Badge component if not imported, or replace usage.
// Assuming Badge is not available in scope here based on imports (Lucide icons imported).
// Replacing Badge usage with simple span for safety.
function Badge({ value, variant, className }: { value: string, variant?: string, className?: string }) {
    const colors = variant === 'danger' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-700 text-slate-300';
    return <span className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider ${colors} ${className}`}>{value}</span>
}
