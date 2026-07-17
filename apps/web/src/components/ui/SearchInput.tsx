import React, { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { IconButton } from './';

/**
 * SearchInput Component - MicroFlex Platform
 * Mobile-first search input with clear button
 *
 * @example
 * <SearchInput
 *   value={searchTerm}
 *   onChange={(e) => setSearchTerm(e.target.value)}
 *   placeholder="Rechercher un client..."
 *   onClear={() => setSearchTerm('')}
 * />
 */

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  containerClassName?: string;
  showClearButton?: boolean;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      placeholder = 'Rechercher...',
      containerClassName = '',
      className = '',
      disabled,
      showClearButton = true,
      children, // Explicitly destructure to exclude from props spread
      ...props
    },
    ref
  ) => {
    const hasValue = value && String(value).length > 0;

    const handleClear = () => {
      if (onClear) {
        onClear();
      }
    };

    return (
      <div className={`relative ${containerClassName}`}>
        <Search
          className="absolute left-[14px] top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          size={18}
          strokeWidth={1.5}
        />

        <input
          ref={ref}
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full h-[40px] pl-[38px] pr-${hasValue && showClearButton ? '12' : '[14px]'}
            bg-input-bg border border-input-border rounded-lg
            text-input-text text-[13px]
            placeholder:text-input-placeholder placeholder:font-normal
            transition-colors duration-200
            hover:border-content-muted
            focus:outline-none focus:ring-[3px] focus:border-accent focus:ring-accent/30
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />

        {hasValue && showClearButton && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <IconButton
              icon={X}
              variant="ghost"
              size="sm"
              onClick={handleClear}
              aria-label="Effacer la recherche"
            />
          </div>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
