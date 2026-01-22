import React, { useState, useMemo } from 'react';
import { Star, Calendar, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { DurationOption } from '../../../hooks/credits/useSmartDuration';
import { FREQUENCE_UNITE_MAP } from '@shared/config/credit-durations';
import { FrequenceRemboursement, DureeUnite, FREQUENCE_REMBOURSEMENT_LABELS } from '@shared/enum/status-constants';
import type { FrequenceRemboursementType, DureeUniteType } from '@shared/enum/status-constants';
import { useEffect } from 'react';

interface DurationSelectorProps {
  /** Array of smart duration options */
  options: DurationOption[];
  /** Currently selected duration value */
  selectedDuration: number;
  /** Currently selected unit */
  selectedUnit: string;
  /** Loan amount for installment calculation */
  amount: number;
  /** Interest rate for installment calculation */
  interestRate: number;
  /** Repayment frequency */
  frequence: string;
  /** Optional plan color for border styling */
  planColor?: string;
  /** Callback when a duration is selected */
  onSelect: (duration: number, unit: string) => void;
  /** Manual input value */
  manualValue: string;
  /** Callback for manual input change */
  onManualChange: (value: string) => void;
  /** Current unit for manual input */
  manualUnit: string;
  /** Callback for unit change */
  onUnitChange: (unit: string) => void;
  /** Validation error or warning */
  validationResult?: {
    type: 'error' | 'warning';
    message: string;
  } | null;
  /** Calculate installment function */
  calculateInstallment: (duration: number, amount: number, rate: number, frequence: string, durationUnit?: string) => number;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * DurationSelector Component
 * 
 * A rich UI component for selecting loan duration with:
 * - 3 pill-style suggestion buttons
 * - Star indicator for recommended option
 * - Instant monthly payment preview on hover/click
 * - Manual input with validation
 * - Error/Warning messages for guard rails
 */
export default function DurationSelector({
  options,
  selectedDuration,
  selectedUnit,
  amount,
  interestRate,
  frequence,
  planColor,
  onSelect,
  manualValue,
  onManualChange,
  manualUnit,
  onUnitChange,
  validationResult,
  calculateInstallment,
  isLoading = false,
}: DurationSelectorProps) {
  // Get available units for the current frequency
  // Use MONTHLY as fallback if frequency is not yet set or invalid
  const availableUnits = useMemo(() => {
    const freq = (frequence || FrequenceRemboursement.MONTHLY) as FrequenceRemboursementType;
    return FREQUENCE_UNITE_MAP[freq] || FREQUENCE_UNITE_MAP[FrequenceRemboursement.MONTHLY];
  }, [frequence]);

  // Auto-correct unit if the current one is not allowed for the new frequency
  useEffect(() => {
    if (manualUnit && !availableUnits.includes(manualUnit as DureeUniteType)) {
      // Default to the first allowed unit (usually the most common one)
      // For Hebdomadaire: 'Semaine', 'Mois', 'Jour' -> 'Semaine' fits well as first choice
      onUnitChange(availableUnits[0]);
    }
  }, [availableUnits, manualUnit, onUnitChange]);

  // Track hovered option for preview
  const [hoveredOption, setHoveredOption] = useState<DurationOption | null>(null);

  // Calculate installment for preview
  const previewInstallment = useMemo(() => {
    const durationToCalculate = hoveredOption?.value || selectedDuration;
    if (!durationToCalculate || amount <= 0) return null;
    
    const unitToUse = hoveredOption?.unit || selectedUnit;
    return calculateInstallment(durationToCalculate, amount, interestRate, frequence, unitToUse);
  }, [hoveredOption, selectedDuration, amount, interestRate, frequence, calculateInstallment]);

  // Format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('fr-FR') + ' FCFA';
  };

  // Get border color based on plan color or default
  const getBorderColor = (isSelected: boolean, isRecommended: boolean): string => {
    if (isSelected) {
      return planColor || 'border-blue-500 bg-blue-600';
    }
    if (isRecommended) {
      return 'border-emerald-500/50 bg-emerald-600/20';
    }
    return 'border-slate-600 bg-slate-700/50';
  };

  return (
    <div className="space-y-4">
      {/* Label */}
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <Calendar size={16} className="text-blue-400" />
        Durée du crédit *
      </label>

      {/* Manual Input Row */}
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="number"
            value={manualValue}
            onChange={(e) => onManualChange(e.target.value)}
            placeholder="Ex: 6"
            min={1}
            className={cn(
              'w-full bg-slate-700/50 border rounded-lg py-2.5 px-4 text-white',
              'placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
              validationResult?.type === 'error' 
                ? 'border-red-500 focus:ring-red-500' 
                : validationResult?.type === 'warning'
                  ? 'border-amber-500 focus:ring-amber-500'
                  : 'border-slate-600 focus:ring-blue-500'
            )}
          />
        </div>
        <select
          value={manualUnit}
          onChange={(e) => onUnitChange(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
        >
          {availableUnits.map(unit => (
            <option key={unit} value={unit}>
              {unit === DureeUnite.DAY ? 'Jours' : unit === DureeUnite.WEEK ? 'Semaines' : 'Mois'}
            </option>
          ))}
        </select>
      </div>

      {/* Validation Message */}
      {validationResult && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
            validationResult.type === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          )}
        >
          {validationResult.type === 'error' ? (
            <AlertCircle size={16} className="flex-shrink-0" />
          ) : (
            <AlertTriangle size={16} className="flex-shrink-0" />
          )}
          <span>{validationResult.message}</span>
        </div>
      )}

      {/* Suggested Durations Grid */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
          <RefreshCw size={14} className="animate-spin" />
          Chargement des suggestions...
        </div>
      ) : options.length > 0 ? (
        <div className="space-y-3">
          <span className="text-xs text-slate-500">Durées suggérées :</span>
          <div className="grid grid-cols-3 gap-3">
            {options.map((option) => {
              const isSelected = selectedDuration === option.value && selectedUnit === option.unit;
              
              return (
                <button
                  key={`${option.value}-${option.unit}`}
                  type="button"
                  onClick={() => onSelect(option.value, option.unit)}
                  onMouseEnter={() => setHoveredOption(option)}
                  onMouseLeave={() => setHoveredOption(null)}
                  className={cn(
                    'relative flex flex-col items-center justify-center',
                    'py-4 px-3 rounded-xl border-2 transition-all duration-200',
                    'hover:scale-[1.02] hover:shadow-lg',
                    getBorderColor(isSelected, option.isRecommended),
                    isSelected 
                      ? 'text-white shadow-lg scale-[1.02]' 
                      : option.isRecommended
                        ? 'text-emerald-300 hover:bg-emerald-600/30'
                        : 'text-slate-300 hover:bg-slate-600/50 hover:border-slate-500'
                  )}
                >
                  {/* Recommended badge */}
                  {option.isRecommended && (
                    <div className={cn(
                      'absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                      isSelected 
                        ? 'bg-amber-500 text-white' 
                        : 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
                    )}>
                      <Star size={10} fill="currentColor" />
                      Populaire
                    </div>
                  )}
                  
                  {/* Duration value */}
                  <span className={cn(
                    'text-2xl font-bold',
                    isSelected ? 'text-white' : option.isRecommended ? 'text-emerald-300' : 'text-slate-200'
                  )}>
                    {option.value}
                  </span>
                  
                  {/* Unit label */}
                  <span className={cn(
                    'text-sm mt-1',
                    isSelected ? 'text-blue-200' : 'text-slate-400'
                  )}>
                    {option.label.split(' ').slice(1).join(' ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Instant Installment Preview */}
      {amount > 0 && previewInstallment !== null && previewInstallment > 0 && (
        <div className={cn(
          'flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200',
          hoveredOption 
            ? 'bg-blue-500/20 border border-blue-500/30' 
            : 'bg-slate-700/30 border border-slate-600/50'
        )}>
          <span className="text-sm text-slate-400">
            {hoveredOption ? 'Aperçu' : 'Mensualité estimée'} :
          </span>
          <span className={cn(
            'text-lg font-bold',
            hoveredOption ? 'text-blue-400' : 'text-cyan-400'
          )}>
            ~{formatCurrency(previewInstallment)}
            <span className="text-xs text-slate-500 ml-1">/{frequence === 'Journalier' || frequence === 'DAILY' ? 'jour' : frequence === 'Hebdomadaire' || frequence === 'WEEKLY' ? 'sem' : 'mois'}</span>
          </span>
        </div>
      )}

      {/* Info text when no amount */}
      {(!amount || amount <= 0) && (
        <div className="text-sm text-slate-500 bg-slate-700/20 px-3 py-2 rounded-lg">
          💡 Saisissez un montant pour voir les mensualités estimées
        </div>
      )}
    </div>
  );
}
