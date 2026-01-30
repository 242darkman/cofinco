import React, { useState } from 'react';
import { Gift, CheckCircle2, UserPlus, Users, Filter, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Avantage } from '../../hooks/hr/useAvantages';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, Button, SelectField, Modal, FormField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';

interface AvantagesManagerProps {
  avantages: Avantage[];
  employes: Employe[];
  selectedEmployes: string[];
  onToggleEmploye: (employeId: string) => void;
  onApplyToSelected: (avantageId: number) => void;
  onCreate?: (data: { nom: string; type: string; montantParDefaut: number; description?: string; eligibleContrats?: string[] }) => Promise<boolean>;
  onUpdate?: (id: number, data: Partial<Avantage>) => Promise<boolean>;
  onDelete?: (id: number) => Promise<boolean>;
}

export default function AvantagesManager({
  avantages,
  employes,
  selectedEmployes,
  onToggleEmploye,
  onApplyToSelected,
  onCreate,
  onUpdate,
  onDelete,
}: AvantagesManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canApplyAvantages = hasPermission('rh', 'edit') || hasPermission('avantages', 'create');

  const [contractFilter, setContractFilter] = useState<string>('Tous');

  // CRUD state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAvantage, setEditingAvantage] = useState<Avantage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Avantage | null>(null);
  const [formData, setFormData] = useState({ nom: '', type: 'Prime', montantParDefaut: 0, description: '', eligibleContrats: '' });
  
  // Pagination for employees
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const filteredEmployes = employes.filter(emp => 
    contractFilter === 'Tous' || emp.typeContrat === contractFilter
  );

  const totalPages = Math.ceil(filteredEmployes.length / ITEMS_PER_PAGE);
  const paginatedEmployes = filteredEmployes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filter changes
  const handleFilterChange = (value: string) => {
    setContractFilter(value);
    setCurrentPage(1);
  };

  const contractOptions = [
    { value: 'Tous', label: 'Tous les contrats' },
    { value: 'CDI', label: 'CDI' },
    { value: 'CDD', label: 'CDD' },
    { value: 'Stage', label: 'Stagiaires' },
  ];

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

  return (

    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
        
        {/* Colonne gauche : Liste des Avantages */}
        <div className="lg:col-span-2 flex flex-col min-h-0 bg-slate-900/30 border border-slate-800 rounded-lg">
             <div className="shrink-0 flex items-center justify-between gap-2 p-3 border-b border-slate-700/50 bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <Gift className="text-cyan-400" size={18} />
                    <h3 className="text-base font-bold text-white">Avantages Disponibles</h3>
                </div>
                {canApplyAvantages && onCreate && (
                  <button
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition"
                  >
                    <Plus size={14} />
                    <span className="hidden sm:inline">Nouvel avantage</span>
                  </button>
                )}
             </div>
             
             <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {(avantages || []).length > 0 ? (
                        (avantages || []).map((avantage) => {
                        // Check compatibility with filter (optional visual cue)
                        const isCompatibleWithFilter = contractFilter === 'Tous' || (avantage.eligibleContrats as string[] || []).includes(contractFilter);
                        
                        return (
                        <div key={avantage.id} className={`bg-slate-800/80 border ${isCompatibleWithFilter ? 'border-slate-700' : 'border-red-900/50 opacity-70'} rounded-lg p-3 hover:border-cyan-500/50 transition-colors group flex flex-col`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-1.5 bg-cyan-500/10 rounded-md group-hover:bg-cyan-500/20 transition-colors">
                                    <Gift size={16} className="text-cyan-400" />
                                </div>
                                <span className="font-mono font-bold text-emerald-400 text-xs">
                                    {(avantage.montantParDefaut || 0).toLocaleString()} FC
                                </span>
                            </div>
                            
                            <h4 className="text-white font-semibold text-sm mb-0.5 line-clamp-1">{avantage.nom}</h4>
                            <p className="text-[10px] text-slate-400 mb-3 line-clamp-2 min-h-[2.5em]">{avantage.description || 'Aucune description'}</p>
                            
                            {/* Show eligibility */}
                            <div className="flex flex-wrap gap-1 mb-auto">
                                {(avantage.eligibleContrats as string[] || []).map(c => (
                                    <span key={c} className="text-[9px] px-1 py-px bg-slate-700 text-slate-300 rounded-sm">{c}</span>
                                ))}
                            </div>

                            <div className="flex gap-1.5 mt-3">
                              <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={selectedEmployes.length === 0 || !canApplyAvantages}
                                  onClick={() => onApplyToSelected(avantage.id)}
                                  className="opacity-90 hover:opacity-100 h-8 text-xs flex-1"
                              >
                                  Attribuer à {selectedEmployes.length || 0}
                              </Button>
                              {canApplyAvantages && onUpdate && (
                                <button
                                  onClick={() => handleEditOpen(avantage)}
                                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition"
                                  title="Modifier"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canApplyAvantages && onDelete && (
                                <button
                                  onClick={() => setConfirmDelete(avantage)}
                                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                                  title="Supprimer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                        </div>
                        )})
                    ) : (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500">
                            <Gift size={48} className="opacity-20 mb-3" />
                            <p className="text-sm">Aucun avantage configuré</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Colonne droite : Sélection des Employés */}
        <div className="lg:col-span-1 flex flex-col min-h-0">
             <Card padding="none" className="h-full flex flex-col bg-slate-900 border-slate-800 overflow-hidden">
                <div className="shrink-0 p-3 border-b border-slate-800 flex flex-col gap-2 bg-slate-900/80">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="text-purple-400" size={16} />
                            <h3 className="font-bold text-white text-sm">Employés</h3>
                        </div>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded-full font-bold uppercase tracking-wide">
                            {selectedEmployes.length} sél.
                        </span>
                    </div>
                    
                    <SelectField
                        label=""
                        name="contractFilter"
                        value={contractFilter}
                        onChange={(e) => handleFilterChange(e.target.value)}
                        options={contractOptions}
                        className="bg-slate-950 border-slate-700 text-xs h-8 py-1"
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900/50">
                    {paginatedEmployes.map(emp => (
                        <div 
                            key={emp.id}
                            onClick={() => onToggleEmploye(emp.id)}
                            className={`
                                flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all border select-none
                                ${selectedEmployes.includes(emp.id) 
                                    ? 'bg-purple-500/10 border-purple-500/50 shadow-sm' 
                                    : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                                }
                            `}
                        >
                            <div className={`
                                w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors shrink-0
                                ${selectedEmployes.includes(emp.id)
                                    ? 'bg-purple-500 border-purple-500'
                                    : 'border-slate-600 bg-slate-800'
                                }
                            `}>
                                {selectedEmployes.includes(emp.id) && <CheckCircle2 size={10} className="text-white" />}
                            </div>
                            
                            <div className="w-7 h-7 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-300 border border-slate-600">
                                {emp.nom.charAt(0)}{emp.prenom.charAt(0)}
                            </div>
                            
                            <div className="min-w-0 flex-1">
                                <p className={`text-xs font-medium truncate leading-tight ${selectedEmployes.includes(emp.id) ? 'text-purple-200' : 'text-slate-300'}`}>
                                    {emp.nom} {emp.prenom}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                     <span className={`text-[9px] px-1 py-px rounded border ${emp.typeContrat === 'Stage' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' : 'bg-blue-500/10 border-blue-500/30 text-blue-500'}`}>
                                        {emp.typeContrat}
                                     </span>
                                     <span className="text-[9px] text-slate-500 truncate">{emp.poste}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredEmployes.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-xs">
                            Aucun employé trouvé.
                        </div>
                    )}
                </div>

                {/* Pagination Controls - Mobile First */}
                {totalPages > 1 && (
                  <div className="shrink-0 flex items-center justify-between p-2 border-t border-slate-800 bg-slate-900/80">
                    <div className="text-[10px] text-slate-500">
                      P. {currentPage} / {totalPages}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="p-1 px-2 flex items-center justify-center gap-1 text-[10px] font-medium border border-slate-700 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 transition-all"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1 px-2 flex items-center justify-center gap-1 text-[10px] font-medium border border-slate-700 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 transition-all"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}
             </Card>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal || !!editingAvantage}
        onClose={() => { setShowCreateModal(false); setEditingAvantage(null); resetForm(); }}
        title={editingAvantage ? 'Modifier l\'avantage' : 'Nouvel Avantage'}
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
