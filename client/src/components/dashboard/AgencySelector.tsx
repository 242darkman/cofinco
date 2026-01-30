
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Building, ChevronDown, Check, Search, Loader2 } from 'lucide-react';
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
  loading?: boolean;
}

export default function AgencySelector({
  agences,
  selectedAgence,
  onSelect,
  isAdmin = false,
  loading = false
}: AgencySelectorProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filtered agences based on search
  const filteredAgences = useMemo(() => {
    if (!searchQuery.trim()) return agences;
    const query = searchQuery.toLowerCase();
    return agences.filter(ua => ua.agence.nom.toLowerCase().includes(query));
  }, [agences, searchQuery]);

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

  // Auto-focus search and reset state on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFocusedIndex(-1);
      // Small delay to allow animation
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < filteredAgences.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredAgences.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredAgences.length) {
          onSelect(filteredAgences[focusedIndex].agence.id);
          setIsOpen(false);
        }
        break;
    }
  }, [isOpen, focusedIndex, filteredAgences, onSelect]);

  // If not admin, just show the read-only badge
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
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200
          ${isOpen
            ? 'bg-slate-800 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'}
        `}
      >
        <div className={`p-1 rounded-md ${isOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-blue-400'}`}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Building size={16} />}
        </div>
        <span className="font-medium text-sm text-slate-200">
          {loading ? t('chargementAgences') : (selectedAgence?.nom || t('toutesAgences'))}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-400' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Header Section with Search */}
          <div className="px-3 py-2.5 bg-slate-950/30 border-b border-slate-800 space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('selectionnerAgence') || 'SÉLECTIONNER UNE AGENCE'}
            </h4>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setFocusedIndex(-1);
                }}
                placeholder={t('rechercherAgence')}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
                aria-label={t('rechercherAgence')}
              />
            </div>
          </div>

          {/* List */}
          <div
            ref={listRef}
            role="listbox"
            aria-activedescendant={focusedIndex >= 0 ? `agency-option-${focusedIndex}` : undefined}
            className="max-h-80 overflow-y-auto py-1"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-xs">
                <Loader2 size={14} className="animate-spin" />
                {t('chargementAgences')}
              </div>
            ) : filteredAgences.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">
                {t('aucuneAgenceTrouvee')}
              </div>
            ) : (
              filteredAgences.map((ua, index) => {
                const isActive = selectedAgence?.id === ua.agence.id;
                const isFocused = focusedIndex === index;
                return (
                  <button
                    key={ua.agence.id}
                    id={`agency-option-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onSelect(ua.agence.id);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`
                      w-full px-4 py-3 text-left transition-colors flex items-center justify-between group
                      ${isActive ? 'bg-blue-500/10' : isFocused ? 'bg-slate-800' : 'hover:bg-slate-800'}
                      ${isFocused ? 'ring-1 ring-inset ring-blue-500/30' : ''}
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
              })
            )}
          </div>

          {/* Footer / Status */}
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
