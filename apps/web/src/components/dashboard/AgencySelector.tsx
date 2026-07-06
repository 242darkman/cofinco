
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
      <div className="flex items-center gap-2 px-3 py-2 bg-surface/50 rounded-lg border border-edge-subtle">
        <Building size={18} className="text-content-muted" />
        <span className="font-medium text-sm text-content-muted">
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
            ? 'bg-surface border-status-info/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            : 'bg-surface border-edge hover:bg-surface-elevated hover:border-edge-strong'}
        `}
      >
        <div className={`p-1 rounded-md ${isOpen ? 'bg-status-info-bg text-status-info' : 'bg-surface-elevated/50 text-status-info'}`}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Building size={16} />}
        </div>
        <span className="font-medium text-sm text-content-secondary">
          {loading ? t('chargementAgences') : (selectedAgence?.nom || t('toutesAgences'))}
        </span>
        <ChevronDown
          size={16}
          className={`text-content-muted transition-transform duration-300 ${isOpen ? 'rotate-180 text-status-info' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface-base border border-edge rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Header Section with Search */}
          <div className="px-3 py-2.5 bg-surface-base/30 border-b border-edge space-y-2">
            <h4 className="text-[10px] font-bold text-content-muted uppercase tracking-wider">
              {t('selectionnerAgence') || 'SÉLECTIONNER UNE AGENCE'}
            </h4>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setFocusedIndex(-1);
                }}
                placeholder={t('rechercherAgence')}
                className="w-full pl-8 pr-3 py-1.5 bg-input-bg border border-input-border rounded-lg text-xs text-content-secondary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
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
              <div className="flex items-center justify-center gap-2 py-6 text-content-muted text-xs">
                <Loader2 size={14} className="animate-spin" />
                {t('chargementAgences')}
              </div>
            ) : filteredAgences.length === 0 ? (
              <div className="py-6 text-center text-content-muted text-xs">
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
                      ${isActive ? 'bg-status-info-bg' : isFocused ? 'bg-surface' : 'hover:bg-surface'}
                      ${isFocused ? 'ring-1 ring-inset ring-status-info/30' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-full flex items-center justify-center transition-colors
                        ${isActive ? 'bg-status-info text-white' : 'bg-surface text-content-muted group-hover:bg-surface-elevated group-hover:text-content-secondary'}
                      `}>
                        <Building size={16} />
                      </div>
                      <span className={`text-sm font-medium ${isActive ? 'text-content-primary' : 'text-content-secondary group-hover:text-content-primary'}`}>
                        {ua.agence.nom}
                      </span>
                    </div>

                    {isActive && (
                      <Check size={16} className="text-status-info" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer / Status */}
          <div className="px-4 py-2 bg-surface-base/30 border-t border-edge flex justify-between items-center bg-dots-pattern">
              <span className="text-[10px] text-content-muted">
                {agences.filter(a => a.agence.id !== 'all').length} {t('agencesDisponibles') || 'agences disponibles'}
              </span>
          </div>
        </div>
      )}
    </div>
  );
}
