import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * ThemeToggle Component - COFIN Platform
 * Mobile-first, sleek, glassmorphic theme switcher
 */

export interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { mode, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const themeOptions = [
    { value: 'light' as const, label: 'Clair', icon: Sun, disabled: true },
    { value: 'dark' as const, label: 'Sombre', icon: Moon },
    { value: 'system' as const, label: 'Système', icon: Monitor, disabled: true },
  ];

  const currentOption = themeOptions.find(opt => opt.value === mode) || themeOptions[1];
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    // Force dark mode if user is currently on a disabled theme
    if (mode === 'light' || mode === 'system') {
        setTheme('dark');
    }
  }, [mode, setTheme]);

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

  // Determine alignment based on screen position (simplistic approach or default to left as requested)
  // For this strict requirement, we'll default to left-0 but ensure it doesn't overflow
  
  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative flex items-center justify-center p-2.5 rounded-xl transition-all duration-300
          ${isOpen 
            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' 
            : 'hover:bg-slate-800/80 text-slate-400 hover:text-white'
          }
        `}
        aria-label="Changer le thème"
        aria-expanded={isOpen}
      >
        <CurrentIcon size={20} className="transition-transform duration-300 active:scale-90" />
      </button>

      {isOpen && (
        <div 
            className="absolute left-0 top-full mt-2 z-[100] w-max min-w-[200px] max-w-[90vw] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-2 shadow-2xl ring-1 ring-white/10">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-1.5 mb-1">
                Apparence
            </div>
            <div className="flex flex-col gap-1">
              {themeOptions.map(({ value, label, icon: Icon, disabled }) => {
                const isSelected = mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      if (!disabled) {
                          setTheme(value);
                          setIsOpen(false);
                      }
                    }}
                    disabled={disabled}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                      ${isSelected 
                        ? 'bg-blue-600 shadow-lg shadow-blue-500/20 text-white' 
                        : disabled
                            ? 'text-slate-600 cursor-not-allowed opacity-50'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }
                    `}
                  >
                    <Icon size={18} className={isSelected ? 'text-white' : 'text-slate-500'} />
                    <span className="flex-1 text-left">{label}</span>
                    {disabled && <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">WIP</span>}
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
