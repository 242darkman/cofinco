import { FileText, CalendarClock, Percent, Calendar, Wallet, AlertTriangle, Undo2, Shield, CheckCircle } from "lucide-react";
import type { StepDefinition, CreditPlanFormData, FeeFormRow } from "./types";

export const STEPS: StepDefinition[] = [
  { num: 1, key: "general", label: "Informations générales", shortLabel: "Général", icon: FileText },
  { num: 2, key: "duration", label: "Durée & Remboursement", shortLabel: "Durée", icon: CalendarClock },
  { num: 3, key: "interest", label: "Intérêts & Arrondis", shortLabel: "Intérêts", icon: Percent },
  { num: 4, key: "calendar", label: "Première Échéance", shortLabel: "Calendrier", icon: Calendar },
  { num: 5, key: "fees", label: "Frais", shortLabel: "Frais", icon: Wallet },
  { num: 6, key: "penalties", label: "Retard & Pénalités", shortLabel: "Pénalités", icon: AlertTriangle },
  { num: 7, key: "prepayment", label: "Remboursement Anticipé", shortLabel: "Anticipé", icon: Undo2 },
  { num: 8, key: "eligibility", label: "Éligibilité & Garanties", shortLabel: "Éligibilité", icon: Shield },
  { num: 9, key: "summary", label: "Résumé & Validation", shortLabel: "Résumé", icon: CheckCircle },
];

export const TOTAL_STEPS = STEPS.length;

export const AUTO_SAVE_KEY = "cofinco_credit_plan_draft";

export const DEFAULT_FORM_DATA: CreditPlanFormData = {
  // Step 1
  nom: "",
  description: "",
  typeCredit: "PERSONAL",
  montantMin: "",
  montantMax: "",
  // Step 2
  dureeValeur: "30",
  dureeUnite: "DAY",
  frequenceRemboursement: "DAILY",
  amortizationType: "EQUAL_INSTALLMENTS",
  allowPartialPayments: true,
  // Step 3
  tauxInteret: "10",
  interestMethod: "FLAT",
  interestRatePeriod: "MONTHLY",
  dayCountConvention: "30_360",
  interestRoundingMode: "ROUND",
  interestRoundingUnit: "1",
  // Step 4
  firstDueRule: "NEXT_DAY",
  gracePeriodDays: "0",
  preferredWeekday: "",
  calendarMode: "ALL_DAYS",
  weekdaysMask: 127,
  shiftNonWorkingDay: "NEXT",
  holidayCalendarId: "",
  allowManualFirstDueDate: false,
  // Step 6
  lateFeeEnabled: true,
  lateFeeGraceDays: "0",
  lateFeeType: "PERCENTAGE",
  lateFeeValue: "2",
  lateInterestEnabled: false,
  lateInterestRate: "",
  penaltyCap: "",
  penaltyApplication: "PER_INSTALLMENT",
  // Step 7
  prepaymentAllowed: true,
  prepaymentFeeType: "NONE",
  prepaymentFeeValue: "",
  prepaymentInterestRebate: false,
  // Step 8
  minSegment: "",
  minScoreGlobal: "",
  minPointsFidelite: "",
  minTauxRemboursement: "",
  kycRequired: false,
  maxDebtToIncomeRatio: "",
  requireSavingsAccount: false,
  collateralRequired: false,
  collateralTypes: [],
  guaranteeDepositPercent: "",
  guaranteeDepositMin: "",
  guaranteeReleaseRule: "ON_FULL_REPAYMENT",
  // Governance
  effectiveFrom: "",
  effectiveTo: "",
  conditions: "",
  documentsRequis: "",
  agenceId: "",
};

export const EMPTY_FEE: FeeFormRow = {
  feeType: "DOSSIER",
  label: "",
  calcType: "FIXED",
  value: "",
  minAmount: "",
  maxAmount: "",
  collectionMode: "UPFRONT",
  isRefundable: false,
  accountingCode: "",
};

// Options for select fields
export const TYPE_CREDIT_OPTIONS = [
  { value: "PERSONAL", label: "Personnel" },
  { value: "REAL_ESTATE", label: "Immobilier" },
  { value: "COMMERCIAL", label: "Commercial" },
];

export const DUREE_UNITE_OPTIONS = [
  { value: "DAY", label: "Jours" },
  { value: "WEEK", label: "Semaines" },
  { value: "MONTH", label: "Mois" },
];

export const FREQUENCE_OPTIONS = [
  { value: "DAILY", label: "Journalier" },
  { value: "WEEKLY", label: "Hebdomadaire" },
  { value: "BI_MONTHLY", label: "Bi-mensuel" },
  { value: "MONTHLY", label: "Mensuel" },
  { value: "QUARTERLY", label: "Trimestriel" },
];

export const AMORTIZATION_OPTIONS = [
  { value: "EQUAL_INSTALLMENTS", label: "Annuités constantes", description: "Chaque échéance est identique (capital + intérêts)" },
  { value: "EQUAL_PRINCIPAL", label: "Capital constant", description: "Le capital remboursé est fixe, les intérêts diminuent" },
  { value: "INTEREST_ONLY_THEN_BALLOON", label: "In fine (intérêt puis ballon)", description: "Intérêts seuls puis capital total à la dernière échéance" },
];

