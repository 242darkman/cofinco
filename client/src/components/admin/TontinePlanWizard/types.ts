import type { LucideIcon } from "lucide-react";

export interface StepDefinition {
  num: number;
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export interface TontinePlanFormData {
  // ─── Step 1: General ───
  nom: string;
  description: string;
  montantCotisation: string;
  nombreMembres: string;
  frequence: string;
  intervalleCotisation: string;
  distributionType: string;

  // ─── Step 2: Calendar ───
  firstContributionRule: string;
  gracePeriodContribution: string;
  collectionCalendarMode: string;
  weekdaysMask: number;
  shiftNonWorkingDay: string;
  holidayCalendarId: string;
  timezone: string;
  preferredWeekday: string;

  // ─── Step 3: Distribution ───
  payoutFrequency: string;
  payoutDayRule: string;
  payoutOrderMode: string;
  allowSwapPayoutOrder: boolean;
  swapRequiresApproval: boolean;
  payoutRequiresContribPaid: boolean;
  allowPartialDistribution: boolean;
  distributionMinThresholdPct: string;

  // ─── Step 4: Penalties ───
  penaltyEnabled: boolean;
  penaltyType: string;
  penaltyValue: string;
  penaltyApplication: string;
  penaltyCap: string;
  lateGracePeriodDays: string;
  maxMissedContributions: string;
  arrearsPolicy: string;
  suspensionPolicy: string;
  defaultPolicy: string;
  maxLateBeforeSuspend: string;
  maxLateBeforeExclude: string;
  penaltyDeductedFromPayout: boolean;
  penaltyAsRevenue: boolean;
  autoPenaltyPriority: boolean;

  // ─── Step 5: Entry/Exit ───
  joinFeeEnabled: boolean;
  joinFeeAmount: string;
  exitAllowed: boolean;
  exitFeePercent: string;
  exitNoticePeriods: string;
  replacementAllowed: boolean;
  transferMembershipAllowed: boolean;
  allowMidCycleJoin: boolean;

  // ─── Step 6: Payment ───
  allowedPaymentMethods: string[];
  defaultPaymentMethod: string;
  cashMustGoToCaisse: boolean;
  tauxPlateforme: string;
  feeCollectionMode: string;
  maxAdvanceTours: string;

  // ─── Step 7: Governance ───
  rolesEnabled: boolean;
  groupRoles: string[];
  approvalsRequiredFor: string[];
  minKycLevel: string;
  minSegmentRequired: string;

  // ─── Meta ───
  agenceId: string;
}

export interface StepComponentProps {
  formData: TontinePlanFormData;
  updateField: <K extends keyof TontinePlanFormData>(key: K, value: TontinePlanFormData[K]) => void;
}
