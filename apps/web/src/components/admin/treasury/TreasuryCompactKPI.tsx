import React from 'react';
import { TrendingUp, TrendingDown, Award, BarChart3, AlertCircle } from 'lucide-react';
import { currencySymbol } from '@shared/config/currency';
import { formatCurrency, calcGrowth, type SupervisionData } from './treasury-helpers';
import { cn } from '@/lib/utils';

interface Props {
  data: SupervisionData;
  activeStats: {
    totalBalance: number;
    activeCount: number;
    averageBalance: number;
    leader: { agenceNom: string; solde: number; share?: number } | null;
  };
  criticalCount: number;
}

export default function TreasuryCompactKPI({ data, activeStats, criticalCount }: Props) {
  const { previousPeriod } = data;
  
  const globalDelta = previousPeriod
    ? calcGrowth(activeStats.totalBalance, previousPeriod.globalBalance)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* 💰 Trésorerie Globale */}
      <KPICard 
        title="Trésorerie Globale"
        value={formatCurrency(activeStats.totalBalance)}
        unit={currencySymbol()}
        icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
        footer={
          previousPeriod && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              globalDelta >= 0 ? "text-emerald-600" : "text-rose-600"
            )}>
              {globalDelta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {globalDelta >= 0 ? '+' : ''}{globalDelta.toFixed(1)}%
            </div>
          )
        }
      />

      {/* 🏆 Agence Leader */}
      <KPICard 
        title="Agence Leader"
        value={activeStats.leader?.agenceNom || '-'}
        subValue={activeStats.leader ? `${formatCurrency(activeStats.leader.solde)} ${currencySymbol()}` : undefined}
        icon={<Award className="w-4 h-4 text-amber-500" />}
      />

      {/* 📊 Moyenne / Agence */}
      <KPICard 
        title="Moyenne / Agence"
        value={formatCurrency(activeStats.averageBalance)}
        unit={currencySymbol()}
        icon={<BarChart3 className="w-4 h-4 text-blue-500" />}
      />

      {/* ⚠️ Agences Critiques */}
      <KPICard 
        title="Agences Critiques"
        value={criticalCount.toString()}
        icon={<AlertCircle className={cn("w-4 h-4", criticalCount > 0 ? "text-rose-500" : "text-slate-400 dark:text-slate-600")} />}
        className={cn(criticalCount > 0 && "bg-rose-50/50 dark:bg-rose-500/5 border-rose-100 dark:border-rose-500/20")}
      />

      {/* 📈 Variation (Optional placeholder or extra metric) */}
      <KPICard 
        title="Agences Actives"
        value={activeStats.activeCount.toString()}
        unit="unités"
        icon={<div className="w-2 h-2 rounded-full bg-emerald-500" />}
      />
    </div>
  );
}

function KPICard({ title, value, subValue, unit, icon, footer, className }: { 
  title: string; 
  value: string; 
  subValue?: string;
  unit?: string; 
  icon: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "bg-surface border border-edge dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between hover:shadow-sm transition-all duration-200 group dark:bg-slate-900",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-content-muted dark:text-slate-400 uppercase tracking-tight">{title}</span>
        {icon}
      </div>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-content-primary dark:text-slate-100 truncate max-w-full leading-tight">{value}</span>
          {unit && <span className="text-[10px] text-content-muted/60 dark:text-slate-500 font-medium">{unit}</span>}
        </div>
        {subValue && <span className="text-[10px] text-content-muted dark:text-slate-500 truncate">{subValue}</span>}
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}
