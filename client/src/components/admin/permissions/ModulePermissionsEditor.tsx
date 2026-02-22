import { useState, useMemo, useCallback } from 'react';
import {
  Package, Plus, Pencil, Trash2, Code2, Search, ChevronRight,
  Loader2, Shield, AlertCircle,
} from 'lucide-react';
import { Button, Badge, Modal, ConfirmDialog } from '@/components/ui';
import { useModulePermissionCrud } from '@/hooks/admin/useModulePermissionCrud';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/hooks/use-toast';

interface Module {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  isActive: boolean;
  orderIndex: number;
}

interface Permission {
  id: string;
  moduleId: string;
  name: string;
  code: string;
  description: string | null;
}

interface ModulePermissionsEditorProps {
  modules: Module[];
  permissions: Permission[];
  onRefresh: () => void;
}

const CATEGORIES = ['general', 'operations', 'finance', 'admin', 'rh'];

function ModuleFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: Module;
  loading: boolean;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [icon, setIcon] = useState(initialData?.icon || 'Shield');
  const [category, setCategory] = useState(initialData?.category || 'general');
  const [orderIndex, setOrderIndex] = useState(initialData?.orderIndex || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description: description || null, icon, category, orderIndex });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Modifier le module' : 'Nouveau module'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Nom *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            placeholder="ex: Gestion des Clients"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">Icône</label>
            <input
              type="text"
              value={icon}
              onChange={e => setIcon(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
              placeholder="Shield"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">Catégorie *</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">Ordre</label>
            <input
              type="number"
              value={orderIndex}
              onChange={e => setOrderIndex(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">Annuler</Button>
          <Button size="sm" type="submit" disabled={!name || loading}>
            {loading && <Loader2 size={14} className="animate-spin mr-1" />}
            {initialData ? 'Modifier' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PermissionFormModal({
  isOpen,
  onClose,
  onSubmit,
  moduleId,
  moduleName,
  initialData,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  moduleId: string;
  moduleName: string;
  initialData?: Permission;
  loading: boolean;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [code, setCode] = useState(initialData?.code || '');
  const [description, setDescription] = useState(initialData?.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ moduleId, name, code, description: description || null });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Modifier la permission' : 'Nouvelle permission'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-xs text-content-muted bg-surface-subtle px-3 py-2 rounded">
          Module : <span className="font-medium text-content-primary">{moduleName}</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Nom *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            placeholder="ex: Créer"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Code *</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
            pattern="^[a-z0-9_.]+$"
            className="w-full px-3 py-2 text-sm font-mono bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            placeholder="ex: clients.create"
          />
          <p className="text-[10px] text-content-muted mt-1">Format: module.action (lettres minuscules, chiffres, points, underscores)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">Annuler</Button>
          <Button size="sm" type="submit" disabled={!name || !code || loading}>
            {loading && <Loader2 size={14} className="animate-spin mr-1" />}
            {initialData ? 'Modifier' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function ModulePermissionsEditor({ modules, permissions, onRefresh }: ModulePermissionsEditorProps) {
  const { loading, createModule, updateModule, deleteModule, createPermission, updatePermission, deletePermission } = useModulePermissionCrud();
  const { toast } = useToast();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(modules[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');

  // Module modals
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | undefined>();

  // Permission modals
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState<Permission | undefined>();

  // Confirm dialog
  const confirmDialog = useConfirmDialog();

  const selectedModule = useMemo(
    () => modules.find(m => m.id === selectedModuleId),
    [modules, selectedModuleId]
  );

  const modulePermissions = useMemo(() => {
    if (!selectedModuleId) return [];
    let perms = permissions.filter(p => p.moduleId === selectedModuleId);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      perms = perms.filter(p =>
        p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
      );
    }
    return perms;
  }, [permissions, selectedModuleId, searchTerm]);

  const permCountByModule = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of permissions) {
      map.set(p.moduleId, (map.get(p.moduleId) || 0) + 1);
    }
    return map;
  }, [permissions]);

  // Handlers
  const handleCreateModule = useCallback(async (data: any) => {
    try {
      await createModule(data);
      toast({ title: 'Module créé', variant: 'default' });
      setModuleModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    }
  }, [createModule, toast, onRefresh]);

  const handleUpdateModule = useCallback(async (data: any) => {
    if (!editingModule) return;
    try {
      await updateModule(editingModule.id, data);
      toast({ title: 'Module modifié', variant: 'default' });
      setModuleModalOpen(false);
      setEditingModule(undefined);
      onRefresh();
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    }
  }, [editingModule, updateModule, toast, onRefresh]);

  const handleDeleteModule = useCallback(async (mod: Module) => {
    confirmDialog.open({
      title: `Supprimer "${mod.name}" ?`,
      message: 'Cette action est irréversible. Le module et toutes ses permissions seront supprimés.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteModule(mod.id);
          toast({ title: 'Module supprimé', variant: 'default' });
          if (selectedModuleId === mod.id) {
            setSelectedModuleId(modules.find(m => m.id !== mod.id)?.id || null);
          }
          onRefresh();
        } catch (err: any) {
          toast({ title: err.message, variant: 'destructive' });
        }
      },
    });
  }, [confirmDialog, deleteModule, toast, selectedModuleId, modules, onRefresh]);

  const handleCreatePermission = useCallback(async (data: any) => {
    try {
      await createPermission(data);
      toast({ title: 'Permission créée', variant: 'default' });
      setPermModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    }
  }, [createPermission, toast, onRefresh]);

  const handleUpdatePermission = useCallback(async (data: any) => {
    if (!editingPerm) return;
    try {
      await updatePermission(editingPerm.id, data);
      toast({ title: 'Permission modifiée', variant: 'default' });
      setPermModalOpen(false);
      setEditingPerm(undefined);
      onRefresh();
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    }
  }, [editingPerm, updatePermission, toast, onRefresh]);

  const handleDeletePermission = useCallback(async (perm: Permission) => {
    confirmDialog.open({
      title: `Supprimer "${perm.name}" ?`,
      message: `La permission "${perm.code}" sera supprimée. Les assignations actives doivent d'abord être retirées.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deletePermission(perm.id);
          toast({ title: 'Permission supprimée', variant: 'default' });
          onRefresh();
        } catch (err: any) {
          toast({ title: err.message, variant: 'destructive' });
        }
      },
    });
  }, [confirmDialog, deletePermission, toast, onRefresh]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-accent" />
          <h3 className="font-semibold text-content-primary">Modules & Permissions</h3>
          <Badge variant="secondary" className="text-[10px]">{modules.length} modules</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingModule(undefined); setModuleModalOpen(true); }}
        >
          <Plus size={14} className="mr-1" />
          Nouveau module
        </Button>
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Module sidebar */}
        <div className="w-64 border-r border-edge-subtle overflow-y-auto bg-surface-subtle">
          {modules.map(mod => (
            <div
              key={mod.id}
              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b border-edge-subtle/50 transition-colors group ${
                selectedModuleId === mod.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-surface-subtle-elevated border-l-2 border-l-transparent'
              }`}
              onClick={() => setSelectedModuleId(mod.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-content-primary truncate">{mod.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="secondary" className="text-[9px]">{mod.category}</Badge>
                  <span className="text-[10px] text-content-muted">{permCountByModule.get(mod.id) || 0} perms</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); setEditingModule(mod); setModuleModalOpen(true); }}
                  className="p-1 rounded hover:bg-surface text-content-muted hover:text-content-primary"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteModule(mod); }}
                  className="p-1 rounded hover:bg-status-danger-bg text-content-muted hover:text-status-danger"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Permission list */}
        <div className="flex-1 overflow-y-auto">
          {selectedModule ? (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge-subtle bg-surface-subtle">
                <div>
                  <span className="font-medium text-content-primary text-sm">{selectedModule.name}</span>
                  {selectedModule.description && (
                    <span className="ml-2 text-xs text-content-muted">{selectedModule.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                    <input
                      type="text"
                      placeholder="Filtrer..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-7 pr-3 py-1.5 text-xs bg-input border border-input-border rounded-md focus:border-input-focus focus:outline-none text-content-primary w-40"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingPerm(undefined); setPermModalOpen(true); }}
                  >
                    <Plus size={12} className="mr-1" />
                    Permission
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-edge-subtle/50">
                {modulePermissions.map(perm => (
                  <div
                    key={perm.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-subtle/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Shield size={14} className="text-accent shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-content-primary font-medium">{perm.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <code className="text-[10px] text-content-muted font-mono">{perm.code}</code>
                          {perm.description && (
                            <span className="text-[10px] text-content-muted truncate max-w-[200px]">{perm.description}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => { setEditingPerm(perm); setPermModalOpen(true); }}
                        className="p-1.5 rounded hover:bg-surface text-content-muted hover:text-content-primary"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDeletePermission(perm)}
                        className="p-1.5 rounded hover:bg-status-danger-bg text-content-muted hover:text-status-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {modulePermissions.length === 0 && (
                  <div className="py-8 text-center text-content-muted text-sm">
                    <Code2 size={24} className="mx-auto mb-2 opacity-50" />
                    Aucune permission dans ce module
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-content-muted text-sm">
              <ChevronRight size={16} className="mr-1" />
              Sélectionnez un module
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {moduleModalOpen && (
        <ModuleFormModal
          isOpen={moduleModalOpen}
          onClose={() => { setModuleModalOpen(false); setEditingModule(undefined); }}
          onSubmit={editingModule ? handleUpdateModule : handleCreateModule}
          initialData={editingModule}
          loading={loading}
        />
      )}

      {permModalOpen && selectedModule && (
        <PermissionFormModal
          isOpen={permModalOpen}
          onClose={() => { setPermModalOpen(false); setEditingPerm(undefined); }}
          onSubmit={editingPerm ? handleUpdatePermission : handleCreatePermission}
          moduleId={selectedModule.id}
          moduleName={selectedModule.name}
          initialData={editingPerm}
          loading={loading}
        />
      )}

      <ConfirmDialog {...confirmDialog.props} />
    </div>
  );
}
