
import React, { useState, useRef, useEffect } from 'react';
import { Building, ChevronDown, Check } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export interface Agency {
  id: string;
  nom: string;
}

interface AgencySelectorProps {
  agences: Array<{ agence: Agency }>;
  selectedAgence?: Agency | null;
  onSelect: (agenceId: string) => void;
  isAdmin?: boolean;
}

export default function AgencySelector({ 
  agences, 
  selectedAgence, 
  onSelect,
  isAdmin = false
}: AgencySelectorProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // If not admin, just show the read-only badge (as per previous logic/requirements, though the prompt focused on the dropdown)
  // The user prompt specifically asked for the "dropdown" logic. 
  // We keep the read-only view for non-admins as implemented previously in Dashboard.
  if (!isAdmin) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
        <Building size={18} className="text-slate-400" />
        <span className="font-medium text-sm text-slate-400">
          {selectedAgence?.nom || t('agencePrincipale')}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200
          ${isOpen 
            ? 'bg-slate-800 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
            : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'}
        `}
      >
        <div className={`p-1 rounded-md ${isOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-blue-400'}`}>
           <Building size={16} />
        </div>
        <span className="font-medium text-sm text-slate-200">
          {selectedAgence?.nom || t('toutesAgences')}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-400' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Header Section */}
          <div className="px-4 py-3 bg-slate-950/30 border-b border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('selectionnerAgence') || 'SÉLECTIONNER UNE AGENCE'}
            </h4>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto py-1">
            {agences.map((ua) => {
              const isActive = selectedAgence?.id === ua.agence.id;
              return (
                <button
                  key={ua.agence.id}
                  onClick={() => {
                    onSelect(ua.agence.id);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full px-4 py-3 text-left transition-colors flex items-center justify-between group
                    ${isActive ? 'bg-blue-500/10' : 'hover:bg-slate-800'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      p-2 rounded-full flex items-center justify-center transition-colors
                      ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300'}
                    `}>
                      <Building size={16} />
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                      {ua.agence.nom}
                    </span>
                  </div>
                  
                  {isActive && (
                    <Check size={16} className="text-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Footer / Status (Optional polish) */}
          <div className="px-4 py-2 bg-slate-950/30 border-t border-slate-800 flex justify-between items-center bg-dots-pattern">
              <span className="text-[10px] text-slate-600">
                {agences.filter(a => a.agence.id !== 'all').length} {t('agencesDisponibles') || 'agences disponibles'}
              </span>
          </div>
        </div>
      )}
    </div>
  );
}
