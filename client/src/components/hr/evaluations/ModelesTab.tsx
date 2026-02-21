import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, GripVertical, FileText } from 'lucide-react';
import { Button, Modal, Card, Badge, LoadingSpinner, EmptyState, ConfirmDialog } from '../../ui';
import { useEvaluationTemplates, type EvaluationTemplate } from '../../../hooks/hr/useEvaluations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriterionForm {
  libelle: string;
  description?: string;
  categorie: string;
  poids: number;
  ordre: number;
}

const CATEGORIES = [
  { value: 'TECHNIQUE', label: 'Technique' },
  { value: 'COMPORTEMENT', label: 'Comportement' },
  { value: 'OBJECTIFS', label: 'Objectifs' },
  { value: 'LEADERSHIP', label: 'Leadership' },
  { value: 'AUTRE', label: 'Autre' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  TECHNIQUE: 'Technique',
  COMPORTEMENT: 'Comportement',
  OBJECTIFS: 'Objectifs',
  LEADERSHIP: 'Leadership',
  AUTRE: 'Autre',
};

const emptyCriterion = (): CriterionForm => ({
  libelle: '',
  categorie: 'TECHNIQUE',
  poids: 0,
  ordre: 1,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModelesTab() {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate, isCreating } =
    useEvaluationTemplates();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<CriterionForm[]>([emptyCriterion()]);

  // Derived
  const totalPoids = useMemo(() => criteria.reduce((s, c) => s + (c.poids || 0), 0), [criteria]);
  const poidsValid = totalPoids === 100;

  // ---- Helpers ----

  const resetForm = () => {
    setNom('');
    setDescription('');
    setCriteria([emptyCriterion()]);
    setEditingTemplate(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (t: EvaluationTemplate) => {
    setEditingTemplate(t);
    setNom(t.nom);
    setDescription(t.description ?? '');
    setCriteria(
      t.criteria.length > 0
        ? t.criteria.map((c) => ({
            libelle: c.libelle,
            description: c.description ?? undefined,
            categorie: c.categorie,
            poids: c.poids,
            ordre: c.ordre,
          }))
        : [emptyCriterion()],
    );
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  // Criteria helpers
  const updateCriterion = (idx: number, patch: Partial<CriterionForm>) => {
    setCriteria((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addCriterion = () => {
    setCriteria((prev) => [...prev, { ...emptyCriterion(), ordre: prev.length + 1 }]);
  };

  const removeCriterion = (idx: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordre: i + 1 })));
  };

  // Submit
  const handleSubmit = async () => {
    if (!nom.trim() || criteria.length === 0 || !poidsValid) return;

    const payload = {
      nom: nom.trim(),
      description: description.trim() || undefined,
      criteria: criteria.map((c, i) => ({
        libelle: c.libelle.trim(),
        description: c.description?.trim() || undefined,
        categorie: c.categorie,
        poids: c.poids,
        ordre: i + 1,
      })),
    };

    if (editingTemplate) {
      await updateTemplate({ id: editingTemplate.id, ...payload });
    } else {
      await createTemplate(payload);
    }
    closeModal();
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await deleteTemplate(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  // ---- Render ----

  if (loading) {
    return <LoadingSpinner text="Chargement des modèles..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-content-primary">Modèles d'évaluation</h2>
          <p className="text-sm text-content-muted mt-1">
            Gérez les modèles et leurs critères de notation
          </p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
          Nouveau modèle
        </Button>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun modèle"
          description="Créez votre premier modèle d'évaluation pour commencer."
          action={{ label: 'Créer un modèle', onClick: openCreate }}
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} padding="sm">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-content-primary truncate">{t.nom}</span>
                    {t.isDefault && <Badge value="Par défaut" variant="info" size="xs" />}
                  </div>
                  {t.description && (
                    <p className="text-sm text-content-muted mt-0.5 line-clamp-1">{t.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-content-secondary">
                    {t.criteriaCount} critère{t.criteriaCount !== 1 ? 's' : ''}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" icon={Edit2} onClick={() => openEdit(t)}>
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={Trash2}
                      onClick={() => setConfirmDeleteId(t.id)}
                      className="text-status-danger hover:text-status-danger"
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTemplate ? 'Modifier le modèle' : 'Nouveau modèle'}
        size="xl"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="ghost" size="md" onClick={closeModal}>
              Annuler
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              isLoading={isCreating}
              disabled={!nom.trim() || criteria.length === 0 || !poidsValid}
            >
              {editingTemplate ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Nom du modèle <span className="text-status-danger">*</span>
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Évaluation annuelle"
              className="w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description optionnelle du modèle"
              className="w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus resize-none"
            />
          </div>

          {/* Criteria builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-content-primary">Critères</h3>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-semibold ${poidsValid ? 'text-status-success' : 'text-status-danger'}`}
                >
                  Total : {totalPoids}%{poidsValid ? '' : ' (doit = 100%)'}
                </span>
                <Button variant="ghost" size="xs" icon={Plus} onClick={addCriterion}>
                  Ajouter
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {criteria.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-edge bg-surface-subtle p-3 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <GripVertical size={16} className="text-content-muted mt-2.5 shrink-0" />

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Libelle */}
                      <div className="sm:col-span-5">
                        <label className="block text-xs text-content-muted mb-1">
                          Libellé <span className="text-status-danger">*</span>
                        </label>
                        <input
                          type="text"
                          value={c.libelle}
                          onChange={(e) => updateCriterion(idx, { libelle: e.target.value })}
                          placeholder="Nom du critère"
                          className="w-full rounded border border-input-border bg-input px-2 py-1.5 text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none"
                        />
                      </div>

                      {/* Categorie */}
                      <div className="sm:col-span-4">
                        <label className="block text-xs text-content-muted mb-1">Catégorie</label>
                        <select
                          value={c.categorie}
                          onChange={(e) => updateCriterion(idx, { categorie: e.target.value })}
                          className="w-full rounded border border-input-border bg-input px-2 py-1.5 text-sm text-content-primary focus:border-input-focus focus:outline-none"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat.value} value={cat.value}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Poids */}
                      <div className="sm:col-span-3">
                        <label className="block text-xs text-content-muted mb-1">Poids (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={c.poids}
                          onChange={(e) =>
                            updateCriterion(idx, { poids: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-full rounded border border-input-border bg-input px-2 py-1.5 text-sm text-content-primary focus:border-input-focus focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeCriterion(idx)}
                      disabled={criteria.length <= 1}
                      className="mt-5 p-1 rounded text-content-muted hover:text-status-danger hover:bg-status-danger-bg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Supprimer ce critère"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Description (optional) */}
                  <div className="ml-6">
                    <input
                      type="text"
                      value={c.description ?? ''}
                      onChange={(e) =>
                        updateCriterion(idx, {
                          description: e.target.value || undefined,
                        })
                      }
                      placeholder="Description optionnelle du critère"
                      className="w-full rounded border border-input-border bg-input px-2 py-1.5 text-xs text-content-secondary placeholder:text-content-muted focus:border-input-focus focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Weight bar indicator */}
            <div className="mt-3">
              <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    poidsValid ? 'bg-status-success' : totalPoids > 100 ? 'bg-status-danger' : 'bg-status-warning'
                  }`}
                  style={{ width: `${Math.min(totalPoids, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer le modèle"
        message="Cette action est irréversible. Toutes les données liées à ce modèle seront perdues."
        variant="danger"
        confirmText="Supprimer"
        cancelText="Annuler"
      />
    </div>
  );
}
