import React, { useState, useEffect } from 'react';
import { X, UserCheck, Calendar, AlertTriangle, Loader2, Search, MapPin } from 'lucide-react';
import { api } from '../../../lib/api';
import { resolveStorageUrl } from '../../../lib/format';

interface Agent {
  id: string;
  userId?: string;
  nom: string;
  prenom: string;
  telephone?: string;
  zoneAffectation?: string;
  zone_affectation?: string;
  photoUrl?: string;
  statut: string;
}

interface EnqueteAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  demande: {
    id: string;
    clientNom?: string;
    montantDemande?: string | number;
    objetCredit?: string;
  };
  onAssign: (data: { agentId: string; priority: string; dueDate?: string }) => Promise<boolean>;
}

export default function EnqueteAssignModal({ isOpen, onClose, demande, onAssign }: EnqueteAssignModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedAgentId('');
    setPriority('MEDIUM');
    setDueDate('');
    setSearch('');

    const fetchAgents = async () => {
      setLoading(true);
      try {
        const res = await api.get<any>('/agents-terrain?per_page=100');
        const list = res.data?.data || res.data || [];
        setAgents(list.filter((a: Agent) => a.statut === 'ACTIVE'));
      } catch {
        setAgents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [isOpen]);

  const filteredAgents = agents.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    const zone = a.zoneAffectation || a.zone_affectation || '';
    return `${a.nom} ${a.prenom}`.toLowerCase().includes(q) || zone.toLowerCase().includes(q);
  });

  const handleSubmit = async () => {
    if (!selectedAgentId) return;
    // Resolve the userId for the selected agent (FK targets users.id, not agents_terrain.id)
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    const agentUserId = selectedAgent?.userId || selectedAgentId;
    setSubmitting(true);
    try {
      const success = await onAssign({ agentId: agentUserId, priority, dueDate: dueDate || undefined });
      if (success) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const priorityOptions = [
    { value: 'LOW', label: 'Basse', color: 'text-content-muted bg-surface-subtle/30 border-edge-strong/20' },
    { value: 'MEDIUM', label: 'Normale', color: 'text-status-info bg-status-info-bg border-status-info/20' },
    { value: 'HIGH', label: 'Haute', color: 'text-status-warning bg-status-warning-bg border-status-warning/20' },
    { value: 'URGENT', label: 'Urgente', color: 'text-status-danger bg-status-danger-bg border-status-danger/20' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-base border border-edge rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-accent" />
            <h3 className="text-sm font-bold text-content-primary">Assigner l'enquête</h3>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary transition">
            <X size={18} />
          </button>
        </div>

        {/* Demande info */}
        <div className="px-4 pt-3">
          <div className="bg-surface/50 rounded-lg p-2.5 text-xs text-content-muted space-y-0.5">
            {demande.clientNom && <p>Client : <span className="text-content-primary font-medium">{demande.clientNom}</span></p>}
            {demande.objetCredit && <p>Objet : <span className="text-content-secondary">{demande.objetCredit}</span></p>}
            {demande.montantDemande && <p>Montant : <span className="text-status-success font-medium">{Number(demande.montantDemande).toLocaleString()} FCFA</span></p>}
          </div>
        </div>

        {/* Agent selection */}
        <div className="p-4 space-y-3">
          <label className="text-[10px] font-bold text-content-muted uppercase">Agent terrain</label>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un agent..."
              className="w-full bg-surface border border-edge rounded-lg pl-9 pr-3 py-2 text-xs text-content-primary placeholder-content-muted focus:border-accent outline-none"
            />
          </div>

          {/* Agent list */}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-edge divide-y divide-edge">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-content-muted" />
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-4 text-xs text-content-muted">
                {search ? 'Aucun agent trouvé' : 'Aucun agent terrain disponible'}
              </div>
            ) : (
              filteredAgents.map(agent => {
                const zone = agent.zoneAffectation || agent.zone_affectation;
                const isSelected = selectedAgentId === agent.id;
                const photoUrl = resolveStorageUrl(agent.photoUrl);
                const initials = `${(agent.nom?.[0] || '')}${(agent.prenom?.[0] || '')}`.toUpperCase();

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition ${
                      isSelected
                        ? 'bg-accent/10 border-l-2 border-l-accent'
                        : 'hover:bg-surface/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center text-[10px] font-bold text-content-muted flex-shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-accent' : 'text-content-primary'}`}>
                        {agent.prenom} {agent.nom}
                      </p>
                      {zone && (
                        <p className="text-[10px] text-content-muted flex items-center gap-0.5 truncate">
                          <MapPin size={8} /> {zone}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-accent-secondary flex items-center justify-center flex-shrink-0">
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-content-muted uppercase mb-1 block">Priorité</label>
              <div className="flex gap-1">
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex-1 px-1.5 py-1 rounded text-[9px] font-bold uppercase border transition ${
                      priority === opt.value ? opt.color + ' ring-1 ring-current' : 'text-content-muted bg-surface border-edge hover:border-edge-strong'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-content-muted uppercase mb-1 block">Date limite</label>
              <div className="relative">
                <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-surface border border-edge rounded-lg pl-8 pr-2 py-1.5 text-xs text-content-primary focus:border-accent outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} className="flex-1 py-2 bg-surface hover:bg-surface-elevated text-content-primary text-xs font-medium rounded-lg transition">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedAgentId || submitting}
            className="flex-1 py-2 bg-accent-secondary hover:bg-accent-secondary disabled:bg-surface disabled:text-content-muted text-content-primary text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            Assigner
          </button>
        </div>
      </div>
    </div>
  );
}
