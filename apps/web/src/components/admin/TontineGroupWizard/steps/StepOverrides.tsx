import { ChevronDown, ChevronRight, PenLine } from "lucide-react";
import type { StepComponentProps } from "../types";
import { DEFAULT_FORM_DATA as PLAN_DEFAULTS } from "../../TontinePlanWizard/constants";

// Re-use step components from TontinePlanWizard
import StepCalendar from "../../TontinePlanWizard/steps/StepCalendar";
import StepDistribution from "../../TontinePlanWizard/steps/StepDistribution";
import StepPenalties from "../../TontinePlanWizard/steps/StepPenalties";
import StepEntryExit from "../../TontinePlanWizard/steps/StepEntryExit";
import StepPayment from "../../TontinePlanWizard/steps/StepPayment";
import StepGovernance from "../../TontinePlanWizard/steps/StepGovernance";

interface OverrideSectionProps {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  hasCustomValues?: boolean;
}

function OverrideSection({ label, enabled, onToggle, children, hasCustomValues }: OverrideSectionProps) {
  return (
    <div className={`border rounded-lg overflow-hidden ${
      hasCustomValues && !enabled ? 'border-status-warning/40' : 'border-edge-subtle'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-subtle/50 hover:bg-surface-subtle transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-content-primary">{label}</span>
          {hasCustomValues && !enabled && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-status-warning-bg text-status-warning">
              <PenLine size={9} />
              Modifie
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-content-muted">
            {enabled ? "Personnalise" : "Herite du modele"}
          </span>
          {enabled ? (
            <ChevronDown className="w-4 h-4 text-accent" />
          ) : (
            <ChevronRight className="w-4 h-4 text-content-muted" />
          )}
        </div>
      </button>
      {enabled && (
        <div className="px-4 py-4 border-t border-edge-subtle">
          {children}
        </div>
      )}
    </div>
  );
}

// Detect if any fields in a category differ from plan defaults (indicates prior customization)
function hasCustomCalendar(f: StepComponentProps['formData']): boolean {
  return f.firstContributionRule !== PLAN_DEFAULTS.firstContributionRule
    || f.collectionCalendarMode !== PLAN_DEFAULTS.collectionCalendarMode
    || f.weekdaysMask !== PLAN_DEFAULTS.weekdaysMask
    || f.shiftNonWorkingDay !== PLAN_DEFAULTS.shiftNonWorkingDay
    || f.timezone !== PLAN_DEFAULTS.timezone
    || f.gracePeriodContribution !== PLAN_DEFAULTS.gracePeriodContribution
    || f.preferredWeekday !== PLAN_DEFAULTS.preferredWeekday
    || f.holidayCalendarId !== PLAN_DEFAULTS.holidayCalendarId;
}
function hasCustomDistribution(f: StepComponentProps['formData']): boolean {
  return f.payoutOrderMode !== PLAN_DEFAULTS.payoutOrderMode
    || f.payoutFrequency !== PLAN_DEFAULTS.payoutFrequency
    || f.allowSwapPayoutOrder !== PLAN_DEFAULTS.allowSwapPayoutOrder
    || f.swapRequiresApproval !== PLAN_DEFAULTS.swapRequiresApproval
    || f.payoutRequiresContribPaid !== PLAN_DEFAULTS.payoutRequiresContribPaid
    || f.allowPartialDistribution !== PLAN_DEFAULTS.allowPartialDistribution
    || f.distributionMinThresholdPct !== PLAN_DEFAULTS.distributionMinThresholdPct;
}
function hasCustomPenalties(f: StepComponentProps['formData']): boolean {
  return f.penaltyEnabled !== PLAN_DEFAULTS.penaltyEnabled
    || f.penaltyType !== PLAN_DEFAULTS.penaltyType
    || f.penaltyValue !== PLAN_DEFAULTS.penaltyValue
    || f.penaltyApplication !== PLAN_DEFAULTS.penaltyApplication
    || f.arrearsPolicy !== PLAN_DEFAULTS.arrearsPolicy;
}
function hasCustomEntryExit(f: StepComponentProps['formData']): boolean {
  return f.joinFeeEnabled !== PLAN_DEFAULTS.joinFeeEnabled
    || f.exitAllowed !== PLAN_DEFAULTS.exitAllowed
    || f.replacementAllowed !== PLAN_DEFAULTS.replacementAllowed
    || f.transferMembershipAllowed !== PLAN_DEFAULTS.transferMembershipAllowed
    || f.allowMidCycleJoin !== PLAN_DEFAULTS.allowMidCycleJoin;
}
function hasCustomPayment(f: StepComponentProps['formData']): boolean {
  return JSON.stringify(f.allowedPaymentMethods) !== JSON.stringify(PLAN_DEFAULTS.allowedPaymentMethods)
    || f.defaultPaymentMethod !== PLAN_DEFAULTS.defaultPaymentMethod
    || f.cashMustGoToCaisse !== PLAN_DEFAULTS.cashMustGoToCaisse;
}
function hasCustomGovernance(f: StepComponentProps['formData']): boolean {
  return f.rolesEnabled !== PLAN_DEFAULTS.rolesEnabled
    || f.minKycLevel !== PLAN_DEFAULTS.minKycLevel;
}

export default function StepOverrides({ formData, updateField }: StepComponentProps) {
  const hasPlan = !!formData.planId;

  // Adapt updateField for TontinePlanWizard step components
  // They expect TontinePlanFormData keys, which overlap with TontineGroupFormData
  const planStepProps = { formData: formData as any, updateField: updateField as any };

  if (!hasPlan) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-content-secondary mb-4">
          Pas de modele selectionne. Configurez les regles manuellement.
        </p>
        <OverrideSection label="Calendrier" enabled={true} onToggle={() => {}}>
          <StepCalendar {...planStepProps} />
        </OverrideSection>
        <OverrideSection label="Distribution" enabled={true} onToggle={() => {}}>
          <StepDistribution {...planStepProps} />
        </OverrideSection>
        <OverrideSection label="Penalites" enabled={true} onToggle={() => {}}>
          <StepPenalties {...planStepProps} />
        </OverrideSection>
        <OverrideSection label="Adhesion & Sortie" enabled={true} onToggle={() => {}}>
          <StepEntryExit {...planStepProps} />
        </OverrideSection>
        <OverrideSection label="Paiement" enabled={true} onToggle={() => {}}>
          <StepPayment {...planStepProps} />
        </OverrideSection>
        <OverrideSection label="Gouvernance" enabled={true} onToggle={() => {}}>
          <StepGovernance {...planStepProps} />
        </OverrideSection>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-content-secondary mb-2">
        Les regles sont heritees du modele. Cliquez sur une section pour la personnaliser.
      </p>

      <OverrideSection
        label="Calendrier"
        enabled={formData.overrideCalendar}
        onToggle={(v) => updateField("overrideCalendar", v)}
        hasCustomValues={hasCustomCalendar(formData)}
      >
        <StepCalendar {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Distribution"
        enabled={formData.overrideDistribution}
        onToggle={(v) => updateField("overrideDistribution", v)}
        hasCustomValues={hasCustomDistribution(formData)}
      >
        <StepDistribution {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Penalites"
        enabled={formData.overridePenalties}
        onToggle={(v) => updateField("overridePenalties", v)}
        hasCustomValues={hasCustomPenalties(formData)}
      >
        <StepPenalties {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Adhesion & Sortie"
        enabled={formData.overrideEntryExit}
        onToggle={(v) => updateField("overrideEntryExit", v)}
        hasCustomValues={hasCustomEntryExit(formData)}
      >
        <StepEntryExit {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Paiement"
        enabled={formData.overridePayment}
        onToggle={(v) => updateField("overridePayment", v)}
        hasCustomValues={hasCustomPayment(formData)}
      >
        <StepPayment {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Gouvernance"
        enabled={formData.overrideGovernance}
        onToggle={(v) => updateField("overrideGovernance", v)}
        hasCustomValues={hasCustomGovernance(formData)}
      >
        <StepGovernance {...planStepProps} />
      </OverrideSection>
    </div>
  );
}
