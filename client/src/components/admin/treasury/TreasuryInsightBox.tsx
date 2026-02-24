import React from 'react';
import { AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import type { Insight, InsightSeverity } from './treasury-helpers';

interface Props {
  insights: Insight[];
}

const SEVERITY_CONFIG: Record<InsightSeverity, { bg: string; text: string; icon: typeof Info }> = {
  danger: { bg: 'bg-status-danger-bg', text: 'text-status-danger', icon: AlertOctagon },
  warning: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: AlertTriangle },
  info: { bg: 'bg-status-info-bg', text: 'text-status-info', icon: Info },
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
