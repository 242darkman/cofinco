import React, { useState, useMemo, useCallback } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { Modal } from '../../ui';
import {
  useEvaluationDetail,
  useEvaluations,
  type EvaluationCriterion,
} from '../../../hooks/hr/useEvaluations';

interface Props {
  evaluationId: string;
  type: 'SELF' | 'MANAGER';
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

interface CriterionRating {
  rating: number;
  commentaire: string;
}

const RECOMMANDATION_OPTIONS = [
  { value: 'MAINTAIN', label: 'Maintenir' },
  { value: 'PROMOTE', label: 'Promouvoir' },
  { value: 'TRAINING_NEEDED', label: 'Formation requise' },
  { value: 'WARNING', label: 'Avertissement' },
  { value: 'PIP', label: "Plan d'amelioration" },
] as const;

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
          aria-label={`${star} etoile${star > 1 ? 's' : ''}`}
        >
          <Star
            size={22}
            className={
              star <= value
                ? 'text-status-warning fill-current'
                : 'text-content-muted'
            }
          />
        </button>
      ))}
    </div>
  );
}

function CategoryBadge({ categorie }: { categorie: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
      {categorie}
    </span>
  );
}

export default function EvaluationFormModal({
  evaluationId,
  type,
  isOpen,
  onClose,
  onSubmitted,
}: Props) {
  const { data: detail, isLoading } = useEvaluationDetail(
    isOpen ? evaluationId : null,
  );
  const { submitSelfEval, submitManagerEval } = useEvaluations();

  const [ratings, setRatings] = useState<Record<string, CriterionRating>>({});
  const [globalComment, setGlobalComment] = useState('');
  const [recommandation, setRecommandation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const criteria: EvaluationCriterion[] = detail?.criteria ?? [];

  const ratedCount = useMemo(
    () => criteria.filter((c) => ratings[c.id]?.rating > 0).length,
    [criteria, ratings],
  );

  const allRated = criteria.length > 0 && ratedCount === criteria.length;
  const progressPercent =
    criteria.length > 0 ? Math.round((ratedCount / criteria.length) * 100) : 0;

  const setRating = useCallback((criteriaId: string, rating: number) => {
    setRatings((prev) => ({
      ...prev,
      [criteriaId]: { ...prev[criteriaId], rating, commentaire: prev[criteriaId]?.commentaire ?? '' },
    }));
  }, []);

  const setComment = useCallback((criteriaId: string, commentaire: string) => {
    setRatings((prev) => ({
      ...prev,
      [criteriaId]: { ...prev[criteriaId], rating: prev[criteriaId]?.rating ?? 0, commentaire },
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!allRated || submitting) return;

    const responses = criteria.map((c) => ({
      criteriaId: c.id,
      rating: ratings[c.id].rating,
      commentaire: ratings[c.id].commentaire || undefined,
    }));

    setSubmitting(true);
    try {
      if (type === 'SELF') {
        await submitSelfEval({
          id: evaluationId,
          responses,
          commentaire: globalComment || undefined,
        });
      } else {
        await submitManagerEval({
          id: evaluationId,
          responses,
          commentaire: globalComment || undefined,
          recommandation: recommandation || undefined,
        });
      }
      onSubmitted?.();
      onClose();
    } catch {
      // Error toast is handled by the mutation hook
    } finally {
      setSubmitting(false);
    }
  }, [
    allRated,
    submitting,
    criteria,
    ratings,
    type,
    evaluationId,
    globalComment,
    recommandation,
    submitSelfEval,
    submitManagerEval,
    onSubmitted,
    onClose,
  ]);

  // Group criteria by category for display
  const groupedCriteria = useMemo(() => {
    const groups: Record<string, EvaluationCriterion[]> = {};
    for (const c of criteria) {
      const cat = c.categorie || 'Autre';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    }
    return groups;
  }, [criteria]);

  const modalTitle =
    type === 'SELF' ? 'Auto-evaluation' : 'Evaluation manager';

  const subtitle = detail?.campaign
    ? `Campagne : ${detail.campaign.nom}`
    : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={subtitle}
      size="xl"
      footer={
        <div className="flex items-center gap-3 w-full justify-between">
          <span className="text-sm text-content-muted">
            {ratedCount}/{criteria.length} criteres notes
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-content-secondary bg-surface hover:bg-surface-elevated border border-edge transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allRated || submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Soumettre
            </button>
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-content-primary">
                Progression
              </span>
              <span className="text-sm font-semibold text-accent">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Criteria grouped by category */}
          {Object.entries(groupedCriteria).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-4">
                {items
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((criterion) => {
                    const current = ratings[criterion.id];
                    return (
                      <div
                        key={criterion.id}
                        className="rounded-lg border border-edge bg-surface-elevated p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-medium text-content-primary">
                                {criterion.libelle}
                              </span>
                              <CategoryBadge categorie={criterion.categorie} />
                              <span className="text-xs text-content-muted">
                                Poids : {criterion.poids}%
                              </span>
                            </div>
                            {criterion.description && (
                              <p className="text-sm text-content-muted">
                                {criterion.description}
                              </p>
                            )}
                          </div>
                          <StarRating
                            value={current?.rating ?? 0}
                            onChange={(v) => setRating(criterion.id, v)}
                          />
                        </div>
                        <textarea
                          value={current?.commentaire ?? ''}
                          onChange={(e) =>
                            setComment(criterion.id, e.target.value)
                          }
                          placeholder="Commentaire (optionnel)"
                          rows={2}
                          className="w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus resize-none"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}

          {/* Manager recommandation */}
          {type === 'MANAGER' && (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1.5">
                Recommandation
              </label>
              <select
                value={recommandation}
                onChange={(e) => setRecommandation(e.target.value)}
                className="w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-content-primary focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus"
              >
                <option value="">-- Selectionner --</option>
                {RECOMMANDATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Global comment */}
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1.5">
              Commentaire general
            </label>
            <textarea
              value={globalComment}
              onChange={(e) => setGlobalComment(e.target.value)}
              placeholder="Commentaire global sur cette evaluation..."
              rows={4}
              className="w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus resize-none"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
