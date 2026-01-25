import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, CheckCircle, Clock, X } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

interface Incident {
  id: string;
  agent_id: string;
  type_incident: string;
  gravite: string;
  description: string;
  date_incident: string;
  localisation: string;
  statut: string;
  resolution: string;
  date_resolution?: string;
  agent?: { nom: string; prenom: string };
}

export default function AgentIncidents({ agentId }: { agentId?: string }) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateIncidents = hasPermission('terrain', 'create') || hasPermission('incidents', 'create');
  const canResolveIncidents = hasPermission('terrain', 'edit') || hasPermission('incidents', 'edit') || hasPermission('terrain', 'manage');

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    type_incident: 'Sécurité',
    gravite: 'Moyenne',
    description: '',
    localisation: '',
    date_incident: new Date().toISOString().slice(0, 16)
  });

  useEffect(() => {
    loadIncidents();
  }, [agentId]);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      let url = '/api/agent-incidents';
      if (agentId) url += `?agentId=${agentId}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setIncidents(data || []);
      } else {
        setIncidents([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, statut: 'OPEN' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la création');
      }

      setShowForm(false);
      loadIncidents();
      setFormData({
        agent_id: agentId || '',
        type_incident: 'Sécurité',
        gravite: 'Moyenne',
        description: '',
        localisation: '',
        date_incident: new Date().toISOString().slice(0, 16)
      });
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    } finally {
      setLoading(false);
    }
  };

  const resoudreIncident = async (id: string, resolution: string) => {
    try {
      const response = await fetch(`/api/agent-incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'RESOLVED',
          resolution,
          date_resolution: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour');
      }

      loadIncidents();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
    }
  };

  const incidentsOuverts = incidents.filter(i => i.statut === 'OPEN' || i.statut === 'IN_PROGRESS').length;
  const incidentsGraves = incidents.filter(i => i.gravite === 'Grave' || i.gravite === 'Critique').length;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidents.length}</div>
          <div className="text-blue-100 text-sm">Total Incidents</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidentsOuverts}</div>
          <div className="text-emerald-100 text-sm">En Cours</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidentsGraves}</div>
          <div className="text-cyan-100 text-sm">Graves/Critiques</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidents.filter(i => i.statut === 'Résolu').length}</div>
          <div className="text-green-100 text-sm">Résolus</div>
        </div>
      </div>

      {canCreateIncidents && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={20} />
          Signaler un Incident
        </button>
      )}

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Nouveau Incident</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Type d'Incident</label>
                <select
                  value={formData.type_incident}
                  onChange={(e) => setFormData({ ...formData, type_incident: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Sécurité">Sécurité</option>
                  <option value="Client difficile">Client difficile</option>
                  <option value="Retard">Retard</option>
                  <option value="Matériel">Matériel</option>
                  <option value="Accident">Accident</option>
                  <option value="Fraude">Fraude</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Gravité</label>
                <select
                  value={formData.gravite}
                  onChange={(e) => setFormData({ ...formData, gravite: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Mineure">Mineure</option>
                  <option value="Moyenne">Moyenne</option>
                  <option value="Grave">Grave</option>
                  <option value="Critique">Critique</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Date/Heure</label>
                <input
                  type="datetime-local"
                  value={formData.date_incident}
                  onChange={(e) => setFormData({ ...formData, date_incident: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Localisation</label>
                <input
                  type="text"
                  value={formData.localisation}
                  onChange={(e) => setFormData({ ...formData, localisation: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Lieu de l'incident"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={4}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Signaler
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-700 text-white rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {incidents.map((incident) => (
          <div key={incident.id} className={`bg-slate-800 rounded-xl p-6 border ${
            incident.gravite === 'Critique' ? 'border-blue-500' :
            incident.gravite === 'Grave' ? 'border-emerald-500' :
            'border-slate-700'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    incident.gravite === 'Critique' ? 'bg-blue-500/20 text-blue-400' :
                    incident.gravite === 'Grave' ? 'bg-emerald-500/20 text-emerald-400' :
                    incident.gravite === 'Moyenne' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {incident.gravite}
                  </span>
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                    {incident.type_incident}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    incident.statut === 'Résolu' ? 'bg-green-500/20 text-green-400' :
                    incident.statut === 'En traitement' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {ALL_STATUS_LABELS[incident.statut] || incident.statut}
                  </span>
                </div>
                <p className="text-white mb-2">{incident.description}</p>
                <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                  <span>{new Date(incident.date_incident).toLocaleString('fr-FR')}</span>
                  {incident.localisation && <span>📍 {incident.localisation}</span>}
                  {!agentId && incident.agent && (
                    <span>👤 {incident.agent.nom} {incident.agent.prenom}</span>
                  )}
                </div>
              </div>
            </div>

            {incident.statut !== 'Résolu' && incident.statut !== 'Fermé' && canResolveIncidents && (
              <div className="flex gap-2 mt-4">
                <input
                  type="text"
                  placeholder="Résolution de l'incident..."
                  className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value;
                      if (value.trim()) {
                        resoudreIncident(incident.id, value);
                      }
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    if (input.value.trim()) {
                      resoudreIncident(incident.id, input.value);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                >
                  <CheckCircle size={16} />
                  Résoudre
                </button>
              </div>
            )}

            {incident.resolution && (
              <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-semibold text-green-400 mb-1">✓ Résolution</p>
                <p className="text-sm text-slate-300">{incident.resolution}</p>
                {incident.date_resolution && (
                  <p className="text-xs text-slate-400 mt-2">
                    Résolu le {new Date(incident.date_resolution).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {incidents.length === 0 && (
          <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
            <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
            <p className="text-slate-400">Aucun incident signalé</p>
          </div>
        )}
      </div>
    </div>
  );
}
