import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Plus, CheckCircle, Clock, X, Upload, ArrowUpCircle, FileText, Image as ImageIcon, ChevronLeft, ChevronRight, Eye, Shield, AlertCircle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

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
      remaining: overHours >= 24 ? `${Math.floor(overHours / 24)}j retard` : `${Math.floor(overHours)}h retard`,
      pct: 100,
    };
  }
  return {
    overdue: false,
    remaining: remaining >= 24 ? `${Math.floor(remaining / 24)}j restants` : `${Math.floor(remaining)}h restants`,
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
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    type_incident: 'Sécurité',
    gravite: 'Moyenne',
    description: '',
    localisation: '',
    date_incident: new Date().toISOString().slice(0, 16)
  });

  // Action fields in Sheet
  const [resolutionNote, setResolutionNote] = useState('');

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

  const resoudreIncident = async () => {
    if (!selectedIncident || !resolutionNote) return;
    try {
      const response = await fetch(`/api/agent-incidents/${selectedIncident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          statut: 'RESOLVED',
          resolution: resolutionNote,
          date_resolution: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      loadIncidents();
      setSelectedIncident(null);
      setResolutionNote('');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const escaladerIncident = async () => {
     if (!selectedIncident) return;
    try {
      const response = await fetch(`/api/agent-incidents/${selectedIncident.id}/escalate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erreur lors de l\'escalade');
      loadIncidents();
      setSelectedIncident(null);
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const incidentsOuverts = incidents.filter(i => i.statut === 'OPEN' || i.statut === 'IN_PROGRESS' || i.statut === 'ESCALATED').length;
  const incidentsEscalades = incidents.filter(i => i.statut === 'ESCALATED').length;
  const incidentsResolus = incidents.filter(i => ['RESOLVED', 'Résolu', 'CLOSED', 'Fermé'].includes(i.statut)).length;

  // Pagination Logic
  const totalPages = Math.ceil(incidents.length / ITEMS_PER_PAGE);
  const paginatedIncidents = incidents.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<AlertTriangle size={14} />} label="Total" value={incidents.length.toString()} color="blue" />
        <StatCard icon={<Clock size={14} />} label="En Cours" value={incidentsOuverts.toString()} color="emerald" />
        <StatCard icon={<ArrowUpCircle size={14} />} label="Escaladés" value={incidentsEscalades.toString()} color="orange" />
        <StatCard icon={<CheckCircle size={14} />} label="Résolus" value={incidentsResolus.toString()} color="green" />
      </div>

      {canCreateIncidents && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Annuler' : 'Signaler un Incident'}
        </button>
      )}

      {/* Form Compact */}
      {showForm && (
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <FormField label="Type">
                <select value={formData.type_incident} onChange={(e) => setFormData({ ...formData, type_incident: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs">
                  <option value="Sécurité">Sécurité</option><option value="Client difficile">Client difficile</option><option value="Retard">Retard</option><option value="Matériel">Matériel</option><option value="Accident">Accident</option><option value="Fraude">Fraude</option><option value="Autre">Autre</option>
                </select>
              </FormField>
              <FormField label="Gravité">
                <select value={formData.gravite} onChange={(e) => setFormData({ ...formData, gravite: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs">
                  <option value="Mineure">Mineure</option><option value="Moyenne">Moyenne</option><option value="Grave">Grave</option><option value="Critique">Critique</option>
                </select>
              </FormField>
              <FormField label="Date">
                <input type="datetime-local" value={formData.date_incident} onChange={(e) => setFormData({ ...formData, date_incident: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" />
              </FormField>
              <FormField label="Lieu">
                <input type="text" value={formData.localisation} onChange={(e) => setFormData({ ...formData, localisation: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" placeholder="Lieu..." />
              </FormField>
            </div>
            
            <FormField label="Description">
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" rows={2} required />
            </FormField>

            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => { if (e.target.files) setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-slate-800 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-blue-500 hover:text-blue-400 flex items-center gap-1.5 text-xs transition">
                <Upload size={14} /> Pièces jointes
              </button>
              {pendingFiles.length > 0 && <span className="text-xs text-slate-400">{pendingFiles.length} fichier(s)</span>}
              <div className="flex-1" />
              <button type="submit" disabled={loading || uploadingFiles} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs">
                {uploadingFiles ? '...' : 'Signaler'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Incidents List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400" />
            Incidents Signalés
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">{incidents.length} incidents</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" /></div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <CheckCircle size={32} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm text-slate-400">Aucun incident signalé</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {paginatedIncidents.map((incident) => {
              const sla = getSlaStatus(incident);
              return (
                <div
                  key={incident.id}
                  onClick={() => { setSelectedIncident(incident); setResolutionNote(''); }}
                  className="p-3 hover:bg-slate-700/30 transition cursor-pointer group flex items-start gap-3"
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-1 ${
                    incident.gravite === 'Critique' ? 'bg-red-500/10 text-red-400' :
                    incident.gravite === 'Grave' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-sm font-bold text-white truncate">{incident.type_incident}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        incident.statut === 'RESOLVED' || incident.statut === 'Résolu' ? 'bg-green-500/20 text-green-400' :
                        incident.statut === 'ESCALATED' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {ALL_STATUS_LABELS[incident.statut] || incident.statut}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1 mb-1">{incident.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{new Date(incident.date_incident).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {incident.localisation && <><span>•</span><span>{incident.localisation}</span></>}
                      {sla && (
                        <>
                          <span>•</span>
                          <span className={sla.overdue ? 'text-red-400 font-bold' : 'text-slate-400'}>
                            SLA: {sla.remaining}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Eye size={14} className="text-slate-600 group-hover:text-cyan-400 shrink-0 mt-2" />
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50 bg-slate-900/20">
            <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"><ChevronLeft size={12} /></button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedIncident} onOpenChange={(open) => !open && setSelectedIncident(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
          {selectedIncident && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-white flex items-center gap-2">
                  <AlertTriangle size={16} className={
                    selectedIncident.gravite === 'Critique' ? 'text-red-400' :
                    selectedIncident.gravite === 'Grave' ? 'text-orange-400' : 'text-blue-400'
                  } />
                  {selectedIncident.type_incident}
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  {new Date(selectedIncident.date_incident).toLocaleString('fr-FR')}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Status Badge */}
                <div className="flex justify-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    selectedIncident.gravite === 'Critique' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    selectedIncident.gravite === 'Grave' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    'bg-slate-700 text-slate-300 border-slate-600'
                  }`}>
                    {selectedIncident.gravite}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    selectedIncident.statut === 'RESOLVED' || selectedIncident.statut === 'Résolu' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}>
                    {ALL_STATUS_LABELS[selectedIncident.statut] || selectedIncident.statut}
                  </span>
                </div>

                {/* SLA Info */}
                {getSlaStatus(selectedIncident) && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">SLA ({SLA_HOURS[selectedIncident.gravite]}h)</span>
                      <span className={getSlaStatus(selectedIncident)!.overdue ? 'text-red-400 font-bold' : 'text-slate-300'}>
                        {getSlaStatus(selectedIncident)!.remaining}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                       <div className={`h-full rounded-full ${getSlaStatus(selectedIncident)!.overdue ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${getSlaStatus(selectedIncident)!.pct}%` }} />
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Description</h4>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 leading-relaxed">
                    {selectedIncident.description}
                  </div>
                </div>
                
                {/* Location & Agent */}
                <div className="grid grid-cols-2 gap-2">
                   {selectedIncident.localisation && (
                     <InfoItem label="Lieu" value={selectedIncident.localisation} />
                   )}
                   {selectedIncident.agent && (
                     <InfoItem label="Signalé par" value={`${selectedIncident.agent.prenom} ${selectedIncident.agent.nom}`} />
                   )}
                </div>

                {/* Resolution Info */}
                {selectedIncident.resolution && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-green-400 font-bold text-xs uppercase mb-1">
                      <CheckCircle size={12} /> Résolution
                    </div>
                    <p className="text-sm text-slate-300">{selectedIncident.resolution}</p>
                    {selectedIncident.date_resolution && (
                      <p className="text-[10px] text-slate-500 mt-2">Le {new Date(selectedIncident.date_resolution).toLocaleString('fr-FR')}</p>
                    )}
                  </div>
                )}

                {/* Attachments */}
                 {selectedIncident.pieces_jointes && selectedIncident.pieces_jointes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">Pièces jointes</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedIncident.pieces_jointes.map((url, i) => (
                        <a key={i} href={url.startsWith('/') ? url : `/api/storage/files/${url}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1.5">
                          {/\.(jpe?g|png)$/i.test(url) ? <ImageIcon size={14} /> : <FileText size={14} />} Pièce {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions (Resolve / Escalate) */}
                {canResolveIncidents && !['RESOLVED', 'Résolu', 'CLOSED', 'Fermé'].includes(selectedIncident.statut) && (
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="space-y-2">
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Note de résolution..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button onClick={resoudreIncident} disabled={!resolutionNote.trim()} className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5">
                          <CheckCircle size={14} /> Résoudre
                        </button>
                        {selectedIncident.statut !== 'ESCALATED' && (
                          <button onClick={escaladerIncident} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5">
                            <ArrowUpCircle size={14} /> Escalader
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
    green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/20 text-orange-400',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-white truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
      <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-slate-200 truncate">{value}</div>
    </div>
  );
}
