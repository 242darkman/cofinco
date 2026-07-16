import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * FilterBar Componen
 * Responsive filter bar with unified height and layout.
 *
 * Desktop (≥1024px): single horizontal row
 * Tablet/POS (600–1024px): 2–3 columns grid
 * Mobile (<600px): vertical stack, full-width items
 *
 * If more than `maxVisible` children, extras are hidden behind
 * an "Advanced Filters" toggle on small screens.
 *
 * @example
 * <FilterBar>
 *   <SearchInput ... />
 *   <SelectField ... />
 *   <Button variant="primary">Nouveau</Button>
 * </FilterBar>
 */

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  /** Max visible filters before collapsing into "advanced" on mobile/tablet (default: 4) */
  maxVisible?: number;
}

export default function FilterBar({ children, className = '', maxVisible = 4 }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const childArray = React.Children.toArray(children).filter(Boolean);
  const needsCollapse = childArray.length > maxVisible;

  // On desktop we show all; on smaller screens we split
  const visibleChildren = needsCollapse ? childArray.slice(0, maxVisible) : childArray;
  const advancedChildren = needsCollapse ? childArray.slice(maxVisible) : [];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main filter row */}
      <div
        className={`
          flex flex-col gap-3
          sm:grid sm:grid-cols-2 sm:gap-3
          lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-3
          [&>*]:min-w-0
        `}
      >
        {visibleChildren.map((child, i) => (
          <div
            key={i}
            className="filter-bar-item [&_input]:h-[44px] [&_select]:h-[44px] [&_button]:h-[44px] lg:[&_input]:h-[40px] lg:[&_select]:h-[40px] lg:[&_button]:h-[40px]"
          >
            {child}
          </div>
        ))}

        {/* Advanced filters toggle button (only on small screens) */}
        {needsCollapse && (
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`
                flex items-center justify-center gap-2
                h-[44px] lg:h-[40px] px-4 w-full
                text-[13px] font-medium rounded-lg border
                transition-colors duration-200
                ${showAdvanced
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-white border-[#E5E7EB] text-gray-600 hover:border-gray-400'
                }
              `}
            >
              {showAdvanced ? <X size={16} strokeWidth={1.5} /> : <SlidersHorizontal size={16} strokeWidth={1.5} />}
              {showAdvanced ? 'Masquer les filtres' : `Filtres avancés (${advancedChildren.length})`}
            </button>
          </div>
        )}
      </div>

      {/* Advanced filters row (collapsed on small screens, always visible on desktop) */}
      {advancedChildren.length > 0 && (
        <div
          className={`
            ${showAdvanced ? 'flex' : 'hidden'} lg:flex
            flex-col gap-3
            sm:grid sm:grid-cols-2 sm:gap-3
            lg:flex-row lg:flex-wrap lg:items-center lg:gap-3
            [&>*]:min-w-0
          `}
        >
          {advancedChildren.map((child, i) => (
            <div
              key={i}
              className="filter-bar-item [&_input]:h-[44px] [&_select]:h-[44px] [&_button]:h-[44px] lg:[&_input]:h-[40px] lg:[&_select]:h-[40px] lg:[&_button]:h-[40px]"
            >
              {child}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
