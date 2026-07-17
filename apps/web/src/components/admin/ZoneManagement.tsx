import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Plus, Edit2, Trash2, ChevronDown, ChevronRight, X, Save, Building2 } from 'lucide-react';
import { arrondissementApi, marcheApi, villeApi } from '../../lib/api-client';
import { toast } from 'sonner';
import { usePermissions } from '../auth/ProtectedFeature';
import { Button, Input, Modal, SearchInput, Pagination, EmptyState, Spinner } from '../ui';
interface Arrondissement {
  id: string;
  nom: string;
  villeId: string;
  villeNom?: string;
  actif: boolean;
}

interface VilleOption {
  id: string;
  nom: string;
}

interface Marche {
  id: string;
  nom: string;
  arrondissementId: string;
  actif: boolean;
}

export default function ZoneManagement() {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('zones', 'create');
  const canEdit = hasPermission('zones', 'edit');
  const canDelete = hasPermission('zones', 'delete');

  const [arrondissements, setArrondissements] = useState<Arrondissement[]>([]);
  const [marchesMap, setMarchesMap] = useState<Record<string, Marche[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedArr, setExpandedArr] = useState<string | null>(null);
  const [loadingMarches, setLoadingMarches] = useState<string | null>(null);

  // Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCityId, setSelectedCityId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Creation State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newArrName, setNewArrName] = useState('');
  const [newArrVilleId, setNewArrVilleId] = useState('');
  
  // Edit State
  const [editingArr, setEditingArr] = useState<string | null>(null);
  const [editingMarche, setEditingMarche] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Data
  const [villesList, setVillesList] = useState<VilleOption[]>([]);

  // Initialize
  const loadArrondissements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await arrondissementApi.getAll();
      setArrondissements(data);
    } catch {
      toast.error('Erreur chargement des arrondissements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadArrondissements(); }, [loadArrondissements]);

  useEffect(() => {
    villeApi.getAll({ actif: true }).then(setVillesList).catch(console.error);
  }, []);

  // Filter Logic
  const filteredArrondissements = useMemo(() => {
    let result = arrondissements;

    // Filter by City
    if (selectedCityId !== 'all') {
        result = result.filter(arr => arr.villeId === selectedCityId);
    }

    // Filter by Search Term
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        result = result.filter(arr => 
            arr.nom.toLowerCase().includes(lower) || 
            arr.villeNom?.toLowerCase().includes(lower)
        );
    }
    
    return result;
  }, [arrondissements, searchTerm, selectedCityId]);

  // Grouping Logic (after filtering) & Sort by City name
  const groupedArrondissements = useMemo(() => {
    const groups: Record<string, Arrondissement[]> = {};
    filteredArrondissements.forEach(arr => {
      const city = arr.villeNom || 'Sans Ville';
      if (!groups[city]) groups[city] = [];
      groups[city].push(arr);
    });
    return groups;
  }, [filteredArrondissements]);

  // Pagination Logic (based on filtered list)
  const totalItems = filteredArrondissements.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedArrondissements = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredArrondissements.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredArrondissements, currentPage]);
  
  // Regroup paginated items for display
  const displayGroups = useMemo(() => {
       const groups: Record<string, Arrondissement[]> = {};
       paginatedArrondissements.forEach(arr => {
         const city = arr.villeNom || 'Sans Ville';
         if (!groups[city]) groups[city] = [];
         groups[city].push(arr);
       });
       return groups;
  }, [paginatedArrondissements]);

  // Actions
  const loadMarches = async (arrId: string) => {
    if (marchesMap[arrId]) return;
    setLoadingMarches(arrId);
    try {
      const data = await marcheApi.getAll({ arrondissementId: arrId });
      setMarchesMap(prev => ({ ...prev, [arrId]: data }));
    } catch {
      toast.error('Erreur chargement des marchés');
    } finally {
      setLoadingMarches(null);
    }
  };

  const toggleExpand = (arrId: string) => {
    if (expandedArr === arrId) {
      setExpandedArr(null);
    } else {
      setExpandedArr(arrId);
      loadMarches(arrId);
    }
  };

  const handleCreateArr = async () => {
    if (!newArrName.trim() || !newArrVilleId) {
      toast.error('Veuillez saisir un nom et sélectionner une ville');
      return;
    }
    setSaving(true);
    try {
      await arrondissementApi.create({ nom: newArrName.trim(), villeId: newArrVilleId });
      toast.success('Arrondissement créé');
      setNewArrName('');
      setNewArrVilleId('');
      setIsCreateModalOpen(false);
      loadArrondissements();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateArr = async (id: string, nom: string) => {
    setSaving(true);
    try {
      await arrondissementApi.update(id, { nom });
      toast.success('Arrondissement modifié');
      setEditingArr(null);
      loadArrondissements();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArr = async (id: string) => {
    if (!confirm('Désactiver cet arrondissement ?')) return;
    try {
      await arrondissementApi.delete(id);
      toast.success('Arrondissement désactivé');
      loadArrondissements();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  // --- Sub-components (Marche) ---
  const [newMarcheName, setNewMarcheName] = useState('');
  const [showNewMarche, setShowNewMarche] = useState<string | null>(null);

  const handleCreateMarche = async (arrId: string) => {
    if (!newMarcheName.trim()) return;
    setSaving(true);
    try {
      await marcheApi.create({ nom: newMarcheName.trim(), arrondissementId: arrId });
      toast.success('Marché créé');
      setNewMarcheName('');
      setShowNewMarche(null);
      const data = await marcheApi.getAll({ arrondissementId: arrId });
      setMarchesMap(prev => ({ ...prev, [arrId]: data }));
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMarche = async (id: string, arrId: string, nom: string) => {
    setSaving(true);
    try {
      await marcheApi.update(id, { nom });
      toast.success('Marché modifié');
      setEditingMarche(null);
      const data = await marcheApi.getAll({ arrondissementId: arrId });
      setMarchesMap(prev => ({ ...prev, [arrId]: data }));
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMarche = async (id: string, arrId: string) => {
    if (!confirm('Désactiver ce marché ?')) return;
    try {
      await marcheApi.delete(id);
      toast.success('Marché désactivé');
      const data = await marcheApi.getAll({ arrondissementId: arrId });
      setMarchesMap(prev => ({ ...prev, [arrId]: data }));
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 h-64">
        <Spinner size="sm" tone="accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface/50 p-3 rounded-lg border border-edge-subtle">
         <div className="flex flex-col sm:flex-row gap-2 flex-1 max-w-2xl">
            {/* City Filter */}
            <select
                value={selectedCityId}
                onChange={(e) => {
                    setSelectedCityId(e.target.value);
                    setCurrentPage(1);
                }}
                className="h-10 sm:h-11 px-3 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:outline-none focus:border-accent min-w-[150px]"
            >
                <option value="all">Toutes les villes</option>
                {villesList.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
            </select>

            {/* Search */}
            <div className="flex-1">
                <SearchInput
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1); // Reset page on search
                }}
                onClear={() => setSearchTerm('')}
                placeholder="Rechercher arrondissement, ville..."
                />
            </div>
         </div>

         {canCreate && (
           <Button
             onClick={() => setIsCreateModalOpen(true)}
             variant="primary"
             size="sm"
             className="whitespace-nowrap h-10 sm:h-auto gap-2"
           >
             <Plus size={16} />
             <span>Nouvel Arrondissement</span>
           </Button>
         )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {filteredArrondissements.length === 0 ? (
           <EmptyState 
              icon={MapPin}
              title="Aucun arrondissement trouvé"
              description={searchTerm || selectedCityId !== 'all' ? "Essayez de modifier vos filtres" : "Commencez par créer un arrondissement"}
              action={canCreate && !searchTerm && selectedCityId === 'all' ? {
                  label: "Créer maintenant",
                  onClick: () => setIsCreateModalOpen(true)
              } : undefined}
           />
        ) : (
           <div className="space-y-4">
              {Object.entries(displayGroups).map(([ville, villeArrondissements]) => (
                 <div key={ville} className="space-y-2">
                    {/* City Header */}
                    <div className="flex items-center gap-2 px-2 pb-1 border-b border-edge-subtle transition-colors hover:border-edge-strong/80">
                       <Building2 size={14} className="text-content-muted" />
                       <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">{ville}</h3>
                       <span className="text-[10px] bg-surface-elevated text-content-muted px-1.5 rounded-full">{villeArrondissements.length}</span>
                    </div>

                    {/* Grid of Arrondissements */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {villeArrondissements.map(arr => (
                          <div key={arr.id} className="bg-surface border border-edge rounded-lg overflow-hidden flex flex-col transition-all hover:border-edge-strong hover:shadow-lg hover:shadow-surface-base/20">
                             {/* Arrondissement Header */}
                             <div className="flex items-center gap-2 p-3 bg-surface-base/40 border-b border-edge-subtle">
                                <button 
                                  onClick={() => toggleExpand(arr.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-elevated text-content-muted transition-colors"
                                >
                                   {expandedArr === arr.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                
                                {editingArr === arr.id ? (
                                   <EditInline
                                     defaultValue={arr.nom}
                                     onSave={(val) => handleUpdateArr(arr.id, val)}
                                     onCancel={() => setEditingArr(null)}
                                     saving={saving}
                                   />
                                ) : (
                                   <div className="flex-1 flex items-center justify-between overflow-hidden">
                                      <span className="font-medium text-sm text-content-secondary truncate pr-2" title={arr.nom}>{arr.nom}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                         {canEdit && (
                                            <button onClick={() => setEditingArr(arr.id)} className="p-1 text-content-muted hover:text-accent transition">
                                               <Edit2 size={12} />
                                            </button>
                                         )}
                                          {canDelete && arr.actif && (
                                            <button onClick={() => handleDeleteArr(arr.id)} className="p-1 text-content-muted hover:text-status-danger transition">
                                               <Trash2 size={12} />
                                            </button>
                                          )}
                                      </div>
                                   </div>
                                )}
                             </div>

                             {/* Marches Expansion */}
                             {expandedArr === arr.id && (
                                <div className="p-2 bg-surface-base/20 flex-1 border-t border-edge animate-in slide-in-from-top-2 duration-200">
                                   {loadingMarches === arr.id ? (
                                      <div className="flex justify-center p-2"><Spinner size="xs" tone="current" className="text-content-muted" /></div>
                                   ) : (
                                      <div className="space-y-1">
                                         {(marchesMap[arr.id] || []).map(m => (
                                            <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface/50 group transition-colors">
                                                {editingMarche === m.id ? (
                                                   <EditInline
                                                      defaultValue={m.nom}
                                                      onSave={(val) => handleUpdateMarche(m.id, arr.id, val)}
                                                      onCancel={() => setEditingMarche(null)}
                                                      saving={saving}
                                                      className="text-xs"
                                                   />
                                                ) : (
                                                   <>
                                                      <div className={`w-1.5 h-1.5 rounded-full transition-colors ${m.actif ? 'bg-status-success/50 group-hover:bg-status-success' : 'bg-status-danger/50 group-hover:bg-status-danger'}`} />
                                                      <span className={`flex-1 text-xs transition-colors ${m.actif ? 'text-content-muted group-hover:text-content-secondary' : 'text-content-muted line-through'}`}>{m.nom}</span>
                                                      <div className="hidden group-hover:flex items-center gap-1">
                                                          {canEdit && (
                                                            <button onClick={() => setEditingMarche(m.id)} className="p-0.5 text-content-muted hover:text-accent transition">
                                                               <Edit2 size={10} />
                                                            </button>
                                                          )}
                                                          {canDelete && m.actif && (
                                                            <button onClick={() => handleDeleteMarche(m.id, arr.id)} className="p-0.5 text-content-muted hover:text-status-danger transition">
                                                               <Trash2 size={10} />
                                                            </button>
                                                          )}
                                                      </div>
                                                   </>
                                                )}
                                            </div>
                                         ))}
                                         
                                         {canCreate && (
                                            <div className="mt-2 pt-1 border-t border-edge/50">
                                               {showNewMarche === arr.id ? (
                                                  <div className="flex items-center gap-1 px-1 animate-in fade-in zoom-in-95">
                                                     <input
                                                        autoFocus
                                                        value={newMarcheName}
                                                        onChange={e => setNewMarcheName(e.target.value)}
                                                        className="flex-1 bg-surface-base border border-edge rounded px-2 py-1 text-xs text-content-primary focus:outline-none focus:border-accent placeholder:text-content-muted"
                                                        placeholder="Nom du marché..."
                                                        onKeyDown={e => e.key === 'Enter' && handleCreateMarche(arr.id)}
                                                     />
                                                     <button onClick={() => handleCreateMarche(arr.id)} disabled={saving} className="p-1 text-accent hover:text-accent transition disabled:opacity-50"><Save size={12} /></button>
                                                     <button onClick={() => setShowNewMarche(null)} className="p-1 text-content-muted hover:text-content-secondary transition"><X size={12} /></button>
                                                  </div>
                                               ) : (
                                                  <button 
                                                    onClick={() => setShowNewMarche(arr.id)}
                                                    className="w-full text-left px-2 py-1 text-[10px] text-accent/70 hover:text-accent hover:bg-accent/5 rounded transition-colors flex items-center gap-1 group"
                                                  >
                                                     <Plus size={10} className="group-hover:scale-110 transition-transform" /> Ajouter un marché
                                                  </button>
                                               )}
                                            </div>
                                         )}
                                      </div>
                                   )}
                                </div>
                             )}
                          </div>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        )}
      </div>

      {/* Footer Pagination */}
      {totalPages > 1 && (
         <div className="pt-2 border-t border-edge flex justify-center shrink-0">
            <Pagination 
               currentPage={currentPage}
               totalPages={totalPages}
               onPageChange={setCurrentPage}
               canGoNext={currentPage < totalPages}
               canGoPrevious={currentPage > 1}
               itemsPerPage={ITEMS_PER_PAGE}
               totalItems={totalItems}
            />
         </div>
      )}

      {/* Creation Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nouvel Arrondissement"
        size="sm"
      >
         <div className="space-y-4 pt-2">
            <div>
               <label className="block text-xs font-medium text-content-muted mb-1">Ville</label>
               <select
                  value={newArrVilleId}
                  onChange={(e) => setNewArrVilleId(e.target.value)}
                  className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all placeholder-content-muted appearance-none"
               >
                  <option value="" className="text-content-muted">Sélectionner une ville...</option>
                  {villesList.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-xs font-medium text-content-muted mb-1">Nom de l'arrondissement</label>
               <Input
                  value={newArrName}
                  onChange={(e) => setNewArrName(e.target.value)}
                  placeholder="Ex: Poto-Poto"
                  autoFocus
               />
            </div>
            <div className="flex justify-end gap-2 pt-4">
               <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Annuler</Button>
               <Button variant="primary" onClick={handleCreateArr} disabled={saving || !newArrName || !newArrVilleId}>
                  {saving ? <Spinner size="xs" tone="current" /> : 'Créer'}
               </Button>
            </div>
         </div>
      </Modal>
    </div>
  );
}

function EditInline({ defaultValue, onSave, onCancel, saving, className = '' }: {
  defaultValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  saving: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={`flex items-center gap-1 flex-1 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="flex-1 px-2 py-1 bg-surface-base border border-accent/50 rounded text-inherit text-content-primary focus:outline-none min-w-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value);
          if (e.key === 'Escape') onCancel();
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button onClick={(e) => { e.stopPropagation(); onSave(value); }} disabled={saving} className="p-1 text-accent hover:text-accent disabled:opacity-50">
        <Save size={12} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="p-1 text-content-muted hover:text-content-primary">
        <X size={12} />
      </button>
    </div>
  );
}
