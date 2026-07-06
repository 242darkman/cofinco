import React from 'react';
import { DecisionComite, DECISION_COMITE_LABELS } from '@shared/enum/status-constants';
import { formatMoney } from '@/lib/format';

interface CommitteeDecisionCardProps {
  decisionComite: string;
  montantApprouveComite?: string | number;
  commentaireComite?: string;
  conditionsSpeciales?: string;
  dateDecisionComite?: string;
}

export function CommitteeDecisionCard({
  decisionComite,
  montantApprouveComite,
  commentaireComite,
  conditionsSpeciales,
  dateDecisionComite,
}: CommitteeDecisionCardProps) {
  const isApproved = decisionComite === DecisionComite.APPROVED || decisionComite === DecisionComite.REDUCED_AMOUNT;
  const label = DECISION_COMITE_LABELS[decisionComite as keyof typeof DECISION_COMITE_LABELS] || decisionComite;

  return (
    <div className={`rounded-xl p-3.5 border ${
      isApproved ? 'bg-status-success-bg border-status-success/30' : 'bg-status-danger-bg border-status-danger/30'
    }`}>
      <h4 className={`text-xs font-medium mb-1.5 ${isApproved ? 'text-status-success' : 'text-status-danger'}`}>
        Décision du comité
      </h4>
      <p className="text-content-primary font-bold text-base">{label}</p>
      {montantApprouveComite && (
        <p className="text-content-secondary text-sm mt-1">
          Montant approuvé : {formatMoney(Number(montantApprouveComite))}
        </p>
      )}
      {commentaireComite && (
        <p className="text-content-muted mt-1.5 text-xs italic">"{commentaireComite}"</p>
      )}
      {conditionsSpeciales && (
        <p className="text-status-warning mt-1.5 text-xs">
          Conditions : {conditionsSpeciales}
        </p>
      )}
      {dateDecisionComite && (
        <p className="text-content-muted text-[11px] mt-1.5">
          Décision le {new Date(dateDecisionComite).toLocaleDateString('fr-FR')}
        </p>
      )}
    </div>
  );
}
