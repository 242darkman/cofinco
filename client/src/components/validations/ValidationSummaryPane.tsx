import React from 'react';
import {
  TrendingUp,
  AlertCircle,
  ShieldCheck,
  Zap
} from 'lucide-react';
import Card from '../ui/Card';
import { formatMoney } from '@/lib/format';
import { type ValidationStats } from './validation-helpers';

interface ValidationSummaryPaneProps {
  stats: ValidationStats;
}

export default function ValidationSummaryPane({ stats }: ValidationSummaryPaneProps) {
  const maxAgentCount = stats.agentPerformances.length > 0
    ? Math.max(...stats.agentPerformances.map(a => a.count))
    : 1;

  return (
    <div className="space-y-4">
      {/* Main Insight Card */}
      <Card className="bg-gradient-to-br from-primary/5 via-surface to-surface border-primary/20 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp size={18} className="text-primary" />
          </div>
          <h3 className="font-bold text-content-primary">Résumé Analytique</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface-muted/30 rounded-xl border border-edge-subtle">
              <div className="text-[10px] text-content-muted font-bold uppercase tracking-wider mb-1">Moyenne</div>
              <div className="text-lg font-bold text-content-primary">
                {formatMoney(Math.round(stats.averagePerValidation))}
              </div>
            </div>
            <div className="p-3 bg-surface-muted/30 rounded-xl border border-edge-subtle">
              <div className="text-[10px] text-content-muted font-bold uppercase tracking-wider mb-1">Agences</div>
              <div className="text-lg font-bold text-content-primary">{stats.activeAgenciesCount}</div>
              <div className="text-[10px] text-content-muted mt-1">Actives</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Alerts - only shown when there are real alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Points de vigilance</h4>

          {stats.alerts.map((alert, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex gap-3 ${
                alert.type === 'warning'
                  ? 'border-status-warning/20 bg-status-warning/5'
                  : 'border-primary/20 bg-primary/5'
              }`}
            >
              {alert.type === 'warning' ? (
                <AlertCircle size={16} className="text-status-warning shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-bold text-content-primary">{alert.title}</p>
                <p className="text-[11px] text-content-muted mt-0.5">{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Performances - only shown when there are operations */}
      {stats.agentPerformances.length > 0 && (
        <div className="bg-surface border border-edge rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <Zap size={16} className="text-status-warning" />
              Performances Agents
            </h4>
            <span className="text-[10px] bg-surface-muted px-2 py-0.5 rounded-full text-content-muted font-medium">
              {stats.pendingCount} en attente
            </span>
          </div>

          <div className="space-y-3">
            {stats.agentPerformances.map((agent, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-content-secondary">{agent.name}</span>
                  <span className="text-content-muted">{agent.count} collectes</span>
                </div>
                <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(agent.count / maxAgentCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
