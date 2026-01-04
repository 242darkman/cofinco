import React from 'react';
import { reportTypes } from '../../../hooks/useReportGenerator';
import { Card } from '../../ui';

interface ReportTypeSelectorProps {
  selectedType: string;
  onSelect: (typeId: string) => void;
}

export default function ReportTypeSelector({ selectedType, onSelect }: ReportTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {reportTypes.map((type) => {
        const IconComponent = type.icon;
        const isSelected = selectedType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
              isSelected 
                ? 'bg-primary/10 border-primary ring-1 ring-primary/50' 
                : 'bg-surface-base border-edge hover:bg-surface-muted hover:border-primary/30'
            }`}
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-2 transition-colors ${
              isSelected 
                ? 'bg-primary text-white shadow-md shadow-primary/30' 
                : 'bg-surface-muted text-primary'
            }`}>
              <IconComponent size={18} />
            </div>
            <h3 className="font-semibold text-sm text-content-primary truncate">{type.label}</h3>
            <p className="text-[10px] sm:text-xs text-content-muted line-clamp-2 mt-0.5">{type.description}</p>
          </button>
        );
      })}
    </div>
  );
}
