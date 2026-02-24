import React from 'react';
import { formatMoney } from '@/lib/format';

interface ComparisonCardsProps {
  montantInitial: string | number;
  scoreInitial: number;
  motifRejet: string;
  montantNouveau: string | number;
  scoreNouveau?: number | null;
  deltaScore?: number;
  elementsNouveaux?: string[];
}

export function ComparisonCards({
  montantInitial,
  scoreInitial,
  motifRejet,
  montantNouveau,
  scoreNouveau,
  deltaScore,
  elementsNouveaux,
}: ComparisonCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Demande initiale */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between border-b border-edge/30">
          <span className="text-[11px] font-bold text-status-danger uppercase tracking-wider">Demande initiale</span>
          <span className="text-[10px] font-bold bg-status-danger-bg text-status-danger px-2 py-0.5 rounded-full border border-status-danger/30">
            Rejetée
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xl font-bold text-content-primary mb-1.5">
            {formatMoney(Number(montantInitial))}
          </p>
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Score de risque</span>
            <span className="font-mono text-content-primary">{scoreInitial}/100</span>
          </div>
          <div className="mt-2 pt-2 border-t border-edge">
            <p className="text-[10px] font-bold text-status-danger uppercase tracking-wider mb-0.5">Motif du rejet</p>
            <p className="text-[11px] text-content-secondary leading-relaxed">{motifRejet || 'Non spécifié'}</p>
          </div>
        </div>
      </div>

      {/* Nouvelle demande */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between border-b border-edge/30">
          <span className="text-[11px] font-bold text-status-warning uppercase tracking-wider">Nouvelle demande</span>
          <span className="text-[10px] font-bold bg-status-warning-bg text-status-warning px-2 py-0.5 rounded-full border border-status-warning/30">
            Réévaluation
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xl font-bold text-content-primary mb-1.5">
            {formatMoney(Number(montantNouveau))}
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-muted">Score de risque</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-content-primary">
                {scoreNouveau !== undefined && scoreNouveau !== null ? `${scoreNouveau}/100` : '—'}
              </span>
              {deltaScore !== undefined && deltaScore !== null && (
                <span className={`text-[11px] font-medium ${deltaScore > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                  {deltaScore > 0 ? '+' : ''}{deltaScore} pts
                </span>
              )}
            </div>
          </div>
          {elementsNouveaux && elementsNouveaux.length > 0 && (
            <div className="mt-2 pt-2 border-t border-edge">
              <p className="text-[10px] font-bold text-status-warning uppercase tracking-wider mb-0.5">Améliorations</p>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                {elementsNouveaux.join(' + ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
