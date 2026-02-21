import { Check } from "lucide-react";
import { STEPS } from "../constants";

interface WizardStepperProps {
  currentStep: number;
  onGoToStep?: (step: number) => void;
}

export default function WizardStepper({ currentStep, onGoToStep }: WizardStepperProps) {
  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center justify-between px-4 py-3 border-b border-edge overflow-x-auto">
        {STEPS.map((step, i) => {
          const isPast = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          const isClickable = isPast && onGoToStep;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onGoToStep(step.num)}
                className={`flex flex-col items-center gap-1 group ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200
                    ${isPast ? "bg-accent text-white" : ""}
                    ${isCurrent ? "bg-accent text-white ring-4 ring-accent/20 scale-110 shadow-lg" : ""}
                    ${!isPast && !isCurrent ? "bg-surface-subtle/50 border border-edge-subtle text-content-muted" : ""}
                    ${isClickable ? "hover:ring-2 hover:ring-accent/30" : ""}
                  `}
                >
                  {isPast ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] leading-tight text-center max-w-[70px] ${isCurrent ? "text-accent font-semibold" : "text-content-muted"}`}>
                  {step.shortLabel}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px mx-1 ${isPast ? "bg-accent" : "bg-edge-subtle"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile compact dots */}
      <div className="flex sm:hidden items-center justify-center gap-1.5 py-2 border-b border-edge">
        {STEPS.map((step) => {
          const isPast = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          const isClickable = isPast && onGoToStep;

          return (
            <button
              key={step.key}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onGoToStep(step.num)}
              className={`rounded-full transition-all duration-200
                ${isCurrent ? "w-6 h-2 bg-accent" : "w-2 h-2"}
                ${isPast ? "bg-accent/60" : ""}
                ${!isPast && !isCurrent ? "bg-edge-subtle" : ""}
              `}
            />
          );
        })}
      </div>
    </>
  );
}
