import { useState, useCallback } from "react";
import type { CreditPlanFormData, FeeFormRow } from "../types";

export interface PreviewRow {
  number: number;
  date: string;
  capitalPayment: string;
  interestPayment: string;
  feePayment: string;
  totalPayment: string;
  balanceAfter: string;
}

export interface PreviewResult {
  rows: PreviewRow[];
  summary: {
    totalCapital: string;
    totalInterest: string;
    totalFees: string;
    totalDue: string;
    numberOfInstallments: number;
  };
  upfrontFees: { feeType: string; label: string | null; amount: string; collectionMode: string }[];
}

export function useSchedulePreview() {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePreview = useCallback(
    async (
      formData: CreditPlanFormData,
      fees: FeeFormRow[],
      principal: string,
      disbursementDate: string,
    ) => {
      setLoading(true);
      setError(null);

      try {
        const planConfig = {
          dureeValeur: parseInt(formData.dureeValeur) || 30,
          dureeUnite: formData.dureeUnite,
          frequenceRemboursement: formData.frequenceRemboursement,
          tauxInteret: formData.tauxInteret,
          interestMethod: formData.interestMethod,
          interestRatePeriod: formData.interestRatePeriod,
          dayCountConvention: formData.dayCountConvention,
          interestRoundingMode: formData.interestRoundingMode,
          interestRoundingUnit: parseInt(formData.interestRoundingUnit) || 1,
          amortizationType: formData.amortizationType,
          firstDueRule: formData.firstDueRule,
          gracePeriodDays: parseInt(formData.gracePeriodDays) || 0,
          preferredWeekday: formData.preferredWeekday ? parseInt(formData.preferredWeekday) : null,
          calendarMode: formData.calendarMode,
          weekdaysMask: formData.weekdaysMask,
          shiftNonWorkingDay: formData.shiftNonWorkingDay,
          allowManualFirstDueDate: formData.allowManualFirstDueDate,
        };

        const feeConfigs = fees
          .filter((f) => f.value)
          .map((f) => ({
            feeType: f.feeType,
            label: f.label || null,
            calcType: f.calcType,
            value: f.value,
            minAmount: f.minAmount || null,
            maxAmount: f.maxAmount || null,
            collectionMode: f.collectionMode,
          }));

        const res = await fetch("/api/credit-plans/preview-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ planConfig, fees: feeConfigs, principal, disbursementDate }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Erreur lors de la génération");
        }

        const result = await res.json();
        setPreview(result);
      } catch (err: any) {
        setError(err.message);
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { preview, loading, error, generatePreview };
}
