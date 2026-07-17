import React from 'react';
import { reportTypes } from '../../../hooks/useReportGenerator';
import { Card } from '../../ui';

interface ReportTypeSelectorProps {
  selectedType: string;
  onSelect: (typeId: string) => void;
  filter?: string[];
}

export default function ReportTypeSelector({ selectedType, onSelect, filter }: ReportTypeSelectorProps) {
  const filteredTypes = filter ? reportTypes.filter(t => filter.includes(t.id)) : reportTypes;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {filteredTypes.map((type) => {
        const IconComponent = type.icon;
        const isSelected = selectedType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            className={`group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 ${
              isSelected 
                ? 'bg-accent/10 border-accent/50 shadow-lg shadow-accent/20' 
                : 'bg-surface-base/50 border-edge hover:bg-surface hover:border-edge'
            }`}
          >
            {/* Active Indicator Line */}
            {isSelected && (
              <div className="absolute inset-x-4 -bottom-px h-0.5 bg-linear-to-r from-transparent via-indigo-500 to-transparent shadow-[0_-2px_8px_rgba(99,102,241,0.5)]" />
            )}

            <div className={`mb-2 p-2 rounded-lg transition-colors ${
              isSelected 
                ? 'bg-accent text-white shadow-inner'
                : 'bg-surface-base text-content-muted group-hover:text-content-secondary group-hover:bg-surface-base border border-edge'
            }`}>
              <IconComponent size={18} />
            </div>
            
            <div className="text-center">
              <h3 className={`text-xs font-bold transition-colors ${
                isSelected ? 'text-accent' : 'text-content-secondary group-hover:text-content-primary'
              }`}>
                {type.label}
              </h3>
            </div>
          </button>
        );
      })}
    </div>
  );
}
