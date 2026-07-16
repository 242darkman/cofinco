import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Braces, Plus, Edit2, Trash2, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Lock, Variable } from 'lucide-react';
import { Button, Badge, Modal, ConfirmDialog } from '@/components/ui';
import { useConditionTemplates, type ConditionTemplate } from '@/hooks/admin/useConditionTemplates';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

// ──────────────────────────────────────────────
// Supported variables reference
// ──────────────────────────────────────────────

const KNOWN_VARIABLES = [
  { name: '${userId}', desc: 'ID utilisateur courant' },
  { name: '${agenceId}', desc: 'Agence active' },
  { name: '${role}', desc: 'Rôle principal' },
  { name: '${roles}', desc: 'Tous les rôles (array)' },
  { name: '${now}', desc: 'Horodatage courant' },
  { name: '${startOfDay}', desc: 'Début du jour' },
  { name: '${endOfDay}', desc: 'Fin du jour' },
  { name: '${startOfWeek}', desc: 'Début de la semaine' },
  { name: '${startOfMonth}', desc: 'Début du mois' },
];

// ──────────────────────────────────────────────
// Template Card
// ──────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: ConditionTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const variables = Array.isArray(template.variables) ? template.variables : [];
  const examples = Array.isArray(template.examples) ? template.examples : [];

  return (
    <div className="border border-edge rounded-lg bg-surface overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button type="button" className="shrink-0 text-content-muted">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono font-semibold text-accent">{template.name}</code>
            {template.isSystem ? (
              <Badge variant="neutral" size="xs">
                <Lock size={8} className="mr-0.5" />
                Système
              </Badge>
            ) : (
              <Badge variant="success" size="xs">Custom</Badge>
            )}
          </div>
          {template.description && (
            <p className="text-[10px] text-content-muted mt-0.5 truncate">{template.description}</p>
          )}
        </div>

        {/* Variables count */}
        {variables.length > 0 && (
          <Badge variant="neutral" size="xs">
            {variables.length} var{variables.length > 1 ? 's' : ''}
          </Badge>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            title={template.isSystem ? 'Non modifiable (système)' : 'Modifier'}
            disabled={template.isSystem}
          >
            <Edit2 size={12} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title={template.isSystem ? 'Non supprimable (système)' : 'Supprimer'}
            disabled={template.isSystem}
          >
            <Trash2 size={12} className={template.isSystem ? 'text-content-muted' : 'text-status-danger'} />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-edge px-3 py-2.5 space-y-2.5 bg-surface-subtle/20">
          {/* Condition Schema */}
          <div>
            <p className="text-[10px] text-content-muted uppercase tracking-wider font-medium mb-1">Schéma de condition</p>
            <pre className="text-[10px] font-mono bg-surface-base border border-edge-subtle rounded p-2 overflow-x-auto text-content-secondary">
              {JSON.stringify(template.conditionSchema, null, 2)}
            </pre>
          </div>

          {/* Variables */}
          {variables.length > 0 && (
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wider font-medium mb-1">Variables</p>
              <div className="flex flex-wrap gap-1">
                {variables.map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5 text-[10px] text-accent font-mono"
                  >
                    <Variable size={8} />
                    {String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {examples.length > 0 && (
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wider font-medium mb-1">Exemples</p>
              <div className="space-y-1">
                {examples.map((ex, i) => (
                  <div key={i} className="bg-surface-base border border-edge-subtle rounded px-2 py-1.5">
                    <p className="text-[10px] text-content-secondary font-medium">{(ex as { description?: string }).description || `Exemple ${i + 1}`}</p>
                    <pre className="text-[9px] font-mono text-content-muted mt-0.5">
                      {JSON.stringify((ex as { values?: unknown }).values || ex, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Create/Edit Modal
// ──────────────────────────────────────────────

function TemplateFormModal({
  template,
  onClose,
  onSave,
}: {
  template?: ConditionTemplate;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    conditionSchema: Record<string, unknown>;
    variables?: string[];
    examples?: Array<{ description: string; values: Record<string, unknown> }>;
  }) => Promise<void>;
}) {
  const isEditing = !!template;
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [schemaText, setSchemaText] = useState(
    template ? JSON.stringify(template.conditionSchema, null, 2) : '{\n  \n}'
  );
  const [variablesText, setVariablesText] = useState(
    template && Array.isArray(template.variables) ? template.variables.join(', ') : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [schemaError, setSchemaError] = useState('');

  const validateSchema = (text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setSchemaError('Doit être un objet JSON {}');
        return null;
      }
      if (Object.keys(parsed).length === 0) {
        setSchemaError('L\'objet ne peut pas être vide');
        return null;
      }
      setSchemaError('');
      return parsed;
    } catch {
      setSchemaError('JSON invalide');
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedSchema = validateSchema(schemaText);
    if (!parsedSchema) return;

    const variables = variablesText
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);

    setSubmitting(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        conditionSchema: parsedSchema,
        variables: variables.length > 0 ? variables : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEditing ? 'Modifier le Template' : 'Nouveau Template de Condition'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2 text-xs text-status-danger flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Nom <span className="text-status-danger">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none font-mono"
            placeholder="ex: amount_limit, same_agency_read"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none resize-none"
            placeholder="Description du template..."
            rows={2}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Schéma de condition (JSON) <span className="text-status-danger">*</span>
          </label>
          <textarea
            value={schemaText}
            onChange={(e) => { setSchemaText(e.target.value); setSchemaError(''); }}
            className={`w-full px-3 py-2 text-sm border rounded bg-input text-content-primary focus:border-input-focus outline-none resize-none font-mono ${
              schemaError ? 'border-status-danger' : 'border-input-border'
            }`}
            placeholder='{ "amount": { "$lte": "$maxAmount" } }'
            rows={5}
          />
          {schemaError && (
            <p className="text-[10px] text-status-danger mt-1">{schemaError}</p>
          )}
          <p className="text-[10px] text-content-muted mt-1">
            Opérateurs MongoDB supportés : <code className="bg-surface-subtle/30 px-1 rounded">$eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $not, $exists</code>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Variables (séparées par des virgules)
          </label>
          <input
            type="text"
            value={variablesText}
            onChange={(e) => setVariablesText(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none font-mono"
            placeholder="ex: maxAmount, allowedStatuses"
          />
          <p className="text-[10px] text-content-muted mt-1">
            Variables contextuelles auto-résolues : <code className="bg-surface-subtle/30 px-1 rounded">userId, agenceId, role, now, startOfDay</code>
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-edge">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? <Spinner size="xs" tone="current" className="mr-1" /> : <Plus size={12} className="mr-1" />}
            {isEditing ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export default function ConditionTemplatesManager() {
  const { templates, loading, error, refresh, createTemplate, updateTemplate, deleteTemplate } = useConditionTemplates();
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConditionTemplate | null>(null);
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const handleEdit = (template: ConditionTemplate) => {
    setEditingTemplate(template);
    setShowFormModal(true);
  };

  const handleDelete = (template: ConditionTemplate) => {
    openConfirm({
      title: 'Supprimer le template',
      message: `Êtes-vous sûr de vouloir supprimer le template "${template.name}" ? Cette action est irréversible.`,
      variant: 'danger',
      onConfirm: async () => {
        await deleteTemplate(template.id);
      },
    });
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowFormModal(true);
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="sm" tone="current" className="text-content-muted" />
        <span className="ml-2 text-sm text-content-muted">Chargement...</span>
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle size={32} className="text-status-danger mb-2" />
        <p className="text-sm text-status-danger">{error}</p>
        <Button variant="ghost" size="sm" onClick={refresh} className="mt-3">
          Réessayer
        </Button>
      </div>
    );
  }

  const systemCount = templates.filter(t => t.isSystem).length;
  const customCount = templates.filter(t => !t.isSystem).length;

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
            <Braces size={14} className="text-accent" />
            Templates de Conditions
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            Modèles réutilisables de conditions CASL pour restreindre les permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw size={12} />
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            <Plus size={12} className="mr-1" />
            Nouveau
          </Button>
        </div>
      </div>

      {/* Info banner - Variables reference */}
      <div className="bg-surface-subtle/30 rounded-lg px-3 py-2 border border-edge-subtle shrink-0">
        <p className="text-[10px] text-content-muted uppercase tracking-wider font-medium mb-1.5">Variables contextuelles disponibles</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {KNOWN_VARIABLES.map(v => (
            <span key={v.name} className="text-[10px] text-content-muted">
              <code className="bg-surface/50 px-1 rounded font-mono text-accent">{v.name}</code>
              <span className="ml-1">{v.desc}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Templates list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-content-muted text-sm border border-edge rounded-lg bg-surface-base">
            <p>Aucun template défini</p>
            <p className="text-[10px] mt-1">Cliquez sur « Nouveau » pour créer un template de condition</p>
          </div>
        ) : (
          templates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => handleDelete(template)}
            />
          ))
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-content-muted shrink-0">
        <span>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
        <span>{systemCount} système</span>
        <span>{customCount} custom</span>
      </div>

      {/* Form Modal */}
      {showFormModal && (
        <TemplateFormModal
          template={editingTemplate || undefined}
          onClose={() => { setShowFormModal(false); setEditingTemplate(null); }}
          onSave={async (data) => {
            if (editingTemplate) {
              await updateTemplate(editingTemplate.id, data);
            } else {
              await createTemplate(data);
            }
          }}
        />
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || 'Confirmer'}
        message={confirmState.message || 'Êtes-vous sûr ?'}
        variant={confirmState.variant || 'warning'}
      />
    </div>
  );
}
