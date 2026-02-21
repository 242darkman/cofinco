import { useMemo } from "react";
import type { TontinePlanFormData } from "../types";

function pctOk(val: string): boolean {
  if (!val) return true;
  const n = parseFloat(val);
  return !isNaN(n) && n >= 0 && n <= 100;
}

export function useTontinePlanValidation(formData: TontinePlanFormData) {
  const isStepValid = useMemo(() => {
    return (step: number): boolean => {
      switch (step) {
        case 1: {
          // General: name, amount, members count required
          const hasName = formData.nom.trim().length >= 2;
          const hasAmount = parseFloat(formData.montantCotisation) > 0;
          const hasMembers = parseInt(formData.nombreMembres) >= 2;
          return hasName && hasAmount && hasMembers;
        }
        case 2: {
          // Calendar
          const gp = parseInt(formData.gracePeriodContribution);
          if (!isNaN(gp) && gp < 0) return false;
          const pw = formData.preferredWeekday ? parseInt(formData.preferredWeekday) : null;
          if (pw !== null && (pw < 0 || pw > 6)) return false;
          return true;
        }
        case 3: // Distribution
          return pctOk(formData.distributionMinThresholdPct);
        case 4: {
          // Penalties
          if (formData.penaltyEnabled) {
            if (formData.penaltyType === "PERCENT" && !pctOk(formData.penaltyValue)) return false;
            if (parseFloat(formData.penaltyValue) <= 0) return false;
          }
          return true;
        }
        case 5: {
          // Entry/Exit
          if (!pctOk(formData.exitFeePercent)) return false;
          if (formData.joinFeeEnabled && parseFloat(formData.joinFeeAmount) <= 0) return false;
          return true;
        }
        case 6: {
          // Payment
          if (!pctOk(formData.tauxPlateforme)) return false;
          if (formData.allowedPaymentMethods.length === 0) return false;
          // A6: defaultPaymentMethod must be one of allowedPaymentMethods
          if (formData.defaultPaymentMethod && !formData.allowedPaymentMethods.includes(formData.defaultPaymentMethod)) return false;
          return true;
        }
        case 7: // Governance — all have defaults
        case 8: // Summary
          return true;
        default:
          return false;
      }
    };
  }, [formData]);

  const isFormValid = useMemo(() => {
    for (let i = 1; i <= 8; i++) {
      if (!isStepValid(i)) return false;
    }
    return true;
  }, [isStepValid]);

  return { isStepValid, isFormValid };
}
