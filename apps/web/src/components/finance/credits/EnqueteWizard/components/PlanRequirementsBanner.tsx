import React from 'react';
import { FileText, Shield, Info } from 'lucide-react';
import type { CreditPlanInfo } from '../types';

interface PlanRequirementsBannerProps {
  creditPlan: CreditPlanInfo;
  compact?: boolean;
}

export default function PlanRequirementsBanner({ creditPlan, compact = false }: PlanRequirementsBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border border-accent/20 rounded-lg text-xs">
        <FileText size={14} className="text-accent shrink-0" />
        <span className="text-content-secondary">Plan :</span>
        <span className="font-semibold text-accent">{creditPlan.nom}</span>
        {creditPlan.tauxInteret && (
          <span className="text-content-muted">• {creditPlan.tauxInteret}%</span>
        )}
        {creditPlan.collateralRequired && (
          <span className="flex items-center gap-0.5 text-status-warning">
            <Shield size={12} />
            Garanties requises
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <FileText size={16} className="text-accent" />
        <span className="font-semibold text-sm text-content-primary">Plan : {creditPlan.nom}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-content-muted">Taux</span>
          <p className="font-medium text-content-primary">{creditPlan.tauxInteret}%</p>
        </div>
        <div>
          <span className="text-content-muted">Durée</span>
          <p className="font-medium text-content-primary">
            {creditPlan.dureeValeur} {creditPlan.dureeUnite === 'DAY' ? 'jours' : creditPlan.dureeUnite === 'MONTH' ? 'mois' : creditPlan.dureeUnite}
          </p>
        </div>
        <div>
          <span className="text-content-muted">Montant</span>
          <p className="font-medium text-content-primary">
            {creditPlan.montantMin ? Number(creditPlan.montantMin).toLocaleString('fr-FR') : '—'} - {creditPlan.montantMax ? Number(creditPlan.montantMax).toLocaleString('fr-FR') : '—'}
          </p>
        </div>
        {creditPlan.guaranteeDepositPercent && (
          <div>
            <span className="text-content-muted">Dépôt garantie</span>
            <p className="font-medium text-content-primary">{creditPlan.guaranteeDepositPercent}%</p>
          </div>
        )}
      </div>
      {creditPlan.collateralRequired && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-status-warning">
          <Info size={14} />
          Garanties obligatoires pour ce plan
        </div>
      )}
    </div>
  );
}
