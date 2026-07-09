import React from 'react';
import { Shield, Users, CheckCircle, Ban, Loader2, AlertTriangle } from 'lucide-react';
import { StatutReevaluation } from '@shared/enum/status-constants';
import type { Reevaluation, ActionContext } from '../types';

interface FinalDecisionCardProps {
  reevaluation: Reevaluation;
  actionLoading: string | null;
  actionContext: ActionContext | null;
  canValidateEligibility: boolean;
  canDecide: boolean;
  canSubmitToCommittee: boolean;
  canCancel: boolean;
  onValidateEligibility: () => void;
  onSubmitToCommittee: () => void;
  onCancel: () => void;
  onOpenDecisionModal: () => void;
}

const TERMINAL_STATUSES: readonly string[] = [
  StatutReevaluation.APPROVED,
  StatutReevaluation.DEFINITIVELY_REJECTED,
  StatutReevaluation.CANCELLED,
  StatutReevaluation.REFUSED,
];

export function FinalDecisionCard({
  reevaluation,
  actionLoading,
  actionContext,
  canValidateEligibility,
  canDecide,
  canSubmitToCommittee,
  canCancel,
  onValidateEligibility,
  onSubmitToCommittee,
  onCancel,
  onOpenDecisionModal,
}: FinalDecisionCardProps) {
  if (reevaluation.verrouille || TERMINAL_STATUSES.includes(reevaluation.statut)) return null;

  const hasConflict = actionContext?.hasConflictOfInterest ?? false;

  return (
    <div className="bg-surface rounded-xl border border-edge overflow-hidden">
      <div className="px-3 py-2.5 border-b border-edge">
        <h3 className="text-xs font-bold text-content-primary">Décision finale</h3>
        <p className="text-[11px] text-content-muted mt-0.5">Action irréversible après validation.</p>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Primary action */}
        {(reevaluation.statut === StatutReevaluation.REQUESTED || reevaluation.statut === StatutReevaluation.ELIGIBILITY_CHECK) && (
          <button
            onClick={onValidateEligibility}
            disabled={actionLoading !== null || !canValidateEligibility}
            className="w-full px-3 py-2.5 bg-accent hover:bg-accent/90 text-content-inverted rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'eligibility' ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            Vérifier l'éligibilité
          </button>
        )}

        {reevaluation.statut === StatutReevaluation.AUTHORIZED && (
          <button
            onClick={onSubmitToCommittee}
            disabled={actionLoading !== null || !canSubmitToCommittee}
            className="w-full px-3 py-2.5 bg-status-warning hover:bg-status-warning/90 text-content-inverted rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'committee' ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
            Soumettre au comité
          </button>
        )}

        {reevaluation.statut === StatutReevaluation.IN_COMMITTEE && (
          <button
            onClick={onOpenDecisionModal}
            disabled={actionLoading !== null || !canDecide || hasConflict}
            className="w-full px-3 py-2.5 bg-btn-success hover:bg-btn-success-hover text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} />
            Valider la décision
          </button>
        )}

        {/* Cancel */}
        <button
          onClick={onCancel}
          disabled={actionLoading !== null || !canCancel}
          className="w-full px-3 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-secondary rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-edge"
        >
          {actionLoading === 'cancel' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
          Rejeter le dossier
        </button>

        {/* Warnings */}
        {reevaluation.statut === StatutReevaluation.IN_COMMITTEE && hasConflict && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-danger-bg border border-status-danger/30">
            <AlertTriangle size={13} className="text-status-danger shrink-0 mt-0.5" />
            <p className="text-[11px] text-status-danger leading-snug">
              <strong>Conflit d'intérêts :</strong> Vous avez validé l'éligibilité initiale, vous ne pouvez pas signer en tant que décideur final.
            </p>
          </div>
        )}

        {(reevaluation.statut === StatutReevaluation.REQUESTED || reevaluation.statut === StatutReevaluation.ELIGIBILITY_CHECK) && !canValidateEligibility && (
          <p className="text-[11px] text-status-warning text-center">
            Seuls le Chef d'agence et le Gestionnaire crédit peuvent valider l'éligibilité.
          </p>
        )}

        {reevaluation.statut === StatutReevaluation.AUTHORIZED && !canSubmitToCommittee && (
          <p className="text-[11px] text-status-warning text-center">
            Vous n'avez pas la permission de soumettre au comité.
          </p>
        )}

        {reevaluation.statut === StatutReevaluation.IN_COMMITTEE && !canDecide && !hasConflict && (
          <p className="text-[11px] text-status-warning text-center">
            Vous n'avez pas la permission d'enregistrer une décision.
          </p>
        )}
      </div>
    </div>
  );
}
