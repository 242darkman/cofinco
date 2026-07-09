import React from 'react';
import { TrendingUp, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import type { CreditPlanInfo, EnqueteFormData } from '../types';

interface LiveScoringPanelProps {
  debtRatio: {
    revenuNet: number;
    echeanceEstimee: number;
    tauxEndettement: number;
    riskLevel: 'good' | 'acceptable' | 'risky';
    dureeLabel: string;
    planMaxRatio: number;
  };
  formData: EnqueteFormData;
  creditPlan: CreditPlanInfo | null;
}

export default function LiveScoringPanel({ debtRatio, formData, creditPlan }: LiveScoringPanelProps) {
  const riskColors = { good: 'text-status-success', acceptable: 'text-status-warning', risky: 'text-status-danger' };
  const riskBg = { good: 'bg-status-success-bg', acceptable: 'bg-status-warning-bg', risky: 'bg-status-danger-bg' };
  const riskLabels = { good: 'Bon', acceptable: 'Correct', risky: 'Risqué' };

  // Plan compliance checks
  const montant = parseFloat(formData.montant_demande) || 0;
  const planMin = creditPlan?.montantMin ? parseFloat(creditPlan.montantMin) : null;
  const planMax = creditPlan?.montantMax ? parseFloat(creditPlan.montantMax) : null;
  const amountInRange = (!planMin || montant >= planMin) && (!planMax || montant <= planMax);
  const hasGaranties = formData.garanties_proposees.length > 0;
  const collateralOk = !creditPlan?.collateralRequired || hasGaranties;
  const docsRequired = creditPlan?.documentsRequis?.length || 0;
  const docsFilled = formData.documents_justificatifs.length;
  const docsOk = docsRequired === 0 || docsFilled >= docsRequired;
  const ratioOk = debtRatio.riskLevel !== 'risky';

  const ComplianceItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-xs">
      {ok ? <CheckCircle size={14} className="text-status-success" /> : <XCircle size={14} className="text-status-danger" />}
      <span className={ok ? 'text-content-primary' : 'text-status-danger'}>{label}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Scoring panel */}
      <div className={`p-4 rounded-lg border ${riskBg[debtRatio.riskLevel]} border-edge`}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-content-secondary" />
          <span className="text-sm font-semibold text-content-primary">Analyse Financière</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-xs text-content-muted">Revenu net mensuel</span>
            <p className="text-lg font-bold text-content-primary">{debtRatio.revenuNet.toLocaleString('fr-FR')}</p>
          </div>
          <div>
            <span className="text-xs text-content-muted">Échéance estimée</span>
            <p className="text-lg font-bold text-content-primary">{debtRatio.echeanceEstimee.toLocaleString('fr-FR')}</p>
            <p className="text-[10px] text-content-muted">{debtRatio.dureeLabel}</p>
          </div>
          <div>
            <span className="text-xs text-content-muted">Ratio d'endettement</span>
            <p className={`text-2xl font-bold ${riskColors[debtRatio.riskLevel]}`}>
              {debtRatio.tauxEndettement.toFixed(1)}%
            </p>
            <p className={`text-xs font-medium ${riskColors[debtRatio.riskLevel]}`}>
              {riskLabels[debtRatio.riskLevel]}
            </p>
          </div>
          <div>
            <span className="text-xs text-content-muted">Seuil du plan</span>
            <p className="text-lg font-bold text-content-primary">{debtRatio.planMaxRatio}%</p>
          </div>
        </div>
      </div>

      {/* Plan compliance summary */}
      {creditPlan && (
        <div className="bg-surface p-3 rounded-lg border border-edge">
          <span className="text-xs font-semibold text-content-secondary mb-2 block">Conformité au Plan "{creditPlan.nom}"</span>
          <div className="space-y-1.5">
            <ComplianceItem ok={amountInRange} label={`Montant ${amountInRange ? 'dans' : 'hors'} la plage (${planMin?.toLocaleString('fr-FR') || '—'} - ${planMax?.toLocaleString('fr-FR') || '—'})`} />
            {creditPlan.collateralRequired && (
              <ComplianceItem ok={collateralOk} label={`Garanties ${collateralOk ? 'fournies' : 'manquantes'} (${formData.garanties_proposees.length} proposée(s))`} />
            )}
            {docsRequired > 0 && (
              <ComplianceItem ok={docsOk} label={`Documents ${docsOk ? 'complets' : 'incomplets'} (${docsFilled}/${docsRequired})`} />
            )}
            <ComplianceItem ok={ratioOk} label={`Ratio d'endettement ${ratioOk ? 'acceptable' : 'trop élevé'} (${debtRatio.tauxEndettement.toFixed(1)}% vs ${debtRatio.planMaxRatio}%)`} />
          </div>
        </div>
      )}
    </div>
  );
}
