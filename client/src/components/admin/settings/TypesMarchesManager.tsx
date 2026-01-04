import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, Store } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { typeMarcheApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface TypeMarche {
  id: string;
  nom: string;
  description: string | null;
  actif: boolean;
  created_at: string;
}

export default function TypesMarchesManager() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateTypesMarches = hasPermission('settings', 'create') || hasPermission('admin', 'manage');
  const canEditTypesMarches = hasPermission('settings', 'edit') || hasPermission('admin', 'manage');
  const canDeleteTypesMarches = hasPermission('settings', 'delete') || hasPermission('admin', 'manage');

  const [typesMarches, setTypesMarches] = useState<TypeMarche[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nom: '', description: '', actif: true });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const loadTypesMarches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await typeMarcheApi.getAll();
      setTypesMarches(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement types marchés'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypesMarches();
  }, [loadTypesMarches]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      toast.warning('Le nom du type de marché est requis');
      return;
    }

    try {
      if (editingId) {
        await typeMarcheApi.update(editingId, {
          nom: formData.nom,
          description: formData.description,
          actif: formData.actif
        });
        toast.success('Type de marché mis à jour avec succès');
      } else {
        await typeMarcheApi.create({
          nom: formData.nom,
          description: formData.description,
          actif: formData.actif
        });
        toast.success('Type de marché créé avec succès');
      }

      setShowForm(false);
      setEditingId(null);
      setFormData({ nom: '', description: '', actif: true });
      loadTypesMarches();
    } catch (error: any) {
      toast.error(handleApiError(error, 'Erreur lors de l\'opération'));
    }
  }, [formData, editingId, loadTypesMarches]);

  const handleEdit = (typeMarche: TypeMarche) => {
    setFormData({
      nom: typeMarche.nom,
      description: typeMarche.description || '',
      actif: typeMarche.actif
    });
    setEditingId(typeMarche.id);
    setShowForm(true);
  };

  const executeDelete = useCallback(async (id: string) => {
    try {
      await typeMarcheApi.delete(id);
      toast.success('Type de marché supprimé');
      loadTypesMarches();
    } catch (error: any) {
      toast.error(handleApiError(error, 'Erreur suppression'));
    } finally {
      setPendingDeleteId(null);
    }
  }, [loadTypesMarches]);

  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
    openConfirm({
      title: 'Supprimer ce type de marché ?',
      message: 'Cette action est irréversible.',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: () => executeDelete(id),
    });
  }, [openConfirm, executeDelete]);

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ nom: '', description: '', actif: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Store className="text-cyan-400" />
            Gestion des Types de Marchés
          </h3>
          <p className="text-slate-400 mt-1">Définissez les types de marchés commerciaux pour catégoriser vos clients</p>
        </div>
        {canCreateTypesMarches && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold flex items-center gap-2 transition"
            data-testid="button-add-type-marche"
          >
            <Plus size={20} />
            Nouveau type
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h4 className="text-lg font-semibold text-white mb-4">
            {editingId ? 'Modifier le type de marché' : 'Nouveau type de marché'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Nom *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                placeholder="Ex: Marché de gros"
                data-testid="input-type-marche-nom"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white"
                rows={3}
                placeholder="Description du type de marché"
                data-testid="input-type-marche-description"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.actif}
                onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                className="w-5 h-5"
                data-testid="checkbox-type-marche-actif"
              />
              <label className="text-slate-300">Actif</label>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold flex items-center gap-2"
                data-testid="button-cancel-type-marche"
              >
                <X size={18} />
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2"
                data-testid="button-save-type-marche"
              >
                <Save size={18} />
                {editingId ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Chargement...</div>
        ) : typesMarches.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Aucun type de marché défini. Cliquez sur "Nouveau type" pour en créer un.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Nom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {typesMarches.map((typeMarche) => (
                <tr key={typeMarche.id} className="hover:bg-slate-700/50" data-testid={`row-type-marche-${typeMarche.id}`}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{typeMarche.nom}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                    {typeMarche.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      typeMarche.actif ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {typeMarche.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canEditTypesMarches && (
                        <button
                          onClick={() => handleEdit(typeMarche)}
                          className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition"
                          data-testid={`button-edit-type-marche-${typeMarche.id}`}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDeleteTypesMarches && (
                        <button
                          onClick={() => handleDelete(typeMarche.id)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                          data-testid={`button-delete-type-marche-${typeMarche.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
