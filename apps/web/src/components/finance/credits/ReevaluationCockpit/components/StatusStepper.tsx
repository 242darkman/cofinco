import React from 'react';
import { Check } from 'lucide-react';
import { StatutReevaluation, STATUT_REEVALUATION_LABELS } from '@shared/enum/status-constants';
import type { Actors, Reevaluation } from '../types';

export interface StepDefinition {
  id: string;
  label: string;
  status: string[];
}

interface StatusStepperProps {
  currentStatus: string;
  onStepClick: (step: StepDefinition) => void;
  actors?: Actors | null;
  reevaluation?: Reevaluation | null;
}

const STEPS: StepDefinition[] = [
  { id: 'request', label: STATUT_REEVALUATION_LABELS[StatutReevaluation.REQUESTED], status: [StatutReevaluation.REQUESTED, StatutReevaluation.ELIGIBILITY_CHECK] },
  { id: 'authorized', label: STATUT_REEVALUATION_LABELS[StatutReevaluation.AUTHORIZED], status: [StatutReevaluation.AUTHORIZED, StatutReevaluation.ADDITIONAL_INVESTIGATION] },
  { id: 'committee', label: STATUT_REEVALUATION_LABELS[StatutReevaluation.IN_COMMITTEE], status: [StatutReevaluation.IN_COMMITTEE] },
  { id: 'decision', label: 'Décision', status: [StatutReevaluation.APPROVED, StatutReevaluation.DEFINITIVELY_REJECTED, StatutReevaluation.REFUSED, StatutReevaluation.CANCELLED] },
];

const TERMINAL_STATUSES: readonly string[] = [StatutReevaluation.REFUSED, StatutReevaluation.DEFINITIVELY_REJECTED, StatutReevaluation.APPROVED, StatutReevaluation.CANCELLED];

function getCurrentStepIndex(currentStatus: string): number {
  if (TERMINAL_STATUSES.includes(currentStatus)) return 3;
  if (currentStatus === StatutReevaluation.IN_COMMITTEE) return 2;
  if ([StatutReevaluation.AUTHORIZED, StatutReevaluation.ADDITIONAL_INVESTIGATION].includes(currentStatus as any)) return 1;
  return 0;
}

export function StatusStepper({ currentStatus, onStepClick, actors, reevaluation }: StatusStepperProps) {
  const activeIndex = getCurrentStepIndex(currentStatus);

  const getStepActor = (stepId: string): { name: string; date: string } | null => {
    if (!actors || !reevaluation) return null;
    switch (stepId) {
      case 'request':
        return actors.createdBy?.nom ? { name: actors.createdBy.nom, date: new Date(reevaluation.createdAt).toLocaleDateString('fr-FR') } : null;
      case 'authorized':
        return actors.validePar?.nom && reevaluation.dateValidationEligibilite
          ? { name: actors.validePar.nom, date: new Date(reevaluation.dateValidationEligibilite).toLocaleDateString('fr-FR') }
          : null;
      case 'decision':
        return actors.decidePar?.nom && reevaluation.dateDecisionComite
          ? { name: actors.decidePar.nom, date: new Date(reevaluation.dateDecisionComite).toLocaleDateString('fr-FR') }
          : null;
      default:
        return null;
    }
  };

  return (
    <div className="w-full pt-2 pb-14" role="navigation" aria-label="Étapes du workflow">
      <div className="relative flex items-center justify-between w-full max-w-3xl mx-auto px-4">
        {/* Background connector */}
        <div className="absolute left-4 right-4 top-[12px] h-0.5 bg-surface -z-10" />
        {/* Active connector */}
        <div
          className="absolute left-4 top-[12px] h-0.5 bg-accent-secondary -z-10 transition-all duration-500"
          style={{ width: `calc(${(activeIndex / (STEPS.length - 1)) * 100}% - 32px)` }}
        />

        {STEPS.map((step, index) => {
          const isActive = index <= activeIndex;
          const isCurrent = index === activeIndex;
          const isClickable = index <= activeIndex;
          const actor = isActive && index < activeIndex ? getStepActor(step.id) : null;

          return (
            <div
              key={step.id}
              className={`flex flex-col items-center gap-1.5 relative group ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={() => isClickable && onStepClick(step)}
              role="button"
              aria-label={`Étape: ${step.label}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-surface-base z-10 ${
                  isActive
                    ? 'bg-surface-base border-accent text-accent shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                    : 'bg-surface-base border-edge text-content-muted'
                } ${isCurrent ? 'scale-110 ring-2 ring-accent/10' : ''}`}
              >
                {isActive ? <Check size={12} strokeWidth={3} /> : <span className="text-[10px] font-bold">{index + 1}</span>}
              </div>

              <div className="absolute top-7 flex flex-col items-center w-32">
                <span className={`text-[10px] font-bold tracking-wide transition-colors ${isActive ? 'text-content-primary' : 'text-content-muted'}`}>
                  {step.label}
                </span>
                {isCurrent && (
                  <span className="text-[9px] text-accent font-medium animate-pulse">En cours</span>
                )}
                {actor && (
                  <span className="text-[9px] text-content-muted truncate max-w-full" title={`${actor.name} — ${actor.date}`}>
                    {actor.name} · {actor.date}
                  </span>
                )}
              </div>

              {isClickable && (
                <div className="absolute -top-6 px-1.5 py-0.5 bg-surface text-[10px] text-content-primary rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-edge">
                  Voir
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
