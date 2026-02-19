import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, X, Calendar, DollarSign, TrendingUp, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { objectifEpargneApi } from '../../../lib/api-client';
import { compteKeys } from '../../../lib/query-keys';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, validateDate, VALIDATION_LIMITS } from '../../../lib/validation';
import { formatMoney, formatDate, getDaysRemaining } from '../../../lib/format';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { StatutObjectif, StatutObjectifType } from '@shared/enum/status-constants';

interface Objectif {
  id: string;
  nom: string;
  montantCible: number;
  montantActuel: number;
  dateDebut: string;
  dateCible: string;
  statut: StatutObjectifType;
  description: string;
}

interface EpargneSavingsGoalsProps {
  compteId: string;
  compteSolde: number;
  onClose: () => void;
}

interface FormErrors {
  nom?: string;
  montantCible?: string;
  dateCible?: string;
  general?: string;
}

export default function EpargneSavingsGoals({ compteId, compteSolde, onClose }: EpargneSavingsGoalsProps) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    nom: '',
    montantCible: '',
    dateCible: '',
    description: '',
  });

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // --- React Query: Objectifs ---
  const objectifsQuery = useQuery({
    queryKey: compteKeys.objectifs(compteId),
    queryFn: () => objectifEpargneApi.getByCompte(compteId),
  });

  const objectifs: Objectif[] = objectifsQuery.data || [];
  const loading = objectifsQuery.isLoading;

  const invalidateObjectifs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: compteKeys.objectifs(compteId) });
  }, [queryClient, compteId]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.nom.trim()) {
      newErrors.nom = "Nom de l'objectif requis";
    } else if (formData.nom.length > 100) {
      newErrors.nom = 'Maximum 100 caractères';
    }

    const amountValidation = validateAmount(formData.montantCible, {
      min: 1000,
      max: VALIDATION_LIMITS.MAX_EPARGNE,
      fieldName: 'Montant cible',
    });
    if (!amountValidation.isValid) {
      newErrors.montantCible = amountValidation.error;
    }

    const dateValidation = validateDate(formData.dateCible, {
      mustBeFuture: true,
      fieldName: 'Date cible',
    });
    if (!dateValidation.isValid) {
      newErrors.dateCible = dateValidation.error;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) return;

      setSubmitting(true);
      try {
        await objectifEpargneApi.create(compteId, {
          compteId,
          nom: sanitizeInput(formData.nom),
          montantCible: parseFloat(formData.montantCible),
          dateCible: formData.dateCible,
          description: sanitizeInput(formData.description) || null,
          montantActuel: 0,
        });

        setFormData({ nom: '', montantCible: '', dateCible: '', description: '' });
        setShowForm(false);
        setErrors({});
        invalidateObjectifs();

        toast.success('Objectif créé');
      } catch (error) {
        toast.error(handleApiError(error, "Erreur lors de la création de l'objectif"));
      } finally {
        setSubmitting(false);
      }
    },
    [formData, compteId, validateForm, invalidateObjectifs]
  );

  const handleDelete = useCallback(
    (objectif: Objectif) => {
      openConfirm({
        title: "Supprimer l'objectif",
        message: `Êtes-vous sûr de vouloir supprimer l'objectif "${escapeHtml(objectif.nom)}" ? Cette action est irréversible.`,
        variant: 'danger',
        confirmText: 'Supprimer',
        onConfirm: async () => {
          try {
            await objectifEpargneApi.delete(objectif.id);
            invalidateObjectifs();
            toast.success('Objectif supprimé');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors de la suppression de l\'objectif'));
          }
        },
      });
    },
    [invalidateObjectifs, openConfirm]
  );

  const updateObjectifProgression = useCallback(
    async (objectif: Objectif) => {
      const progression = Math.min(compteSolde, objectif.montantCible);
      const nouveauStatut = progression >= objectif.montantCible ? 'Atteint' : 'En cours';

      try {
        await objectifEpargneApi.update(objectif.id, {
          montantActuel: progression,
          statut: nouveauStatut,
        });
        invalidateObjectifs();
        toast.success('Progression mise à jour');
      } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors de la mise à jour de l\'objectif'));
      }
    },
    [compteSolde, invalidateObjectifs]
  );

  const getProgressionColor = useCallback((pourcentage: number) => {
    if (pourcentage >= 100) return 'from-status-success to-status-success';
    if (pourcentage >= 75) return 'from-status-info to-accent';
    if (pourcentage >= 50) return 'from-accent to-status-success';
    return 'from-status-info to-accent';
  }, []);

  const getStatusBadgeColor = useCallback((statut: string) => {
    switch (statut) {
      case 'Atteint':
        return 'bg-status-success-bg text-status-success';
      case 'Abandonné':
        return 'bg-status-danger-bg text-status-danger';
      default:
        return 'bg-status-info-bg text-status-info';
    }
  }, []);

  // Memoized stats
  const stats = useMemo(() => {
    const total = objectifs.length;
    const atteints = objectifs.filter((o) => o.statut === StatutObjectif.ACHIEVED).length;
    const enCours = objectifs.filter((o) => o.statut === StatutObjectif.IN_PROGRESS).length;
    return { total, atteints, enCours };
  }, [objectifs]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setFormData({ nom: '', montantCible: '', dateCible: '', description: '' });
    setErrors({});
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goals-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-xl border border-edge w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-edge p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Target className="text-status-success" size={24} aria-hidden="true" />
            <div>
              <h2 id="goals-title" className="text-2xl font-bold text-content-primary">
                Objectifs d'Épargne
              </h2>
              <p className="text-content-muted text-sm">
                Solde disponible: <span className="text-status-success font-semibold">{formatMoney(compteSolde)}</span>
              </p>
            </div>
          </div>
          <IconButton icon={X} onClick={onClose} aria-label="Fermer" />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Stats */}
          {!loading && objectifs.length > 0 && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-surface-elevated/30 rounded-lg p-3">
                <div className="text-2xl font-bold text-content-primary">{stats.total}</div>
                <div className="text-xs text-content-muted">Total</div>
              </div>
              <div className="bg-status-success-bg rounded-lg p-3">
                <div className="text-2xl font-bold text-status-success">{stats.atteints}</div>
                <div className="text-xs text-content-muted">Atteints</div>
              </div>
              <div className="bg-status-info-bg rounded-lg p-3">
                <div className="text-2xl font-bold text-status-info">{stats.enCours}</div>
                <div className="text-xs text-content-muted">En cours</div>
              </div>
            </div>
          )}

          {/* Add button */}
          {!showForm && (
            <Button onClick={() => setShowForm(true)} variant="success" fullWidth icon={Plus}>
              Nouvel Objectif
            </Button>
          )}

          {/* Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-surface-elevated/50 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-bold text-content-primary mb-4">Créer un Objectif</h3>

              {errors.general && (
                <div className="p-3 bg-status-danger-bg border border-status-danger/50 rounded-lg text-status-danger text-sm" role="alert">
                  {errors.general}
                </div>
              )}

              <div>
                <label htmlFor="goal-name" className="block text-sm font-semibold text-content-secondary mb-2">
                  Nom de l'Objectif *
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={formData.nom}
                  onChange={(e) => {
                    setFormData({ ...formData, nom: e.target.value });
                    if (errors.nom) setErrors({ ...errors, nom: undefined });
                  }}
                  className={`w-full bg-surface-elevated border rounded-lg px-4 py-2 text-content-primary ${
                    errors.nom ? 'border-status-danger' : 'border-edge-strong'
                  }`}
                  placeholder="Ex: Voyage, Mariage, Achat maison..."
                  maxLength={100}
                  required
                  aria-invalid={!!errors.nom}
                  aria-describedby={errors.nom ? 'name-error' : undefined}
                />
                {errors.nom && (
                  <p id="name-error" className="text-status-danger text-xs mt-1" role="alert">
                    {errors.nom}
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="goal-amount" className="block text-sm font-semibold text-content-secondary mb-2">
                    <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                    Montant Cible (FCFA) *
                  </label>
                  <input
                    id="goal-amount"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.montantCible}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      setFormData({ ...formData, montantCible: v });
                      if (errors.montantCible) setErrors({ ...errors, montantCible: undefined });
                    }}
                    className={`w-full bg-surface-elevated border rounded-lg px-4 py-2 text-content-primary ${
                      errors.montantCible ? 'border-status-danger' : 'border-edge-strong'
                    }`}
                    required
                    aria-invalid={!!errors.montantCible}
                    aria-describedby={errors.montantCible ? 'amount-error' : undefined}
                  />
                  {errors.montantCible && (
                    <p id="amount-error" className="text-status-danger text-xs mt-1" role="alert">
                      {errors.montantCible}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="goal-date" className="block text-sm font-semibold text-content-secondary mb-2">
                    <Calendar size={16} className="inline mr-2" aria-hidden="true" />
                    Date Cible *
                  </label>
                  <input
                    id="goal-date"
                    type="date"
                    value={formData.dateCible}
                    onChange={(e) => {
                      setFormData({ ...formData, dateCible: e.target.value });
                      if (errors.dateCible) setErrors({ ...errors, dateCible: undefined });
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className={`w-full bg-surface-elevated border rounded-lg px-4 py-2 text-content-primary ${
                      errors.dateCible ? 'border-status-danger' : 'border-edge-strong'
                    }`}
                    required
                    aria-invalid={!!errors.dateCible}
                    aria-describedby={errors.dateCible ? 'date-error' : undefined}
                  />
                  {errors.dateCible && (
                    <p id="date-error" className="text-status-danger text-xs mt-1" role="alert">
                      {errors.dateCible}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="goal-description" className="block text-sm font-semibold text-content-secondary mb-2">
                  Description (optionnel)
                </label>
                <textarea
                  id="goal-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-2 text-content-primary resize-none"
                  rows={2}
                  maxLength={500}
                  placeholder="Détails de votre objectif..."
                />
              </div>

              <div className="flex gap-3">
                <Button type="button" onClick={handleCloseForm} variant="ghost" fullWidth disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" variant="success" fullWidth isLoading={submitting}>
                  Créer l'Objectif
                </Button>
              </div>
            </form>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-4" role="status" aria-label="Chargement des objectifs">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : objectifs.length === 0 ? (
            <div className="text-center py-12 text-content-muted" role="status">
              <Target className="mx-auto mb-3" size={48} aria-hidden="true" />
              <p>Aucun objectif défini</p>
              <p className="text-sm mt-1">Créez votre premier objectif d'épargne</p>
            </div>
          ) : (
            <div className="space-y-4" role="list" aria-label="Liste des objectifs">
              {objectifs.map((objectif) => {
                const pourcentage = (objectif.montantActuel / objectif.montantCible) * 100;
                const { text: joursText, isOverdue } = getDaysRemaining(objectif.dateCible);

                return (
                  <div
                    key={objectif.id}
                    className="bg-surface-elevated/50 border border-edge-strong rounded-lg p-6 hover:border-status-success/50 transition"
                    role="listitem"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-xl font-bold text-content-primary">{escapeHtml(objectif.nom)}</h3>
                          <span className={`px-3 py-1 rounded text-xs font-semibold ${getStatusBadgeColor(objectif.statut)}`}>
                            {ALL_STATUS_LABELS[objectif.statut] || objectif.statut}
                          </span>
                        </div>
                        {objectif.description && (
                          <p className="text-content-muted text-sm mb-3">{escapeHtml(objectif.description)}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-content-muted flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar size={14} aria-hidden="true" />
                            <span className={isOverdue ? 'text-status-danger' : ''}>{joursText}</span>
                          </div>
                          <div>Cible: {formatDate(objectif.dateCible)}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(objectif)}
                        className="p-2 text-status-danger hover:bg-status-danger-bg rounded-lg transition"
                        aria-label={`Supprimer l'objectif ${escapeHtml(objectif.nom)}`}
                        type="button"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-content-muted text-sm">Progression</span>
                        <span className="text-content-primary font-bold">
                          {formatMoney(objectif.montantActuel, { showCurrency: false })} /{' '}
                          {formatMoney(objectif.montantCible, { showCurrency: false })} FCFA
                        </span>
                      </div>
                      <div
                        className="w-full bg-surface-subtle rounded-full h-4"
                        role="progressbar"
                        aria-valuenow={Math.min(pourcentage, 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progression: ${pourcentage.toFixed(1)}%`}
                      >
                        <div
                          className={`h-4 rounded-full bg-gradient-to-r ${getProgressionColor(pourcentage)} transition-all duration-500`}
                          style={{ width: `${Math.min(pourcentage, 100)}%` }}
                        />
                      </div>
                      <div className="text-right text-sm font-bold text-content-primary mt-1">{pourcentage.toFixed(1)}%</div>
                    </div>

                    {objectif.statut === StatutObjectif.IN_PROGRESS && (
                      <Button
                        onClick={() => updateObjectifProgression(objectif)}
                        variant="primary"
                        fullWidth
                        size="sm"
                        icon={TrendingUp}
                      >
                        Mettre à Jour la Progression
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
