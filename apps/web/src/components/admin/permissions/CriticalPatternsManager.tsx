import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { AlertTriangle, Plus, Edit2, Trash2, Save, X, RefreshCw, AlertCircle } from 'lucide-react';
import { Button, Badge, Modal, ConfirmDialog } from '@/components/ui';
import Switch from '@/components/ui/Switch';
import { useCriticalPatterns, type CriticalPattern } from '@/hooks/admin/useCriticalPatterns';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

// ──────────────────────────────────────────────
// Pattern Row (inline edit)
// ──────────────────────────────────────────────

function PatternRow({
  pattern,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  pattern: CriticalPattern;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: Partial<CriticalPattern>) => Promise<void>;
  onDelete: () => void;
}) {
  const [description, setDescription] = useState(pattern.description || '');
  const [requireReason, setRequireReason] = useState(pattern.requireReason);
  const [requireApproval, setRequireApproval] = useState(pattern.requireSupervisorApproval);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ description, requireReason, requireSupervisorApproval: requireApproval });
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <tr className="border-b border-edge/50 bg-accent/5">
        <td className="px-3 py-2">
          <code className="text-xs font-mono bg-surface-subtle/30 px-1.5 py-0.5 rounded text-accent">
            {pattern.pattern}
          </code>
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-input-border rounded bg-input text-content-primary"
            placeholder="Description..."
          />
        </td>
        <td className="px-3 py-2 text-center">
          <Switch checked={requireReason} onChange={setRequireReason} />
        </td>
        <td className="px-3 py-2 text-center">
          <Switch checked={requireApproval} onChange={setRequireApproval} />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="xs" tone="current" /> : <Save size={12} />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={saving}>
              <X size={12} />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-edge/50 hover:bg-surface-subtle/20 transition-colors">
      <td className="px-3 py-2">
        <code className="text-xs font-mono bg-surface-subtle/30 px-1.5 py-0.5 rounded text-accent">
          {pattern.pattern}
        </code>
      </td>
      <td className="px-3 py-2 text-xs text-content-muted">
        {pattern.description || '—'}
      </td>
      <td className="px-3 py-2 text-center">
        {pattern.requireReason ? (
          <Badge variant="success" size="xs">Oui</Badge>
        ) : (
          <Badge variant="neutral" size="xs">Non</Badge>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {pattern.requireSupervisorApproval ? (
          <Badge variant="warning" size="xs">Oui</Badge>
        ) : (
          <Badge variant="neutral" size="xs">Non</Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Modifier">
            <Edit2 size={12} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Supprimer">
            <Trash2 size={12} className="text-status-danger" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ──────────────────────────────────────────────
// Create Modal
// ──────────────────────────────────────────────

function CreatePatternModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { pattern: string; description?: string; requireReason?: boolean; requireSupervisorApproval?: boolean }) => Promise<void>;
}) {
  const [pattern, setPattern] = useState('');
  const [description, setDescription] = useState('');
  const [requireReason, setRequireReason] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        pattern: pattern.trim(),
        description: description.trim() || undefined,
        requireReason,
        requireSupervisorApproval: requireApproval,
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
      title="Nouveau Pattern Critique"
      size="md"
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
            Pattern <span className="text-status-danger">*</span>
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none"
            placeholder="ex: paiements.%, admin.%, coffre.%"
            required
            autoFocus
          />
          <p className="text-[10px] text-content-muted mt-1">
            Utilisez <code className="bg-surface-subtle/30 px-1 rounded">%</code> comme wildcard. Ex: <code className="bg-surface-subtle/30 px-1 rounded">admin.%</code> = toutes les permissions admin.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none resize-none"
            placeholder="Description du pattern..."
            rows={2}
          />
        </div>

        <div className="space-y-3 border-t border-edge pt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-content-secondary">Raison requise</p>
              <p className="text-[10px] text-content-muted">Exiger une justification lors de modification</p>
            </div>
            <Switch checked={requireReason} onChange={setRequireReason} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-content-secondary">Approbation superviseur</p>
              <p className="text-[10px] text-content-muted">Nécessite validation d'un superviseur</p>
            </div>
            <Switch checked={requireApproval} onChange={setRequireApproval} />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-edge">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!pattern.trim() || submitting}>
            {submitting ? <Spinner size="xs" tone="current" className="mr-1" /> : <Plus size={12} className="mr-1" />}
            Créer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export default function CriticalPatternsManager() {
  const { patterns, loading, error, refresh, createPattern, updatePattern, deletePattern } = useCriticalPatterns();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const handleDelete = (id: string, patternStr: string) => {
    openConfirm({
      title: 'Supprimer le pattern',
      message: `Êtes-vous sûr de vouloir supprimer le pattern "${patternStr}" ? Les permissions correspondantes ne nécessiteront plus de justification.`,
      variant: 'danger',
      onConfirm: async () => {
        await deletePattern(id);
      },
    });
  };

  if (loading && patterns.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="sm" tone="current" className="text-content-muted" />
        <span className="ml-2 text-sm text-content-muted">Chargement...</span>
      </div>
    );
  }

  if (error && patterns.length === 0) {
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

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
            <AlertTriangle size={14} className="text-status-warning" />
            Patterns de Permissions Critiques
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            Les permissions correspondant à ces patterns nécessitent une justification lors de modification
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw size={12} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={12} className="mr-1" />
            Nouveau
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-surface-subtle/30 rounded-lg px-3 py-2 border border-edge-subtle shrink-0">
        <p className="text-[10px] text-content-muted">
          Le symbole <code className="bg-surface/50 px-1 rounded font-mono">%</code> est un wildcard.
          <code className="bg-surface/50 px-1 rounded font-mono ml-1">admin.%</code> correspond à toutes les permissions commençant par <code className="bg-surface/50 px-1 rounded font-mono">admin.</code>
        </p>
      </div>

      {/* Table */}
      <div className="border border-edge rounded-lg overflow-hidden bg-surface flex-1">
        <table className="w-full text-xs">
          <thead className="bg-surface-subtle/30 border-b border-edge sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-content-secondary">Pattern</th>
              <th className="text-left px-3 py-2 font-semibold text-content-secondary">Description</th>
              <th className="text-center px-3 py-2 font-semibold text-content-secondary w-28">Raison</th>
              <th className="text-center px-3 py-2 font-semibold text-content-secondary w-28">Superviseur</th>
              <th className="text-right px-3 py-2 font-semibold text-content-secondary w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {patterns.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-content-muted">
                  Aucun pattern défini
                </td>
              </tr>
            ) : (
              patterns.map((pattern) => (
                <PatternRow
                  key={pattern.id}
                  pattern={pattern}
                  isEditing={editingId === pattern.id}
                  onEdit={() => setEditingId(pattern.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={async (data) => {
                    await updatePattern(pattern.id, data);
                    setEditingId(null);
                  }}
                  onDelete={() => handleDelete(pattern.id, pattern.pattern)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-content-muted shrink-0">
        <span>{patterns.length} pattern{patterns.length !== 1 ? 's' : ''}</span>
        <span>{patterns.filter(p => p.requireReason).length} avec raison requise</span>
        <span>{patterns.filter(p => p.requireSupervisorApproval).length} avec approbation superviseur</span>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePatternModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createPattern}
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
