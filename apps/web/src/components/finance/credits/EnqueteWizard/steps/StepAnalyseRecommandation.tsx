import React from 'react';
import { ThumbsUp, ThumbsDown, AlertTriangle, DollarSign, Activity, MessageSquare, Tag } from 'lucide-react';
import LiveScoringPanel from '../components/LiveScoringPanel';
import { useDebtRatioCalculation } from '../hooks/useDebtRatioCalculation';
import type { EnqueteFormData, CreditPlanInfo } from '../types';

interface StepAnalyseRecommandationProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  markTouched: (field: string) => void;
  getFieldError: (field: string) => string | null;
}

const RECOMMENDATIONS = [
  { value: 'APPROVE', label: 'Approuver', icon: ThumbsUp, color: 'text-status-success', bgColor: 'bg-status-success-bg border-status-success/30' },
  { value: 'APPROVE_WITH_CONDITIONS', label: 'Approuver avec conditions', icon: AlertTriangle, color: 'text-status-warning', bgColor: 'bg-status-warning-bg border-status-warning/30' },
  { value: 'REJECT', label: 'Rejeter', icon: ThumbsDown, color: 'text-status-danger', bgColor: 'bg-status-danger-bg border-status-danger/30' },
];

const RISK_LEVELS = [
  { value: 'LOW', label: 'Faible', color: 'text-status-success' },
  { value: 'MEDIUM', label: 'Moyen', color: 'text-status-warning' },
  { value: 'HIGH', label: 'Élevé', color: 'text-status-danger' },
];

const RISK_FACTOR_OPTIONS = [
  'Revenu instable', 'Activité récente', 'Charges élevées', 'Historique de crédit défavorable',
  'Garanties insuffisantes', 'Zone à risque', 'Client non coopératif', 'Documents manquants',
  'Activité saisonnière', 'Endettement multiple',
];

export default function StepAnalyseRecommandation({
  formData, updateField, readOnly, creditPlan, markTouched, getFieldError,
}: StepAnalyseRecommandationProps) {
  const debtRatio = useDebtRatioCalculation({
    montant: parseFloat(formData.montant_demande) || 0,
    revenuMensuel: parseFloat(formData.revenu_mensuel_declare) || 0,
    chargesMensuelles: parseFloat(formData.charges_mensuelles) || 0,
    autresCredits: formData.autres_credits,
    creditPlan,
  });

  const toggleRiskFactor = (factor: string) => {
    const current = formData.riskFactors;
    if (current.includes(factor)) {
      updateField('riskFactors', current.filter(f => f !== factor));
    } else {
      updateField('riskFactors', [...current, factor]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live scoring */}
      <LiveScoringPanel debtRatio={debtRatio} formData={formData} creditPlan={creditPlan} />

      {/* Agent recommendation */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          Recommandation de l'Agent *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RECOMMENDATIONS.map(rec => {
            const Icon = rec.icon;
            const isSelected = formData.agentRecommendation === rec.value;
            return (
              <button
                key={rec.value}
                type="button"
                onClick={() => { updateField('agentRecommendation', rec.value); markTouched('agentRecommendation'); }}
                className={`flex items-center gap-2 p-3 rounded-lg border text-xs font-medium transition ${
                  isSelected
                    ? `${rec.bgColor} ${rec.color} ring-2 ring-offset-1`
                    : 'border-edge hover:border-accent/30 text-content-secondary'
                }`}
              >
                <Icon size={16} />
                {rec.label}
              </button>
            );
          })}
        </div>
        {getFieldError('agentRecommendation') && (
          <p className="text-xs text-status-danger mt-1">{getFieldError('agentRecommendation')}</p>
        )}
      </div>

      {/* Montant recommandé */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <DollarSign size={14} className="inline mr-1.5" />
          Montant Recommandé *
        </label>
        <input
          type="number"
          min="0"
          value={formData.recommendedAmount}
          onChange={(e) => updateField('recommendedAmount', e.target.value)}
          onBlur={() => markTouched('recommendedAmount')}
          placeholder="Montant recommandé"
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus"
        />
        {creditPlan && (
          <p className="text-xs text-content-muted mt-1">
            Plage du plan : {Number(creditPlan.montantMin || 0).toLocaleString('fr-FR')} - {Number(creditPlan.montantMax || 0).toLocaleString('fr-FR')}
          </p>
        )}
      </div>

      {/* Niveau de risque */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <Activity size={14} className="inline mr-1.5" />
          Niveau de Risque *
        </label>
        <div className="flex gap-2">
          {RISK_LEVELS.map(level => (
            <button
              key={level.value}
              type="button"
              onClick={() => { updateField('riskLevel', level.value); markTouched('riskLevel'); }}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition ${
                formData.riskLevel === level.value
                  ? `${level.color} border-current bg-current/5 ring-1 ring-current/30`
                  : 'border-edge text-content-muted hover:border-accent/30'
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>

      {/* Facteurs de risque */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <Tag size={14} className="inline mr-1.5" />
          Facteurs de Risque
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RISK_FACTOR_OPTIONS.map(factor => {
            const isSelected = formData.riskFactors.includes(factor);
            return (
              <button
                key={factor}
                type="button"
                onClick={() => toggleRiskFactor(factor)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                  isSelected
                    ? 'bg-status-danger-bg text-status-danger border-status-danger/30'
                    : 'bg-surface-subtle text-content-muted border-edge-subtle hover:border-accent/30'
                }`}
              >
                {factor}
              </button>
            );
          })}
        </div>
      </div>

      {/* Observations */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
          <MessageSquare size={14} className="inline mr-1.5" />
          Observations & Remarques
        </label>
        <textarea
          value={formData.observations}
          onChange={(e) => updateField('observations', e.target.value)}
          rows={4}
          placeholder="Notes complémentaires sur l'enquête, recommandations spécifiques..."
          className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-input-focus resize-none"
        />
      </div>
    </div>
  );
}
