import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Target, Plus, X, Calendar, DollarSign, TrendingUp, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { objectifEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, validateDate, VALIDATION_LIMITS } from '../../../lib/validation';
import { formatMoney, formatDate, getDaysRemaining } from '../../../lib/format';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface Objectif {
  id: string;
  nom: string;
  montantCible: number;
  montantActuel: number;
  dateDebut: string;
  dateCible: string;
  statut: 'En cours' | 'Atteint' | 'Abandonné';
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
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadObjectifs();
  }, [compteId]);

  const loadObjectifs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await objectifEpargneApi.getByCompte(compteId);
      setObjectifs(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des objectifs'));
      setObjectifs([]);
    } finally {
      setLoading(false);
    }
  }, [compteId]);

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
        loadObjectifs();

        toast.success('Objectif créé avec succès');
      } catch (error) {
        toast.error(handleApiError(error, "Erreur lors de la création de l'objectif"));
      } finally {
        setSubmitting(false);
      }
    },
    [formData, compteId, validateForm, loadObjectifs]
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
            loadObjectifs();
            toast.success('Objectif supprimé');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors de la suppression'));
          }
        },
      });
    },
    [loadObjectifs, openConfirm]
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
        loadObjectifs();
        toast.success('Progression mise à jour');
      } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors de la mise à jour'));
      }
    },
    [compteSolde, loadObjectifs]
  );

  const getProgressionColor = useCallback((pourcentage: number) => {
    if (pourcentage >= 100) return 'from-green-500 to-emerald-600';
    if (pourcentage >= 75) return 'from-blue-500 to-cyan-600';
    if (pourcentage >= 50) return 'from-cyan-500 to-emerald-600';
    return 'from-blue-500 to-cyan-600';
  }, []);

  const getStatusBadgeColor = useCallback((statut: string) => {
    switch (statut) {
      case 'Atteint':
        return 'bg-green-500/20 text-green-400';
      case 'Abandonné':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-blue-500/20 text-blue-400';
    }
  }, []);

  // Memoized stats
  const stats = useMemo(() => {
    const total = objectifs.length;
    const atteints = objectifs.filter((o) => o.statut === 'Atteint').length;
    const enCours = objectifs.filter((o) => o.statut === 'En cours').length;
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
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Target className="text-green-400" size={24} aria-hidden="true" />
            <div>
              <h2 id="goals-title" className="text-2xl font-bold text-white">
                Objectifs d'Épargne
              </h2>
              <p className="text-slate-400 text-sm">
                Solde disponible: <span className="text-green-400 font-semibold">{formatMoney(compteSolde)}</span>
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
              <div className="bg-slate-700/30 rounded-lg p-3">
                <div className="text-2xl font-bold text-white">{stats.total}</div>
                <div className="text-xs text-slate-400">Total</div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-400">{stats.atteints}</div>
                <div className="text-xs text-slate-400">Atteints</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-400">{stats.enCours}</div>
                <div className="text-xs text-slate-400">En cours</div>
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
            <form onSubmit={handleSubmit} className="bg-slate-700/50 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-bold text-white mb-4">Créer un Objectif</h3>

              {errors.general && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm" role="alert">
                  {errors.general}
                </div>
              )}

              <div>
                <label htmlFor="goal-name" className="block text-sm font-semibold text-slate-300 mb-2">
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
                  className={`w-full bg-slate-700 border rounded-lg px-4 py-2 text-white ${
                    errors.nom ? 'border-red-500' : 'border-slate-600'
                  }`}
                  placeholder="Ex: Voyage, Mariage, Achat maison..."
                  maxLength={100}
                  required
                  aria-invalid={!!errors.nom}
                  aria-describedby={errors.nom ? 'name-error' : undefined}
                />
                {errors.nom && (
                  <p id="name-error" className="text-red-400 text-xs mt-1" role="alert">
                    {errors.nom}
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="goal-amount" className="block text-sm font-semibold text-slate-300 mb-2">
                    <DollarSign size={16} className="inline mr-2" aria-hidden="true" />
                    Montant Cible (FCFA) *
                  </label>
                  <input
                    id="goal-amount"
                    type="number"
                    min="1000"
                    max={VALIDATION_LIMITS.MAX_EPARGNE}
                    value={formData.montantCible}
                    onChange={(e) => {
                      setFormData({ ...formData, montantCible: e.target.value });
                      if (errors.montantCible) setErrors({ ...errors, montantCible: undefined });
                    }}
                    className={`w-full bg-slate-700 border rounded-lg px-4 py-2 text-white ${
                      errors.montantCible ? 'border-red-500' : 'border-slate-600'
                    }`}
                    required
                    aria-invalid={!!errors.montantCible}
                    aria-describedby={errors.montantCible ? 'amount-error' : undefined}
                  />
                  {errors.montantCible && (
                    <p id="amount-error" className="text-red-400 text-xs mt-1" role="alert">
                      {errors.montantCible}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="goal-date" className="block text-sm font-semibold text-slate-300 mb-2">
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
                    className={`w-full bg-slate-700 border rounded-lg px-4 py-2 text-white ${
                      errors.dateCible ? 'border-red-500' : 'border-slate-600'
                    }`}
                    required
                    aria-invalid={!!errors.dateCible}
                    aria-describedby={errors.dateCible ? 'date-error' : undefined}
                  />
                  {errors.dateCible && (
                    <p id="date-error" className="text-red-400 text-xs mt-1" role="alert">
                      {errors.dateCible}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="goal-description" className="block text-sm font-semibold text-slate-300 mb-2">
                  Description (optionnel)
                </label>
                <textarea
                  id="goal-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white resize-none"
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
            <div className="text-center py-12 text-slate-400" role="status">
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
                    className="bg-slate-700/50 border border-slate-600 rounded-lg p-6 hover:border-green-500/50 transition"
                    role="listitem"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-xl font-bold text-white">{escapeHtml(objectif.nom)}</h3>
                          <span className={`px-3 py-1 rounded text-xs font-semibold ${getStatusBadgeColor(objectif.statut)}`}>
                            {objectif.statut}
                          </span>
                        </div>
                        {objectif.description && (
                          <p className="text-slate-400 text-sm mb-3">{escapeHtml(objectif.description)}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar size={14} aria-hidden="true" />
                            <span className={isOverdue ? 'text-red-400' : ''}>{joursText}</span>
                          </div>
                          <div>Cible: {formatDate(objectif.dateCible)}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(objectif)}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                        aria-label={`Supprimer l'objectif ${escapeHtml(objectif.nom)}`}
                        type="button"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-400 text-sm">Progression</span>
                        <span className="text-white font-bold">
                          {formatMoney(objectif.montantActuel, { showCurrency: false })} /{' '}
                          {formatMoney(objectif.montantCible, { showCurrency: false })} FCFA
                        </span>
                      </div>
                      <div
                        className="w-full bg-slate-600 rounded-full h-4"
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
                      <div className="text-right text-sm font-bold text-white mt-1">{pourcentage.toFixed(1)}%</div>
                    </div>

                    {objectif.statut === 'En cours' && (
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
