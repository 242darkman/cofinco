import React, { useState, useEffect } from 'react';
import { Package, Plus, AlertCircle, CheckCircle, DollarSign, Shield, Wrench, TrendingDown, Calendar, X } from 'lucide-react';

interface Maintenance {
  date: string;
  description: string;
  cout: number;
}

interface Materiel {
  id: string;
  agent_id: string;
  type_materiel: string;
  nom_materiel: string;
  numero_serie: string;
  date_attribution: string;
  date_retour?: string;
  etat: string;
  valeur: number;
  date_garantie_fin?: string;
  duree_amortissement_mois?: number;
  prochaine_maintenance?: string;
  historique_maintenances?: Maintenance[];
  notes: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

function calcDepreciation(valeur: number, dateAttribution: string, dureeMois: number): { valeurResiduelle: number; pourcentage: number } {
  const start = new Date(dateAttribution);
  const now = new Date();
  const moisEcoules = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const ratio = Math.min(moisEcoules / dureeMois, 1);
  const valeurResiduelle = Math.max(valeur * (1 - ratio), 0);
  return { valeurResiduelle: Math.round(valeurResiduelle), pourcentage: Math.round(ratio * 100) };
}

function getWarrantyStatus(dateGarantieFin?: string): { label: string; color: string; expired: boolean } {
  if (!dateGarantieFin) return { label: 'Non définie', color: 'text-slate-400', expired: false };
  const fin = new Date(dateGarantieFin);
  const now = new Date();
  const joursRestants = Math.ceil((fin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (joursRestants < 0) return { label: 'Expirée', color: 'text-red-400', expired: true };
  if (joursRestants <= 30) return { label: `${joursRestants}j restants`, color: 'text-orange-400', expired: false };
  if (joursRestants <= 90) return { label: `${joursRestants}j restants`, color: 'text-yellow-400', expired: false };
  return { label: `${joursRestants}j restants`, color: 'text-green-400', expired: false };
}

export default function AgentMateriel({ agentId }: { agentId?: string }) {
  const [materiels, setMateriels] = useState<Materiel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [maintenanceModal, setMaintenanceModal] = useState<Materiel | null>(null);
  const [newMaintenance, setNewMaintenance] = useState({ description: '', cout: 0 });

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

  useEffect(() => {
    loadMateriels();
  }, [agentId]);

  const loadMateriels = async () => {
    try {
      const params = new URLSearchParams();
      if (agentId) {
        params.append('agent_id', agentId);
        params.append('actif', 'true');
      }

      const response = await fetch(`/api/agent-materiel?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setMateriels(data || []);
    } catch (error) {
      console.error('Erreur:', error);
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
        body: JSON.stringify({
          date_retour: new Date().toISOString().slice(0, 10),
          etat: 'Retourné'
        })
      });

      if (!response.ok) throw new Error('Erreur lors du retour');
      loadMateriels();
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

  const actifs = materiels.filter(m => !m.date_retour);
  const valeurTotale = actifs.reduce((sum, m) => sum + m.valeur, 0);
  const valeurResiduelle = actifs.reduce((sum, m) => {
    const dep = calcDepreciation(m.valeur, m.date_attribution, m.duree_amortissement_mois || 36);
    return sum + dep.valeurResiduelle;
  }, 0);
  const materielProblemes = actifs.filter(m => m.etat === 'Mauvais' || m.etat === 'Perdu').length;
  const garantiesExpirees = actifs.filter(m => {
    const w = getWarrantyStatus(m.date_garantie_fin);
    return w.expired;
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
          <Package size={20} className="mb-2" />
          <div className="text-2xl font-bold mb-1">{actifs.length}</div>
          <div className="text-blue-100 text-xs">Matériel Actif</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white">
          <CheckCircle size={20} className="mb-2" />
          <div className="text-2xl font-bold mb-1">{actifs.filter(m => m.etat === 'Neuf' || m.etat === 'Bon').length}</div>
          <div className="text-green-100 text-xs">Bon État</div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white">
          <AlertCircle size={20} className="mb-2" />
          <div className="text-2xl font-bold mb-1">{materielProblemes}</div>
          <div className="text-amber-100 text-xs">Problèmes</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <DollarSign size={20} className="mb-2" />
          <div className="text-2xl font-bold mb-1">{valeurTotale.toLocaleString()}</div>
          <div className="text-emerald-100 text-xs">Valeur Achat (FCFA)</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-5 text-white">
          <TrendingDown size={20} className="mb-2" />
          <div className="text-2xl font-bold mb-1">{valeurResiduelle.toLocaleString()}</div>
          <div className="text-cyan-100 text-xs">Val. Résiduelle (FCFA)</div>
        </div>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
      >
        <Plus size={20} />
        Attribuer Matériel
      </button>

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Attribution de Matériel</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Type de Matériel</label>
                <select
                  value={formData.type_materiel}
                  onChange={(e) => setFormData({ ...formData, type_materiel: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Tablette">Tablette</option>
                  <option value="Badge">Badge</option>
                  <option value="Uniforme">Uniforme</option>
                  <option value="Véhicule">Véhicule</option>
                  <option value="Téléphone">Téléphone</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Nom/Modèle</label>
                <input
                  type="text"
                  value={formData.nom_materiel}
                  onChange={(e) => setFormData({ ...formData, nom_materiel: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Ex: Samsung Galaxy Tab A"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Numéro de Série</label>
                <input
                  type="text"
                  value={formData.numero_serie}
                  onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Ex: SN123456"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Date d'Attribution</label>
                <input
                  type="date"
                  value={formData.date_attribution}
                  onChange={(e) => setFormData({ ...formData, date_attribution: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">État</label>
                <select
                  value={formData.etat}
                  onChange={(e) => setFormData({ ...formData, etat: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Neuf">Neuf</option>
                  <option value="Bon">Bon</option>
                  <option value="Moyen">Moyen</option>
                  <option value="Mauvais">Mauvais</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Valeur (FCFA)</label>
                <input
                  type="number"
                  value={formData.valeur}
                  onChange={(e) => setFormData({ ...formData, valeur: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  <Shield size={14} className="inline mr-1" />
                  Fin de Garantie
                </label>
                <input
                  type="date"
                  value={formData.date_garantie_fin}
                  onChange={(e) => setFormData({ ...formData, date_garantie_fin: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  <TrendingDown size={14} className="inline mr-1" />
                  Amortissement (mois)
                </label>
                <input
                  type="number"
                  value={formData.duree_amortissement_mois}
                  onChange={(e) => setFormData({ ...formData, duree_amortissement_mois: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  min={1}
                  max={120}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  <Wrench size={14} className="inline mr-1" />
                  Prochaine Maintenance
                </label>
                <input
                  type="date"
                  value={formData.prochaine_maintenance}
                  onChange={(e) => setFormData({ ...formData, prochaine_maintenance: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Attribuer
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-700 text-white rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-blue-400" />
            Inventaire du Matériel ({actifs.length})
          </h3>
          {garantiesExpirees > 0 && (
            <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-semibold">
              {garantiesExpirees} garantie{garantiesExpirees > 1 ? 's' : ''} expirée{garantiesExpirees > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                {!agentId && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Agent</th>}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Nom/Modèle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">N° Série</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Attribution</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">État</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Garantie</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">Valeur</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">V. Résid.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {materiels.map((mat) => {
                const dep = calcDepreciation(mat.valeur, mat.date_attribution, mat.duree_amortissement_mois || 36);
                const warranty = getWarrantyStatus(mat.date_garantie_fin);
                const maintenanceDue = mat.prochaine_maintenance && new Date(mat.prochaine_maintenance) <= new Date();

                return (
                  <tr key={mat.id} className="hover:bg-slate-700/50 transition">
                    {!agentId && (
                      <td className="px-4 py-3 text-white text-sm">
                        {mat.agent?.nom} {mat.agent?.prenom}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                        {mat.type_materiel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-sm">{mat.nom_materiel}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{mat.numero_serie || '-'}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{new Date(mat.date_attribution).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <select
                        value={mat.etat}
                        onChange={(e) => changerEtat(mat.id, e.target.value)}
                        disabled={!!mat.date_retour}
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          mat.etat === 'Neuf' || mat.etat === 'Bon' ? 'bg-green-500/20 text-green-400' :
                          mat.etat === 'Moyen' ? 'bg-yellow-500/20 text-yellow-400' :
                          mat.etat === 'Mauvais' ? 'bg-red-500/20 text-red-400' :
                          mat.etat === 'Perdu' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        } bg-transparent border-0 cursor-pointer`}
                      >
                        <option value="Neuf">Neuf</option>
                        <option value="Bon">Bon</option>
                        <option value="Moyen">Moyen</option>
                        <option value="Mauvais">Mauvais</option>
                        <option value="Perdu">Perdu</option>
                        <option value="Retourné">Retourné</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Shield size={12} className={warranty.color} />
                        <span className={`text-xs font-medium ${warranty.color}`}>{warranty.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white text-sm font-semibold">{mat.valeur.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div>
                        <span className="text-sm font-semibold text-cyan-400">{dep.valeurResiduelle.toLocaleString()}</span>
                        <div className="w-full bg-slate-600 rounded-full h-1 mt-1">
                          <div
                            className={`h-1 rounded-full ${dep.pourcentage > 80 ? 'bg-red-500' : dep.pourcentage > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${100 - dep.pourcentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!mat.date_retour && (
                          <>
                            <button
                              onClick={() => setMaintenanceModal(mat)}
                              className={`text-xs font-semibold flex items-center gap-1 ${maintenanceDue ? 'text-orange-400 hover:text-orange-300' : 'text-slate-400 hover:text-slate-300'}`}
                              title="Maintenance"
                            >
                              <Wrench size={14} />
                              {maintenanceDue && <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />}
                            </button>
                            <button
                              onClick={() => retournerMateriel(mat.id)}
                              className="text-xs font-semibold text-blue-400 hover:text-blue-300"
                            >
                              Retourner
                            </button>
                          </>
                        )}
                        {mat.date_retour && (
                          <span className="text-xs text-slate-500">
                            Retourné le {new Date(mat.date_retour).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {materiels.length === 0 && (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">Aucun matériel attribué</p>
            </div>
          )}
        </div>
      </div>

      {/* Maintenance Modal */}
      {maintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMaintenanceModal(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wrench size={20} className="text-blue-400" />
                Maintenance - {maintenanceModal.nom_materiel}
              </h3>
              <button onClick={() => setMaintenanceModal(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Next maintenance */}
              {maintenanceModal.prochaine_maintenance && (
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                  new Date(maintenanceModal.prochaine_maintenance) <= new Date()
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : 'bg-slate-700/50 border-slate-600'
                }`}>
                  <Calendar size={16} className={new Date(maintenanceModal.prochaine_maintenance) <= new Date() ? 'text-orange-400' : 'text-slate-400'} />
                  <span className="text-sm text-slate-300">Prochaine maintenance:</span>
                  <span className={`text-sm font-semibold ${new Date(maintenanceModal.prochaine_maintenance) <= new Date() ? 'text-orange-400' : 'text-white'}`}>
                    {new Date(maintenanceModal.prochaine_maintenance).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )}

              {/* Add maintenance */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300">Enregistrer une maintenance</h4>
                <input
                  type="text"
                  value={newMaintenance.description}
                  onChange={(e) => setNewMaintenance({ ...newMaintenance, description: e.target.value })}
                  placeholder="Description de l'intervention..."
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={newMaintenance.cout}
                    onChange={(e) => setNewMaintenance({ ...newMaintenance, cout: Number(e.target.value) })}
                    placeholder="Coût (FCFA)"
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                    min={0}
                  />
                  <button
                    onClick={ajouterMaintenance}
                    disabled={!newMaintenance.description}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {/* History */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-300">Historique ({(maintenanceModal.historique_maintenances || []).length})</h4>
                {(maintenanceModal.historique_maintenances || []).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">Aucune maintenance enregistrée</p>
                ) : (
                  (maintenanceModal.historique_maintenances || []).slice().reverse().map((m, i) => (
                    <div key={i} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">{new Date(m.date).toLocaleDateString('fr-FR')}</span>
                        {m.cout > 0 && <span className="text-xs font-semibold text-cyan-400">{m.cout.toLocaleString()} FCFA</span>}
                      </div>
                      <p className="text-sm text-white">{m.description}</p>
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
