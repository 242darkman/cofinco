import { useState, useEffect, useCallback } from "react";
import type { TontineGroupFormData, MemberEntry } from "../types";
import { DEFAULT_FORM_DATA, AUTO_SAVE_KEY } from "../constants";
import { DEFAULT_FORM_DATA as PLAN_DEFAULT_FORM_DATA } from "../../TontinePlanWizard/constants";
import { tontineApi } from "../../../../lib/api-client";
import type { Tontine, TontinePlan } from "@shared/schema/tontines";

function mapTontineToFormData(t: Tontine): TontineGroupFormData {
  return {
    planId: t.planId || "",
    nom: t.nom || "",
    description: t.description || "",
    montantCotisation: t.montantCotisation?.toString() || "",
    nombreMembres: t.nombreMembres?.toString() || "",
    frequence: t.frequence || "MONTHLY",
    intervalleCotisation: t.intervalleCotisation?.toString() || "1",
    distributionType: t.distributionType || "ROTATIVE_SUSU",
    agenceId: t.agenceId || "",
    gestionnaireId: t.gestionnaireId || "",

    statut: t.statut || "DRAFT",
    dateDebut: t.dateDebut ? (t.dateDebut instanceof Date ? t.dateDebut.toISOString() : String(t.dateDebut)).split("T")[0] : new Date().toISOString().split("T")[0],
    dateFin: t.dateFin ? (t.dateFin instanceof Date ? t.dateFin.toISOString() : String(t.dateFin)).split("T")[0] : "",
    endRule: t.endRule || "WHEN_ALL_RECEIVED",
    roundCount: t.roundCount?.toString() || "",
    minMembersToStart: t.minMembersToStart?.toString() || "3",

    overrideCalendar: false,
    overrideDistribution: false,
    overridePenalties: false,
    overrideEntryExit: false,
    overridePayment: false,
    overrideGovernance: false,

    firstContributionRule: t.firstContributionRule || "ON_START_DATE",
    gracePeriodContribution: t.gracePeriodContribution?.toString() || "0",
    collectionCalendarMode: t.collectionCalendarMode || "ALL_DAYS",
    weekdaysMask: t.weekdaysMask ?? 127,
    shiftNonWorkingDay: t.shiftNonWorkingDay || "NEXT",
    holidayCalendarId: t.holidayCalendarId || "",
    timezone: t.timezone || "Africa/Brazzaville",
    preferredWeekday: t.preferredWeekday?.toString() || "",

    payoutFrequency: t.payoutFrequency || "SAME_AS_CONTRIBUTION",
    payoutDayRule: t.payoutDayRule || "",
    payoutOrderMode: t.payoutOrderMode || "FIXED_BY_ADMIN",
    allowSwapPayoutOrder: t.allowSwapPayoutOrder ?? false,
    swapRequiresApproval: t.swapRequiresApproval ?? true,
    payoutRequiresContribPaid: t.payoutRequiresContribPaid ?? true,
    allowPartialDistribution: t.allowPartialDistribution ?? true,
    distributionMinThresholdPct: t.distributionMinThresholdPct?.toString() || "50",

    penaltyEnabled: t.penaltyEnabled ?? false,
    penaltyType: t.penaltyType || "FIXED",
    penaltyValue: t.penaltyValue?.toString() || "0",
    penaltyApplication: t.penaltyApplication || "PER_PERIOD",
    penaltyCap: t.penaltyCap?.toString() || "",
    lateGracePeriodDays: t.lateGracePeriodDays?.toString() || "0",
    maxMissedContributions: t.maxMissedContributions?.toString() || "0",
    arrearsPolicy: t.arrearsPolicy || "MUST_PAY_BEFORE_PAYOUT",
    suspensionPolicy: t.suspensionPolicy || "SUSPEND_MEMBER",
    defaultPolicy: t.defaultPolicy || "EXCLUDE_MEMBER",
    maxLateBeforeSuspend: t.maxLateBeforeSuspend?.toString() || "3",
    maxLateBeforeExclude: t.maxLateBeforeExclude?.toString() || "5",
    penaltyDeductedFromPayout: t.penaltyDeductedFromPayout ?? true,
    penaltyAsRevenue: t.penaltyAsRevenue ?? false,
    autoPenaltyPriority: t.autoPenaltyPriority ?? true,

    joinFeeEnabled: t.joinFeeEnabled ?? false,
    joinFeeAmount: t.joinFeeAmount?.toString() || "0",
    exitAllowed: t.exitAllowed ?? true,
    exitFeePercent: t.exitFeePercent?.toString() || "0",
    exitNoticePeriods: t.exitNoticePeriods?.toString() || "0",
    replacementAllowed: t.replacementAllowed ?? true,
    transferMembershipAllowed: t.transferMembershipAllowed ?? false,
    allowMidCycleJoin: t.allowMidCycleJoin ?? false,

    allowedPaymentMethods: Array.isArray(t.allowedPaymentMethods) ? t.allowedPaymentMethods : ["CASH"],
    defaultPaymentMethod: t.defaultPaymentMethod || "CASH",
    cashMustGoToCaisse: t.cashMustGoToCaisse ?? true,
    tauxPlateforme: t.tauxPlateforme?.toString() || "0",
    feeCollectionMode: t.feeCollectionMode || "ON_EACH_PAYOUT",
    maxAdvanceTours: t.maxAdvanceTours?.toString() || "3",

    rolesEnabled: t.rolesEnabled ?? true,
    groupRoles: Array.isArray(t.groupRoles) ? t.groupRoles : ["PRESIDENT", "TRESORIER", "SECRETAIRE"],
    approvalsRequiredFor: Array.isArray(t.approvalsRequiredFor) ? t.approvalsRequiredFor : ["DISTRIBUTION", "REORDER"],
    minKycLevel: t.minKycLevel || "NONE",
    minSegmentRequired: t.minSegmentRequired || "",

    members: [],
    payoutOrder: [],
  };
}

