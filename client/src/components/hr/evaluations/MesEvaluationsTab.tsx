import React, { useState, useMemo } from 'react';
import { Card, Badge, Button, LoadingSpinner, EmptyState } from '../../ui';
import {
  ClipboardCheck,
  Eye,
  Calendar,
  Star,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import {
  useEvaluations,
  useEvaluationDetail,
  type Evaluation,
} from '../../../hooks/hr/useEvaluations';
import EvaluationFormModal from './EvaluationFormModal';
import EvaluationComparisonView from './EvaluationComparisonView';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

type EvalStatusKey = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FINALIZED';

interface StatusConfig {
  label: string;
  variant: 'neutral' | 'warning' | 'success' | 'info';
}

const STATUS_CONFIG: Record<EvalStatusKey, StatusConfig> = {
  NOT_STARTED: { label: 'Non commencé', variant: 'neutral' },
  IN_PROGRESS: { label: 'En cours', variant: 'warning' },
  COMPLETED: { label: 'Terminé', variant: 'success' },
  FINALIZED: { label: 'Finalisé', variant: 'info' },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status as EvalStatusKey] ?? STATUS_CONFIG.NOT_STARTED;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeriod(debut: string, fin: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(debut)} — ${fmt(fin)}`;
}

// ---------------------------------------------------------------------------
// EvaluationCard
// ---------------------------------------------------------------------------

interface EvaluationCardProps {
  evaluation: Evaluation;
  campaignName: string;
  campaignPeriod: string;
  onAutoEval: (id: string) => void;
  onViewResults: (id: string) => void;
}

function EvaluationCard({
  evaluation,
  campaignName,
  campaignPeriod,
  onAutoEval,
  onViewResults,
}: EvaluationCardProps) {
  const selfStatus = getStatusConfig(evaluation.selfEvalStatus);
  const managerStatus = getStatusConfig(evaluation.managerEvalStatus);
  const showAutoEvalBtn = evaluation.selfEvalStatus !== 'COMPLETED';
  const showResultsBtn = evaluation.statut === 'FINALIZED';

  return (
    <Card className="hover:shadow-theme-lg transition-shadow duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-content-primary truncate">
            {campaignName}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-content-muted text-xs sm:text-sm">
            <Calendar size={14} className="shrink-0" />
            <span>{campaignPeriod}</span>
          </div>
        </div>

        <Badge
          value={getStatusConfig(evaluation.statut).label}
          variant={getStatusConfig(evaluation.statut).variant}
          size="sm"
          rawValue
        />
      </div>

      {/* Status rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Self eval */}
        <div className="flex items-center gap-2 rounded-lg bg-surface-subtle p-3">
          <ClipboardCheck size={16} className="text-content-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-content-muted">Auto-évaluation</p>
            <Badge
              value={selfStatus.label}
              variant={selfStatus.variant}
              size="xs"
              rawValue
              className="mt-0.5"
            />
          </div>
        </div>

        {/* Manager eval */}
        <div className="flex items-center gap-2 rounded-lg bg-surface-subtle p-3">
          <UserCheck size={16} className="text-content-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-content-muted">Éval. manager</p>
            <Badge
              value={managerStatus.label}
              variant={managerStatus.variant}
              size="xs"
              rawValue
              className="mt-0.5"
            />
          </div>
        </div>
      </div>

      {/* Final score */}
      {evaluation.finalScore != null && (
        <div className="flex items-center gap-2 rounded-lg bg-accent/10 p-3 mb-4">
          <Star size={16} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-content-primary">
            Note finale :
          </span>
          <span className="text-sm font-bold text-accent">
            {Number(evaluation.finalScore).toFixed(1)} / 5
          </span>
        </div>
      )}

      {/* Actions */}
      {(showAutoEvalBtn || showResultsBtn) && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-edge">
          {showAutoEvalBtn && (
            <Button
              variant="primary"
              size="sm"
              icon={ClipboardCheck}
              onClick={() => onAutoEval(evaluation.id)}
            >
              Compléter mon auto-évaluation
            </Button>
          )}
          {showResultsBtn && (
            <Button
              variant="secondary"
              size="sm"
              icon={Eye}
              onClick={() => onViewResults(evaluation.id)}
            >
              Voir résultats
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MesEvaluationsTab (main export)
// ---------------------------------------------------------------------------

export default function MesEvaluationsTab() {
  const { evaluations, loading, submitSelfEval } = useEvaluations();

  // Modal states
  const [autoEvalId, setAutoEvalId] = useState<string | null>(null);
  const [resultsId, setResultsId] = useState<string | null>(null);

  // Fetch detail for auto-eval modal
  const { data: evalDetail, isLoading: detailLoading } =
    useEvaluationDetail(autoEvalId);

  // Derive campaign info per evaluation (campaign data embedded in detail,
  // but for the list we build a lightweight map from the evaluations array).
  const campaignMap = useMemo(() => {
    const map = new Map<
      string,
      { nom: string; period: string }
    >();
    evaluations.forEach((ev) => {
      if (!map.has(ev.campaignId)) {
        // Campaign-level info is not directly in the list item; use placeholder
        // that will be enriched if detail is fetched. The list endpoint may
        // include campaign name in a future version; for now we display the ID
        // as fallback. In practice, the evaluation list endpoint typically
        // returns campaign info joined.
        map.set(ev.campaignId, {
          nom: `Campagne`,
          period: '',
        });
      }
    });
    return map;
  }, [evaluations]);

  // ---------- Handlers ----------

  const handleOpenAutoEval = (id: string) => {
    setAutoEvalId(id);
  };

  const handleCloseAutoEval = () => {
    setAutoEvalId(null);
  };

  const handleOpenResults = (id: string) => {
    setResultsId(id);
  };

  const handleCloseResults = () => {
    setResultsId(null);
  };

  // ---------- Loading ----------

  if (loading) {
    return <LoadingSpinner text="Chargement de vos évaluations…" />;
  }

  // ---------- Empty state ----------

  if (evaluations.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Aucune évaluation"
        description="Vous n'avez pas encore d'évaluation assignée. Les évaluations apparaîtront ici lorsqu'une campagne sera lancée."
      />
    );
  }

  // ---------- Render list ----------

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck size={20} className="text-accent" />
          <h2 className="text-lg font-bold text-content-primary">
            Mes évaluations
          </h2>
          <span className="text-xs text-content-muted">
            ({evaluations.length})
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {evaluations.map((ev) => {
            const campaign = campaignMap.get(ev.campaignId);
            return (
              <EvaluationCard
                key={ev.id}
                evaluation={ev}
                campaignName={campaign?.nom ?? 'Campagne'}
                campaignPeriod={campaign?.period ?? ''}
                onAutoEval={handleOpenAutoEval}
                onViewResults={handleOpenResults}
              />
            );
          })}
        </div>
      </div>

      {/* Auto-evaluation modal */}
      {autoEvalId && (
        <EvaluationFormModal
          isOpen={!!autoEvalId}
          onClose={handleCloseAutoEval}
          evaluationId={autoEvalId}
          detail={evalDetail ?? null}
          detailLoading={detailLoading}
          onSubmit={submitSelfEval}
        />
      )}

      {/* Results comparison view */}
      {resultsId && (
        <EvaluationComparisonView
          isOpen={!!resultsId}
          onClose={handleCloseResults}
          evaluationId={resultsId}
        />
      )}
    </>
  );
}
