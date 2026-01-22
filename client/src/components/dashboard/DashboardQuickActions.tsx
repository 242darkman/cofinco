import React, { useState, useRef, useEffect } from 'react';
import { Building2, Plus, DollarSign, Banknote, FileText, ChevronDown, Check, MapPin } from 'lucide-react';
import { Button } from '../ui';
import { useAgence } from '../../contexts/AgenceContext';
import { TypeAgence } from '@shared/enum/status-constants';

export interface DashboardQuickActionsProps {
  onModuleChange?: (module: string) => void;
  onQuickAction?: (action: string) => void;
  t: (key: string) => string;
}

export default function DashboardQuickActions({ onModuleChange, onQuickAction, t }: DashboardQuickActionsProps) {
  const { agences, selectedAgence, selectAgence, hasMultipleAgences, loading } = useAgence();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown en cliquant à l'extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAgenceSelect = (agenceId: string) => {
    selectAgence(agenceId);
    setShowDropdown(false);
  };

  return (
    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
      {/* Agency Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full xl:w-auto">
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="secondary"
            size="md"
            icon={Building2}
            iconPosition="left"
            className="justify-between w-full sm:w-auto min-w-[200px]"
            data-testid="button-select-agency"
            onClick={() => hasMultipleAgences && setShowDropdown(!showDropdown)}
            disabled={loading}
          >
            <span className="truncate max-w-[180px]">
              {loading ? 'Chargement...' : selectedAgence?.nom || t('agenceCentrale') || 'Agence Centrale'}
            </span>
            {hasMultipleAgences && (
              <ChevronDown
                className={`w-4 h-4 text-slate-400 ml-2 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
              />
            )}
          </Button>

          {/* Dropdown des agences */}
          {showDropdown && hasMultipleAgences && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="max-h-64 overflow-y-auto">
                {agences.map((ua) => (
                  <button
                    key={ua.agence.id}
                    onClick={() => handleAgenceSelect(ua.agence.id)}
                    className={`
                      w-full px-4 py-3 flex items-center gap-3 text-left transition-colors
                      ${selectedAgence?.id === ua.agence.id
                        ? 'bg-blue-500/20 text-white'
                        : 'hover:bg-slate-700/50 text-slate-300'
                      }
                    `}
                  >
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${ua.agence.typeAgence === TypeAgence.MAIN
                        ? 'bg-amber-500/20 text-amber-400'
                        : ua.agence.typeAgence === TypeAgence.KIOSK
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }
                    `}>
                      <Building2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{ua.agence.nom}</span>
                        {ua.isPrimary && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                            Principal
                          </span>
                        )}
                      </div>
                      {ua.agence.ville && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={10} />
                          <span>{ua.agence.ville}</span>
                        </div>
                      )}
                    </div>
                    {selectedAgence?.id === ua.agence.id && (
                      <Check size={16} className="text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto xl:justify-end">
        <Button
          variant="primary"
          size="md"
          icon={Plus}
          iconPosition="left"
          onClick={() => onQuickAction?.('new-client')}
          data-testid="button-quick-new-client"
          className="shadow-lg shadow-blue-500/20 h-11 whitespace-nowrap px-2"
        >
          <span className="text-xs sm:text-sm font-medium truncate">{t('nouveauClient') || 'Nouveau Client'}</span>
        </Button>

        <Button
          variant="primary"
          size="md"
          icon={DollarSign}
          iconPosition="left"
          onClick={() => onQuickAction?.('new-credit')}
          data-testid="button-quick-credit"
          className="shadow-lg shadow-blue-500/20 h-11"
        >
          <span className="text-sm font-medium">{t('credit') || 'Crédit'}</span>
        </Button>

        <Button
          variant="primary"
          size="md"
          icon={Banknote}
          iconPosition="left"
          onClick={() => onQuickAction?.('new-payment')}
          data-testid="button-quick-payment"
          className="shadow-lg shadow-blue-500/20 h-11"
        >
          <span className="text-sm font-medium">{t('paiement') || 'Paiement'}</span>
        </Button>

        <Button
          variant="primary"
          size="md"
          icon={FileText}
          iconPosition="left"
          onClick={() => onQuickAction?.('new-report')}
          data-testid="button-quick-report"
          className="shadow-lg shadow-blue-500/20 h-11"
        >
          <span className="text-sm font-medium">{t('rapport') || 'Rapport'}</span>
        </Button>
      </div>
    </div>
  );
}
