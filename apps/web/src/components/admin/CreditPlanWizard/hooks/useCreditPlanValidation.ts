import { useMemo } from "react";
import type { CreditPlanFormData } from "../types";

export function useCreditPlanValidation(formData: CreditPlanFormData) {
  const isStepValid = useMemo(() => {
    return (step: number): boolean => {
      switch (step) {
        case 1:
          return formData.nom.trim().length >= 2 && !!formData.typeCredit;
        case 2:
          return (
            parseInt(formData.dureeValeur) > 0 &&
            !!formData.dureeUnite &&
            !!formData.frequenceRemboursement
          );
        case 3: {
          const taux = parseFloat(formData.tauxInteret);
          return !isNaN(taux) && taux >= 0 && taux <= 100;
        }
        // Steps 4-8 all have defaults, always valid
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
          return true;
        default:
          return false;
      }
    };
  }, [formData]);

  const isFormValid = useMemo(() => {
    return isStepValid(1) && isStepValid(2) && isStepValid(3);
  }, [isStepValid]);

  return { isStepValid, isFormValid };
}
