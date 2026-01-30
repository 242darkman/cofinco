/**
 * Map View Toggle Component
 * Switch between list and map views
 */

import React from 'react';
import { List, Map, Grid } from 'lucide-react';

export type ViewMode = 'list' | 'map' | 'grid';

export interface MapViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  showGrid?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function MapViewToggle({
  viewMode,
  onChange,
  showGrid = false,
  disabled = false,
  className = '',
}: MapViewToggleProps) {
  const options: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'list', icon: <List size={18} />, label: 'Liste' },
    { mode: 'map', icon: <Map size={18} />, label: 'Carte' },
  ];

  if (showGrid) {
    options.push({ mode: 'grid', icon: <Grid size={18} />, label: 'Grille' });
  }

  return (
    <div className={`flex items-center bg-slate-700/50 rounded-lg p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.mode}
          onClick={() => !disabled && onChange(option.mode)}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition disabled:opacity-50 ${
            viewMode === option.mode
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-300 hover:text-white hover:bg-slate-600/50'
          }`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
