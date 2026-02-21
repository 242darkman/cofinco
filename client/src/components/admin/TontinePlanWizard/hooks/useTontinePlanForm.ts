import { useState, useEffect, useCallback } from "react";
import type { TontinePlanFormData } from "../types";
import { DEFAULT_FORM_DATA, AUTO_SAVE_KEY } from "../constants";
import type { TontinePlan } from "@shared/schema/tontines";

function mapPlanToFormData(plan: TontinePlan): TontinePlanFormData {
  return {
    actif: plan.actif ?? true,
    nom: plan.nom || "",
    description: plan.description || "",
    montantCotisation: plan.montantCotisation?.toString() || "",
    nombreMembres: plan.nombreMembres?.toString() || "",
    frequence: plan.frequence || "MONTHLY",
    intervalleCotisation: plan.intervalleCotisation?.toString() || "1",
    distributionType: plan.distributionType || "ROTATIVE_SUSU",

    firstContributionRule: plan.firstContributionRule || "ON_START_DATE",
    gracePeriodContribution: plan.gracePeriodContribution?.toString() || "0",
    collectionCalendarMode: plan.collectionCalendarMode || "ALL_DAYS",
    weekdaysMask: plan.weekdaysMask ?? 127,
    shiftNonWorkingDay: plan.shiftNonWorkingDay || "NEXT",
    holidayCalendarId: plan.holidayCalendarId || "",
    timezone: plan.timezone || "Africa/Brazzaville",
    preferredWeekday: plan.preferredWeekday?.toString() || "",

    payoutFrequency: plan.payoutFrequency || "SAME_AS_CONTRIBUTION",
    payoutDayRule: plan.payoutDayRule || "",
    payoutOrderMode: plan.payoutOrderMode || "FIXED_BY_ADMIN",
    allowSwapPayoutOrder: plan.allowSwapPayoutOrder ?? false,
    swapRequiresApproval: plan.swapRequiresApproval ?? true,
    payoutRequiresContribPaid: plan.payoutRequiresContribPaid ?? true,
    allowPartialDistribution: plan.allowPartialDistribution ?? true,
    distributionMinThresholdPct: plan.distributionMinThresholdPct?.toString() || "50",

    penaltyEnabled: plan.penaltyEnabled ?? false,
    penaltyType: plan.penaltyType || "FIXED",
    penaltyValue: plan.penaltyValue?.toString() || "0",
    penaltyApplication: plan.penaltyApplication || "PER_PERIOD",
    penaltyCap: plan.penaltyCap?.toString() || "",
    lateGracePeriodDays: plan.lateGracePeriodDays?.toString() || "0",
    maxMissedContributions: plan.maxMissedContributions?.toString() || "0",
    arrearsPolicy: plan.arrearsPolicy || "MUST_PAY_BEFORE_PAYOUT",
    suspensionPolicy: plan.suspensionPolicy || "SUSPEND_MEMBER",
    defaultPolicy: plan.defaultPolicy || "EXCLUDE_MEMBER",
    maxLateBeforeSuspend: plan.maxLateBeforeSuspend?.toString() || "3",
    maxLateBeforeExclude: plan.maxLateBeforeExclude?.toString() || "5",
    penaltyDeductedFromPayout: plan.penaltyDeductedFromPayout ?? true,
    penaltyAsRevenue: plan.penaltyAsRevenue ?? false,
    autoPenaltyPriority: plan.autoPenaltyPriority ?? true,

    joinFeeEnabled: plan.joinFeeEnabled ?? false,
    joinFeeAmount: plan.joinFeeAmount?.toString() || "0",
    exitAllowed: plan.exitAllowed ?? true,
    exitFeePercent: plan.exitFeePercent?.toString() || "0",
    exitNoticePeriods: plan.exitNoticePeriods?.toString() || "0",
    replacementAllowed: plan.replacementAllowed ?? true,
    transferMembershipAllowed: plan.transferMembershipAllowed ?? false,
    allowMidCycleJoin: plan.allowMidCycleJoin ?? false,

    allowedPaymentMethods: Array.isArray(plan.allowedPaymentMethods) ? plan.allowedPaymentMethods : ["CASH"],
    defaultPaymentMethod: plan.defaultPaymentMethod || "CASH",
    cashMustGoToCaisse: plan.cashMustGoToCaisse ?? true,
    tauxPlateforme: plan.tauxPlateforme?.toString() || "0",
    feeCollectionMode: plan.feeCollectionMode || "ON_EACH_PAYOUT",
    maxAdvanceTours: plan.maxAdvanceTours?.toString() || "3",

    rolesEnabled: plan.rolesEnabled ?? true,
    groupRoles: Array.isArray(plan.groupRoles) ? plan.groupRoles : ["PRESIDENT", "TRESORIER", "SECRETAIRE"],
    approvalsRequiredFor: Array.isArray(plan.approvalsRequiredFor) ? plan.approvalsRequiredFor : ["DISTRIBUTION", "REORDER"],
    minKycLevel: plan.minKycLevel || "NONE",
    minSegmentRequired: plan.minSegmentRequired || "",

    agenceId: plan.agenceId || "",
  };
}

export function useTontinePlanForm(editData?: TontinePlan) {
  const [formData, setFormData] = useState<TontinePlanFormData>(() => {
    if (editData) return mapPlanToFormData(editData);
    const saved = sessionStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_FORM_DATA, ...(parsed.formData ?? parsed) };
      } catch { /* ignore */ }
    }
    return { ...DEFAULT_FORM_DATA };
  });

  // Autosave draft (disabled in edit mode)
  useEffect(() => {
    if (editData) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ formData }));
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, editData]);

  const updateField = useCallback(<K extends keyof TontinePlanFormData>(key: K, value: TontinePlanFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(editData ? mapPlanToFormData(editData) : { ...DEFAULT_FORM_DATA });
  }, [editData]);

  return { formData, updateField, clearDraft, resetForm };
}
