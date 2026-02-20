import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";

export interface StepDefinition {
  num: number;
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export interface FeeFormRow {
  feeType: string;
  label: string;
  calcType: "FIXED" | "PERCENTAGE";
  value: string;
  minAmount: string;
  maxAmount: string;
  collectionMode: string;
  isRefundable: boolean;
  accountingCode: string;
}

export interface CreditPlanFormData {
  // Step 1: General
  nom: string;
  description: string;
  typeCredit: string;
  montantMin: string;
  montantMax: string;

  // Step 2: Duration & Repayment
  dureeValeur: string;
  dureeUnite: string;
  frequenceRemboursement: string;
  amortizationType: string;
  allowPartialPayments: boolean;

  // Step 3: Interest
  tauxInteret: string;
  interestMethod: string;
  interestRatePeriod: string;
  dayCountConvention: string;
  interestRoundingMode: string;
  interestRoundingUnit: string;

  // Step 4: Calendar & First Due Date
  firstDueRule: string;
  gracePeriodDays: string;
  preferredWeekday: string;
  calendarMode: string;
  weekdaysMask: number;
  shiftNonWorkingDay: string;
  holidayCalendarId: string;
  allowManualFirstDueDate: boolean;

  // Step 6: Penalties
  lateFeeEnabled: boolean;
  lateFeeGraceDays: string;
  lateFeeType: string;
  lateFeeValue: string;
  lateInterestEnabled: boolean;
  lateInterestRate: string;
  penaltyCap: string;
  penaltyApplication: string;

  // Step 7: Prepayment
  prepaymentAllowed: boolean;
  prepaymentFeeType: string;
  prepaymentFeeValue: string;
  prepaymentInterestRebate: boolean;

  // Step 8: Eligibility & Collateral
  minSegment: string;
  minScoreGlobal: string;
  minPointsFidelite: string;
  minTauxRemboursement: string;
  kycRequired: boolean;
  maxDebtToIncomeRatio: string;
  requireSavingsAccount: boolean;
  collateralRequired: boolean;
  collateralTypes: string[];
  guaranteeDepositPercent: string;
  guaranteeDepositMin: string;
  guaranteeReleaseRule: string;

  // Governance
  effectiveFrom: string;
  effectiveTo: string;
  conditions: string;
  documentsRequis: string;
  agenceId: string;
}

export interface StepComponentProps {
  formData: CreditPlanFormData;
  updateField: (key: string, value: any) => void;
  fees: FeeFormRow[];
  setFees: Dispatch<SetStateAction<FeeFormRow[]>>;
}
