import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
  step, setStep, setDirection,
  isStepValid, isFormValid, isSubmitting,
  onSave, onCancel, isEditMode,
}: WizardFooterProps) {
  const isLastStep = step === TOTAL_STEPS;

  const goNext = () => {
    setDirection("forward");
    setStep(step + 1);
  };

  const goPrev = () => {
    setDirection("backward");
    setStep(step - 1);
  };

  return (
    <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 px-6 py-4 border-t border-edge bg-surface-subtle/30">
      <div className="flex-1">
        {step > 1 && (
          <button
            type="button"
            onClick={goPrev}
            className="flex items-center gap-1 px-3 py-2 text-sm text-content-secondary hover:text-content-primary rounded-lg hover:bg-surface-subtle transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Precedent
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-content-secondary hover:text-content-primary rounded-lg hover:bg-surface-subtle transition-colors"
        >
          Annuler
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={onSave}
            disabled={!isFormValid || isSubmitting}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors
              bg-btn-success text-white hover:bg-btn-success/90
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditMode ? "Enregistrer" : "Creer la tontine"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!isStepValid(step)}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors
              bg-accent text-white hover:bg-accent/90
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
