import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { mode, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const themeOptions = [
    { value: 'light' as const, label: 'Clair', icon: Sun },
    { value: 'dark' as const, label: 'Sombre', icon: Moon },
    { value: 'system' as const, label: 'Systeme', icon: Monitor },
  ];

  const currentOption = themeOptions.find(opt => opt.value === mode) || themeOptions[1];
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative flex items-center justify-center p-2.5 rounded-xl transition-all duration-300
          ${isOpen
            ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
            : 'hover:bg-surface/80 text-content-muted hover:text-content-primary'
          }
        `}
        aria-label="Changer le theme"
        aria-expanded={isOpen}
      >
        <CurrentIcon size={20} className="transition-transform duration-300 active:scale-90" />
      </button>
      {isOpen && (
        <div
            className="absolute left-0 top-full mt-2 z-[9999] w-max min-w-[200px] max-w-[90vw] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="bg-surface-base/95 backdrop-blur-xl border border-edge rounded-2xl p-2 shadow-theme-lg ring-1 ring-edge-subtle">
            <div className="text-[10px] font-bold text-content-muted uppercase tracking-wider px-3 py-1.5 mb-1">
                Apparence
            </div>
            <div className="flex flex-col gap-1">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const isSelected = mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      setTheme(value);
                      setIsOpen(false);
                    }}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                      ${isSelected
                        ? 'bg-accent-primary shadow-lg shadow-accent/20 text-white'
                        : 'text-content-muted hover:text-content-primary hover:bg-surface'
                      }
                    `}
                  >
                    <Icon size={18} className={isSelected ? 'text-white' : 'text-content-muted'} />
                    <span className="flex-1 text-left">{label}</span>
                    {isSelected && <Check size={16} className="text-white animate-in zoom-in spin-in-90 duration-300" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
