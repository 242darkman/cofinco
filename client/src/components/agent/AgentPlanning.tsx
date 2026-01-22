import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Plus, Check, X } from 'lucide-react';
import { StatutPlanning, STATUT_PLANNING_LABELS } from '@shared/enum/status-constants';

interface Planning {
  id: string;
  agent_id: string;
  date_planning: string;
  heure_debut: string;
  heure_fin: string;
  type_activite: string;
  zone: string;
  statut: string;
  notes: string;
}

export default function AgentPlanning({ agentId }: { agentId?: string }) {
  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    date_planning: selectedDate,
    heure_debut: '08:00',
    heure_fin: '17:00',
    type_activite: 'Visite',
    zone: '',
    notes: ''
  });

  useEffect(() => {
    fetchPlannings();
  }, [agentId, selectedDate]);

  const fetchPlannings = async () => {
    try {
      setLoading(true);
      let url = '/api/agent-planning';
      const params = new URLSearchParams();
      if (agentId) params.append('agentId', agentId);
      if (selectedDate) params.append('date', selectedDate);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPlannings(data || []);
      } else {
        setPlannings([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setPlannings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, statut: 'PLANNED' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la création');
      }

      setShowForm(false);
      fetchPlannings();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatut = async (id: string, statut: string) => {
    try {
      const response = await fetch(`/api/agent-planning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour');
      }

      fetchPlannings();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 items-center">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        />
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={20} />
          Nouveau Planning
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Nouveau Planning</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date_planning}
                  onChange={(e) => setFormData({ ...formData, date_planning: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Type d'Activité</label>
                <select
                  value={formData.type_activite}
                  onChange={(e) => setFormData({ ...formData, type_activite: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Visite">Visite</option>
                  <option value="Collecte">Collecte</option>
                  <option value="Formation">Formation</option>
                  <option value="Congé">Congé</option>
                  <option value="Réunion">Réunion</option>
                  <option value="Prospection">Prospection</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Heure Début</label>
                <input
                  type="time"
                  value={formData.heure_debut}
                  onChange={(e) => setFormData({ ...formData, heure_debut: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Heure Fin</label>
                <input
                  type="time"
                  value={formData.heure_fin}
                  onChange={(e) => setFormData({ ...formData, heure_fin: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Zone</label>
                <input
                  type="text"
                  value={formData.zone}
                  onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Zone à couvrir"
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
              <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Enregistrer
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-700 text-white rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Calendar size={24} className="text-blue-400" />
            Planning du {new Date(selectedDate).toLocaleDateString('fr-FR')}
          </h3>
          <div className="space-y-3">
            {plannings.map((planning) => (
              <div key={planning.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        planning.type_activite === 'Visite' ? 'bg-blue-500/20 text-blue-400' :
                        planning.type_activite === 'Collecte' ? 'bg-green-500/20 text-green-400' :
                        planning.type_activite === 'Formation' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {planning.type_activite}
                      </span>
                      <span className="text-white font-semibold flex items-center gap-2">
                        <Clock size={16} />
                        {planning.heure_debut} - {planning.heure_fin}
                      </span>
                    </div>
                    {planning.zone && (
                      <p className="text-slate-300 text-sm flex items-center gap-2">
                        <MapPin size={16} />
                        {planning.zone}
                      </p>
                    )}
                    {planning.notes && (
                      <p className="text-slate-400 text-sm mt-2">{planning.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {planning.statut === 'Planifié' && (
                      <>
                        <button
                          onClick={() => updateStatut(planning.id, 'Complété')}
                          className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          title="Marquer comme complété"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => updateStatut(planning.id, 'Annulé')}
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                          title="Annuler"
                        >
                          <X size={18} />
                        </button>
                      </>
                    )}
                    {planning.statut !== StatutPlanning.PLANNED && (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        planning.statut === StatutPlanning.COMPLETED ? 'bg-green-500/20 text-green-400' :
                        planning.statut === StatutPlanning.CANCELLED ? 'bg-blue-500/20 text-blue-400' :
                        'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {STATUT_PLANNING_LABELS[planning.statut as keyof typeof STATUT_PLANNING_LABELS] || planning.statut}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {plannings.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                Aucune activité planifiée pour cette date
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
