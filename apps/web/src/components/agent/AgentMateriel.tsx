import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Package, Plus, AlertCircle, CheckCircle, DollarSign, Shield, Wrench, TrendingDown, Calendar, ChevronLeft, ChevronRight, Eye, AlertTriangle, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { authService } from '../../lib/auth';
import { useIsAdmin } from '../../contexts/AbilityContext';
import type { Maintenance, Materiel } from './AgentMateriel.types';

function calcDepreciation(valeur: number, dateAttribution: string, dureeMois: number): { valeurResiduelle: number; pourcentage: number } {
  const start = new Date(dateAttribution);
  const now = new Date();
  const moisEcoules = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const ratio = Math.min(moisEcoules / dureeMois, 1);
  const valeurResiduelle = Math.max(valeur * (1 - ratio), 0);
  return { valeurResiduelle: Math.round(valeurResiduelle), pourcentage: Math.round(ratio * 100) };
}

function getWarrantyStatus(dateGarantieFin?: string): { label: string; color: string; expired: boolean } {
  if (!dateGarantieFin) return { label: 'Non définie', color: 'text-content-muted', expired: false };
  const fin = new Date(dateGarantieFin);
  const now = new Date();
  const joursRestants = Math.ceil((fin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (joursRestants < 0) return { label: 'Expirée', color: 'text-status-danger', expired: true };
  if (joursRestants <= 30) return { label: `${joursRestants}j`, color: 'text-status-warning', expired: false };
  if (joursRestants <= 90) return { label: `${joursRestants}j`, color: 'text-status-warning', expired: false };
  return { label: `${joursRestants}j`, color: 'text-status-success', expired: false };
}

export default function AgentMateriel({ agentId }: { agentId?: string }) {
  const [materiels, setMateriels] = useState<Materiel[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = useIsAdmin();
  const isChefAgence = authService.hasRole?.('chef_agence') || false;
  const canManage = isAdmin || isChefAgence;

  // Form state (admin/chef only)
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    type_materiel: 'Tablette',
    nom_materiel: '',
    numero_serie: '',
    date_attribution: new Date().toISOString().slice(0, 10),
    etat: 'Neuf',
    valeur: 0,
    date_garantie_fin: '',
    duree_amortissement_mois: 36,
    prochaine_maintenance: '',
    notes: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedMateriel, setSelectedMateriel] = useState<Materiel | null>(null);

  // Problem Report (agent)
  const [reportingProblem, setReportingProblem] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');

  // Maintenance Modal (admin/chef)
  const [maintenanceModal, setMaintenanceModal] = useState<Materiel | null>(null);
  const [newMaintenance, setNewMaintenance] = useState({ description: '', cout: 0 });

  useEffect(() => {
    loadMateriels();
  }, [agentId]);

  const loadMateriels = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (agentId) {
        params.append('agent_id', agentId);
        params.append('actif', 'true');
      }
      const response = await fetch(`/api/agent-materiel?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setMateriels(data || []);
    } catch {
      // Non-blocking: materiel list will show empty
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/agent-materiel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }
      setShowForm(false);
      loadMateriels();
      setFormData({
        agent_id: agentId || '',
        type_materiel: 'Tablette',
        nom_materiel: '',
        numero_serie: '',
        date_attribution: new Date().toISOString().slice(0, 10),
        etat: 'Neuf',
        valeur: 0,
        date_garantie_fin: '',
        duree_amortissement_mois: 36,
        prochaine_maintenance: '',
        notes: ''
      });
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const retournerMateriel = async (id: string) => {
    try {
      const response = await fetch(`/api/agent-materiel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date_retour: new Date().toISOString().slice(0, 10), etat: 'Retourné' })
      });
      if (!response.ok) throw new Error('Erreur lors du retour');
      loadMateriels();
      setSelectedMateriel(null);
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const changerEtat = async (id: string, nouvelEtat: string) => {
    try {
      const response = await fetch(`/api/agent-materiel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ etat: nouvelEtat })
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      loadMateriels();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const ajouterMaintenance = async () => {
    if (!maintenanceModal || !newMaintenance.description) return;
    const historique = [...(maintenanceModal.historique_maintenances || []), {
      date: new Date().toISOString().slice(0, 10),
      description: newMaintenance.description,
      cout: newMaintenance.cout
    }];
    try {
      const response = await fetch(`/api/agent-materiel/${maintenanceModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ historique_maintenances: historique })
      });
      if (!response.ok) throw new Error('Erreur');
      setNewMaintenance({ description: '', cout: 0 });
      loadMateriels();
      setMaintenanceModal(prev => prev ? { ...prev, historique_maintenances: historique } : null);
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const signalerProbleme = async () => {
    if (!selectedMateriel || !problemDescription.trim()) return;
    try {
      const historique = [...(selectedMateriel.historique_maintenances || []), {
        date: new Date().toISOString().slice(0, 10),
        description: `⚠️ Problème signalé: ${problemDescription}`,
        cout: 0
      }];
      const response = await fetch(`/api/agent-materiel/${selectedMateriel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ historique_maintenances: historique, etat: 'Mauvais' })
      });
      if (!response.ok) throw new Error('Erreur');
      setProblemDescription('');
      setReportingProblem(false);
      loadMateriels();
      setSelectedMateriel(null);
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const actifs = materiels.filter(m => !m.date_retour);
  const bonEtat = actifs.filter(m => m.etat === 'Neuf' || m.etat === 'Bon').length;
  const materielProblemes = actifs.filter(m => m.etat === 'Mauvais' || m.etat === 'Perdu').length;
  const valeurTotale = actifs.reduce((sum, m) => sum + m.valeur, 0);
  const valeurResiduelle = actifs.reduce((sum, m) => {
    const dep = calcDepreciation(m.valeur, m.date_attribution, m.duree_amortissement_mois || 36);
    return sum + dep.valeurResiduelle;
  }, 0);

  // Pagination Logic
  const totalPages = Math.ceil(actifs.length / ITEMS_PER_PAGE);
  const paginatedMateriels = actifs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      {/* Stats - Different for Agent vs Admin/Chef */}
      <div className={`grid gap-2 ${canManage ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-3'}`}>
        <StatCard icon={<Package size={14} />} label={canManage ? "Matériel Actif" : "Mon Matériel"} value={actifs.length.toString()} color="blue" />
        <StatCard icon={<CheckCircle size={14} />} label="Bon État" value={bonEtat.toString()} color="green" />
        <StatCard icon={<AlertCircle size={14} />} label="Problèmes" value={materielProblemes.toString()} color="amber" />
        {canManage && (
          <>
            <StatCard icon={<DollarSign size={14} />} label="Val. Achat" value={`${(valeurTotale / 1000).toFixed(0)}k`} color="emerald" />
            <StatCard icon={<TrendingDown size={14} />} label="Val. Résid." value={`${(valeurResiduelle / 1000).toFixed(0)}k`} color="cyan" />
          </>
        )}
      </div>

      {/* Admin/Chef: Attribution Button */}
      {canManage && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Annuler' : 'Attribuer Matériel'}
        </button>
      )}

      {/* Admin/Chef: Attribution Form */}
      {canManage && showForm && (
        <div className="bg-surface-base/50 rounded-xl p-4 border border-edge">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <FormField label="Type">
                <select value={formData.type_materiel} onChange={(e) => setFormData({ ...formData, type_materiel: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value="Tablette">Tablette</option>
                  <option value="Badge">Badge</option>
                  <option value="Uniforme">Uniforme</option>
                  <option value="Véhicule">Véhicule</option>
                  <option value="Téléphone">Téléphone</option>
                  <option value="Autre">Autre</option>
                </select>
              </FormField>
              <FormField label="Nom/Modèle">
                <input type="text" value={formData.nom_materiel} onChange={(e) => setFormData({ ...formData, nom_materiel: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" required />
              </FormField>
              <FormField label="N° Série">
                <input type="text" value={formData.numero_serie} onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
              <FormField label="Valeur (FCFA)">
                <input inputMode="numeric" pattern="[0-9]*" value={formData.valeur} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, valeur: v ? Number(v) : 0 }); }} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <FormField label="Attribution">
                <input type="date" value={formData.date_attribution} onChange={(e) => setFormData({ ...formData, date_attribution: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
              <FormField label="État">
                <select value={formData.etat} onChange={(e) => setFormData({ ...formData, etat: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value="Neuf">Neuf</option><option value="Bon">Bon</option><option value="Moyen">Moyen</option><option value="Mauvais">Mauvais</option>
                </select>
              </FormField>
              <FormField label="Fin Garantie">
                <input type="date" value={formData.date_garantie_fin} onChange={(e) => setFormData({ ...formData, date_garantie_fin: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
              <FormField label="Amortis. (mois)">
                <input inputMode="numeric" pattern="[0-9]*" value={formData.duree_amortissement_mois} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, duree_amortissement_mois: v ? Number(v) : 0 }); }} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
              <FormField label="Maintenance">
                <input type="date" value={formData.prochaine_maintenance} onChange={(e) => setFormData({ ...formData, prochaine_maintenance: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
            </div>
            <div className="flex gap-2">
              <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="flex-1 px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" placeholder="Notes..." />
              <button type="submit" disabled={loading} className="px-4 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg font-bold text-xs shrink-0">Attribuer</button>
            </div>
          </form>
        </div>
      )}

      {/* Inventory List */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between bg-surface-base/30">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <Package size={16} className="text-status-info" />
            {canManage ? 'Inventaire du Matériel' : 'Mon Équipement'}
          </h3>
          <span className="text-[10px] text-content-muted font-medium">{actifs.length} article(s)</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="sm" /></div>
        ) : actifs.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <Package size={32} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-muted">Aucun matériel attribué</p>
          </div>
        ) : (
          <div className="divide-y divide-edge/50">
            {paginatedMateriels.map((mat) => {
              const warranty = getWarrantyStatus(mat.date_garantie_fin);
              const maintenanceDue = mat.prochaine_maintenance && new Date(mat.prochaine_maintenance) <= new Date();
              const dep = calcDepreciation(mat.valeur, mat.date_attribution, mat.duree_amortissement_mois || 36);

              return (
                <div
                  key={mat.id}
                  onClick={() => setSelectedMateriel(mat)}
                  className="p-3 hover:bg-surface-elevated/30 transition cursor-pointer group flex items-center gap-3"
                >
                  <div className="p-2 bg-status-info-bg rounded-lg shrink-0">
                    <Package size={16} className="text-status-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-content-primary truncate">{mat.nom_materiel}</span>
                      {maintenanceDue && <span className="w-2 h-2 bg-status-warning rounded-full shrink-0" title="Maintenance requise" />}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-content-muted flex-wrap">
                      <span className="text-status-info font-bold">{mat.type_materiel}</span>
                      <span>•</span>
                      <span>{new Date(mat.date_attribution).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      {canManage && mat.valeur > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-accent">{dep.valeurResiduelle.toLocaleString()} FCFA</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    mat.etat === 'Neuf' || mat.etat === 'Bon' ? 'bg-status-success-bg text-status-success' :
                    mat.etat === 'Moyen' ? 'bg-status-warning-bg text-status-warning' :
                    'bg-status-danger-bg text-status-danger'
                  }`}>
                    {mat.etat}
                  </span>
                  <Eye size={14} className="text-content-muted group-hover:text-accent shrink-0" />
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle bg-surface-base/20">
            <span className="text-[10px] text-content-muted">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronLeft size={12} /></button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedMateriel} onOpenChange={(open) => { if (!open) { setSelectedMateriel(null); setReportingProblem(false); } }}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedMateriel && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary flex items-center gap-2">
                  <Package size={16} className="text-status-info" />
                  {selectedMateriel.nom_materiel}
                </SheetTitle>
                <SheetDescription className="text-content-muted">
                  {selectedMateriel.type_materiel} • N° {selectedMateriel.numero_serie || 'N/A'}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Status Badge */}
                <div className="flex justify-center">
                  {canManage ? (
                    <select
                      value={selectedMateriel.etat}
                      onChange={(e) => { changerEtat(selectedMateriel.id, e.target.value); setSelectedMateriel({ ...selectedMateriel, etat: e.target.value }); }}
                      className={`px-4 py-2 rounded-full text-sm font-bold uppercase bg-transparent border cursor-pointer ${
                        selectedMateriel.etat === 'Neuf' || selectedMateriel.etat === 'Bon' ? 'border-status-success/30 text-status-success' :
                        selectedMateriel.etat === 'Moyen' ? 'border-status-warning/30 text-status-warning' :
                        'border-status-danger/30 text-status-danger'
                      }`}
                    >
                      <option value="Neuf">Neuf</option><option value="Bon">Bon</option><option value="Moyen">Moyen</option><option value="Mauvais">Mauvais</option><option value="Perdu">Perdu</option>
                    </select>
                  ) : (
                    <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase border ${
                      selectedMateriel.etat === 'Neuf' || selectedMateriel.etat === 'Bon' ? 'bg-status-success-bg text-status-success border-status-success/30' :
                      selectedMateriel.etat === 'Moyen' ? 'bg-status-warning-bg text-status-warning border-status-warning/30' :
                      'bg-status-danger-bg text-status-danger border-status-danger/30'
                    }`}>{selectedMateriel.etat}</span>
                  )}
                </div>

                {/* Info Grid */}
                <div className={`grid gap-3 ${canManage ? 'grid-cols-2' : 'grid-cols-2'}`}>
                  <InfoItem label="Type" value={selectedMateriel.type_materiel} />
                  <InfoItem label="N° Série" value={selectedMateriel.numero_serie || 'N/A'} />
                  <InfoItem label="Attribué le" value={new Date(selectedMateriel.date_attribution).toLocaleDateString('fr-FR')} />
                  <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
                    <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5 flex items-center gap-1"><Shield size={10} />Garantie</div>
                    <div className={`text-sm font-medium ${getWarrantyStatus(selectedMateriel.date_garantie_fin).color}`}>{getWarrantyStatus(selectedMateriel.date_garantie_fin).label}</div>
                  </div>
                  {canManage && (
                    <>
                      <InfoItem label="Valeur Achat" value={`${selectedMateriel.valeur.toLocaleString()} FCFA`} />
                      <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
                        <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5 flex items-center gap-1"><TrendingDown size={10} />Val. Résiduelle</div>
                        <div className="text-sm font-medium text-accent">{calcDepreciation(selectedMateriel.valeur, selectedMateriel.date_attribution, selectedMateriel.duree_amortissement_mois || 36).valeurResiduelle.toLocaleString()} FCFA</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Next Maintenance */}
                {selectedMateriel.prochaine_maintenance && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                    new Date(selectedMateriel.prochaine_maintenance) <= new Date() ? 'bg-status-warning-bg border-status-warning/30' : 'bg-surface-base border-edge'
                  }`}>
                    <Wrench size={14} className={new Date(selectedMateriel.prochaine_maintenance) <= new Date() ? 'text-status-warning' : 'text-content-muted'} />
                    <span className="text-xs text-content-secondary">Prochaine maintenance:</span>
                    <span className={`text-xs font-bold ${new Date(selectedMateriel.prochaine_maintenance) <= new Date() ? 'text-status-warning' : 'text-content-primary'}`}>{new Date(selectedMateriel.prochaine_maintenance).toLocaleDateString('fr-FR')}</span>
                    {canManage && <button onClick={() => setMaintenanceModal(selectedMateriel)} className="ml-auto text-xs font-bold text-status-info hover:text-status-info">Gérer</button>}
                  </div>
                )}

                {/* Notes */}
                {selectedMateriel.notes && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-content-muted uppercase">Notes</h4>
                    <div className="p-3 bg-surface-base border border-edge rounded-lg text-sm text-content-secondary italic">"{selectedMateriel.notes}"</div>
                  </div>
                )}

                {/* Maintenance History */}
                {(selectedMateriel.historique_maintenances || []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-content-muted uppercase">Historique</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(selectedMateriel.historique_maintenances || []).slice().reverse().map((m, i) => (
                        <div key={i} className="p-2 bg-surface-base border border-edge rounded-lg">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-content-muted">{new Date(m.date).toLocaleDateString('fr-FR')}</span>
                            {canManage && m.cout > 0 && <span className="text-[10px] font-bold text-accent">{m.cout.toLocaleString()} FCFA</span>}
                          </div>
                          <p className="text-xs text-content-secondary">{m.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-edge space-y-3">
                  {/* Agent: Report Problem */}
                  {!canManage && !reportingProblem && (
                    <button onClick={() => setReportingProblem(true)} className="w-full py-3 bg-status-warning hover:bg-status-warning/90 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition">
                      <AlertTriangle size={16} />Signaler un Problème
                    </button>
                  )}
                  {!canManage && reportingProblem && (
                    <div className="space-y-2">
                      <textarea value={problemDescription} onChange={(e) => setProblemDescription(e.target.value)} placeholder="Décrivez le problème..." className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary text-sm placeholder-content-muted" rows={3} />
                      <div className="flex gap-2">
                        <button onClick={signalerProbleme} disabled={!problemDescription.trim()} className="flex-1 py-2 bg-status-danger hover:bg-status-danger/90 disabled:opacity-50 text-white rounded-lg font-bold text-xs">Envoyer</button>
                        <button onClick={() => { setReportingProblem(false); setProblemDescription(''); }} className="px-4 py-2 bg-surface text-content-secondary rounded-lg text-xs">Annuler</button>
                      </div>
                    </div>
                  )}

                  {/* Admin/Chef: Actions */}
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => setMaintenanceModal(selectedMateriel)} className="flex-1 py-2.5 bg-accent hover:bg-accent-primary-hover text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition">
                        <Wrench size={14} />Maintenance
                      </button>
                      <button onClick={() => retournerMateriel(selectedMateriel.id)} className="flex-1 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-xl font-bold text-xs transition">
                        Retourner
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Maintenance Modal (Admin/Chef) */}
      {canManage && maintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMaintenanceModal(null)}>
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-edge flex items-center justify-between">
              <h3 className="text-sm font-bold text-content-primary flex items-center gap-2"><Wrench size={16} className="text-status-info" />Maintenance - {maintenanceModal.nom_materiel}</h3>
              <button onClick={() => setMaintenanceModal(null)} className="text-content-muted hover:text-content-primary"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              {maintenanceModal.prochaine_maintenance && (
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${new Date(maintenanceModal.prochaine_maintenance) <= new Date() ? 'bg-status-warning-bg border-status-warning/30' : 'bg-surface border-edge'}`}>
                  <Calendar size={14} className={new Date(maintenanceModal.prochaine_maintenance) <= new Date() ? 'text-status-warning' : 'text-content-muted'} />
                  <span className="text-xs text-content-secondary">Prochaine:</span>
                  <span className={`text-xs font-bold ${new Date(maintenanceModal.prochaine_maintenance) <= new Date() ? 'text-status-warning' : 'text-content-primary'}`}>{new Date(maintenanceModal.prochaine_maintenance).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-content-muted">Enregistrer une maintenance</h4>
                <input type="text" value={newMaintenance.description} onChange={(e) => setNewMaintenance({ ...newMaintenance, description: e.target.value })} placeholder="Description..." className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
                <div className="flex gap-2">
                  <input inputMode="numeric" pattern="[0-9]*" value={newMaintenance.cout} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setNewMaintenance({ ...newMaintenance, cout: v ? Number(v) : 0 }); }} placeholder="Coût (FCFA)" className="flex-1 px-3 py-2 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
                  <button onClick={ajouterMaintenance} disabled={!newMaintenance.description} className="px-4 py-2 bg-accent hover:bg-accent-primary-hover disabled:opacity-50 text-white rounded-lg text-xs font-bold">Ajouter</button>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-content-muted">Historique ({(maintenanceModal.historique_maintenances || []).length})</h4>
                {(maintenanceModal.historique_maintenances || []).length === 0 ? (
                  <p className="text-xs text-content-muted text-center py-3">Aucune maintenance enregistrée</p>
                ) : (
                  (maintenanceModal.historique_maintenances || []).slice().reverse().map((m, i) => (
                    <div key={i} className="p-2 bg-surface border border-edge rounded-lg">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-content-muted">{new Date(m.date).toLocaleDateString('fr-FR')}</span>
                        {m.cout > 0 && <span className="text-[10px] font-bold text-accent">{m.cout.toLocaleString()} FCFA</span>}
                      </div>
                      <p className="text-xs text-content-secondary">{m.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
    green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    amber: 'from-status-warning/20 to-status-warning/5 border-status-warning/20 text-status-warning',
    emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    cyan: 'from-accent/20 to-accent/5 border-accent/20 text-accent',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-content-secondary truncate">{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
