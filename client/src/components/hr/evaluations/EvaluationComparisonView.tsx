import React from 'react';
import { Star, ArrowUp, ArrowDown, Minus, Award } from 'lucide-react';
import { Modal, Card, Badge, Button, LoadingSpinner } from '../../ui';
import { useEvaluationComparison } from '../../../hooks/hr/useEvaluations';

interface Props {
  evaluationId: string;
  isOpen: boolean;
  onClose: () => void;
}

const RECOMMANDATION_MAP: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  MAINTAIN: { label: 'Maintenir', variant: 'success' },
  PROMOTE: { label: 'Promouvoir', variant: 'info' },
  TRAINING_NEEDED: { label: 'Formation requise', variant: 'warning' },
  WARNING: { label: 'Avertissement', variant: 'danger' },
  PIP: { label: 'Plan amelioration', variant: 'danger' },
};

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-content-muted text-sm">--</span>;

  const colorClass =
    rating <= 2 ? 'text-status-danger' : rating === 3 ? 'text-status-warning' : 'text-status-success';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={i <= rating ? colorClass : 'text-content-muted/30'}
          fill={i <= rating ? 'currentColor' : 'none'}
        />
      ))}
      <span className={`ml-1.5 text-sm font-semibold ${colorClass}`}>{rating}/5</span>
    </div>
  );
}

function GapIndicator({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-content-muted">--</span>;

  const absGap = Math.abs(gap);

  if (absGap <= 1) {
    return (
      <div className="flex items-center gap-1 text-status-success">
        <Minus size={14} />
        <span className="text-sm font-medium">{gap === 0 ? 'Aligné' : `${gap > 0 ? '+' : ''}${gap}`}</span>
      </div>
    );
  }

  const isPositive = gap > 0;
  return (
    <div className={`flex items-center gap-1 text-status-danger`}>
      {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      <span className="text-sm font-semibold">{gap > 0 ? '+' : ''}{gap}</span>
    </div>
  );
}

function ScoreCard({ label, score, icon }: { label: string; score: string | null; icon?: React.ReactNode }) {
  return (
    <Card padding="sm" className="flex-1 text-center">
      <p className="text-xs text-content-muted mb-1">{label}</p>
      <div className="flex items-center justify-center gap-2">
        {icon}
        <span className="text-2xl font-bold text-content-primary">
          {score != null ? `${parseFloat(score).toFixed(1)}` : '--'}
        </span>
      </div>
    </Card>
  );
}

export default function EvaluationComparisonView({ evaluationId, isOpen, onClose }: Props) {
  const { data, isLoading } = useEvaluationComparison(isOpen ? evaluationId : null);

  const recommandation = data?.evaluation.recommandation
    ? RECOMMANDATION_MAP[data.evaluation.recommandation]
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Award size={22} className="text-accent" />
          <span>Comparaison d'evaluation</span>
        </div>
      }
      subtitle={data ? `${data.evaluation.employeNom}` : undefined}
      size="2xl"
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
    >
      {isLoading || !data ? (
        <LoadingSpinner text="Chargement de la comparaison..." />
      ) : (
        <div className="space-y-6">
          {/* Header: recommandation badge */}
          {recommandation && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-content-secondary">Recommandation :</span>
              <Badge value={recommandation.label} variant={recommandation.variant} size="lg" />
            </div>
          )}

          {/* Score summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ScoreCard label="Auto-evaluation" score={data.selfScore} />
            <ScoreCard label="Manager" score={data.managerScore} />
            <ScoreCard
              label="Score final"
              score={data.finalScore}
              icon={<Award size={18} className="text-accent" />}
            />
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-subtle border-b border-edge">
                  <th className="text-left px-3 py-2 text-content-primary font-semibold">Critere</th>
                  <th className="text-center px-3 py-2 text-content-primary font-semibold w-16">Poids</th>
                  <th className="text-center px-3 py-2 text-content-primary font-semibold">Auto-evaluation</th>
                  <th className="text-center px-3 py-2 text-content-primary font-semibold">Manager</th>
                  <th className="text-center px-3 py-2 text-content-primary font-semibold w-24">Ecart</th>
                </tr>
              </thead>
              <tbody>
                {data.comparison.map((row, idx) => (
                  <tr
                    key={row.criteriaId}
                    className={`border-b border-edge last:border-b-0 ${idx % 2 === 0 ? 'bg-surface' : 'bg-surface-subtle/50'}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-content-primary font-medium">{row.libelle}</span>
                        <Badge value={row.categorie} variant="neutral" size="xs" rawValue />
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5 text-content-secondary font-medium">
                      {row.poids}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <StarRating rating={row.selfRating} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <StarRating rating={row.managerRating} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <GapIndicator gap={row.gap} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comments section */}
          {(data.evaluation.selfCommentaire || data.evaluation.managerCommentaire) && (
            <div>
              <h4 className="text-content-primary font-semibold mb-3">Commentaires</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.evaluation.selfCommentaire && (
                  <Card padding="sm">
                    <p className="text-xs text-content-muted mb-1 font-semibold">Auto-evaluation</p>
                    <p className="text-sm text-content-secondary">{data.evaluation.selfCommentaire}</p>
                  </Card>
                )}
                {data.evaluation.managerCommentaire && (
                  <Card padding="sm">
                    <p className="text-xs text-content-muted mb-1 font-semibold">Manager</p>
                    <p className="text-sm text-content-secondary">{data.evaluation.managerCommentaire}</p>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Action plan */}
          {data.evaluation.actionPlan && (
            <div>
              <h4 className="text-content-primary font-semibold mb-2">Plan d'action</h4>
              <Card padding="sm">
                <p className="text-sm text-content-secondary whitespace-pre-line">
                  {data.evaluation.actionPlan}
                </p>
              </Card>
            </div>
          )}

          {/* Training recommendations */}
          {data.evaluation.trainingRecommendations && data.evaluation.trainingRecommendations.length > 0 && (
            <div>
              <h4 className="text-content-primary font-semibold mb-2">Formations recommandees</h4>
              <div className="flex flex-wrap gap-2">
                {data.evaluation.trainingRecommendations.map((training, i) => (
                  <Badge key={i} value={training} variant="info" size="md" rawValue />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
