import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Button } from "../../../ui";
import { TOTAL_STEPS } from "../constants";

interface WizardFooterProps {
  step: number;
  setStep: (n: number) => void;
  setDirection: (d: "forward" | "backward") => void;
  isStepValid: (n: number) => boolean;
  isFormValid: boolean;
  isSubmitting: boolean;
  onSave: () => void;
  onCancel: () => void;
  isEditMode: boolean;
}

export default function WizardFooter({
  step,
  setStep,
  setDirection,
  isStepValid,
  isFormValid,
  isSubmitting,
  onSave,
  onCancel,
  isEditMode,
}: WizardFooterProps) {
  const isFirst = step === 1;
  const isLast = step === TOTAL_STEPS;

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      setDirection("forward");
      setStep(step + 1);
    }
  };

  const goPrev = () => {
    if (step > 1) {
      setDirection("backward");
      setStep(step - 1);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-4 border-t border-edge bg-surface-base flex-shrink-0 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div>
        {!isFirst && (
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={goPrev}>
            Précédent
          </Button>
        )}
      </div>
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        {isLast ? (
          <Button
            variant="success"
            size="md"
            icon={Save}
            onClick={onSave}
            disabled={!isFormValid || isSubmitting}
            isLoading={isSubmitting}
            className="min-w-[140px] w-full sm:w-auto"
          >
            {isEditMode ? "Enregistrer" : "Créer le plan"}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            icon={ChevronRight}
            iconPosition="right"
            onClick={goNext}
            disabled={!isStepValid(step)}
            className="min-w-[140px] w-full sm:w-auto"
          >
            Suivant
          </Button>
        )}
      </div>
    </div>
  );
}
