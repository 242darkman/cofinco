import { ChevronDown, ChevronRight } from "lucide-react";
import type { StepComponentProps } from "../types";

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
}

function OverrideSection({ label, enabled, onToggle, children }: OverrideSectionProps) {
  return (
    <div className="border border-edge-subtle rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-subtle/50 hover:bg-surface-subtle transition-colors"
      >
        <span className="text-sm font-medium text-content-primary">{label}</span>
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
      >
        <StepCalendar {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Distribution"
        enabled={formData.overrideDistribution}
        onToggle={(v) => updateField("overrideDistribution", v)}
      >
        <StepDistribution {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Penalites"
        enabled={formData.overridePenalties}
        onToggle={(v) => updateField("overridePenalties", v)}
      >
        <StepPenalties {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Adhesion & Sortie"
        enabled={formData.overrideEntryExit}
        onToggle={(v) => updateField("overrideEntryExit", v)}
      >
        <StepEntryExit {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Paiement"
        enabled={formData.overridePayment}
        onToggle={(v) => updateField("overridePayment", v)}
      >
        <StepPayment {...planStepProps} />
      </OverrideSection>

      <OverrideSection
        label="Gouvernance"
        enabled={formData.overrideGovernance}
        onToggle={(v) => updateField("overrideGovernance", v)}
      >
        <StepGovernance {...planStepProps} />
      </OverrideSection>
    </div>
  );
}
