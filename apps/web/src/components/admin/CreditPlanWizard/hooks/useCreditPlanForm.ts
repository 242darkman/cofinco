import { useState, useEffect, useCallback } from "react";
import { DEFAULT_FORM_DATA, AUTO_SAVE_KEY } from "../constants";
import type { CreditPlanFormData, FeeFormRow } from "../types";

export function useCreditPlanForm(editData?: any) {
  const [formData, setFormData] = useState<CreditPlanFormData>(() => {
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

  const [fees, setFees] = useState<FeeFormRow[]>(() => {
    if (editData?.fees) return editData.fees.map(mapFeeToFormRow);
    const saved = sessionStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.fees?.length) return parsed.fees;
      } catch { /* ignore */ }
    }
    return [];
  });

  // Autosave debounced
  useEffect(() => {
    if (editData) return; // Don't autosave when editing
    const timer = setTimeout(() => {
      sessionStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ formData, fees }));
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, fees, editData]);

  const updateField = useCallback((key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(editData ? mapPlanToFormData(editData) : { ...DEFAULT_FORM_DATA });
    setFees(editData?.fees ? editData.fees.map(mapFeeToFormRow) : []);
  }, [editData]);

  return { formData, fees, setFees, updateField, clearDraft, resetForm };
}

function mapPlanToFormData(plan: any): CreditPlanFormData {
  return {
    nom: plan.nom || "",
    description: plan.description || "",
    typeCredit: plan.typeCredit || "PERSONAL",
    montantMin: plan.montantMin || "",
    montantMax: plan.montantMax || "",
    dureeValeur: String(plan.dureeValeur || 30),
    dureeUnite: plan.dureeUnite || "DAY",
    frequenceRemboursement: plan.frequenceRemboursement || "DAILY",
    amortizationType: plan.amortizationType || "EQUAL_INSTALLMENTS",
    allowPartialPayments: plan.allowPartialPayments ?? true,
    tauxInteret: plan.tauxInteret || "10",
    interestMethod: plan.interestMethod || "FLAT",
    interestRatePeriod: plan.interestRatePeriod || "MONTHLY",
    dayCountConvention: plan.dayCountConvention || "30_360",
    interestRoundingMode: plan.interestRoundingMode || "ROUND",
    interestRoundingUnit: String(plan.interestRoundingUnit || 1),
    firstDueRule: plan.firstDueRule || "NEXT_DAY",
    gracePeriodDays: String(plan.gracePeriodDays || 0),
    preferredWeekday: plan.preferredWeekday != null ? String(plan.preferredWeekday) : "",
    calendarMode: plan.calendarMode || "ALL_DAYS",
    weekdaysMask: plan.weekdaysMask ?? 127,
    shiftNonWorkingDay: plan.shiftNonWorkingDay || "NEXT",
    holidayCalendarId: plan.holidayCalendarId || "",
    allowManualFirstDueDate: plan.allowManualFirstDueDate ?? false,
    lateFeeEnabled: plan.lateFeeEnabled ?? true,
    lateFeeGraceDays: String(plan.lateFeeGraceDays || 0),
    lateFeeType: plan.lateFeeType || "PERCENTAGE",
    lateFeeValue: plan.lateFeeValue || "2",
    lateInterestEnabled: plan.lateInterestEnabled ?? false,
    lateInterestRate: plan.lateInterestRate || "",
    penaltyCap: plan.penaltyCap || "",
    penaltyApplication: plan.penaltyApplication || "PER_INSTALLMENT",
    prepaymentAllowed: plan.prepaymentAllowed ?? true,
    prepaymentFeeType: plan.prepaymentFeeType || "NONE",
    prepaymentFeeValue: plan.prepaymentFeeValue || "",
    prepaymentInterestRebate: plan.prepaymentInterestRebate ?? false,
    minSegment: plan.minSegment || "",
    minScoreGlobal: plan.minScoreGlobal != null ? String(plan.minScoreGlobal) : "",
    minPointsFidelite: plan.minPointsFidelite != null ? String(plan.minPointsFidelite) : "",
    minTauxRemboursement: plan.minTauxRemboursement || "",
    kycRequired: plan.kycRequired ?? false,
    maxDebtToIncomeRatio: plan.maxDebtToIncomeRatio || "",
    requireSavingsAccount: plan.requireSavingsAccount ?? false,
    collateralRequired: plan.collateralRequired ?? false,
    collateralTypes: plan.collateralTypes || [],
    guaranteeDepositPercent: plan.guaranteeDepositPercent || "",
    guaranteeDepositMin: plan.guaranteeDepositMin || "",
    guaranteeReleaseRule: plan.guaranteeReleaseRule || "ON_FULL_REPAYMENT",
    effectiveFrom: plan.effectiveFrom ? new Date(plan.effectiveFrom).toISOString().slice(0, 10) : "",
    effectiveTo: plan.effectiveTo ? new Date(plan.effectiveTo).toISOString().slice(0, 10) : "",
    conditions: Array.isArray(plan.conditions) ? plan.conditions.join("\n") : "",
    documentsRequis: Array.isArray(plan.documentsRequis) ? plan.documentsRequis.join("\n") : "",
    agenceId: plan.agenceId || "",
  };
}

function mapFeeToFormRow(fee: any): FeeFormRow {
  return {
    feeType: fee.feeType || "DOSSIER",
    label: fee.label || "",
    calcType: fee.calcType || "FIXED",
    value: fee.value || "",
    minAmount: fee.minAmount || "",
    maxAmount: fee.maxAmount || "",
    collectionMode: fee.collectionMode || "UPFRONT",
    isRefundable: fee.isRefundable ?? false,
    accountingCode: fee.accountingCode || "",
  };
}
