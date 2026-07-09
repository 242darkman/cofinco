import React from 'react';
import { ChevronLeft, ChevronRight, Send, X } from 'lucide-react';
import { Button } from '../../../../ui';
import { TOTAL_ENQUETE_STEPS } from '../constants';

interface EnqueteFooterProps {
  step: number;
  setStep: (n: number) => void;
  setDirection: (d: 'forward' | 'backward') => void;
  isStepValid: (n: number) => boolean;
  isFormValid: boolean;
  isSubmitting: boolean;
  readOnly: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export default function EnqueteFooter({
  step, setStep, setDirection, isStepValid, isFormValid, isSubmitting, readOnly, onSubmit, onClose,
}: EnqueteFooterProps) {
  const isFirst = step === 1;
  const isLast = step === TOTAL_ENQUETE_STEPS;

  const goNext = () => {
    if (step < TOTAL_ENQUETE_STEPS) {
      setDirection('forward');
      setStep(step + 1);
    }
  };

  const goPrev = () => {
    if (step > 1) {
      setDirection('backward');
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
        <Button variant="ghost" size="sm" icon={X} onClick={onClose}>
          {readOnly ? 'Fermer' : 'Annuler'}
        </Button>

        {isLast ? (
          readOnly ? null : (
            <Button
              variant="success"
              size="md"
              icon={Send}
              onClick={onSubmit}
              disabled={!isFormValid || isSubmitting}
              isLoading={isSubmitting}
              className="min-w-[160px] w-full sm:w-auto"
            >
              Soumettre l'enquête
            </Button>
          )
        ) : (
          <Button
            variant="primary"
            size="md"
            icon={ChevronRight}
            iconPosition="right"
            onClick={goNext}
            disabled={!readOnly && !isStepValid(step)}
            className="min-w-[140px] w-full sm:w-auto"
          >
            Suivant
          </Button>
        )}
      </div>
    </div>
  );
}
