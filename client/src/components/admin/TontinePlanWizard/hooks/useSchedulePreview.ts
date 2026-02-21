import { useState, useCallback } from "react";
import type { TontinePlanFormData } from "../types";
import { tontineScheduleApi } from "../../../../lib/api-client";

export interface ScheduleEntry {
  periodNumber: number;
  dueDate: string;
}

export interface SchedulePreview {
  contributions: ScheduleEntry[];
  payouts: ScheduleEntry[];
  cycleEndDate: string;
  totalPeriods: number;
  totalRounds: number;
}

export function useSchedulePreview() {
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const generatePreview = useCallback(async (formData: TontinePlanFormData) => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const config = {
        firstContributionRule: formData.firstContributionRule,
        gracePeriodContribution: parseInt(formData.gracePeriodContribution) || 0,
        collectionCalendarMode: formData.collectionCalendarMode,
        weekdaysMask: formData.weekdaysMask,
        shiftNonWorkingDay: formData.shiftNonWorkingDay,
        timezone: formData.timezone,
        frequence: formData.frequence,
        intervalleCotisation: parseInt(formData.intervalleCotisation) || 1,
        preferredWeekday: formData.preferredWeekday ? parseInt(formData.preferredWeekday) : null,
        distributionType: formData.distributionType,
        payoutFrequency: formData.payoutFrequency,
        payoutDayRule: formData.payoutDayRule || null,
        nombreMembres: parseInt(formData.nombreMembres) || 5,
      };

      const data = await tontineScheduleApi.preview({
        config,
        startDate: new Date().toISOString().split("T")[0],
        holidayCalendarId: formData.holidayCalendarId || undefined,
      });

      setPreview(data);
    } catch (err: any) {
      setPreviewError(err.message || "Erreur inconnue");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  return { preview, previewLoading, previewError, generatePreview };
}
