import { FileText, Calendar, ArrowRightLeft, AlertTriangle, UserPlus, Wallet, Shield, CheckCircle } from "lucide-react";
import type { StepDefinition, TontinePlanFormData } from "./types";

export const STEPS: StepDefinition[] = [
  { num: 1, key: "general", label: "Informations generales", shortLabel: "General", icon: FileText },
  { num: 2, key: "calendar", label: "Calendrier & Cotisations", shortLabel: "Calendrier", icon: Calendar },
  { num: 3, key: "distribution", label: "Distribution & Tours", shortLabel: "Distribution", icon: ArrowRightLeft },
  { num: 4, key: "penalties", label: "Penalites & Retards", shortLabel: "Penalites", icon: AlertTriangle },
  { num: 5, key: "entry_exit", label: "Adhesion & Sortie", shortLabel: "Adhesion", icon: UserPlus },
  { num: 6, key: "payment", label: "Paiement & Tresorerie", shortLabel: "Paiement", icon: Wallet },
  { num: 7, key: "governance", label: "Gouvernance", shortLabel: "Gouvernance", icon: Shield },
  { num: 8, key: "summary", label: "Resume & Validation", shortLabel: "Resume", icon: CheckCircle },
];

export const TOTAL_STEPS = STEPS.length;

export const AUTO_SAVE_KEY = "cofinco_tontine_plan_draft";

export const DEFAULT_FORM_DATA: TontinePlanFormData = {
  // Step 1: General
  nom: "",
  description: "",
  montantCotisation: "",
  nombreMembres: "",
  frequence: "MONTHLY",
  intervalleCotisation: "1",
  distributionType: "ROTATIVE_SUSU",

  // Step 2: Calendar
  firstContributionRule: "ON_START_DATE",
  gracePeriodContribution: "0",
  collectionCalendarMode: "ALL_DAYS",
  weekdaysMask: 127,
  shiftNonWorkingDay: "NEXT",
  holidayCalendarId: "",
  timezone: "Africa/Brazzaville",
  preferredWeekday: "",

  // Step 3: Distribution
  payoutFrequency: "SAME_AS_CONTRIBUTION",
  payoutDayRule: "",
  payoutOrderMode: "FIXED_BY_ADMIN",
  allowSwapPayoutOrder: false,
  swapRequiresApproval: true,
  payoutRequiresContribPaid: true,
  allowPartialDistribution: true,
  distributionMinThresholdPct: "50",

  // Step 4: Penalties
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

  // Step 5: Entry/Exit
  joinFeeEnabled: false,
  joinFeeAmount: "0",
  exitAllowed: true,
  exitFeePercent: "0",
  exitNoticePeriods: "0",
  replacementAllowed: true,
  transferMembershipAllowed: false,
  allowMidCycleJoin: false,

  // Step 6: Payment
  allowedPaymentMethods: ["CASH"],
  defaultPaymentMethod: "CASH",
  cashMustGoToCaisse: true,
  tauxPlateforme: "0",
  feeCollectionMode: "ON_EACH_PAYOUT",
  maxAdvanceTours: "3",

  // Step 7: Governance
  rolesEnabled: true,
  groupRoles: ["PRESIDENT", "TRESORIER", "SECRETAIRE"],
  approvalsRequiredFor: ["DISTRIBUTION", "REORDER"],
  minKycLevel: "NONE",
  minSegmentRequired: "",

  // Meta
  agenceId: "",
};

// ─── Option arrays ───

export const FREQUENCE_OPTIONS = [
  { value: "DAILY", label: "Journalier" },
  { value: "WEEKLY", label: "Hebdomadaire" },
  { value: "BIWEEKLY", label: "Bi-hebdomadaire (14 jours)" },
  { value: "MONTHLY", label: "Mensuel" },
  { value: "BIMONTHLY", label: "Bimestriel" },
  { value: "QUARTERLY", label: "Trimestriel" },
];

export const DISTRIBUTION_TYPE_OPTIONS = [
  { value: "ROTATIVE_SUSU", label: "Rotative (Susu/Tontine classique)", description: "Chaque membre recoit a tour de role" },
  { value: "ACCUMULATIVE_END", label: "Accumulative (Pot commun)", description: "Un seul paiement a la fin du cycle" },
  { value: "MIXED", label: "Mixte", description: "Rotation + pot final" },
];

