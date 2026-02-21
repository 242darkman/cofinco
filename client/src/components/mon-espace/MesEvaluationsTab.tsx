import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMyEvaluations, MyEvaluation } from '../../hooks/hr/useMonEspace';
import { Card, Badge, EmptyState } from '../ui';
import { Star, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getScoreColor(score: number): string {
  if (score >= 7) return 'text-status-success';
  if (score >= 5) return 'text-status-warning';
  return 'text-status-danger';
}

function getScoreBg(score: number): string {
  if (score >= 7) return 'bg-status-success-bg border-status-success/20';
  if (score >= 5) return 'bg-status-warning-bg border-status-warning/20';
  return 'bg-status-danger-bg border-status-danger/20';
}

const STATUS_VARIANTS: Record<string, 'warning' | 'primary' | 'success' | 'neutral'> = {
  PENDING: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
};

interface EvaluationResponse {
  id: string;
  criteriaName: string;
  score: number | null;
  comment: string | null;
}

export default function MesEvaluationsTab() {
  const { evaluations, isLoading } = useMyEvaluations();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Aucune evaluation"
        description="Vous n'avez pas encore d'evaluations. Elles apparaitront ici lorsque votre responsable les aura completees."
      />
    );
  }

  return (
    <div className="space-y-4">
      {evaluations.map((evaluation) => (
        <EvaluationCard
          key={evaluation.id}
          evaluation={evaluation}
          expanded={expandedId === evaluation.id}
          onToggle={() =>
            setExpandedId(expandedId === evaluation.id ? null : evaluation.id)
          }
        />
      ))}
    </div>
  );
}

function EvaluationCard({
  evaluation,
  expanded,
  onToggle,
}: {
  evaluation: MyEvaluation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: responses } = useQuery<EvaluationResponse[]>({
    queryKey: ['/api/hr/evaluations', evaluation.id, 'responses'],
    queryFn: () =>
      fetch(`/api/hr/evaluations/${evaluation.id}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => data.responses || []),
    enabled: expanded,
  });

  const variant = STATUS_VARIANTS[evaluation.status] || 'neutral';

  return (
    <Card padding="none">
      {/* Header - clickable */}
      <button
        onClick={onToggle}
        className="w-full p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left hover:bg-surface-elevated/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
            <Star className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">
              {formatDate(evaluation.createdAt)}
            </p>
            {evaluation.evaluatorNom && (
              <p className="text-xs text-content-muted mt-0.5">
                Evaluateur: {evaluation.evaluatorNom}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {evaluation.overallScore != null && (
            <div
              className={`px-3 py-1.5 rounded-lg border font-bold text-sm ${getScoreBg(evaluation.overallScore)} ${getScoreColor(evaluation.overallScore)}`}
            >
              {evaluation.overallScore}/10
            </div>
          )}
          <Badge value={evaluation.status} variant={variant} size="sm" />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-content-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-content-muted" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-edge px-4 sm:px-5 py-4 space-y-4">
          {/* Overall comment */}
          {evaluation.overallComment && (
            <div className="flex gap-3 p-3 rounded-lg bg-surface-subtle border border-edge-subtle">
              <MessageSquare className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-1">
                  Commentaire general
                </p>
                <p className="text-sm text-content-secondary">{evaluation.overallComment}</p>
              </div>
            </div>
          )}

          {/* Detailed responses */}
          {responses && responses.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-3">
                Detail des criteres
              </p>
              <div className="space-y-2">
                {responses.map((resp) => (
                  <div
                    key={resp.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-lg bg-surface-subtle border border-edge-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-primary">
                        {resp.criteriaName}
                      </p>
                      {resp.comment && (
                        <p className="text-xs text-content-muted mt-0.5">{resp.comment}</p>
                      )}
                    </div>
                    {resp.score != null && (
                      <span
                        className={`text-sm font-bold shrink-0 ${getScoreColor(resp.score)}`}
                      >
                        {resp.score}/10
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : responses && responses.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-4">
              Aucun detail disponible
            </p>
          ) : (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