export function useTontineGroupForm(editData?: Tontine) {
  const [formData, setFormData] = useState<TontineGroupFormData>(() => {
    if (editData) return mapTontineToFormData(editData);
    const saved = sessionStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_FORM_DATA, ...(parsed.formData ?? parsed) };
      } catch { /* ignore */ }
    }
    return { ...DEFAULT_FORM_DATA };
  });

  // Load members from backend when editing an existing tontine
  useEffect(() => {
    if (!editData?.id) return;
    let cancelled = false;
    tontineApi.getMembres(editData.id).then((membres: any[]) => {
      if (cancelled) return;
      const members: MemberEntry[] = membres.map((m: any) => ({
        clientId: m.clientId,
        groupRole: m.groupRole || "",
      }));
      const payoutOrder = membres
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((m: any) => m.clientId);
      setFormData((prev: TontineGroupFormData) => ({ ...prev, members, payoutOrder }));
    }).catch(() => { /* members will stay empty */ });
    return () => { cancelled = true; };
  }, [editData?.id]);

  useEffect(() => {
    if (editData) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ formData }));
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, editData]);

  const updateField = useCallback(<K extends keyof TontineGroupFormData>(key: K, value: TontineGroupFormData[K]) => {
    setFormData((prev: TontineGroupFormData) => {
      const next = { ...prev, [key]: value };
      // Clear payoutOrder when switching to a non-manual mode
      if (key === "payoutOrderMode" && value !== "FIXED_BY_ADMIN") {
        next.payoutOrder = [];
      }
      return next;
    });
  }, []);

  const applyPlan = useCallback((plan: Partial<TontinePlan> & { id: string }) => {
    if (!plan.id) {
      // "Sans modele" selected — reset all config fields to defaults, keep name/members/dates
      setFormData((prev: TontineGroupFormData) => ({
        ...prev,
        planId: "",
        montantCotisation: PLAN_DEFAULT_FORM_DATA.montantCotisation,
        nombreMembres: PLAN_DEFAULT_FORM_DATA.nombreMembres,
        frequence: PLAN_DEFAULT_FORM_DATA.frequence,
        intervalleCotisation: PLAN_DEFAULT_FORM_DATA.intervalleCotisation,
        distributionType: PLAN_DEFAULT_FORM_DATA.distributionType,
        tauxPlateforme: PLAN_DEFAULT_FORM_DATA.tauxPlateforme,
        firstContributionRule: PLAN_DEFAULT_FORM_DATA.firstContributionRule,
        gracePeriodContribution: PLAN_DEFAULT_FORM_DATA.gracePeriodContribution,
        collectionCalendarMode: PLAN_DEFAULT_FORM_DATA.collectionCalendarMode,
        weekdaysMask: PLAN_DEFAULT_FORM_DATA.weekdaysMask,
        shiftNonWorkingDay: PLAN_DEFAULT_FORM_DATA.shiftNonWorkingDay,
        holidayCalendarId: PLAN_DEFAULT_FORM_DATA.holidayCalendarId,
        timezone: PLAN_DEFAULT_FORM_DATA.timezone,
        preferredWeekday: PLAN_DEFAULT_FORM_DATA.preferredWeekday,
        payoutFrequency: PLAN_DEFAULT_FORM_DATA.payoutFrequency,
        payoutDayRule: PLAN_DEFAULT_FORM_DATA.payoutDayRule,
        payoutOrderMode: PLAN_DEFAULT_FORM_DATA.payoutOrderMode,
        allowSwapPayoutOrder: PLAN_DEFAULT_FORM_DATA.allowSwapPayoutOrder,
        swapRequiresApproval: PLAN_DEFAULT_FORM_DATA.swapRequiresApproval,
        payoutRequiresContribPaid: PLAN_DEFAULT_FORM_DATA.payoutRequiresContribPaid,
        allowPartialDistribution: PLAN_DEFAULT_FORM_DATA.allowPartialDistribution,
        distributionMinThresholdPct: PLAN_DEFAULT_FORM_DATA.distributionMinThresholdPct,
        penaltyEnabled: PLAN_DEFAULT_FORM_DATA.penaltyEnabled,
        penaltyType: PLAN_DEFAULT_FORM_DATA.penaltyType,
        penaltyValue: PLAN_DEFAULT_FORM_DATA.penaltyValue,
        penaltyApplication: PLAN_DEFAULT_FORM_DATA.penaltyApplication,
        penaltyCap: PLAN_DEFAULT_FORM_DATA.penaltyCap,
        lateGracePeriodDays: PLAN_DEFAULT_FORM_DATA.lateGracePeriodDays,
        maxMissedContributions: PLAN_DEFAULT_FORM_DATA.maxMissedContributions,
        arrearsPolicy: PLAN_DEFAULT_FORM_DATA.arrearsPolicy,
        suspensionPolicy: PLAN_DEFAULT_FORM_DATA.suspensionPolicy,
        defaultPolicy: PLAN_DEFAULT_FORM_DATA.defaultPolicy,
        maxLateBeforeSuspend: PLAN_DEFAULT_FORM_DATA.maxLateBeforeSuspend,
        maxLateBeforeExclude: PLAN_DEFAULT_FORM_DATA.maxLateBeforeExclude,
        penaltyDeductedFromPayout: PLAN_DEFAULT_FORM_DATA.penaltyDeductedFromPayout,
        penaltyAsRevenue: PLAN_DEFAULT_FORM_DATA.penaltyAsRevenue,
        autoPenaltyPriority: PLAN_DEFAULT_FORM_DATA.autoPenaltyPriority,
        joinFeeEnabled: PLAN_DEFAULT_FORM_DATA.joinFeeEnabled,
        joinFeeAmount: PLAN_DEFAULT_FORM_DATA.joinFeeAmount,
        exitAllowed: PLAN_DEFAULT_FORM_DATA.exitAllowed,
        exitFeePercent: PLAN_DEFAULT_FORM_DATA.exitFeePercent,
        exitNoticePeriods: PLAN_DEFAULT_FORM_DATA.exitNoticePeriods,
        replacementAllowed: PLAN_DEFAULT_FORM_DATA.replacementAllowed,
        transferMembershipAllowed: PLAN_DEFAULT_FORM_DATA.transferMembershipAllowed,
        allowMidCycleJoin: PLAN_DEFAULT_FORM_DATA.allowMidCycleJoin,
        allowedPaymentMethods: PLAN_DEFAULT_FORM_DATA.allowedPaymentMethods,
        defaultPaymentMethod: PLAN_DEFAULT_FORM_DATA.defaultPaymentMethod,
        cashMustGoToCaisse: PLAN_DEFAULT_FORM_DATA.cashMustGoToCaisse,
        feeCollectionMode: PLAN_DEFAULT_FORM_DATA.feeCollectionMode,
        maxAdvanceTours: PLAN_DEFAULT_FORM_DATA.maxAdvanceTours,
        rolesEnabled: PLAN_DEFAULT_FORM_DATA.rolesEnabled,
        groupRoles: PLAN_DEFAULT_FORM_DATA.groupRoles,
        approvalsRequiredFor: PLAN_DEFAULT_FORM_DATA.approvalsRequiredFor,
        minKycLevel: PLAN_DEFAULT_FORM_DATA.minKycLevel,
        minSegmentRequired: PLAN_DEFAULT_FORM_DATA.minSegmentRequired,
      }));
      return;
    }
    setFormData((prev: TontineGroupFormData) => ({
      ...prev,
      planId: plan.id,
      nom: prev.nom || plan.nom || "",
      description: prev.description || plan.description || "",
      montantCotisation: plan.montantCotisation?.toString() || prev.montantCotisation,
      nombreMembres: plan.nombreMembres?.toString() || prev.nombreMembres,
      frequence: plan.frequence || prev.frequence,
      intervalleCotisation: plan.intervalleCotisation?.toString() || prev.intervalleCotisation,
      distributionType: plan.distributionType || prev.distributionType,
      tauxPlateforme: plan.tauxPlateforme?.toString() || prev.tauxPlateforme,

      // Copy all config fields from plan
      firstContributionRule: plan.firstContributionRule || prev.firstContributionRule,
      gracePeriodContribution: plan.gracePeriodContribution?.toString() || prev.gracePeriodContribution,
      collectionCalendarMode: plan.collectionCalendarMode || prev.collectionCalendarMode,
      weekdaysMask: plan.weekdaysMask ?? prev.weekdaysMask,
      shiftNonWorkingDay: plan.shiftNonWorkingDay || prev.shiftNonWorkingDay,
      holidayCalendarId: plan.holidayCalendarId || prev.holidayCalendarId,
      timezone: plan.timezone || prev.timezone,
      preferredWeekday: plan.preferredWeekday?.toString() || prev.preferredWeekday,

      payoutFrequency: plan.payoutFrequency || prev.payoutFrequency,
      payoutDayRule: plan.payoutDayRule || prev.payoutDayRule,
      payoutOrderMode: plan.payoutOrderMode || prev.payoutOrderMode,
      allowSwapPayoutOrder: plan.allowSwapPayoutOrder ?? prev.allowSwapPayoutOrder,
      swapRequiresApproval: plan.swapRequiresApproval ?? prev.swapRequiresApproval,
      payoutRequiresContribPaid: plan.payoutRequiresContribPaid ?? prev.payoutRequiresContribPaid,
      allowPartialDistribution: plan.allowPartialDistribution ?? prev.allowPartialDistribution,
      distributionMinThresholdPct: plan.distributionMinThresholdPct?.toString() || prev.distributionMinThresholdPct,

      penaltyEnabled: plan.penaltyEnabled ?? prev.penaltyEnabled,
      penaltyType: plan.penaltyType || prev.penaltyType,
      penaltyValue: plan.penaltyValue?.toString() || prev.penaltyValue,
      penaltyApplication: plan.penaltyApplication || prev.penaltyApplication,
      penaltyCap: plan.penaltyCap?.toString() || prev.penaltyCap,
      lateGracePeriodDays: plan.lateGracePeriodDays?.toString() || prev.lateGracePeriodDays,
      maxMissedContributions: plan.maxMissedContributions?.toString() || prev.maxMissedContributions,
      arrearsPolicy: plan.arrearsPolicy || prev.arrearsPolicy,
      suspensionPolicy: plan.suspensionPolicy || prev.suspensionPolicy,
      defaultPolicy: plan.defaultPolicy || prev.defaultPolicy,
      maxLateBeforeSuspend: plan.maxLateBeforeSuspend?.toString() || prev.maxLateBeforeSuspend,
      maxLateBeforeExclude: plan.maxLateBeforeExclude?.toString() || prev.maxLateBeforeExclude,
      penaltyDeductedFromPayout: plan.penaltyDeductedFromPayout ?? prev.penaltyDeductedFromPayout,
      penaltyAsRevenue: plan.penaltyAsRevenue ?? prev.penaltyAsRevenue,
      autoPenaltyPriority: plan.autoPenaltyPriority ?? prev.autoPenaltyPriority,

      joinFeeEnabled: plan.joinFeeEnabled ?? prev.joinFeeEnabled,
      joinFeeAmount: plan.joinFeeAmount?.toString() || prev.joinFeeAmount,
      exitAllowed: plan.exitAllowed ?? prev.exitAllowed,
      exitFeePercent: plan.exitFeePercent?.toString() || prev.exitFeePercent,
      exitNoticePeriods: plan.exitNoticePeriods?.toString() || prev.exitNoticePeriods,
      replacementAllowed: plan.replacementAllowed ?? prev.replacementAllowed,
      transferMembershipAllowed: plan.transferMembershipAllowed ?? prev.transferMembershipAllowed,
      allowMidCycleJoin: plan.allowMidCycleJoin ?? prev.allowMidCycleJoin,

      allowedPaymentMethods: Array.isArray(plan.allowedPaymentMethods) ? plan.allowedPaymentMethods : prev.allowedPaymentMethods,
      defaultPaymentMethod: plan.defaultPaymentMethod || prev.defaultPaymentMethod,
      cashMustGoToCaisse: plan.cashMustGoToCaisse ?? prev.cashMustGoToCaisse,
      feeCollectionMode: plan.feeCollectionMode || prev.feeCollectionMode,
      maxAdvanceTours: plan.maxAdvanceTours?.toString() || prev.maxAdvanceTours,

      rolesEnabled: plan.rolesEnabled ?? prev.rolesEnabled,
      groupRoles: Array.isArray(plan.groupRoles) ? plan.groupRoles : prev.groupRoles,
      approvalsRequiredFor: Array.isArray(plan.approvalsRequiredFor) ? plan.approvalsRequiredFor : prev.approvalsRequiredFor,
      minKycLevel: plan.minKycLevel || prev.minKycLevel,
      minSegmentRequired: plan.minSegmentRequired || prev.minSegmentRequired,
    }));
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(editData ? mapTontineToFormData(editData) : { ...DEFAULT_FORM_DATA });
  }, [editData]);

  return { formData, updateField, applyPlan, clearDraft, resetForm };
}
