import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar';
import type { GarantieAdditionnelle } from '../types';

interface ConfidenceIndicatorProps {
  scoreInitial: number;
  scoreNouveau?: number | null;
  deltaScore?: number;
  garanties?: GarantieAdditionnelle[];
}

const RADIUS = 48;
const STROKE_WIDTH = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const VIEW_BOX_SIZE = (RADIUS + STROKE_WIDTH) * 2;
const CENTER = VIEW_BOX_SIZE / 2;

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--color-success)';
  if (score >= 40) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function getScoreLabel(score: number): { label: string; color: 'success' | 'warning' | 'danger' } {
  if (score >= 70) return { label: 'Bon', color: 'success' };
  if (score >= 40) return { label: 'Moyen', color: 'warning' };
  return { label: 'Faible', color: 'danger' };
}

function getGarantieScore(garanties?: GarantieAdditionnelle[]): { value: number; label: string; color: 'success' | 'warning' | 'danger' } {
  if (!garanties || garanties.length === 0) return { value: 20, label: 'Insuffisant', color: 'danger' };
  const totalValue = garanties.reduce((sum, g) => sum + Number(g.valeurEstimee || 0), 0);
  if (totalValue >= 200000) return { value: 95, label: 'Excellente', color: 'success' };
  if (totalValue >= 100000) return { value: 70, label: 'Bonne', color: 'success' };
  if (totalValue >= 50000) return { value: 50, label: 'Moyenne', color: 'warning' };
  return { value: 30, label: 'Faible', color: 'danger' };
}

export function ConfidenceIndicator({ scoreInitial, scoreNouveau, deltaScore, garanties }: ConfidenceIndicatorProps) {
  const displayScore = scoreNouveau ?? scoreInitial;
  const offset = CIRCUMFERENCE - (displayScore / 100) * CIRCUMFERENCE;
  const strokeColor = getScoreColor(displayScore);
  const capacite = getScoreLabel(displayScore);
  const garantieScore = getGarantieScore(garanties);

  return (
    <div className="bg-surface rounded-xl border border-edge p-3" aria-label="Indicateur de confiance">
      <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 text-center">
        Indicateur de confiance
      </h3>

      {/* Circular gauge */}
      <div className="flex justify-center mb-3">
        <div className="relative">
          <svg
            width={VIEW_BOX_SIZE}
            height={VIEW_BOX_SIZE}
            viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
            className="transform -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none" stroke="var(--border-default)" strokeWidth={STROKE_WIDTH} opacity={0.2}
            />
            <circle
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none" stroke={strokeColor} strokeWidth={STROKE_WIDTH}
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
              strokeLinecap="round" className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-content-primary">{displayScore}</span>
            <span className="text-[9px] text-content-muted uppercase tracking-wider">sur 100</span>
          </div>
        </div>
      </div>

      {/* Delta badge */}
      {deltaScore !== undefined && deltaScore !== null && deltaScore !== 0 && (
        <div className="flex justify-center mb-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
            deltaScore > 0
              ? 'bg-status-success-bg text-status-success border-status-success/30'
              : 'bg-status-danger-bg text-status-danger border-status-danger/30'
          }`}>
            {deltaScore > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {deltaScore > 0 ? '+' : ''}{deltaScore} {deltaScore > 0 ? 'Amélioration' : 'Dégradation'}
          </span>
        </div>
      )}

      {/* Sub-metrics */}
      <div className="space-y-2.5 pt-2.5 border-t border-edge">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-content-muted">Capacité de remboursement</span>
            <span className={`text-[11px] font-bold text-status-${capacite.color}`}>{capacite.label}</span>
          </div>
          <ProgressBar value={displayScore} color={capacite.color} size="sm" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-content-muted">Qualité garanties</span>
            <span className={`text-[11px] font-bold text-status-${garantieScore.color}`}>{garantieScore.label}</span>
          </div>
          <ProgressBar value={garantieScore.value} color={garantieScore.color} size="sm" />
        </div>
      </div>
    </div>
  );
}
