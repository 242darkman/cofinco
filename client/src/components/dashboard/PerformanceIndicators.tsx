import React from 'react';
import { Target, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '../ui';

interface PerformanceIndicatorsProps {
  stats: {
    creditsEnCours: number;
    totalCredits: number;
    clientsActifs: number;
    totalClients: number;
    agentsActifs: number;
    totalAgents: number;
    creditsRetard: number;
  };
  t: (key: string) => string;
}

export default function PerformanceIndicators({ stats, t }: PerformanceIndicatorsProps) {
  const calculatePercentage = (active: number, total: number) => {
    return active && total ? Math.round((active / total) * 100) : 0;
  };

  const indicators = [
    {
      label: t('tauxCreditsActifs'),
      value: calculatePercentage(stats.creditsEnCours, stats.totalCredits),
      color: 'emerald',
      icon: TrendingUp
    },
    {
      label: t('tauxClientsActifs'),
      value: calculatePercentage(stats.clientsActifs, stats.totalClients),
      color: 'cyan',
      icon: TrendingUp
    },
    {
      label: t('tauxAgentsActifs'),
      value: calculatePercentage(stats.agentsActifs, stats.totalAgents),
      color: 'purple',
      icon: TrendingUp
    },
    {
      label: t('tauxRetard'),
      value: calculatePercentage(stats.creditsRetard, stats.creditsEnCours),
      color: 'amber',
      icon: TrendingDown,
      isNegative: true
    }
  ];

  const colorClasses: Record<string, { text: string; bg: string; ring: string }> = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
    cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20' },
    purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' }
  };

  return (
    <Card variant="default" padding="md">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-purple-500/20 rounded-lg">
          <Target className="text-purple-400" size={14} />
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-white">{t('indicateursPerformance')}</h3>
      </div>

      {/* Indicators - Inline on mobile */}
      <div className="flex flex-wrap justify-around gap-2 sm:grid sm:grid-cols-4 sm:gap-3">
        {indicators.map((indicator, index) => {
          const colors = colorClasses[indicator.color];
          const IconComponent = indicator.icon;
          
          return (
            <div 
              key={index} 
              className={`flex flex-col items-center p-2 sm:p-3 rounded-lg ${colors.bg} ring-1 ${colors.ring} min-w-[70px] flex-1 sm:flex-none`}
            >
              <div className="flex items-center gap-1">
                <IconComponent size={12} className={colors.text} />
                <span className={`text-lg sm:text-2xl font-bold ${colors.text}`}>
                  {indicator.value}%
                </span>
              </div>
              <p className="text-[9px] sm:text-xs text-slate-400 text-center mt-0.5 leading-tight">
                {indicator.label}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
