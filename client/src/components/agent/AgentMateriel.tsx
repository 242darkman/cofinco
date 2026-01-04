import React, { useState, useEffect } from 'react';
import { Package, Plus, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';

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
  notes: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

export default function AgentMateriel({ agentId }: { agentId?: string }) {
  const [materiels, setMateriels] = useState<Materiel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    type_materiel: 'Tablette',
    nom_materiel: '',
    numero_serie: '',
    date_attribution: new Date().toISOString().slice(0, 10),
    etat: 'Neuf',
    valeur: 0,
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
      
      const response = await fetch(`/api/agent-materiel?${params.toString()}`);
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
        notes: ''
      });
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    } finally {
      setLoading(false);
    }
  };

  const retournerMateriel = async (id: string) => {
    try {
      const response = await fetch(`/api/agent-materiel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_retour: new Date().toISOString().slice(0, 10),
          etat: 'Retourné'
        })
      });

      if (!response.ok) throw new Error('Erreur lors du retour');
      loadMateriels();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    }
  };

  const changerEtat = async (id: string, nouvelEtat: string) => {
    try {
      const response = await fetch(`/api/agent-materiel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etat: nouvelEtat })
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      loadMateriels();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    }
  };

  const valeurTotale = materiels
    .filter(m => !m.date_retour)
    .reduce((sum, m) => sum + m.valeur, 0);

  const materielProblemes = materiels.filter(m =>
    (m.etat === 'Mauvais' || m.etat === 'Perdu') && !m.date_retour
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Package size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{materiels.filter(m => !m.date_retour).length}</div>
          <div className="text-blue-100 text-sm">Matériel Actif</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{materiels.filter(m => m.etat === 'Neuf' || m.etat === 'Bon').length}</div>
          <div className="text-green-100 text-sm">Bon État</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{materielProblemes}</div>
          <div className="text-emerald-100 text-sm">Problèmes</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{valeurTotale.toLocaleString()} FCFA</div>
          <div className="text-emerald-100 text-sm">Valeur Totale</div>
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
                <label className="block text-sm font-semibold text-slate-300 mb-2">Valeur (FC)</label>
                <input
                  type="number"
                  value={formData.valeur}
                  onChange={(e) => setFormData({ ...formData, valeur: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
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

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-blue-400" />
            Inventaire du Matériel ({materiels.filter(m => !m.date_retour).length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                {!agentId && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Agent</th>}
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Nom/Modèle</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">N° Série</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Attribution</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">État</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-300">Valeur</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {materiels.map((mat) => (
                <tr key={mat.id} className="hover:bg-slate-700/50 transition">
                  {!agentId && (
                    <td className="px-6 py-4 text-white">
                      {mat.agent?.nom} {mat.agent?.prenom}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                      {mat.type_materiel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white">{mat.nom_materiel}</td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-sm">{mat.numero_serie || '-'}</td>
                  <td className="px-6 py-4 text-slate-300">{new Date(mat.date_attribution).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4">
                    <select
                      value={mat.etat}
                      onChange={(e) => changerEtat(mat.id, e.target.value)}
                      disabled={!!mat.date_retour}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        mat.etat === 'Neuf' || mat.etat === 'Bon' ? 'bg-green-500/20 text-green-400' :
                        mat.etat === 'Moyen' ? 'bg-cyan-500/20 text-cyan-400' :
                        mat.etat === 'Mauvais' ? 'bg-emerald-500/20 text-emerald-400' :
                        mat.etat === 'Perdu' ? 'bg-blue-500/20 text-blue-400' :
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
                  <td className="px-6 py-4 text-right text-white font-semibold">{mat.valeur.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4">
                    {!mat.date_retour && (
                      <button
                        onClick={() => retournerMateriel(mat.id)}
                        className="text-sm font-semibold text-blue-400 hover:text-blue-300"
                      >
                        Retourner
                      </button>
                    )}
                    {mat.date_retour && (
                      <span className="text-sm text-slate-500">
                        Retourné le {new Date(mat.date_retour).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  );
}
