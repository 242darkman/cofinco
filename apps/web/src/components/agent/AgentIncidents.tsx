import React, { useState, useEffect, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { AlertTriangle, Plus, CheckCircle, Clock, X, Upload, ArrowUpCircle, FileText, Image as ImageIcon, ChevronLeft, ChevronRight, Eye, Shield, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '../auth/ProtectedFeature';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { toast } from '@/lib/toast';
import { agentKeys } from '@/lib/query-keys';
import { authService } from '@/lib/auth';

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

  const queryClient = useQueryClient();
  const currentUser = authService.getCurrentUser();

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

  // Sync formData.agent_id when agentId prop changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, agent_id: agentId || '' }));
  }, [agentId]);

  // Action fields in Sheet
  const [resolutionNote, setResolutionNote] = useState('');

  // ── React Query: load incidents ──────────────────────────────────
  const { data: incidents = [], isLoading: loading } = useQuery<Incident[]>({
    queryKey: agentKeys.incidents(agentId),
    queryFn: async () => {
      let url = '/api/agent-incidents';
      if (agentId) url += `?agentId=${agentId}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // ── Real-time listener: toast notifications on incident changes ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.entity !== 'incident') return;

      // Don't self-notify
      if (detail?.userId === currentUser?.id) return;

      switch (detail.action) {
        case 'created':
          if (detail.gravite === 'Critique' || detail.gravite === 'Grave') {
            toast.warning('Nouvel incident critique signalé');
          } else {
            toast.info('Nouvel incident signalé');
          }
          break;
        case 'escalated':
          toast.warning('Un incident a été escaladé');
          break;
        case 'resolved':
          toast.success('Un incident a été résolu');
          break;
      }
    };

    window.addEventListener('agent-modules-update', handler);
    return () => window.removeEventListener('agent-modules-update', handler);
  }, [currentUser?.id]);

  // ── Mutations ────────────────────────────────────────────────────
  const uploadFiles = async (incidentId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileType', file.type.startsWith('image/') ? 'profile' : 'misc');
      fd.append('entityType', 'incident');
      fd.append('entityId', incidentId);

      const response = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        urls.push(data.url || data.key);
      }
    }
    return urls;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
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

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.incidents(agentId) });
      toast.success('Incident signalé');
      setShowForm(false);
      setPendingFiles([]);
      setFormData({
        agent_id: agentId || '',
        type_incident: 'Sécurité',
        gravite: 'Moyenne',
        description: '',
        localisation: '',
        date_incident: new Date().toISOString().slice(0, 16)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (incidentId: string) => {
      const response = await fetch(`/api/agent-incidents/${incidentId}`, {
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
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.incidents(agentId) });
      toast.success('Incident résolu');
      setSelectedIncident(null);
      setResolutionNote('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (incidentId: string) => {
      const response = await fetch(`/api/agent-incidents/${incidentId}/escalate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Erreur lors de l'escalade");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.incidents(agentId) });
      toast.warning('Incident escaladé');
      setSelectedIncident(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const resoudreIncident = () => {
    if (!selectedIncident || !resolutionNote) return;
    resolveMutation.mutate(selectedIncident.id);
  };

  const escaladerIncident = () => {
    if (!selectedIncident) return;
    escalateMutation.mutate(selectedIncident.id);
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

  const isMutating = createMutation.isPending || resolveMutation.isPending || escalateMutation.isPending;

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
          className="px-3 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Annuler' : 'Signaler un Incident'}
        </button>
      )}

      {/* Form Compact */}
      {showForm && (
        <div className="bg-surface-base/50 rounded-xl p-4 border border-edge">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <FormField label="Type">
                <select value={formData.type_incident} onChange={(e) => setFormData({ ...formData, type_incident: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value="Sécurité">Sécurité</option><option value="Client difficile">Client difficile</option><option value="Retard">Retard</option><option value="Matériel">Matériel</option><option value="Accident">Accident</option><option value="Fraude">Fraude</option><option value="Autre">Autre</option>
                </select>
              </FormField>
              <FormField label="Gravité">
                <select value={formData.gravite} onChange={(e) => setFormData({ ...formData, gravite: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value="Mineure">Mineure</option><option value="Moyenne">Moyenne</option><option value="Grave">Grave</option><option value="Critique">Critique</option>
                </select>
              </FormField>
              <FormField label="Date">
                <input type="datetime-local" value={formData.date_incident} onChange={(e) => setFormData({ ...formData, date_incident: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" />
              </FormField>
              <FormField label="Lieu">
                <input type="text" value={formData.localisation} onChange={(e) => setFormData({ ...formData, localisation: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" placeholder="Lieu..." />
              </FormField>
            </div>

            <FormField label="Description">
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" rows={2} required />
            </FormField>

            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => { if (e.target.files) setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-surface border border-dashed border-edge-strong rounded-lg text-content-muted hover:border-status-info hover:text-status-info flex items-center gap-1.5 text-xs transition">
                <Upload size={14} /> Pièces jointes
              </button>
              {pendingFiles.length > 0 && <span className="text-xs text-content-muted">{pendingFiles.length} fichier(s)</span>}
              <div className="flex-1" />
              <button type="submit" disabled={createMutation.isPending || uploadingFiles} className="px-4 py-1.5 bg-status-danger hover:bg-status-danger/90 text-white rounded-lg font-bold text-xs">
                {uploadingFiles ? '...' : 'Signaler'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Incidents List */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between bg-surface-base/30">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <AlertTriangle size={16} className="text-status-warning" />
            Incidents Signalés
          </h3>
          <span className="text-[10px] text-content-muted font-medium">{incidents.length} incidents</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="sm" /></div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <CheckCircle size={32} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-muted">Aucun incident signalé</p>
          </div>
        ) : (
          <div className="divide-y divide-edge/50">
            {paginatedIncidents.map((incident) => {
              const sla = getSlaStatus(incident);
              return (
                <div
                  key={incident.id}
                  onClick={() => { setSelectedIncident(incident); setResolutionNote(''); }}
                  className="p-3 hover:bg-surface-elevated/30 transition cursor-pointer group flex items-start gap-3"
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-1 ${
                    incident.gravite === 'Critique' ? 'bg-status-danger-bg text-status-danger' :
                    incident.gravite === 'Grave' ? 'bg-status-warning-bg text-status-warning' :
                    'bg-surface-elevated text-content-muted'
                  }`}>
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-sm font-bold text-content-primary truncate">{incident.type_incident}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        incident.statut === 'RESOLVED' || incident.statut === 'Résolu' ? 'bg-status-success-bg text-status-success' :
                        incident.statut === 'ESCALATED' ? 'bg-status-warning-bg text-status-warning' :
                        'bg-status-info-bg text-status-info'
                      }`}>
                        {ALL_STATUS_LABELS[incident.statut] || incident.statut}
                      </span>
                    </div>
                    <p className="text-xs text-content-muted line-clamp-1 mb-1">{incident.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-content-muted">
                      <span>{new Date(incident.date_incident).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {incident.localisation && <><span>•</span><span>{incident.localisation}</span></>}
                      {sla && (
                        <>
                          <span>•</span>
                          <span className={sla.overdue ? 'text-status-danger font-bold' : 'text-content-muted'}>
                            SLA: {sla.remaining}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Eye size={14} className="text-content-muted group-hover:text-accent shrink-0 mt-2" />
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
      <Sheet open={!!selectedIncident} onOpenChange={(open) => !open && setSelectedIncident(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedIncident && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary flex items-center gap-2">
                  <AlertTriangle size={16} className={
                    selectedIncident.gravite === 'Critique' ? 'text-status-danger' :
                    selectedIncident.gravite === 'Grave' ? 'text-status-warning' : 'text-status-info'
                  } />
                  {selectedIncident.type_incident}
                </SheetTitle>
                <SheetDescription className="text-content-muted">
                  {new Date(selectedIncident.date_incident).toLocaleString('fr-FR')}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Status Badge */}
                <div className="flex justify-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    selectedIncident.gravite === 'Critique' ? 'bg-status-danger/20 text-status-danger border-status-danger/30' :
                    selectedIncident.gravite === 'Grave' ? 'bg-status-warning-bg text-status-warning border-status-warning/30' :
                    'bg-surface-elevated text-content-secondary border-edge-strong'
                  }`}>
                    {selectedIncident.gravite}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    selectedIncident.statut === 'RESOLVED' || selectedIncident.statut === 'Résolu' ? 'bg-status-success-bg text-status-success border-status-success/30' :
                    'bg-status-info-bg text-status-info border-status-info/30'
                  }`}>
                    {ALL_STATUS_LABELS[selectedIncident.statut] || selectedIncident.statut}
                  </span>
                </div>

                {/* SLA Info */}
                {getSlaStatus(selectedIncident) && (
                  <div className="p-3 bg-surface-base border border-edge rounded-lg">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-content-muted">SLA ({SLA_HOURS[selectedIncident.gravite]}h)</span>
                      <span className={getSlaStatus(selectedIncident)!.overdue ? 'text-status-danger font-bold' : 'text-content-secondary'}>
                        {getSlaStatus(selectedIncident)!.remaining}
                      </span>
                    </div>
                    <div className="w-full bg-surface-elevated rounded-full h-1.5">
                       <div className={`h-full rounded-full ${getSlaStatus(selectedIncident)!.overdue ? 'bg-status-danger' : 'bg-status-info'}`} style={{ width: `${getSlaStatus(selectedIncident)!.pct}%` }} />
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-content-muted uppercase">Description</h4>
                  <div className="p-3 bg-surface-base border border-edge rounded-lg text-sm text-content-secondary leading-relaxed">
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
                  <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-status-success font-bold text-xs uppercase mb-1">
                      <CheckCircle size={12} /> Résolution
                    </div>
                    <p className="text-sm text-content-secondary">{selectedIncident.resolution}</p>
                    {selectedIncident.date_resolution && (
                      <p className="text-[10px] text-content-muted mt-2">Le {new Date(selectedIncident.date_resolution).toLocaleString('fr-FR')}</p>
                    )}
                  </div>
                )}

                {/* Attachments */}
                 {selectedIncident.pieces_jointes && selectedIncident.pieces_jointes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-content-muted uppercase">Pièces jointes</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedIncident.pieces_jointes.map((url, i) => (
                        <a key={i} href={url.startsWith('/') ? url : `/api/storage/files/${url}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-surface border border-edge rounded-lg text-status-info hover:text-status-info text-xs flex items-center gap-1.5">
                          {/\.(jpe?g|png)$/i.test(url) ? <ImageIcon size={14} /> : <FileText size={14} />} Pièce {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions (Resolve / Escalate) */}
                {canResolveIncidents && !['RESOLVED', 'Résolu', 'CLOSED', 'Fermé'].includes(selectedIncident.statut) && (
                  <div className="pt-4 border-t border-edge space-y-3">
                    <div className="space-y-2">
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Note de résolution..."
                        className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary text-sm placeholder-content-muted"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button onClick={resoudreIncident} disabled={!resolutionNote.trim() || resolveMutation.isPending} className="flex-1 py-2 bg-status-success hover:bg-status-success/90 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5">
                          <CheckCircle size={14} /> Résoudre
                        </button>
                        {selectedIncident.statut !== 'ESCALATED' && (
                          <button onClick={escaladerIncident} disabled={escalateMutation.isPending} className="px-4 py-2 bg-status-warning hover:bg-status-warning/90 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1.5">
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
    blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
    green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    orange: 'from-status-warning/20 to-status-warning/5 border-status-warning/20 text-status-warning',
    emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
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

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-content-secondary truncate">{value}</div>
    </div>
  );
}
