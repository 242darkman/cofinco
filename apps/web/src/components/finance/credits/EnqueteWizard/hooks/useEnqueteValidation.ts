import { useCallback, useState } from 'react';
import type { EnqueteFormData, CreditPlanInfo } from '../types';
import { ENQUETE_STEPS } from '../constants';

export function useEnqueteValidation(formData: EnqueteFormData, creditPlan: CreditPlanInfo | null) {
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const markTouched = useCallback((field: string) => {
    setTouchedFields(prev => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const isStepValid = useCallback((stepNum: number): boolean => {
    const step = ENQUETE_STEPS.find(s => s.num === stepNum);
    if (!step) return false;

    // Check required fields
    for (const field of step.requiredFields) {
      const value = formData[field as keyof EnqueteFormData];
      if (value === '' || value === null || value === undefined) return false;
    }

    // Step-specific validations
    switch (stepNum) {
      case 1:
        if (!formData.client_id) return false;
        break;
      case 3:
        if (!formData.revenu_mensuel_declare || parseFloat(formData.revenu_mensuel_declare) <= 0) return false;
        if (formData.description_activite.length < 10) return false;
        break;
      case 4:
        if (creditPlan?.collateralRequired && formData.garanties_proposees.length === 0) return false;
        break;
      case 5:
        if (!formData.agentRecommendation) return false;
        if (!formData.recommendedAmount || parseFloat(formData.recommendedAmount) <= 0) return false;
        break;
    }

    return true;
  }, [formData, creditPlan]);

  const isFormValid = useCallback(() => {
    return ENQUETE_STEPS.every(s => isStepValid(s.num));
  }, [isStepValid]);

  const getFieldError = useCallback((field: string): string | null => {
    if (!touchedFields.has(field)) return null;
    const value = formData[field as keyof EnqueteFormData];
    if (value === '' || value === null || value === undefined) return 'Ce champ est requis';
    if (field === 'description_activite' && typeof value === 'string' && value.length < 10) {
      return 'Minimum 10 caractères';
    }
    return null;
  }, [formData, touchedFields]);

  return { isStepValid, isFormValid, markTouched, getFieldError, touchedFields };
}
