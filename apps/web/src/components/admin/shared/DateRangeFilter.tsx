/**
 * Reusable Date Range Filter Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';

export interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  presets?: DatePreset[];
  className?: string;
  placeholder?: string;
}

export interface DatePreset {
  label: string;
  getValue: () => { start: string; end: string };
}

const DEFAULT_PRESETS: DatePreset[] = [
  {
    label: "Aujourd'hui",
    getValue: () => {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    },
  },
  {
    label: '7 derniers jours',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: '30 derniers jours',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Ce mois',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Mois dernier',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Cette année',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        start: start.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
      };
    },
  },
];

export default function DateRangeFilter({
  startDate,
  endDate,
  onChange,
  presets = DEFAULT_PRESETS,
  className = '',
  placeholder = 'Sélectionner une période',
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    onChange(localStart, localEnd);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalStart('');
    setLocalEnd('');
    onChange('', '');
    setIsOpen(false);
  };

  const handlePresetClick = (preset: DatePreset) => {
    const { start, end } = preset.getValue();
    setLocalStart(start);
    setLocalEnd(end);
    onChange(start, end);
    setIsOpen(false);
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const displayValue = () => {
    if (startDate && endDate) {
      if (startDate === endDate) {
        return formatDisplayDate(startDate);
      }
      return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
    }
    if (startDate) {
      return `À partir du ${formatDisplayDate(startDate)}`;
    }
    if (endDate) {
      return `Jusqu'au ${formatDisplayDate(endDate)}`;
    }
    return placeholder;
  };

  const hasValue = startDate || endDate;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition text-sm min-w-[200px] ${
          hasValue
            ? 'bg-accent/10 border-accent/50 text-content-primary'
            : 'bg-surface-elevated border-edge-strong text-content-secondary hover:border-edge-strong'
        }`}
      >
        <Calendar size={16} className={hasValue ? 'text-accent' : 'text-content-muted'} />
        <span className="flex-1 text-left truncate">{displayValue()}</span>
        {hasValue ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="p-0.5 hover:bg-surface-subtle rounded"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-surface rounded-xl border border-edge shadow-xl z-50 overflow-hidden">
          {/* Presets */}
          <div className="p-3 border-b border-edge">
            <p className="text-xs text-content-muted mb-2 font-medium">Raccourcis</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className="px-3 py-1.5 text-xs bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Range */}
          <div className="p-3 space-y-3">
            <p className="text-xs text-content-muted font-medium">Période personnalisée</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-content-muted mb-1">Date début</label>
                <input
                  type="date"
                  value={localStart}
                  onChange={(e) => setLocalStart(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-content-muted mb-1">Date fin</label>
                <input
                  type="date"
                  value={localEnd}
                  onChange={(e) => setLocalEnd(e.target.value)}
                  min={localStart || undefined}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-sm text-content-muted hover:text-content-primary transition"
              >
                Effacer
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg text-sm transition"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
