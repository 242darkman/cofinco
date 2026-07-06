import React from 'react';
import { TrendingUp, TrendingDown, Award, BarChart3 } from 'lucide-react';
import { Card } from '../../ui';
import { currencySymbol } from '@shared/config/currency';
import { formatCurrency, calcGrowth } from './treasury-helpers';
import type { SupervisionData } from './treasury-helpers';

interface Props {
  data: SupervisionData;
}

export default function TreasuryKPIStrip({ data }: Props) {
  const { globalBalance, breakdown, ranking, previousPeriod } = data;

  const totalCount = breakdown.length;
  const average = totalCount > 0 ? Math.round(globalBalance / totalCount) : 0;

  const globalDelta = previousPeriod
    ? calcGrowth(globalBalance, previousPeriod.globalBalance)
    : 0;
  const hasComparison = !!previousPeriod;

  const topAgency = ranking?.[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Solde Global */}
      <Card className="rounded-xl p-5 shadow-card border-edge flex flex-col justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-accent uppercase mb-1">Trésorerie Globale</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-content-primary">
              {formatCurrency(globalBalance)}
            </span>
            <span className="text-xs text-content-muted font-medium">{currencySymbol()}</span>
          </div>
        </div>
        {hasComparison && (
          <div className={`mt-4 flex items-center text-sm font-medium ${globalDelta >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
            {globalDelta >= 0 ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
            {globalDelta >= 0 ? '+' : ''}{globalDelta.toFixed(1)}%
            <span className="text-content-muted font-normal ml-1">vs période préc.</span>
          </div>
        )}
      </Card>

      {/* 2. Top Agence */}
      {topAgency && (
        <Card className="rounded-xl p-5 shadow-card border-edge flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-[0.07]">
            <Award size={80} className="text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Award size={18} className="text-accent" />
              <p className="text-xs font-semibold tracking-wider text-content-muted uppercase">Top Agence</p>
            </div>
            <h3 className="text-lg font-semibold text-content-primary truncate">{topAgency.agenceNom}</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold text-content-primary">{formatCurrency(topAgency.solde)}</span>
              <span className="text-xs text-content-muted">{currencySymbol()}</span>
            </div>
          </div>
          {topAgency.share > 0 && (
            <div className="mt-2 text-xs text-content-muted">
              {topAgency.share.toFixed(1)}% du total
            </div>
          )}
        </Card>
      )}

      {/* 3. Moyenne / Agence */}
      <Card className="rounded-xl p-5 shadow-card border-edge flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={18} className="text-content-muted" />
            <p className="text-xs font-semibold tracking-wider text-content-muted uppercase">Moyenne / Agence</p>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-xl font-bold text-content-primary">{formatCurrency(average)}</span>
            <span className="text-xs text-content-muted">{currencySymbol()}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
