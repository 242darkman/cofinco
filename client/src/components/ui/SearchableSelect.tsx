import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronDown, Search, X, Check, AlertCircle } from 'lucide-react';
import { resolveStorageUrl } from '../../lib/format';
import * as Popover from '@radix-ui/react-popover';

const PAGE_SIZE = 20;

/** Génère les initiales à partir d'un label (ex: "MALONGA Herve" -> "MH") */
function getInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/** Composant Avatar avec fallback initiales */
function OptionAvatar({ image, label, disabled, emoji }: { image?: string; label: string; disabled?: boolean; emoji?: string }) {
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
          className="w-8 h-8 rounded-full object-cover border border-edge-strong"
          onError={() => setHasError(true)}
        />
      ) : emoji ? (
        <span className="w-8 h-8 flex items-center justify-center text-xl leading-none flex-shrink-0">{emoji}</span>
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-surface-subtle to-surface-elevated flex items-center justify-center text-xs font-bold text-content-primary border border-edge-strong flex-shrink-0">
          {getInitials(label)}
        </div>
      )}
    </div>
  );
}

/** Skeleton loader for items loading in */
function SkeletonItem() {
  return (
    <div className="w-full px-4 py-2.5 flex items-center gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-surface-elevated" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-surface-elevated rounded w-3/4" />
        <div className="h-2.5 bg-surface-elevated/60 rounded w-1/2" />
      </div>
    </div>
  );
}

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  subLabel?: string; // For additional info like score or ID
  image?: string;    // For avatar/photo
  emoji?: string;    // For flag emojis or other emoji icons
  disabled?: boolean;
  disabledReason?: string;
  hideAvatar?: boolean; // Hide the avatar/initials circle for this option
}

