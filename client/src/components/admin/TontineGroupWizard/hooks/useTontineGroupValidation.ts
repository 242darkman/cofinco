import { useMemo } from "react";
import type { TontineGroupFormData } from "../types";

function pctOk(val: string): boolean {
  if (!val) return true; // empty = default
  const n = parseFloat(val);
  return !isNaN(n) && n >= 0 && n <= 100;
}

export function useTontineGroupValidation(formData: TontineGroupFormData) {
  const isStepValid = useMemo(() => {
    return (step: number): boolean => {
      switch (step) {
        case 1: // Template — optional, always valid
          return true;
        case 2: {
          // General: name, amount, members required
          const hasName = formData.nom.trim().length >= 2;
          const hasAmount = parseFloat(formData.montantCotisation) > 0;
          const hasMembers = parseInt(formData.nombreMembres) >= 2;
          return hasName && hasAmount && hasMembers;
        }
        case 3: {
          // Lifecycle: start date required + date coherence
          if (!formData.dateDebut) return false;
          if (formData.dateFin && formData.dateFin < formData.dateDebut) return false;
          const minMembers = parseInt(formData.minMembersToStart) || 0;
          const maxMembers = parseInt(formData.nombreMembres) || 0;
          if (minMembers > maxMembers) return false;
          // roundCount must be a positive integer when endRule requires it
          if (formData.endRule === "AFTER_N_ROUNDS" || formData.endRule === "AFTER_N_PERIODS") {
            const rc = parseInt(formData.roundCount);
            if (isNaN(rc) || rc <= 0) return false;
          }
          return true;
        }
        case 4: {
          // Overrides: validate percentage fields + conditional deps
          if (!pctOk(formData.exitFeePercent)) return false;
          if (!pctOk(formData.tauxPlateforme)) return false;
          if (!pctOk(formData.distributionMinThresholdPct)) return false;
          if (formData.penaltyEnabled) {
            if (formData.penaltyType === "PERCENT" && !pctOk(formData.penaltyValue)) return false;
            if (parseFloat(formData.penaltyValue) <= 0) return false;
          }
          if (formData.joinFeeEnabled && parseFloat(formData.joinFeeAmount) <= 0) return false;
          if (formData.allowedPaymentMethods.length === 0) return false;
          return true;
        }
        case 5: // Members — optional at creation
        case 6: // Payout order — optional
        case 7: // Preview — informational
        case 8: // Summary
          return true;
        default:
          return false;
      }
    };
  }, [formData]);

  const isFormValid = useMemo(() => {
    return isStepValid(2) && isStepValid(3) && isStepValid(4);
  }, [isStepValid]);

  return { isStepValid, isFormValid };
}
