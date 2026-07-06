import type { LucideIcon } from "lucide-react";

export interface StepDefinition {
  num: number;
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export interface TontineGroupFormData {
  // ─── Step 1: Template ───
  planId: string;

  // ─── Step 2: General ───
  nom: string;
  description: string;
  montantCotisation: string;
  nombreMembres: string;
  frequence: string;
  intervalleCotisation: string;
  distributionType: string;
  agenceId: string;
  gestionnaireId: string;

  // ─── Step 3: Lifecycle ───
  statut: string;
  dateDebut: string;
  dateFin: string;
  endRule: string;
  roundCount: string;
  minMembersToStart: string;

  // ─── Step 4: Overrides (config inherited from plan, overridable) ───
  overrideCalendar: boolean;
  overrideDistribution: boolean;
  overridePenalties: boolean;
  overrideEntryExit: boolean;
  overridePayment: boolean;
  overrideGovernance: boolean;

  // Calendar overrides
  firstContributionRule: string;
  gracePeriodContribution: string;
  collectionCalendarMode: string;
  weekdaysMask: number;
  shiftNonWorkingDay: string;
  holidayCalendarId: string;
  timezone: string;
  preferredWeekday: string;

  // Distribution overrides
  payoutFrequency: string;
  payoutDayRule: string;
  payoutOrderMode: string;
  allowSwapPayoutOrder: boolean;
  swapRequiresApproval: boolean;
  payoutRequiresContribPaid: boolean;
  allowPartialDistribution: boolean;
  distributionMinThresholdPct: string;

  // Penalty overrides
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

  // Entry/Exit overrides
  joinFeeEnabled: boolean;
  joinFeeAmount: string;
  exitAllowed: boolean;
  exitFeePercent: string;
  exitNoticePeriods: string;
  replacementAllowed: boolean;
  transferMembershipAllowed: boolean;
  allowMidCycleJoin: boolean;

  // Payment overrides
  allowedPaymentMethods: string[];
  defaultPaymentMethod: string;
  cashMustGoToCaisse: boolean;
  tauxPlateforme: string;
  feeCollectionMode: string;
  maxAdvanceTours: string;

  // Governance overrides
  rolesEnabled: boolean;
  groupRoles: string[];
  approvalsRequiredFor: string[];
  minKycLevel: string;
  minSegmentRequired: string;

  // ─── Step 5: Members ───
  members: MemberEntry[];

  // ─── Step 6: Payout Order ───
  payoutOrder: string[]; // ordered clientIds
}

export interface MemberEntry {
  clientId: string;
  groupRole: string;
}

export interface StepComponentProps {
  formData: TontineGroupFormData;
  updateField: <K extends keyof TontineGroupFormData>(key: K, value: TontineGroupFormData[K]) => void;
}
