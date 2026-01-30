import React, { useState, useEffect } from 'react';
import { Target, TrendingUp, Award, Plus, Check, BarChart3, DollarSign, RefreshCw, Loader2 } from 'lucide-react';
import { StatutObjectif } from '@shared/enum/status-constants';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

interface Objectif {
  id: string;
  agent_id: string;
  periode: string;
  type_objectif: string;
  valeur_objectif: number;
  valeur_realisee: number;
  unite: string;
  statut: string;
  recompense: number;
  created_at: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

export default function AgentObjectifs({ agentId }: { agentId?: string }) {
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriode, setSelectedPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [recalculating, setRecalculating] = useState<string | null>(null); // objectif id or 'all'

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    periode: new Date().toISOString().slice(0, 7),
    type_objectif: 'Collecte',
    valeur_objectif: 0,
    unite: 'FCFA',
    recompense: 0
  });

  useEffect(() => {
    loadObjectifs();
  }, [agentId, selectedPeriode]);

  const loadObjectifs = async () => {
    try {
      setLoading(true);
      let url = '/api/agent-objectifs';
      const params = new URLSearchParams();
      if (agentId) params.append('agentId', agentId);
      if (selectedPeriode) params.append('periode', selectedPeriode);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setObjectifs(data || []);
      } else {
        setObjectifs([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setObjectifs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-objectifs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          valeur_realisee: 0,
          statut: 'IN_PROGRESS'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la creation');
      }

      setShowForm(false);
      loadObjectifs();
      setFormData({
        agent_id: agentId || '',
        periode: new Date().toISOString().slice(0, 7),
        type_objectif: 'Collecte',
        valeur_objectif: 0,
        unite: 'FCFA',
        recompense: 0
      });
    } catch (error: any) {
      alert('Erreur: ' + (error.message || error.error));
    } finally {
      setLoading(false);
    }
  };

  const updateRealisation = async (objectifId: string, valeur: number) => {
    try {
      const objectif = objectifs.find(o => o.id === objectifId);
      if (!objectif) return;

      const pourcentage = (valeur / objectif.valeur_objectif) * 100;
      let statut = 'IN_PROGRESS';
      if (pourcentage >= 110) statut = 'Depasse';
      else if (pourcentage >= 100) statut = 'Atteint';

      const response = await fetch(`/api/agent-objectifs/${objectifId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          valeur_realisee: valeur,
          statut
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise a jour');
      }

      loadObjectifs();
    } catch (error: any) {
      alert('Erreur: ' + (error.message || error.error));
    }
  };

  const recalculateOne = async (objectifId: string) => {
    try {
      setRecalculating(objectifId);
      const response = await fetch(`/api/agent-objectifs/${objectifId}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors du recalcul');
      }

      await loadObjectifs();
    } catch (error: any) {
      alert('Erreur recalcul: ' + (error.message || error.error));
    } finally {
      setRecalculating(null);
    }
  };

  const recalculateAll = async () => {
    if (!agentId) return;
    try {
      setRecalculating('all');
      const response = await fetch('/api/agent-objectifs/recalculate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agentId, periode: selectedPeriode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors du recalcul');
      }

      await loadObjectifs();
    } catch (error: any) {
      alert('Erreur recalcul: ' + (error.message || error.error));
    } finally {
      setRecalculating(null);
    }
  };

  const objectifsAtteints = objectifs.filter(o => o.statut === 'Atteint' || o.statut === 'Depasse').length;
  const totalRecompenses = objectifs
    .filter(o => o.statut === 'Atteint' || o.statut === 'Depasse')
    .reduce((sum, o) => sum + Number(o.recompense || 0), 0);
  const tauxReussite = objectifs.length > 0
    ? (objectifsAtteints / objectifs.length) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Target size={24} />
            <BarChart3 size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{objectifs.length}</div>
          <div className="text-blue-100 text-sm">Objectifs Actifs</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Check size={24} />
            <TrendingUp size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{objectifsAtteints}</div>
          <div className="text-green-100 text-sm">Objectifs Atteints</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Award size={24} />
            <DollarSign size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{totalRecompenses.toLocaleString()} FCFA</div>
          <div className="text-emerald-100 text-sm">Recompenses</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={24} />
            <BarChart3 size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{tauxReussite.toFixed(1)}%</div>
          <div className="text-cyan-100 text-sm">Taux de Reussite</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Nouvel Objectif
        </button>

        {objectifs.length > 0 && agentId && (
          <button
            onClick={recalculateAll}
            disabled={recalculating !== null}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            {recalculating === 'all' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            Recalculer Tout
          </button>
        )}

        <input
          type="month"
          value={selectedPeriode}
          onChange={(e) => setSelectedPeriode(e.target.value)}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        />
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Nouvel Objectif</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Periode</label>
                <input
                  type="month"
                  value={formData.periode}
                  onChange={(e) => setFormData({ ...formData, periode: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Type d'Objectif</label>
                <select
                  value={formData.type_objectif}
                  onChange={(e) => setFormData({ ...formData, type_objectif: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Collecte">Collecte</option>
                  <option value="Clients">Nombre de Clients</option>
                  <option value="Visites">Nombre de Visites</option>
                  <option value="Performance">Performance</option>
                  <option value="Prospection">Prospection</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Valeur Objectif</label>
                <input
                  type="number"
                  value={formData.valeur_objectif}
                  onChange={(e) => setFormData({ ...formData, valeur_objectif: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Unite</label>
                <select
                  value={formData.unite}
                  onChange={(e) => setFormData({ ...formData, unite: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="FCFA">FCFA (Franc CFA)</option>
                  <option value="Clients">Clients</option>
                  <option value="Visites">Visites</option>
                  <option value="%">%</option>
                  <option value="Points">Points</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Recompense (FC)</label>
                <input
                  type="number"
                  value={formData.recompense}
                  onChange={(e) => setFormData({ ...formData, recompense: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {objectifs.map((objectif) => {
          const pourcentage = objectif.valeur_objectif > 0
            ? (Number(objectif.valeur_realisee) / Number(objectif.valeur_objectif)) * 100
            : 0;
          const isRecalculating = recalculating === objectif.id;

          return (
            <div key={objectif.id} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                      {objectif.type_objectif}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      objectif.statut === 'Atteint' || objectif.statut === 'Depasse'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {ALL_STATUS_LABELS[objectif.statut] || objectif.statut}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1">
                    Objectif {objectif.type_objectif} - {objectif.periode}
                  </h4>
                  {!agentId && objectif.agent && (
                    <p className="text-slate-400 text-sm">
                      {objectif.agent.nom} {objectif.agent.prenom}
                    </p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="text-2xl font-bold text-white">
                    {pourcentage.toFixed(1)}%
                  </div>
                  {Number(objectif.recompense) > 0 && (
                    <div className="text-green-400 text-sm font-semibold flex items-center gap-1">
                      <Award size={14} />
                      {Number(objectif.recompense).toLocaleString()} FCFA
                    </div>
                  )}
                  <button
                    onClick={() => recalculateOne(objectif.id)}
                    disabled={recalculating !== null}
                    className="px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 text-indigo-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="Recalculer depuis les donnees reelles"
                  >
                    {isRecalculating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Recalculer
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm text-slate-300 mb-2">
                  <span>Progression</span>
                  <span>
                    {Number(objectif.valeur_realisee).toLocaleString()} / {Number(objectif.valeur_objectif).toLocaleString()} {objectif.unite}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pourcentage >= 100 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                      pourcentage >= 80 ? 'bg-gradient-to-r from-cyan-500 to-cyan-600' :
                      'bg-gradient-to-r from-blue-500 to-blue-600'
                    }`}
                    style={{ width: `${Math.min(pourcentage, 100)}%` }}
                  />
                </div>
              </div>

              {objectif.statut === StatutObjectif.IN_PROGRESS && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Valeur realisee"
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const value = Number((e.target as HTMLInputElement).value);
                        if (value > 0) {
                          updateRealisation(objectif.id, value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      const value = Number(input.value);
                      if (value > 0) {
                        updateRealisation(objectif.id, value);
                        input.value = '';
                      }
                    }}
                  >
                    Mettre a jour
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {objectifs.length === 0 && (
          <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
            <Target size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">Aucun objectif pour cette periode</p>
          </div>
        )}
      </div>
    </div>
  );
}
