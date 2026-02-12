import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LucideIcon, Lock, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * TabGroup Component - COFIN Platform
 * Mobile-first tab navigation with pills or underline style
 * Hidden scrollbar with gradient fade + arrow indicators
 */

export type TabVariant = 'pills' | 'underline' | 'buttons';
export type TabSize = 'xs' | 'sm' | 'md' | 'lg';

export interface Tab {
  key: string;
  label: string;
  icon?: LucideIcon;
  badge?: number | string;
  badgeClassName?: string;
  disabled?: boolean;
}

export interface TabGroupProps {
  activeTab: string;
  onTabChange: (key: string) => void;
  tabs: Tab[];
  variant?: TabVariant;
  size?: TabSize;
  className?: string;
  fullWidth?: boolean;
  scrollable?: boolean;
}

const TabGroup: React.FC<TabGroupProps> = ({
  activeTab,
  onTabChange,
  tabs,
  variant = 'pills',
  size = 'md',
  className = '',
  fullWidth = false,
  scrollable = true,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    if (!scrollable) return;
    const el = scrollRef.current;
    if (!el) return;

    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });

    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, [scrollable, checkOverflow, tabs.length]);

  // Scroll active tab into view on mount / tab change
  useEffect(() => {
    if (!scrollable || !scrollRef.current) return;
    const el = scrollRef.current;
    const activeBtn = el.querySelector('[aria-current="page"]') as HTMLElement | null;
    if (activeBtn) {
      const elRect = el.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (btnRect.left < elRect.left || btnRect.right > elRect.right) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab, scrollable]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  // Size classes (mobile-first)
  const sizeClasses = {
    xs: {
      text: 'text-[10px] sm:text-xs',
      padding: 'px-2 py-1',
      icon: 12,
      gap: 'gap-1',
    },
    sm: {
      text: 'text-xs',
      padding: 'px-3 py-1.5',
      icon: 14,
      gap: 'gap-1.5',
    },
    md: {
      text: 'text-xs sm:text-sm',
      padding: 'px-3 py-2',
      icon: 16,
      gap: 'gap-1.5 sm:gap-2',
    },
    lg: {
      text: 'text-sm sm:text-base',
      padding: 'px-4 py-2.5',
      icon: 18,
      gap: 'gap-2',
    },
  };

  const sizeConfig = sizeClasses[size];

  // Variant styles — scrollbar-hide hides native scrollbar, touch scroll still works
  const scrollClass = scrollable ? 'flex flex-nowrap overflow-x-auto scrollbar-hide' : 'flex flex-wrap';

  const variantStyles = {
    pills: {
      container: `${scrollClass} gap-1`,
      tab: `
        ${sizeConfig.padding} ${sizeConfig.text}
        font-medium rounded-lg transition-all duration-200
        flex items-center ${sizeConfig.gap} whitespace-nowrap
        ${fullWidth ? 'flex-1 justify-center' : 'shrink-0'}
      `,
      active: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
      inactive: 'text-slate-400 hover:bg-slate-700 hover:text-white',
      disabled: 'opacity-50 cursor-not-allowed',
    },
    underline: {
      container: `${scrollClass} border-b border-slate-700`,
      tab: `
        ${sizeConfig.padding} ${sizeConfig.text}
        font-medium transition-all duration-200
        flex items-center ${sizeConfig.gap} whitespace-nowrap
        border-b-2 -mb-px
        ${fullWidth ? 'flex-1 justify-center' : 'shrink-0'}
      `,
      active: 'border-cyan-500 text-cyan-400',
      inactive: 'border-transparent text-slate-400 hover:text-white hover:border-slate-600',
      disabled: 'opacity-50 cursor-not-allowed',
    },
    buttons: {
      container: `${scrollClass} gap-1`,
      tab: `
        ${sizeConfig.padding} ${sizeConfig.text}
        font-semibold rounded-lg transition-all duration-200
        flex items-center ${sizeConfig.gap} whitespace-nowrap
        border
        ${fullWidth ? 'flex-1 justify-center' : 'shrink-0'}
      `,
      active: 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/50',
      inactive: 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600',
      disabled: 'opacity-50 cursor-not-allowed',
    },
  };

  const styles = variantStyles[variant];
  const showArrows = scrollable && (canScrollLeft || canScrollRight);

  return (
    <div className={`relative ${className}`}>
      {/* Left fade + arrow */}
      {showArrows && canScrollLeft && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#020617] to-transparent z-10 pointer-events-none" />
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all shadow-lg"
            aria-label="Défiler à gauche"
          >
            <ChevronLeft size={14} />
          </button>
        </>
      )}

      {/* Scrollable tabs container */}
      <div ref={scrollRef} className={styles.container}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;

          const defaultBadgeStyle = isActive
               ? 'bg-white text-emerald-600 font-bold'
               : 'bg-slate-600 text-slate-300';

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => !tab.disabled && onTabChange(tab.key)}
              disabled={tab.disabled}
              className={`
                ${styles.tab}
                ${isActive ? styles.active : styles.inactive}
                ${tab.disabled ? styles.disabled : ''}
              `}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={tab.disabled}
            >
              {Icon && <Icon size={sizeConfig.icon} />}
              <span>{tab.label}</span>
              {tab.disabled && <Lock size={12} className="ml-1 opacity-50" />}
              {tab.badge !== undefined && valOrZero(tab.badge) && (
                <span
                  className={`
                    px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-1
                    ${tab.badgeClassName || defaultBadgeStyle}
                  `}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right fade + arrow */}
      {showArrows && canScrollRight && (
        <>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#020617] to-transparent z-10 pointer-events-none" />
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all shadow-lg"
            aria-label="Défiler à droite"
          >
            <ChevronRight size={14} />
          </button>
        </>
      )}
    </div>
  );
};

function valOrZero(v: string | number) {
    if (typeof v === 'number') return v > 0;
    return !!v;
}

export default TabGroup;
