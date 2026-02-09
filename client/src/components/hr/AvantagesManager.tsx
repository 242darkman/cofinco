import React, { useState, useMemo } from 'react';
import { Gift, Plus, Pencil, Trash2, Users, Briefcase } from 'lucide-react';
import { Avantage } from '../../hooks/hr/useAvantages';
import { Employe } from '../../hooks/hr/useEmployes';
import { Button, SelectField, Modal, FormField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';

interface AvantagesManagerProps {
  avantages: Avantage[];
  employes: Employe[];
  onCreate?: (data: { nom: string; type: string; montantParDefaut: number; description?: string; eligibleContrats?: string[] }) => Promise<boolean>;
  onUpdate?: (id: number, data: Partial<Avantage>) => Promise<boolean>;
  onDelete?: (id: number) => Promise<boolean>;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Prime: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
  Assurance: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-400' },
  'Avantage en nature': { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
  Autre: { bg: 'bg-slate-500/10 border-slate-500/30', text: 'text-slate-400' },
};

export default function AvantagesManager({
  avantages,
  employes,
  onCreate,
  onUpdate,
  onDelete,
}: AvantagesManagerProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'edit') || hasPermission('avantages', 'create');

  // CRUD state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAvantage, setEditingAvantage] = useState<Avantage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Avantage | null>(null);
  const [formData, setFormData] = useState({ nom: '', type: 'Prime', montantParDefaut: 0, description: '', eligibleContrats: '' });
  const [filterType, setFilterType] = useState('Tous');

  // Count employees per contract type (memoized)
  const employeCountByContract = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const emp of employes) {
      const ct = emp.typeContrat || 'Inconnu';
      counts[ct] = (counts[ct] || 0) + 1;
    }
    return counts;
  }, [employes]);

  const getEligibleCount = (avantage: Avantage): number => {
    const eligible = avantage.eligibleContrats as string[] | undefined;
    if (!eligible || eligible.length === 0) return employes.length;
    return eligible.reduce((sum, ct) => sum + (employeCountByContract[ct] || 0), 0);
  };

  const filteredAvantages = filterType === 'Tous'
    ? avantages
    : avantages.filter(a => a.type === filterType);

  const resetForm = () => setFormData({ nom: '', type: 'Prime', montantParDefaut: 0, description: '', eligibleContrats: '' });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreate) return;
    const eligibleArr = formData.eligibleContrats ? formData.eligibleContrats.split(',').map(c => c.trim()).filter(Boolean) : undefined;
    const success = await onCreate({
      nom: formData.nom,
      type: formData.type,
      montantParDefaut: formData.montantParDefaut,
      description: formData.description || undefined,
      eligibleContrats: eligibleArr,
    });
    if (success) {
      toast.success('Avantage créé');
      setShowCreateModal(false);
      resetForm();
    }
  };

  const handleEditOpen = (avantage: Avantage) => {
    setFormData({
      nom: avantage.nom,
      type: avantage.type,
      montantParDefaut: avantage.montantParDefaut || 0,
      description: avantage.description || '',
      eligibleContrats: Array.isArray(avantage.eligibleContrats) ? avantage.eligibleContrats.join(', ') : '',
    });
    setEditingAvantage(avantage);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvantage || !onUpdate) return;
    const eligibleArr = formData.eligibleContrats ? formData.eligibleContrats.split(',').map(c => c.trim()).filter(Boolean) : undefined;
    const success = await onUpdate(editingAvantage.id, {
      nom: formData.nom,
      type: formData.type,
      montantParDefaut: formData.montantParDefaut,
      description: formData.description || undefined,
      eligibleContrats: eligibleArr,
    });
    if (success) {
      toast.success('Avantage mis à jour');
      setEditingAvantage(null);
      resetForm();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete || !onDelete) return;
    const success = await onDelete(confirmDelete.id);
    if (success) {
      toast.success('Avantage supprimé');
      setConfirmDelete(null);
    }
  };

  const typeOptions = ['Tous', ...new Set(avantages.map(a => a.type))];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gift size={18} className="text-cyan-400 shrink-0" />
          <h3 className="text-sm font-bold text-white whitespace-nowrap">Avantages</h3>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full font-medium">
            {avantages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter */}
          {typeOptions.length > 2 && (
            <div className="hidden sm:flex items-center gap-1">
              {typeOptions.map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition ${
                    filterType === type
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          {canManage && onCreate && (
            <button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
          )}
        </div>
      </div>

      {/* Benefits grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredAvantages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredAvantages.map((avantage) => {
              const typeStyle = TYPE_COLORS[avantage.type] || TYPE_COLORS.Autre;
              const eligibleCount = getEligibleCount(avantage);
              const eligibleContrats = avantage.eligibleContrats as string[] | undefined;

              return (
                <div
                  key={avantage.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition group flex flex-col"
                >
                  {/* Top: Type badge + Amount */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeStyle.bg} ${typeStyle.text}`}>
                      {avantage.type}
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap">
                      {(avantage.montantParDefaut || 0).toLocaleString()} FC
                    </span>
                  </div>

                  {/* Name + Description */}
                  <h4 className="text-white font-semibold text-sm leading-tight mb-0.5 line-clamp-1">{avantage.nom}</h4>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mb-2 min-h-[2.5em]">
                    {avantage.description || 'Aucune description'}
                  </p>

                  {/* Eligible contracts + employee count */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-1 min-w-0 flex-wrap">
                      {eligibleContrats && eligibleContrats.length > 0 ? (
                        eligibleContrats.map(c => (
                          <span key={c} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded font-medium">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-slate-600 italic">Tous contrats</span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title={`${eligibleCount} employé(s) éligible(s)`}>
                      <Users size={10} />
                      {eligibleCount}
                    </span>
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onUpdate && (
                        <button
                          onClick={() => handleEditOpen(avantage)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition"
                        >
                          <Pencil size={12} />
                          Modifier
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => setConfirmDelete(avantage)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                        >
                          <Trash2 size={12} />
                          Supprimer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <Gift size={36} className="opacity-20 mb-2" />
            <p className="text-sm">{filterType !== 'Tous' ? `Aucun avantage de type "${filterType}"` : 'Aucun avantage configuré'}</p>
            {canManage && onCreate && (
              <button
                onClick={() => { resetForm(); setShowCreateModal(true); }}
                className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                Créer un avantage
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal || !!editingAvantage}
        onClose={() => { setShowCreateModal(false); setEditingAvantage(null); resetForm(); }}
        title={editingAvantage ? "Modifier l'avantage" : 'Nouvel Avantage'}
        size="md"
      >
        <form onSubmit={editingAvantage ? handleEditSubmit : handleCreateSubmit} className="space-y-4">
          <FormField
            label="Nom"
            name="nom"
            type="text"
            value={formData.nom}
            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Type"
              name="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={[
                { value: 'Prime', label: 'Prime' },
                { value: 'Assurance', label: 'Assurance' },
                { value: 'Avantage en nature', label: 'Avantage en nature' },
                { value: 'Autre', label: 'Autre' },
              ]}
              required
            />
            <FormField
              label="Montant par défaut (FC)"
              name="montantParDefaut"
              type="number"
              value={formData.montantParDefaut.toString()}
              onChange={(e) => setFormData({ ...formData, montantParDefaut: parseInt(e.target.value) || 0 })}
            />
          </div>
          <FormField
            label="Description"
            name="description"
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <FormField
            label="Contrats éligibles (séparés par virgule)"
            name="eligibleContrats"
            type="text"
            value={formData.eligibleContrats}
            onChange={(e) => setFormData({ ...formData, eligibleContrats: e.target.value })}
            placeholder="CDI, CDD, Stage"
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateModal(false); setEditingAvantage(null); resetForm(); }}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {editingAvantage ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-red-400">Supprimer l'avantage</h3>
            </div>
            <div className="p-4 text-sm text-slate-300">
              Voulez-vous vraiment supprimer l'avantage <span className="font-bold text-white">"{confirmDelete.nom}"</span> ?
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
