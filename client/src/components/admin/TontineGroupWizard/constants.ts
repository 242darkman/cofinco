import { LayoutTemplate, FileText, CalendarClock, Settings, Users, ListOrdered, Eye, CheckCircle } from "lucide-react";
import type { StepDefinition, TontineGroupFormData } from "./types";

export const STEPS: StepDefinition[] = [
  { num: 1, key: "template", label: "Choisir un modele", shortLabel: "Modele", icon: LayoutTemplate },
  { num: 2, key: "general", label: "Configuration du groupe", shortLabel: "General", icon: FileText },
  { num: 3, key: "lifecycle", label: "Dates & Cycle de vie", shortLabel: "Cycle", icon: CalendarClock },
  { num: 4, key: "overrides", label: "Regles (personnalisation)", shortLabel: "Regles", icon: Settings },
  { num: 5, key: "members", label: "Membres", shortLabel: "Membres", icon: Users },
  { num: 6, key: "payout_order", label: "Ordre de distribution", shortLabel: "Ordre", icon: ListOrdered },
  { num: 7, key: "preview", label: "Preview calendrier", shortLabel: "Preview", icon: Eye },
  { num: 8, key: "summary", label: "Confirmation", shortLabel: "Confirmer", icon: CheckCircle },
];

export const TOTAL_STEPS = STEPS.length;

export const AUTO_SAVE_KEY = "cofinco_tontine_group_draft";

export const END_RULE_OPTIONS = [
  { value: "WHEN_ALL_RECEIVED", label: "Quand tous ont recu" },
  { value: "AFTER_N_ROUNDS", label: "Apres N tours" },
  { value: "AFTER_N_PERIODS", label: "Apres N periodes" },
];

export const DEFAULT_FORM_DATA: TontineGroupFormData = {
  planId: "",

  nom: "",
  description: "",
  montantCotisation: "",
  nombreMembres: "",
  frequence: "MONTHLY",
  intervalleCotisation: "1",
  distributionType: "ROTATIVE_SUSU",
  agenceId: "",
  gestionnaireId: "",

  statut: "DRAFT",
  dateDebut: new Date().toISOString().split("T")[0],
  dateFin: "",
  endRule: "WHEN_ALL_RECEIVED",
  roundCount: "",
  minMembersToStart: "3",

  overrideCalendar: false,
  overrideDistribution: false,
  overridePenalties: false,
  overrideEntryExit: false,
  overridePayment: false,
  overrideGovernance: false,

  firstContributionRule: "ON_START_DATE",
  gracePeriodContribution: "0",
  collectionCalendarMode: "ALL_DAYS",
  weekdaysMask: 127,
  shiftNonWorkingDay: "NEXT",
  holidayCalendarId: "",
  timezone: "Africa/Brazzaville",
  preferredWeekday: "",

  payoutFrequency: "SAME_AS_CONTRIBUTION",
  payoutDayRule: "",
  payoutOrderMode: "FIXED_BY_ADMIN",
  allowSwapPayoutOrder: false,
  swapRequiresApproval: true,
  payoutRequiresContribPaid: true,
  allowPartialDistribution: true,
  distributionMinThresholdPct: "50",

  penaltyEnabled: false,
  penaltyType: "FIXED",
  penaltyValue: "0",
  penaltyApplication: "PER_PERIOD",
  penaltyCap: "",
  lateGracePeriodDays: "0",
  maxMissedContributions: "0",
  arrearsPolicy: "MUST_PAY_BEFORE_PAYOUT",
  suspensionPolicy: "SUSPEND_MEMBER",
  defaultPolicy: "EXCLUDE_MEMBER",
  maxLateBeforeSuspend: "3",
  maxLateBeforeExclude: "5",
  penaltyDeductedFromPayout: true,
  penaltyAsRevenue: false,
  autoPenaltyPriority: true,

  joinFeeEnabled: false,
  joinFeeAmount: "0",
  exitAllowed: true,
  exitFeePercent: "0",
  exitNoticePeriods: "0",
  replacementAllowed: true,
  transferMembershipAllowed: false,
  allowMidCycleJoin: false,

  allowedPaymentMethods: ["CASH"],
  defaultPaymentMethod: "CASH",
  cashMustGoToCaisse: true,
  tauxPlateforme: "0",
  feeCollectionMode: "ON_EACH_PAYOUT",
  maxAdvanceTours: "3",

  rolesEnabled: true,
  groupRoles: ["PRESIDENT", "TRESORIER", "SECRETAIRE"],
  approvalsRequiredFor: ["DISTRIBUTION", "REORDER"],
  minKycLevel: "NONE",
  minSegmentRequired: "",

  members: [],
  payoutOrder: [],
};