interface SearchableSelectProps {
  label?: string;
  name: string;
  options: SearchableSelectOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  onDisabledClick?: (option: SearchableSelectOption) => void;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  /** External "load more" callback for server-side pagination */
  onLoadMore?: () => void;
  /** Whether more items are available server-side */
  hasMore?: boolean;
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
 * A "Pro" dropdown with search capability and infinite scroll pagination
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
  onLoadMore,
  hasMore: hasMoreExternal,
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset visible count and highlighted index when search changes or dropdown opens/closes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setHighlightedIndex(-1);
  }, [searchQuery, isOpen]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex < 0) return;
    const el = optionRefs.current.get(highlightedIndex);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Strip diacritics for accent-insensitive matching (e.g. "electricite" matches "Électricité")
  const stripDiacritics = useCallback((s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  , []);

  // Filter options based on search query with flexible name matching
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;

    const normQuery = stripDiacritics(searchQuery.trim());
    const queryWords = normQuery.split(/\s+/).filter(w => w.length > 0);

    return options.filter(opt => {
      const normLabel = stripDiacritics(opt.label);
      const normSubLabel = opt.subLabel ? stripDiacritics(opt.subLabel) : '';

      if (normLabel.includes(normQuery) || normSubLabel.includes(normQuery)) {
        return true;
      }

      if (queryWords.length > 1) {
        return queryWords.every(word =>
          normLabel.includes(word) || normSubLabel.includes(word)
        );
      }

      return false;
    });
  }, [options, searchQuery, stripDiacritics]);

  // Slice to visible page
  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, visibleCount),
    [filteredOptions, visibleCount]
  );

  const hasMoreLocal = visibleCount < filteredOptions.length;
  const hasMore = hasMoreLocal || (hasMoreExternal ?? false);
  const isLoadingMore = isLoading && visibleOptions.length > 0;

  // Infinite scroll via onScroll — load next page when scrolled past 90%
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const ratio = (el.scrollTop + el.clientHeight) / el.scrollHeight;
    if (ratio < 0.9 || isLoading) return;
    if (hasMoreLocal) {
      setVisibleCount(prev => prev + PAGE_SIZE);
    } else if (hasMoreExternal && onLoadMore) {
      onLoadMore();
    }
  };

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

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev < visibleOptions.length - 1 ? prev + 1 : prev;
          // Auto-expand visible page if navigating near the end
          if (next >= visibleCount - 3 && hasMoreLocal) {
            setVisibleCount(vc => vc + PAGE_SIZE);
          }
          return next;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const opt = visibleOptions[highlightedIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setIsOpen(false);
          setSearchQuery('');
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
      }
      case 'Home': {
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setHighlightedIndex(visibleOptions.length - 1);
        break;
      }
    }
  }, [isOpen, visibleOptions, visibleCount, highlightedIndex, hasMoreLocal, onChange]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={`relative ${className} ${label ? 'mb-4' : ''}`} ref={containerRef}>
      {label && (
        <label htmlFor={name} className="block font-inter font-medium text-[13px] text-[#374151] mb-[6px]">
          {label}
          {required && <span className="text-[#EF4444] ml-1">*</span>}
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
              w-full py-[10px] pl-[14px] pr-8
              border rounded-lg
              text-[13px]
              transition-all duration-200
              ${variant === 'dark'
                ? 'bg-surface-base border-edge text-content-primary'
                : 'bg-white text-[#111827]'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
              ${isOpen ? 'border-[#059669] ring-[3px] ring-[#059669]/30' : (variant === 'dark' ? '' : 'border-[#E5E7EB]')}
              ${error ? '!border-[#EF4444] !ring-[3px] !ring-[#EF4444]/30' : ''}
            `}
          >
              {/* Left Icon / Avatar */}
               {showAvatarInTrigger && selectedOption && !selectedOption.hideAvatar ? (
                 <div className="shrink-0 mr-2">
                   <OptionAvatar image={selectedOption.image} label={selectedOption.label} emoji={selectedOption.emoji} />
                 </div>
               ) : (
                 <div className="shrink-0 mr-2 text-gray-400">
                   {Icon ? <Icon size={18} strokeWidth={1.5} /> : <Search size={18} strokeWidth={1.5} />}
                 </div>
               )}

               {/* Content Area: Either Display Value or Search Input */}
               <div className="flex-1 min-w-0 overflow-hidden">
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
                        className="w-full bg-transparent border-none p-0 text-[#111827] placeholder:text-[#9CA3AF] placeholder:font-normal focus:ring-0 focus:outline-none text-[13px]"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                           e.stopPropagation();
                           handleKeyDown(e);
                        }}
                     />
                  ) : selectedOption ? (
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[13px] text-[#111827] truncate leading-tight">{selectedOption.label}</span>
                      {selectedOption.subLabel && <span className="text-[11px] text-gray-400 truncate shrink-0">{selectedOption.subLabel}</span>}
                    </div>
                  ) : (
                     <span className="text-[#9CA3AF] text-[13px] block">{placeholder}</span>
                  )}
               </div>

               {/* Right Actions */}
               <div className="absolute right-[12px] flex items-center gap-2">
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
                       className="p-1.5 hover:bg-surface rounded-full text-content-muted hover:text-content-primary transition-colors cursor-pointer"
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
                    className="cursor-pointer transition-colors"
                  >
                    <ChevronDown size={16} strokeWidth={1.5} className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
               </div>
          </div>
        </Popover.Trigger>

        {/* Dropdown Menu - Portal to avoid overflow/scroll issues */}
        <Popover.Portal>
            <Popover.Content
                className="z-[9999] w-[var(--radix-popover-trigger-width)] bg-surface-base border border-accent rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{ filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.15))' }}
                sideOffset={4}
                align="start"
            >
               <div onScroll={handleListScroll} className="max-h-[250px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                 {/* Initial full loading state */}
                 {isLoading && visibleOptions.length === 0 ? (
                   <div className="p-8 flex flex-col items-center justify-center gap-3 text-content-muted">
                     <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                     <span className="text-xs font-medium uppercase tracking-wider">Chargement...</span>
                   </div>
                 ) : visibleOptions.length > 0 ? (
                    <div className="py-1" role="listbox" ref={listRef}>
                      {visibleOptions.map((option, idx) => {
                        const isHighlighted = idx === highlightedIndex;
                        const isSelected = String(value) === String(option.value);
                        return (
                         <div
                           key={option.value}
                           ref={(el) => { if (el) optionRefs.current.set(idx, el); else optionRefs.current.delete(idx); }}
                           onClick={() => handleSelect(option)}
                           onMouseEnter={() => setHighlightedIndex(idx)}
                           role="option"
                           aria-selected={isSelected}
                           className={`
                             w-full px-4 py-2.5 flex items-center gap-3
                             cursor-pointer transition-colors border-l-2
                             ${option.disabled ? 'opacity-50 cursor-not-allowed bg-surface-base/50 border-transparent' : 'hover:bg-surface/80'}
                             ${isSelected
                               ? 'bg-accent/10 border-accent'
                               : isHighlighted
                                 ? 'bg-surface/60 border-accent/50'
                                 : 'border-transparent'
                             }
                           `}
                         >
                           {!option.hideAvatar && <OptionAvatar image={option.image} label={option.label} disabled={option.disabled} emoji={option.emoji} />}
                           <div className="flex-1 min-w-0">
                             <div className={`text-sm font-medium truncate flex items-center gap-2 ${option.disabled ? 'text-content-muted' : 'text-content-secondary'}`}>
                                 {option.label}
                                 {option.disabled && (
                                     <Badge value={option.disabledReason || "Indisponible"} variant="danger" className="text-[9px] py-0 px-1.5 h-4" />
                                 )}
                             </div>
                             {option.subLabel && <div className="text-xs text-content-muted truncate">{option.subLabel}</div>}
                           </div>
                           {isSelected && (
                             <Check size={14} className="text-accent" />
                           )}
                         </div>
                        );
                      })}

                      {/* Loading indicator at end of visible items */}
                      {hasMore && (
                        isLoadingMore ? (
                          <div className="py-3 flex justify-center">
                            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <>
                            <SkeletonItem />
                            <SkeletonItem />
                          </>
                        )
                      )}

                      {/* End of list message */}
                      {!hasMore && filteredOptions.length > PAGE_SIZE && (
                        <div className="py-2 text-center">
                          <span className="text-[10px] text-content-muted/60">Fin de liste</span>
                        </div>
                      )}
                    </div>
                 ) : (
                   <div className="p-6 text-center">
                      <p className="text-sm text-content-muted mb-1">Aucun résultat</p>
                      {searchQuery && <p className="text-xs text-content-muted">"{searchQuery}"</p>}
                   </div>
                 )}
                </div>

                {/* Footer Hint */}
                <div className="bg-surface-base/50 py-1.5 px-3 border-t border-surface text-[10px] text-content-muted flex justify-between items-center">
                    <span>{filteredOptions.length} résultat{filteredOptions.length !== 1 ? 's' : ''}</span>
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1 py-0.5 rounded bg-surface-elevated text-[9px] font-mono">↑↓</kbd>
                      <span>naviguer</span>
                      <kbd className="px-1 py-0.5 rounded bg-surface-elevated text-[9px] font-mono">↵</kbd>
                      <span>valider</span>
                    </span>
                </div>
            </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Errors */}
      {error && (
        <p className="absolute -bottom-5 left-0 text-[11px] text-[#EF4444] flex items-center gap-1 mt-1">
          <AlertCircle size={12} strokeWidth={2} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function Badge({ value, variant, className }: { value: string, variant?: string, className?: string }) {
    const colors = variant === 'danger' ? 'bg-status-danger-bg text-status-danger border-status-danger/20' : 'bg-surface-elevated text-content-secondary';
    return <span className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider ${colors} ${className}`}>{value}</span>
}
