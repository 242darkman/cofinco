import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Shield, ChevronDown, RefreshCw, AlertCircle, GitBranch, Plus, X, Trash2 } from 'lucide-react';
import { useRoleHierarchy, type RoleHierarchyNode } from '@/hooks/admin/useRoleHierarchy';
import { getRoleBadgeStyle } from '@/lib/role-utils';
import { Button, Badge, Modal, ConfirmDialog } from '@/components/ui';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ROLE_LABELS } from '@shared/types/roles';

// ──────────────────────────────────────────────
// Add Relation Modal
// ──────────────────────────────────────────────

function AddRelationModal({
  nodes,
  onClose,
  onAdd,
}: {
  nodes: RoleHierarchyNode[];
  onClose: () => void;
  onAdd: (parentRole: string, childRole: string) => Promise<void>;
}) {
  const [parentRole, setParentRole] = useState('');
  const [childRole, setChildRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

  // Filter out roles that would create obvious issues
  const childOptions = roleOptions.filter(r => r.value !== parentRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentRole || !childRole) return;
    setSubmitting(true);
    setError('');
    try {
      await onAdd(parentRole, childRole);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nouvelle Relation de Hiérarchie" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2 text-xs text-status-danger flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="bg-surface-subtle/30 rounded-lg px-3 py-2 border border-edge-subtle">
          <p className="text-[10px] text-content-muted">
            Le rôle <strong>parent</strong> héritera automatiquement de toutes les permissions du rôle <strong>enfant</strong> (et de ses descendants).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Rôle Parent <span className="text-status-danger">*</span>
          </label>
          <select
            value={parentRole}
            onChange={(e) => { setParentRole(e.target.value); if (e.target.value === childRole) setChildRole(''); }}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none"
            required
          >
            <option value="">Sélectionner un rôle parent...</option>
            {roleOptions.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-center">
          <div className="flex items-center gap-2 text-content-muted">
            <ChevronDown size={16} />
            <span className="text-[10px] uppercase tracking-wider font-medium">hérite de</span>
            <ChevronDown size={16} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
            Rôle Enfant <span className="text-status-danger">*</span>
          </label>
          <select
            value={childRole}
            onChange={(e) => setChildRole(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input-border rounded bg-input text-content-primary focus:border-input-focus outline-none"
            required
            disabled={!parentRole}
          >
            <option value="">Sélectionner un rôle enfant...</option>
            {childOptions.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-edge">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!parentRole || !childRole || submitting}>
            {submitting ? <Spinner size="xs" tone="current" className="mr-1" /> : <Plus size={12} className="mr-1" />}
            Créer la relation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export default function RoleHierarchyTree() {
  const { nodes, relations, loading, error, refresh, addRelation, removeRelation } = useRoleHierarchy();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="sm" tone="current" className="text-content-muted" />
        <span className="ml-2 text-sm text-content-muted">Chargement de la hiérarchie...</span>
      </div>
    );
  }

  if (error && nodes.length === 0) {
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

  const handleRemoveRelation = (parentRole: string, childRole: string) => {
    const relation = relations.find(r => r.parentRole === parentRole && r.childRole === childRole);
    if (!relation) return;

    const parentLabel = getRoleBadgeStyle(parentRole).label;
    const childLabel = getRoleBadgeStyle(childRole).label;

    openConfirm({
      title: 'Supprimer la relation',
      message: `Supprimer la relation "${parentLabel} → ${childLabel}" ? Le rôle parent n'héritera plus des permissions du rôle enfant.`,
      variant: 'danger',
      onConfirm: async () => {
        setRemoving(relation.id);
        try {
          await removeRelation(relation.id);
        } finally {
          setRemoving(null);
        }
      },
    });
  };

  // Find root nodes (no parents) — these are the top of the hierarchy
  const rootNodes = nodes.filter(n => n.parents.length === 0);
  // Also find orphan nodes (no parents AND no children — standalone roles)
  const orphanNodes = nodes.filter(n => n.parents.length === 0 && n.children.length === 0);
  // Root nodes that have children
  const treeRoots = rootNodes.filter(n => n.children.length > 0);

  const renderNode = (role: string, parentRole: string | null = null, level: number = 0): React.ReactNode => {
    const node = nodes.find(n => n.role === role);
    if (!node) return null;

    const { label, classes } = getRoleBadgeStyle(role);
    const totalPermissions = node.directPermissions + node.inheritedPermissions;

    // Find the relation ID for this specific parent→child link
    const relation = parentRole
      ? relations.find(r => r.parentRole === parentRole && r.childRole === role)
      : null;

    return (
      <div key={`${parentRole || 'root'}-${node.role}`}>
        {/* Connector line */}
        <div className="flex items-stretch" style={{ paddingLeft: level * 32 }}>
          {level > 0 && (
            <div className="flex items-center w-8 shrink-0">
              <div className="w-4 h-px bg-edge-subtle" />
              <ChevronDown size={10} className="text-content-muted -rotate-90" />
            </div>
          )}

          {/* Node card */}
          <div className="flex-1 flex items-center gap-3 px-3 py-2.5 my-1 rounded-lg border border-edge bg-surface hover:bg-surface-elevated/50 transition-colors group">
            {/* Role badge icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${classes}`}>
              <Shield size={14} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-content-primary">{label}</span>
                <code className="text-[9px] text-content-muted font-mono">{node.role}</code>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-content-muted">
                  <span className="font-medium text-accent">{node.directPermissions}</span> directes
                </span>
                {node.inheritedPermissions > 0 && (
                  <>
                    <span className="text-[10px] text-content-muted">+</span>
                    <span className="text-xs text-status-success">
                      <span className="font-medium">{node.inheritedPermissions}</span> héritées
                    </span>
                  </>
                )}
                <span className="text-[10px] text-content-muted">
                  = <span className="font-semibold text-content-secondary">{totalPermissions}</span> total
                </span>
              </div>
            </div>

            {/* Children count */}
            {node.children.length > 0 && (
              <Badge variant="neutral" size="xs">
                {node.children.length} sous-rôle{node.children.length > 1 ? 's' : ''}
              </Badge>
            )}

            {/* Remove relation button (only for child nodes) */}
            {relation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveRelation(parentRole!, role)}
                disabled={removing === relation.id}
                title="Supprimer cette relation"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {removing === relation.id ? (
                  <Spinner size="xs" tone="current" />
                ) : (
                  <Trash2 size={12} className="text-status-danger" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Children */}
        {node.children.map((childRole) => renderNode(childRole, node.role, level + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
            <GitBranch size={14} className="text-accent" />
            Hiérarchie des Rôles
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            Les rôles parents héritent automatiquement des permissions de leurs sous-rôles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw size={12} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={12} className="mr-1" />
            Relation
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-surface-subtle/30 rounded-lg px-3 py-2 border border-edge-subtle shrink-0">
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-content-muted">Directes : permissions attribuées au rôle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-success" />
            <span className="text-content-muted">Héritées : permissions des sous-rôles</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronDown size={10} className="text-content-muted -rotate-90" />
            <span className="text-content-muted">Relation parent → enfant</span>
          </div>
        </div>
      </div>

      {/* Relations list */}
      {relations.length > 0 && (
        <div className="bg-surface-subtle/30 rounded-lg px-3 py-2 border border-edge-subtle shrink-0">
          <p className="text-[10px] text-content-muted uppercase tracking-wider font-medium mb-1.5">Relations actives</p>
          <div className="flex flex-wrap gap-1.5">
            {relations.map(rel => {
              const pLabel = getRoleBadgeStyle(rel.parentRole).label;
              const cLabel = getRoleBadgeStyle(rel.childRole).label;
              return (
                <span
                  key={rel.id}
                  className="inline-flex items-center gap-1 bg-surface/50 border border-edge-subtle rounded px-2 py-0.5 text-[10px] text-content-secondary"
                >
                  {pLabel} → {cLabel}
                  <button
                    type="button"
                    onClick={() => handleRemoveRelation(rel.parentRole, rel.childRole)}
                    className="ml-0.5 text-content-muted hover:text-status-danger transition-colors"
                    title="Supprimer"
                    disabled={removing === rel.id}
                  >
                    {removing === rel.id ? <Spinner size="xs" tone="current" /> : <X size={8} />}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="border border-edge rounded-lg p-3 bg-surface-base flex-1 overflow-y-auto">
        {treeRoots.length === 0 && orphanNodes.length === 0 ? (
          <div className="text-center py-8 text-content-muted text-sm">
            <p>Aucune hiérarchie définie</p>
            <p className="text-[10px] mt-1">Cliquez sur « Relation » pour créer une première relation parent → enfant</p>
          </div>
        ) : (
          <div className="space-y-1">
            {treeRoots.map((node) => renderNode(node.role))}

            {/* Orphan roles (not in any hierarchy) */}
            {orphanNodes.length > 0 && (
              <div className="mt-4 pt-3 border-t border-edge-subtle">
                <span className="text-[10px] text-content-muted uppercase tracking-wider font-medium px-1">
                  Rôles indépendants
                </span>
                {orphanNodes.map((node) => renderNode(node.role))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-content-muted shrink-0">
        <span>{nodes.length} rôle{nodes.length !== 1 ? 's' : ''}</span>
        <span>{relations.length} relation{relations.length !== 1 ? 's' : ''}</span>
        <span>{orphanNodes.length} indépendant{orphanNodes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddRelationModal
          nodes={nodes}
          onClose={() => setShowAddModal(false)}
          onAdd={addRelation}
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
