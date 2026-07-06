import React from 'react';
import { AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import type { Insight, InsightSeverity } from './treasury-helpers';

interface Props {
  insights: Insight[];
}

const SEVERITY_CONFIG: Record<InsightSeverity, { bg: string; text: string; icon: typeof Info }> = {
  danger: { bg: 'bg-status-danger-bg dark:bg-status-danger/10', text: 'text-status-danger dark:text-rose-400', icon: AlertOctagon },
  warning: { bg: 'bg-status-warning-bg dark:bg-status-warning/10', text: 'text-status-warning dark:text-amber-400', icon: AlertTriangle },
  info: { bg: 'bg-status-info-bg dark:bg-status-info/10', text: 'text-status-info dark:text-blue-400', icon: Info },
};

export default function TreasuryInsightBox({ insights }: Props) {
  if (insights.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {insights.map(insight => {
        const config = SEVERITY_CONFIG[insight.severity];
        const Icon = config.icon;
        return (
          <div
            key={insight.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg} ${config.text} text-xs font-medium`}
          >
            <Icon size={13} className="shrink-0" />
            <span>{insight.message}</span>
            {insight.detail && (
              <span className="opacity-70 font-normal">({insight.detail})</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