export const FIRST_CONTRIBUTION_RULE_OPTIONS = [
  { value: "ON_START_DATE", label: "A la date de debut" },
  { value: "AFTER_N_DAYS", label: "Apres N jours de grace" },
  { value: "NEXT_WEEKDAY", label: "Au prochain jour ouvrable prefere" },
  { value: "END_OF_WEEK", label: "Fin de semaine" },
  { value: "END_OF_MONTH", label: "Fin de mois" },
  { value: "CUSTOM_DATE_ALLOWED", label: "Date personnalisee autorisee" },
];

export const CALENDAR_MODE_OPTIONS = [
  { value: "ALL_DAYS", label: "Tous les jours" },
  { value: "BUSINESS_DAYS_ONLY", label: "Jours ouvrables uniquement" },
  { value: "CUSTOM_WEEKDAYS", label: "Jours personnalises" },
];

export const SHIFT_OPTIONS = [
  { value: "NEXT", label: "Reporter au jour suivant" },
  { value: "PREVIOUS", label: "Avancer au jour precedent" },
  { value: "NEAREST", label: "Au plus proche" },
];

export const PAYOUT_FREQUENCY_OPTIONS = [
  { value: "SAME_AS_CONTRIBUTION", label: "Meme frequence que les cotisations" },
  { value: "CUSTOM", label: "Frequence personnalisee" },
];

export const PAYOUT_ORDER_MODE_OPTIONS = [
  { value: "FIXED_BY_ADMIN", label: "Fixe par l'administrateur" },
  { value: "RANDOM_AT_START", label: "Aleatoire au debut du cycle" },
  { value: "PRIORITY_SCORE", label: "Par score de priorite" },
];

export const PENALTY_TYPE_OPTIONS = [
  { value: "FIXED", label: "Montant fixe" },
  { value: "PERCENT", label: "Pourcentage de la cotisation" },
];

export const PENALTY_APPLICATION_OPTIONS = [
  { value: "PER_PERIOD", label: "Par periode de retard" },
  { value: "PER_DAY", label: "Par jour de retard" },
  { value: "ONE_TIME", label: "Une seule fois" },
];

export const ARREARS_POLICY_OPTIONS = [
  { value: "MUST_PAY_BEFORE_PAYOUT", label: "Doit payer avant de recevoir" },
  { value: "ALLOW_PAYOUT_WITH_ARREARS", label: "Distribution autorisee avec arrieres" },
];

export const SUSPENSION_POLICY_OPTIONS = [
  { value: "SUSPEND_MEMBER", label: "Suspendre le membre" },
  { value: "SUSPEND_PAYOUT_ONLY", label: "Suspendre la distribution uniquement" },
  { value: "SUSPEND_BOTH", label: "Suspendre membre et distribution" },
];

export const DEFAULT_POLICY_OPTIONS = [
  { value: "EXCLUDE_MEMBER", label: "Exclure le membre" },
  { value: "REPLACE_MEMBER", label: "Remplacer le membre" },
  { value: "KEEP_DEBT_RUNNING", label: "Garder la dette active" },
];

export const FEE_COLLECTION_MODE_OPTIONS = [
  { value: "ON_EACH_PAYOUT", label: "A chaque distribution" },
  { value: "ON_EACH_CONTRIBUTION", label: "A chaque cotisation" },
  { value: "END_OF_CYCLE", label: "En fin de cycle" },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Especes" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "WALLET_INTERNAL", label: "Portefeuille interne" },
];

export const KYC_LEVEL_OPTIONS = [
  { value: "NONE", label: "Aucun" },
  { value: "BASIC", label: "Basique (piece d'identite)" },
  { value: "FULL", label: "Complet (identite + adresse + revenus)" },
];

export const GROUP_ROLE_OPTIONS = [
  { value: "PRESIDENT", label: "President" },
  { value: "TRESORIER", label: "Tresorier" },
  { value: "SECRETAIRE", label: "Secretaire" },
];

export const APPROVAL_OPTIONS = [
  { value: "DISTRIBUTION", label: "Distributions" },
  { value: "REORDER", label: "Reordonnancement des tours" },
  { value: "MEMBER_JOIN", label: "Adhesion de membres" },
  { value: "MEMBER_EXIT", label: "Sortie de membres" },
];

export const WEEKDAY_LABELS = [
  { value: 0, label: "Dim" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
];

export const SEGMENT_OPTIONS = [
  { value: "", label: "Aucun" },
  { value: "BRONZE", label: "Bronze" },
  { value: "SILVER", label: "Argent" },
  { value: "GOLD", label: "Or" },
  { value: "PLATINUM", label: "Platine" },
];
