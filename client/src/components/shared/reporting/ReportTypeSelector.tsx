import React from 'react';
import { reportTypes } from '../../../hooks/useReportGenerator';
import { Card } from '../../ui';

interface ReportTypeSelectorProps {
  selectedType: string;
  onSelect: (typeId: string) => void;
}

export default function ReportTypeSelector({ selectedType, onSelect }: ReportTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {reportTypes.map((type) => {
        const IconComponent = type.icon;
        const isSelected = selectedType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            className={`group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 ${
              isSelected 
                ? 'bg-indigo-600/10 border-indigo-500/50 shadow-lg shadow-indigo-900/20' 
                : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Active Indicator Line */}
            {isSelected && (
              <div className="absolute inset-x-4 -bottom-px h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_-2px_8px_rgba(99,102,241,0.5)]" />
            )}

            <div className={`mb-2 p-2 rounded-lg transition-colors ${
              isSelected 
                ? 'bg-indigo-500 text-white shadow-inner' 
                : 'bg-slate-950 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-900 border border-slate-800'
            }`}>
              <IconComponent size={18} />
            </div>
            
            <div className="text-center">
              <h3 className={`text-xs font-bold transition-colors ${
                isSelected ? 'text-indigo-300' : 'text-slate-300 group-hover:text-white'
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