export const INTEREST_METHOD_OPTIONS = [
  { value: "FLAT", label: "Taux fixe (Flat)" },
  { value: "DECLINING_BALANCE", label: "Dégressif (Declining balance)" },
];

export const INTEREST_RATE_PERIOD_OPTIONS = [
  { value: "DAILY", label: "Journalier" },
  { value: "MONTHLY", label: "Mensuel" },
  { value: "ANNUAL", label: "Annuel" },
];

export const DAY_COUNT_OPTIONS = [
  { value: "ACT_365", label: "Exact/365" },
  { value: "ACT_360", label: "Exact/360" },
  { value: "30_360", label: "30/360" },
];

export const ROUNDING_MODE_OPTIONS = [
  { value: "ROUND", label: "Arrondi standard" },
  { value: "FLOOR", label: "Arrondi inférieur" },
  { value: "CEIL", label: "Arrondi supérieur" },
];

export const ROUNDING_UNIT_OPTIONS = [
  { value: "1", label: "1 (unité)" },
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

export const FIRST_DUE_RULE_OPTIONS = [
  { value: "NEXT_DAY", label: "Lendemain" },
  { value: "NEXT_BUSINESS_DAY", label: "Prochain jour ouvré" },
  { value: "AFTER_N_DAYS", label: "Après N jours (grâce)" },
  { value: "NEXT_WEEKDAY", label: "Prochain jour de la semaine" },
  { value: "END_OF_WEEK", label: "Fin de semaine" },
  { value: "END_OF_MONTH", label: "Fin de mois" },
  { value: "CUSTOM_DATE_ALLOWED", label: "Date manuelle autorisée" },
];

export const CALENDAR_MODE_OPTIONS = [
  { value: "ALL_DAYS", label: "Tous les jours" },
  { value: "BUSINESS_DAYS_ONLY", label: "Jours ouvrés uniquement" },
  { value: "CUSTOM_WEEKDAYS", label: "Jours personnalisés" },
];

export const SHIFT_OPTIONS = [
  { value: "NEXT", label: "Reporter au suivant" },
  { value: "PREVIOUS", label: "Avancer au précédent" },
  { value: "NEAREST", label: "Le plus proche" },
];

export const FEE_TYPE_OPTIONS = [
  { value: "DOSSIER", label: "Frais de dossier" },
  { value: "ASSURANCE", label: "Assurance" },
  { value: "NOTAIRE", label: "Frais de notaire" },
  { value: "TIMBRES", label: "Timbres fiscaux" },
  { value: "COMMISSION", label: "Commission" },
  { value: "CUSTOM", label: "Autre" },
];

export const FEE_CALC_TYPE_OPTIONS = [
  { value: "FIXED", label: "Montant fixe" },
  { value: "PERCENTAGE", label: "Pourcentage du capital" },
];

export const FEE_COLLECTION_MODE_OPTIONS = [
  { value: "UPFRONT", label: "À l'avance" },
  { value: "DEDUCTED_FROM_PRINCIPAL", label: "Déduit du capital" },
  { value: "SPREAD", label: "Réparti sur les échéances" },
  { value: "ON_DISBURSEMENT", label: "Au décaissement" },
];

export const LATE_FEE_TYPE_OPTIONS = [
  { value: "FIXED", label: "Montant fixe" },
  { value: "PERCENTAGE", label: "Pourcentage" },
];

export const PENALTY_APPLICATION_OPTIONS = [
  { value: "PER_INSTALLMENT", label: "Par échéance" },
  { value: "ON_TOTAL_OVERDUE", label: "Sur total impayé" },
  { value: "DAILY_ACCRUAL", label: "Cumul journalier" },
];

export const PREPAYMENT_FEE_TYPE_OPTIONS = [
  { value: "NONE", label: "Aucun frais" },
  { value: "FIXED", label: "Montant fixe" },
  { value: "PERCENTAGE_OF_REMAINING", label: "% du solde restant" },
  { value: "PERCENTAGE_OF_PREPAID", label: "% du montant remboursé" },
];

export const SEGMENT_OPTIONS = [
  { value: "", label: "Aucun minimum" },
  { value: "RISQUE", label: "Risque" },
  { value: "STANDARD", label: "Standard" },
  { value: "PREMIUM", label: "Premium" },
  { value: "VIP", label: "VIP" },
];

export const GUARANTEE_RELEASE_OPTIONS = [
  { value: "ON_FULL_REPAYMENT", label: "Au remboursement complet" },
  { value: "ON_PERCENTAGE_REPAID", label: "Après % remboursé" },
  { value: "MANUAL", label: "Libération manuelle" },
];

export const COLLATERAL_TYPE_OPTIONS = [
  { value: "IMMOBILIER", label: "Bien immobilier" },
  { value: "VEHICULE", label: "Véhicule" },
  { value: "EQUIPEMENT", label: "Équipement" },
  { value: "DEPOT_GARANTIE", label: "Dépôt de garantie" },
  { value: "CAUTION_SOLIDAIRE", label: "Caution solidaire" },
  { value: "AUTRE", label: "Autre" },
];

export const WEEKDAY_LABELS = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];
