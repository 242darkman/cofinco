import React from 'react';
import { ArrowLeft, RefreshCw, LayoutDashboard, Zap } from 'lucide-react';
import { STATUT_REEVALUATION_LABELS } from '@shared/enum/status-constants';
import type { StatutVisualConfig, Actor } from '../types';

export type ViewMode = 'quick' | 'detailed';

interface ReevaluationHeaderProps {
  numeroReevaluation: string;
  createdAt: string;
  statut: string;
  statutConfig: StatutVisualConfig;
  verrouille?: boolean;
  wsUpdated: boolean;
  actorCreatedBy?: Actor | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBack?: () => void;
}

export function ReevaluationHeader({
  numeroReevaluation,
  createdAt,
  statut,
  statutConfig,
  verrouille,
  wsUpdated,
  actorCreatedBy,
  viewMode,
  onViewModeChange,
  onBack,
}: ReevaluationHeaderProps) {
  const statutLabel = STATUT_REEVALUATION_LABELS[statut as keyof typeof STATUT_REEVALUATION_LABELS] || statut;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0 flex-1">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-content-muted hover:text-content-primary mb-1.5 transition text-sm"
          >
            <ArrowLeft size={15} />
            Retour
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <RefreshCw
            className={`text-status-warning shrink-0 transition-transform ${wsUpdated ? 'animate-spin' : ''}`}
            size={22}
            style={wsUpdated ? { animationDuration: '1s', animationIterationCount: '1' } : undefined}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-content-primary truncate">
                {numeroReevaluation}
              </h2>
              {wsUpdated && (
                <span className="text-[11px] text-status-success animate-pulse">Mis à jour</span>
              )}
            </div>
            <p className="text-content-muted text-xs">
              Créée le{' '}
              {new Date(createdAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {actorCreatedBy?.nom && (
                <span className="ml-1">
                  par <span className="text-content-secondary font-medium">{actorCreatedBy.nom}</span>
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex rounded-lg border border-edge overflow-hidden text-[11px] font-medium">
          <button
            onClick={() => onViewModeChange('quick')}
            className={`flex items-center gap-1 px-2.5 py-1.5 transition ${
              viewMode === 'quick'
                ? 'bg-accent text-content-inverted'
                : 'bg-surface text-content-muted hover:text-content-primary'
            }`}
            aria-label="Vue rapide"
          >
            <Zap size={13} />
            Rapide
          </button>
          <button
            onClick={() => onViewModeChange('detailed')}
            className={`flex items-center gap-1 px-2.5 py-1.5 transition ${
              viewMode === 'detailed'
                ? 'bg-accent text-content-inverted'
                : 'bg-surface text-content-muted hover:text-content-primary'
            }`}
            aria-label="Vue détaillée"
          >
            <LayoutDashboard size={13} />
            Détaillée
          </button>
        </div>

        <div className={`px-3 py-1.5 rounded-lg border text-sm ${statutConfig.bg} ${statutConfig.border}`}>
          <span className={`font-medium ${statutConfig.color}`}>{statutLabel}</span>
          {verrouille && (
            <span className="ml-1.5 text-[11px] text-content-muted">(verrouillée)</span>
          )}
        </div>
      </div>
    </div>
  );
}
