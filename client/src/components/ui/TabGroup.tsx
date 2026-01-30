import React from 'react';
import { LucideIcon, Lock } from 'lucide-react';

/**
 * TabGroup Component - COFIN Platform
 * Mobile-first tab navigation with pills or underline style
 *
 * @example
 * <TabGroup
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   tabs={[
 *     { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
 *     { key: 'demandes', label: 'Demandes', icon: FileText, badge: 5 },
 *   ]}
 *   variant="pills"
 * />
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

  // Variant styles
  const variantStyles = {
    pills: {
      container: scrollable
        ? 'flex flex-nowrap gap-2 overflow-x-auto scrollbar-thin'
        : 'flex flex-wrap gap-2',
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
      container: scrollable
        ? 'flex flex-nowrap border-b border-slate-700 overflow-x-auto scrollbar-thin'
        : 'flex flex-wrap border-b border-slate-700',
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
      container: scrollable
        ? 'flex flex-nowrap gap-2 overflow-x-auto scrollbar-thin'
        : 'flex flex-wrap gap-2',
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

  return (
    <div className={`${styles.container} ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;

        // Custom default style if no class provided - high contrast for active state
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
  );
};

function valOrZero(v: string | number) {
    if (typeof v === 'number') return v > 0;
    return !!v;
}

export default TabGroup;
