import React, { useState, useEffect } from 'react';
import { X, UserCheck, Calendar, AlertTriangle, Loader2, Search, MapPin } from 'lucide-react';
import { api } from '../../../lib/api';
import { resolveStorageUrl } from '../../../lib/format';

interface Agent {
  id: string;
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
    setSubmitting(true);
    try {
      const success = await onAssign({ agentId: selectedAgentId, priority, dueDate: dueDate || undefined });
      if (success) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const priorityOptions = [
    { value: 'LOW', label: 'Basse', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
    { value: 'MEDIUM', label: 'Normale', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { value: 'HIGH', label: 'Haute', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { value: 'URGENT', label: 'Urgente', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Assigner l'enquête</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Demande info */}
        <div className="px-4 pt-3">
          <div className="bg-slate-800/50 rounded-lg p-2.5 text-xs text-slate-400 space-y-0.5">
            {demande.clientNom && <p>Client : <span className="text-white font-medium">{demande.clientNom}</span></p>}
            {demande.objetCredit && <p>Objet : <span className="text-slate-300">{demande.objetCredit}</span></p>}
            {demande.montantDemande && <p>Montant : <span className="text-emerald-400 font-medium">{Number(demande.montantDemande).toLocaleString()} FCFA</span></p>}
          </div>
        </div>

        {/* Agent selection */}
        <div className="p-4 space-y-3">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Agent terrain</label>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un agent..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Agent list */}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-slate-500" />
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
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
                        ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500'
                        : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-cyan-300' : 'text-white'}`}>
                        {agent.prenom} {agent.nom}
                      </p>
                      {zone && (
                        <p className="text-[10px] text-slate-500 flex items-center gap-0.5 truncate">
                          <MapPin size={8} /> {zone}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center flex-shrink-0">
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
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Priorité</label>
              <div className="flex gap-1">
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex-1 px-1.5 py-1 rounded text-[9px] font-bold uppercase border transition ${
                      priority === opt.value ? opt.color + ' ring-1 ring-current' : 'text-slate-500 bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Date limite</label>
              <div className="relative">
                <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedAgentId || submitting}
            className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            Assigner
          </button>
        </div>
      </div>
    </div>
  );
}
