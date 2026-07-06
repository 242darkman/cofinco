import React from 'react';
import { Check } from 'lucide-react';
import { ENQUETE_STEPS } from '../constants';

interface EnqueteStepperProps {
  currentStep: number;
}

export default function EnqueteStepper({ currentStep }: EnqueteStepperProps) {
  return (
    <>
      {/* Full stepper: sm+ */}
      <div className="hidden sm:flex items-center justify-between relative px-2">
        <div className="absolute left-6 right-6 top-[18px] h-px bg-edge-subtle -z-0" />
        {ENQUETE_STEPS.map((step) => {
          const isPast = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          const Icon = step.icon;
          return (
            <div key={step.num} className="flex flex-col items-center z-10 gap-1">
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${isPast
                    ? 'bg-accent text-white'
                    : isCurrent
                      ? 'bg-accent text-white ring-4 ring-accent/20 scale-110 shadow-lg shadow-accent/25'
                      : 'bg-surface-subtle/50 border border-edge-subtle text-content-muted'
                  }
                `}
              >
                {isPast ? <Check size={16} /> : <Icon size={16} />}
              </div>
              <span className={`text-[9px] font-medium leading-tight text-center max-w-[56px] ${
                isCurrent ? 'text-accent' : isPast ? 'text-content-secondary' : 'text-content-muted'
              }`}>
                {step.shortLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Compact dots: <sm */}
      <div className="flex sm:hidden items-center justify-center gap-1.5 py-1">
        {ENQUETE_STEPS.map((step) => {
          const isPast = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          return (
            <div
              key={step.num}
              className={`rounded-full transition-all duration-300 ${
                isCurrent
                  ? 'w-6 h-2 bg-accent shadow-sm shadow-accent/30'
                  : isPast
                    ? 'w-2 h-2 bg-accent/60'
                    : 'w-2 h-2 bg-edge'
              }`}
            />
          );
        })}
      </div>
    </>
  );
}
