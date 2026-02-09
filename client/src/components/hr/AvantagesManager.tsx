import React, { useState, useMemo } from 'react';
import { Gift, Plus, Pencil, Trash2, Users, Percent } from 'lucide-react';
import { Avantage, AvantageFormData } from '../../hooks/hr/useAvantages';
import { Employe } from '../../hooks/hr/useEmployes';
import { Button, SelectField, Modal, FormField, Switch, TextareaField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';

interface AvantagesManagerProps {
  avantages: Avantage[];
  employes: Employe[];
  onCreate?: (data: AvantageFormData) => Promise<boolean>;
  onUpdate?: (id: number, data: Partial<Avantage>) => Promise<boolean>;
  onDelete?: (id: number) => Promise<boolean>;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Prime: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
  Assurance: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-400' },
  'Avantage en nature': { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
  Autre: { bg: 'bg-slate-500/10 border-slate-500/30', text: 'text-slate-400' },
};

const FREQUENCE_LABELS: Record<string, string> = {
  MENSUEL: 'Mensuel',
  TRIMESTRIEL: 'Trimestriel',
  ANNUEL: 'Annuel',
  PONCTUEL: 'Ponctuel',
};

const CATEGORIE_OPTIONS = [
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'LOGEMENT', label: 'Logement' },
  { value: 'REPAS', label: 'Repas' },
  { value: 'TELECOMMUNICATION', label: 'Telecom' },
  { value: 'SCOLAIRE', label: 'Scolaire' },
  { value: 'MEDICAL', label: 'Médical' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'ANCIENNETE', label: 'Ancienneté' },
  { value: 'RISQUE', label: 'Risque' },
  { value: 'REPRESENTATION', label: 'Représentation' },
  { value: 'AUTRE', label: 'Autre' },
];

const CONTRACT_TYPES = ['CDI', 'CDD', 'Stage', 'Intérim'];

const DEFAULT_FORM = {
  nom: '',
  type: 'Prime',
  montantParDefaut: 0,
  description: '',
  eligibleContrats: [] as string[],
  modeCalcul: 'FIXE',
  pourcentage: 0,
  plafond: 0,
  frequence: 'MENSUEL',
  dateDebut: '',
  dateFin: '',
  imposable: true,
  soumisCnss: true,
  autoAttribution: false,
  categorie: 'AUTRE',
};

type FormState = typeof DEFAULT_FORM;

export default function AvantagesManager({
  avantages,
  employes,
  onCreate,
  onUpdate,
  onDelete,
}: AvantagesManagerProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'edit') || hasPermission('avantages', 'create');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAvantage, setEditingAvantage] = useState<Avantage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Avantage | null>(null);
  const [formData, setFormData] = useState<FormState>({ ...DEFAULT_FORM });
  const [filterType, setFilterType] = useState('Tous');

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

  const resetForm = () => setFormData({ ...DEFAULT_FORM });
  const set = (patch: Partial<FormState>) => setFormData(prev => ({ ...prev, ...patch }));

  const toggleContrat = (ct: string) => {
    setFormData(prev => ({
      ...prev,
      eligibleContrats: prev.eligibleContrats.includes(ct)
        ? prev.eligibleContrats.filter(c => c !== ct)
        : [...prev.eligibleContrats, ct],
    }));
  };

  const buildPayload = (): AvantageFormData => ({
    nom: formData.nom,
    type: formData.type,
    montantParDefaut: formData.modeCalcul === 'FIXE' ? formData.montantParDefaut : 0,
    description: formData.description || undefined,
    eligibleContrats: formData.eligibleContrats.length > 0 ? formData.eligibleContrats : undefined,
    modeCalcul: formData.modeCalcul,
    pourcentage: formData.modeCalcul === 'POURCENTAGE' ? formData.pourcentage : undefined,
    plafond: formData.modeCalcul === 'POURCENTAGE' && formData.plafond > 0 ? formData.plafond : undefined,
    frequence: formData.frequence,
    dateDebut: formData.dateDebut || undefined,
    dateFin: formData.dateFin || undefined,
    imposable: formData.imposable,
    soumisCnss: formData.soumisCnss,
    autoAttribution: formData.autoAttribution,
    categorie: formData.categorie,
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreate) return;
    const success = await onCreate(buildPayload());
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
      eligibleContrats: Array.isArray(avantage.eligibleContrats) ? avantage.eligibleContrats : [],
      modeCalcul: avantage.modeCalcul || 'FIXE',
      pourcentage: Number(avantage.pourcentage) || 0,
      plafond: avantage.plafond || 0,
      frequence: avantage.frequence || 'MENSUEL',
      dateDebut: avantage.dateDebut || '',
      dateFin: avantage.dateFin || '',
      imposable: avantage.imposable ?? true,
      soumisCnss: avantage.soumisCnss ?? true,
      autoAttribution: avantage.autoAttribution ?? false,
      categorie: avantage.categorie || 'AUTRE',
    });
    setEditingAvantage(avantage);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvantage || !onUpdate) return;
    const success = await onUpdate(editingAvantage.id, buildPayload() as any);
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

  const getAmountDisplay = (av: Avantage) => {
    if ((av.modeCalcul || 'FIXE') === 'POURCENTAGE') {
      return `${Number(av.pourcentage) || 0}%`;
    }
    return `${(av.montantParDefaut || 0).toLocaleString()} FCFA`;
  };

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
              const freq = avantage.frequence || 'MENSUEL';
              const isPercentage = (avantage.modeCalcul || 'FIXE') === 'POURCENTAGE';

              return (
                <div
                  key={avantage.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition group flex flex-col"
                >
                  {/* Top: Badges + Amount */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeStyle.bg} ${typeStyle.text}`}>
                        {avantage.type}
                      </span>
                      {freq !== 'MENSUEL' && (
                        <span className="text-[9px] px-1 py-0.5 bg-violet-900/30 text-violet-400 rounded border border-violet-500/20">
                          {FREQUENCE_LABELS[freq] || freq}
                        </span>
                      )}
                      {avantage.autoAttribution && (
                        <span className="text-[9px] px-1 py-0.5 bg-cyan-900/30 text-cyan-400 rounded border border-cyan-500/20">
                          Auto
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap flex items-center gap-0.5">
                      {isPercentage && <Percent size={10} />}
                      {getAmountDisplay(avantage)}
                    </span>
                  </div>

                  {/* Name + Description */}
                  <h4 className="text-white font-semibold text-sm leading-tight mb-0.5 line-clamp-1">{avantage.nom}</h4>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mb-2 min-h-[2.5em]">
                    {avantage.description || 'Aucune description'}
                  </p>

                  {/* Footer: Contracts + count + fiscal */}
                  <div className="mt-auto flex flex-col gap-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between gap-2">
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
                    {/* Fiscal indicators */}
                    {(!avantage.imposable || !avantage.soumisCnss) && (
                      <div className="flex items-center gap-1">
                        {!avantage.imposable && (
                          <span className="text-[8px] px-1 py-0.5 bg-green-900/30 text-green-500 rounded border border-green-500/20">
                            Non imposable
                          </span>
                        )}
                        {!avantage.soumisCnss && (
                          <span className="text-[8px] px-1 py-0.5 bg-blue-900/30 text-blue-500 rounded border border-blue-500/20">
                            Exempt CNSS
                          </span>
                        )}
                      </div>
                    )}
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
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => { setShowCreateModal(false); setEditingAvantage(null); resetForm(); }}>
              Annuler
            </Button>
            <Button type="submit" form="avantage-form" variant="primary">
              {editingAvantage ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <form id="avantage-form" onSubmit={editingAvantage ? handleEditSubmit : handleCreateSubmit} className="space-y-4">
          {/* Section 1: Identification */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField
              label="Nom de l'avantage"
              name="nom"
              type="text"
              value={formData.nom}
              onChange={(e) => set({ nom: e.target.value })}
              required
              placeholder="Prime de transport"
            />
            <SelectField
              label="Catégorie"
              name="categorie"
              value={formData.categorie}
              onChange={(e) => set({ categorie: e.target.value })}
              options={CATEGORIE_OPTIONS}
            />
            <SelectField
              label="Type"
              name="type"
              value={formData.type}
              onChange={(e) => set({ type: e.target.value })}
              options={[
                { value: 'Prime', label: 'Prime' },
                { value: 'Assurance', label: 'Assurance' },
                { value: 'Avantage en nature', label: 'Avantage en nature' },
                { value: 'Autre', label: 'Autre' },
              ]}
              required
            />
          </div>

          {/* Section 2: Mode de calcul + Fréquence (combined row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Mode de calcul"
              name="modeCalcul"
              value={formData.modeCalcul}
              onChange={(e) => set({ modeCalcul: e.target.value })}
              options={[
                { value: 'FIXE', label: 'Montant fixe (FCFA)' },
                { value: 'POURCENTAGE', label: '% du salaire de base' },
              ]}
            />
            {formData.modeCalcul === 'FIXE' ? (
              <FormField
                label="Montant par défaut (FCFA)"
                name="montantParDefaut"
                type="number"
                value={formData.montantParDefaut.toString()}
                onChange={(e) => set({ montantParDefaut: parseInt(e.target.value) || 0 })}
                placeholder="50000"
              />
            ) : (
              <>
                <FormField
                  label="Pourcentage (%)"
                  name="pourcentage"
                  type="number"
                  value={formData.pourcentage.toString()}
                  onChange={(e) => set({ pourcentage: parseFloat(e.target.value) || 0 })}
                  placeholder="5.00"
                />
              </>
            )}
          </div>

          {formData.modeCalcul === 'POURCENTAGE' && (
            <FormField
              label="Plafond max (FCFA, optionnel)"
              name="plafond"
              type="number"
              value={formData.plafond ? formData.plafond.toString() : ''}
              onChange={(e) => set({ plafond: parseInt(e.target.value) || 0 })}
              placeholder="200000"
            />
          )}

          {/* Section 3: Fréquence & Validité (single row) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectField
              label="Fréquence"
              name="frequence"
              value={formData.frequence}
              onChange={(e) => set({ frequence: e.target.value })}
              options={[
                { value: 'MENSUEL', label: 'Mensuel' },
                { value: 'TRIMESTRIEL', label: 'Trimestriel' },
                { value: 'ANNUEL', label: 'Annuel' },
                { value: 'PONCTUEL', label: 'Ponctuel' },
              ]}
            />
            <FormField
              label="Début (optionnel)"
              name="dateDebut"
              type="date"
              value={formData.dateDebut}
              onChange={(e) => set({ dateDebut: e.target.value })}
            />
            <FormField
              label="Fin (optionnel)"
              name="dateFin"
              type="date"
              value={formData.dateFin}
              onChange={(e) => set({ dateFin: e.target.value })}
            />
          </div>

          {/* Section 4: Éligibilité — inline */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Contrats éligibles
              <span className="text-slate-500 ml-1 font-normal">(vide = tous)</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {CONTRACT_TYPES.map(ct => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => toggleContrat(ct)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition ${
                    formData.eligibleContrats.includes(ct)
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: Toggles — compact row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-800/40 rounded-lg px-3 py-2.5 border border-slate-700/30">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={formData.autoAttribution} onChange={(v) => set({ autoAttribution: v })} size="sm" />
              <span className="text-xs text-slate-300">Auto-attribution</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={formData.imposable} onChange={(v) => set({ imposable: v })} size="sm" />
              <span className="text-xs text-slate-300">Imposable (IPR)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={formData.soumisCnss} onChange={(v) => set({ soumisCnss: v })} size="sm" />
              <span className="text-xs text-slate-300">Soumis CNSS</span>
            </label>
          </div>

          {/* Section 6: Description */}
          <TextareaField
            label="Description (optionnel)"
            name="description"
            value={formData.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Détails sur cet avantage, conditions d'attribution..."
            rows={2}
          />
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
