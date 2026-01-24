import { useMemo, useCallback } from 'react';
import {
  calculerNombreEcheances,
  validerCoherenceFrequenceDuree,
  type FrequenceRemboursement,
  type DureeUnite
} from '@shared/config/credit-durations';
import {
  normalizeDureeUnite,
  normalizeFrequenceRemboursement
} from '@shared/enum/status-constants';

// Wrappers pour compatibilité avec le code existant
const normalizeUnit = (unit: string): string => normalizeDureeUnite(unit);
const normalizeFrequence = (freq: string): string => normalizeFrequenceRemboursement(freq);

/**
 * Interface for a credit plan with duration constraints
 */
interface CreditPlan {
  id?: string;
  nom?: string;
  dureeValeur?: number;
  duree_valeur?: number;
  dureeUnite?: string;
  duree_unite?: string;
  montantMin?: number;
  montant_min?: number;
  montantMax?: number;
  montant_max?: number;
  tauxInteret?: number;
  taux_interet?: number;
}

/**
 * Interface for a duration option
 * Note: unit uses EN values (DAY, WEEK, MONTH) for consistency with shared config
 */
export interface DurationOption {
  value: number;
  unit: 'MONTH' | 'DAY' | 'WEEK';
  label: string;
  isRecommended: boolean;
}

/**
 * Hook inputs
 */
interface UseSmartDurationProps {
  selectedPlan: CreditPlan | null | undefined;
  amount: number;
  frequence?: string;
}

/**
 * Hook return type
 */
interface UseSmartDurationReturn {
  suggestedDurations: DurationOption[];
  calculateInstallment: (duration: number, amount: number, rate: number, frequence: string, durationUnit?: string) => number;
  validateDuration: (duration: number, unit: string) => ValidationResult | null;
}

interface ValidationResult {
  type: 'error' | 'warning';
  message: string;
}

/**
 * Helper to generate a label for a duration
 */
const generateLabel = (value: number, unit: string): string => {
  const normalizedUnit = normalizeUnit(unit);
  const unitLabels: Record<string, string> = {
    'MONTH': 'mois',
    'DAY': value === 1 ? 'jour' : 'jours',
    'WEEK': value === 1 ? 'semaine' : 'semaines',
  };
  return `${value} ${unitLabels[normalizedUnit] || normalizedUnit}`;
};

/**
 * Smart Duration Hook
 * 
 * Generates intelligent duration suggestions based on:
 * 1. Selected credit plan constraints (if active)
 * 2. Loan amount (financial logic when no plan)
 */
