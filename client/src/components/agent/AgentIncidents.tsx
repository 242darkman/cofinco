import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Plus, CheckCircle, Clock, X, Upload, ArrowUpCircle, FileText, Image as ImageIcon } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

// SLA thresholds in hours by severity
const SLA_HOURS: Record<string, number> = {
  Critique: 2,
  Grave: 24,
  Moyenne: 72,
  Mineure: 168,
};

function getSlaStatus(incident: Incident): { overdue: boolean; remaining: string; pct: number } | null {
  if (incident.statut === 'RESOLVED' || incident.statut === 'Résolu' || incident.statut === 'CLOSED' || incident.statut === 'Fermé') {
    return null;
  }
  const maxHours = SLA_HOURS[incident.gravite];
  if (!maxHours) return null;

  const elapsed = (Date.now() - new Date(incident.date_incident).getTime()) / (1000 * 60 * 60);
  const remaining = maxHours - elapsed;
  const pct = Math.min((elapsed / maxHours) * 100, 100);

  if (remaining <= 0) {
    const overHours = Math.abs(remaining);
    return {
      overdue: true,
      remaining: overHours >= 24 ? `${Math.floor(overHours / 24)}j en retard` : `${Math.floor(overHours)}h en retard`,
      pct: 100,
    };
  }
  return {
    overdue: false,
    remaining: remaining >= 24 ? `${Math.floor(remaining / 24)}j ${Math.floor(remaining % 24)}h restants` : `${Math.floor(remaining)}h restants`,
    pct,
  };
}

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
  pieces_jointes?: string[];
  escalade_par?: string;
  date_escalade?: string;
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
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

      const response = await fetch(url, { credentials: 'include' });
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

  const uploadFiles = async (incidentId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of pendingFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', file.type.startsWith('image/') ? 'profile' : 'misc');
      formData.append('entityType', 'incident');
      formData.append('entityId', incidentId);

      const response = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        urls.push(data.url || data.key);
      }
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...formData, statut: 'OPEN' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la création');
      }

      const created = await response.json();

      // Upload files if any
      if (pendingFiles.length > 0) {
        setUploadingFiles(true);
        const urls = await uploadFiles(created.id);
        if (urls.length > 0) {
          await fetch(`/api/agent-incidents/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ pieces_jointes: urls }),
          });
        }
        setUploadingFiles(false);
      }

      setShowForm(false);
      setPendingFiles([]);
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
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resoudreIncident = async (id: string, resolution: string) => {
    try {
      const response = await fetch(`/api/agent-incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      alert('Erreur: ' + error.message);
    }
  };

  const escaladerIncident = async (id: string) => {
    try {
      const response = await fetch(`/api/agent-incidents/${id}/escalate`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de l\'escalade');
      }

      loadIncidents();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const incidentsOuverts = incidents.filter(i => i.statut === 'OPEN' || i.statut === 'IN_PROGRESS' || i.statut === 'ESCALATED').length;
  const incidentsGraves = incidents.filter(i => i.gravite === 'Grave' || i.gravite === 'Critique').length;
  const incidentsEscalades = incidents.filter(i => i.statut === 'ESCALATED').length;

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

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <ArrowUpCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidentsEscalades}</div>
          <div className="text-orange-100 text-sm">Escaladés</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{incidents.filter(i => i.statut === 'RESOLVED' || i.statut === 'Résolu').length}</div>
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

              {/* File attachments */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Pièces jointes</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-700 border border-dashed border-slate-500 rounded-lg text-slate-300 hover:border-blue-500 hover:text-blue-400 flex items-center gap-2 text-sm"
                >
                  <Upload size={16} />
                  Ajouter des fichiers (JPEG, PNG, PDF)
                </button>
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingFiles.map((file, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1">
                        {file.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
                        {file.name}
                        <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-400 ml-1">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading || uploadingFiles} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                {uploadingFiles ? 'Upload des fichiers...' : 'Signaler'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setPendingFiles([]); }} className="px-6 py-3 bg-slate-700 text-white rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {incidents.map((incident) => {
          const sla = getSlaStatus(incident);

          return (
            <div key={incident.id} className={`bg-slate-800 rounded-xl p-6 border ${
              incident.statut === 'ESCALATED' ? 'border-orange-500' :
              incident.gravite === 'Critique' ? 'border-red-500' :
              incident.gravite === 'Grave' ? 'border-yellow-500' :
              'border-slate-700'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      incident.gravite === 'Critique' ? 'bg-red-500/20 text-red-400' :
                      incident.gravite === 'Grave' ? 'bg-yellow-500/20 text-yellow-400' :
                      incident.gravite === 'Moyenne' ? 'bg-cyan-500/20 text-cyan-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {incident.gravite}
                    </span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                      {incident.type_incident}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      incident.statut === 'RESOLVED' || incident.statut === 'Résolu' ? 'bg-green-500/20 text-green-400' :
                      incident.statut === 'ESCALATED' ? 'bg-orange-500/20 text-orange-400' :
                      incident.statut === 'IN_PROGRESS' || incident.statut === 'En traitement' ? 'bg-cyan-500/20 text-cyan-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {incident.statut === 'ESCALATED' ? 'Escaladé' : (ALL_STATUS_LABELS[incident.statut] || incident.statut)}
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

              {/* SLA indicator */}
              {sla && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  sla.overdue
                    ? 'bg-red-500/10 border-red-500/30'
                    : sla.pct > 75
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-slate-700/30 border-slate-600'
                }`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={`font-semibold ${sla.overdue ? 'text-red-400' : sla.pct > 75 ? 'text-yellow-400' : 'text-slate-300'}`}>
                      SLA ({SLA_HOURS[incident.gravite]}h)
                    </span>
                    <span className={`text-xs ${sla.overdue ? 'text-red-400' : 'text-slate-400'}`}>
                      {sla.remaining}
                    </span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-1.5">
                    <div
                      className={`h-full rounded-full transition-all ${
                        sla.overdue ? 'bg-red-500' : sla.pct > 75 ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${sla.pct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Attached files */}
              {incident.pieces_jointes && incident.pieces_jointes.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {incident.pieces_jointes.map((url, i) => {
                    const isImage = /\.(jpe?g|png)$/i.test(url);
                    return (
                      <a
                        key={i}
                        href={url.startsWith('/') ? url : `/api/storage/files/${url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1.5"
                      >
                        {isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                        Pièce jointe {i + 1}
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Escalation info */}
              {incident.statut === 'ESCALATED' && incident.date_escalade && (
                <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <p className="text-sm font-semibold text-orange-400 mb-1 flex items-center gap-1.5">
                    <ArrowUpCircle size={14} />
                    Incident escaladé
                  </p>
                  <p className="text-xs text-slate-400">
                    Escaladé le {new Date(incident.date_escalade).toLocaleString('fr-FR')}
                  </p>
                </div>
              )}

              {/* Action buttons for open/escalated incidents */}
              {incident.statut !== 'RESOLVED' && incident.statut !== 'Résolu' && incident.statut !== 'CLOSED' && incident.statut !== 'Fermé' && canResolveIncidents && (
                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    placeholder="Résolution de l'incident..."
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    onKeyDown={(e) => {
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
                  {incident.statut !== 'ESCALATED' && (
                    <button
                      onClick={() => escaladerIncident(incident.id)}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                      title="Escalader au superviseur"
                    >
                      <ArrowUpCircle size={16} />
                      Escalader
                    </button>
                  )}
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
          );
        })}

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