export function useSmartDuration({
  selectedPlan,
  amount,
  frequence = 'MONTHLY',
}: UseSmartDurationProps): UseSmartDurationReturn {
  
  /**
   * Generate suggested durations based on plan or amount
   */
  const suggestedDurations = useMemo<DurationOption[]>(() => {
    // Get plan duration values (normalized for snake_case vs camelCase)
    const planDuration = selectedPlan?.dureeValeur || selectedPlan?.duree_valeur;
    const rawPlanUnit = selectedPlan?.dureeUnite || selectedPlan?.duree_unite;
    // Normalize the unit to EN values
    const planUnit = rawPlanUnit ? normalizeUnit(rawPlanUnit) as 'MONTH' | 'DAY' | 'WEEK' : undefined;

    // CASE 1: Plan is active - generate options based on plan constraints
    if (selectedPlan && planDuration && planUnit) {
      // The default duration is the plan's standard duration
      const defaultDuration = planDuration;

      // Calculate min and max based on plan duration (±50% range)
      const minDuration = Math.max(1, Math.floor(defaultDuration * 0.5));
      const maxDuration = Math.ceil(defaultDuration * 1.5);

      // If min/max are the same (or very close), expand the range
      const durations = new Set([minDuration, defaultDuration, maxDuration]);

      // Convert to sorted array and take 3 options
      const sortedDurations = Array.from(durations).sort((a, b) => a - b).slice(0, 3);

      // If we have less than 3 unique values, add intermediate values
      while (sortedDurations.length < 3 && sortedDurations.length > 0) {
        const lastValue = sortedDurations[sortedDurations.length - 1];
        sortedDurations.push(lastValue + Math.ceil(defaultDuration * 0.25));
      }

      return sortedDurations.map(value => ({
        value,
        unit: planUnit,
        label: generateLabel(value, planUnit),
        isRecommended: value === defaultDuration,
      }));
    }

    // CASE 2: No plan - generate based on amount (financial logic)
    const unit: 'MONTH' = 'MONTH'; // Default to months for amount-based

    let durations: number[];

    if (!amount || amount < 100000) {
      // Small loans: short durations
      durations = [1, 2, 3];
    } else if (amount < 500000) {
      // Medium loans: medium durations
      durations = [3, 4, 6];
    } else {
      // Large loans: longer durations
      durations = [6, 12, 18];
    }

    // Middle option is recommended
    const middleIndex = Math.floor(durations.length / 2);

    return durations.map((value, index) => ({
      value,
      unit,
      label: generateLabel(value, unit),
      isRecommended: index === middleIndex,
    }));
  }, [selectedPlan, amount]);
  
  /**
   * Calculate monthly installment estimate
   * Simple calculation: (principal + interest) / number of payments
   */
  const calculateInstallment = useCallback(
    (duration: number, loanAmount: number, rate: number, repaymentFrequence: string, durationUnit: string = 'MONTH'): number => {
      if (duration <= 0 || loanAmount <= 0) return 0;

      // Calculate total with simple interest
      const totalWithInterest = loanAmount * (1 + rate / 100);

      // Normalize inputs to EN values for shared logic
      const normalizedFrequence = normalizeFrequence(repaymentFrequence);
      const normalizedUnit = normalizeUnit(durationUnit);

      // Use shared logic for accurate calculation
      const numberOfPayments = calculerNombreEcheances(
        normalizedFrequence as FrequenceRemboursement,
        duration,
        normalizedUnit as DureeUnite
      );

      return numberOfPayments > 0 ? Math.round(totalWithInterest / numberOfPayments) : 0;
    },
    []
  );
  
  /**
   * Validate a manually entered duration
   * Returns error/warning or null if valid
   */
  const validateDuration = useCallback(
    (duration: number, unit: string): ValidationResult | null => {
      if (!duration || duration <= 0) {
        return null; // Will be caught by required field validation
      }

      // Normalize inputs to EN values
      const normalizedUnit = normalizeUnit(unit);
      const normalizedFrequence = normalizeFrequence(frequence);

      // 1. Validate against shared logic first (Backend rules)
      const sharedValidation = validerCoherenceFrequenceDuree(
        normalizedFrequence as FrequenceRemboursement,
        duration,
        normalizedUnit as DureeUnite
      );

      if (!sharedValidation.isValid) {
        return {
          type: 'error',
          message: sharedValidation.debugMessage || "Durée incompatible avec la fréquence"
        };
      }

      // 2. Validate against plan limits if a plan is selected
      if (selectedPlan) {
        const planDuration = selectedPlan.dureeValeur || selectedPlan.duree_valeur;
        const rawPlanUnit = selectedPlan.dureeUnite || selectedPlan.duree_unite;
        const planUnit = rawPlanUnit ? normalizeUnit(rawPlanUnit) : null;

        if (planDuration && planUnit) {
          // Check if exceeds plan max (we use 1.5x as a soft max)
          const maxAllowed = Math.ceil(planDuration * 1.5);
          const minAllowed = Math.max(1, Math.floor(planDuration * 0.3));

          // Convert to same unit for comparison
          if (normalizedUnit === planUnit) {
            const unitLabel = planUnit === 'DAY' ? 'jours' : planUnit === 'WEEK' ? 'semaines' : 'mois';
            if (duration > maxAllowed) {
              return {
                type: 'error',
                message: `Ce plan impose max ${maxAllowed} ${unitLabel}`,
              };
            }
            if (duration < minAllowed) {
              return {
                type: 'error',
                message: `Ce plan impose min ${minAllowed} ${unitLabel}`,
              };
            }
          }
        }
      }

      // Check for very high monthly payment (based on amount)
      if (amount && duration > 0) {
        // Convert duration to months for consistent calculation
        let durationInMonths = duration;
        if (normalizedUnit === 'DAY') durationInMonths = Math.ceil(duration / 30);
        else if (normalizedUnit === 'WEEK') durationInMonths = Math.ceil(duration / 4);

        const estimatedMonthly = amount / Math.max(1, durationInMonths);

        // Warn if monthly payment exceeds 500,000 FCFA (high threshold)
        if (estimatedMonthly > 500000) {
          return {
            type: 'warning',
            message: 'Mensualité très élevée !',
          };
        }
      }

      return null;
    },
    [selectedPlan, amount, frequence]
  );
  
  return {
    suggestedDurations,
    calculateInstallment,
    validateDuration,
  };
}

export default useSmartDuration;
