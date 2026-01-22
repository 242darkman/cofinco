import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, User, ChevronDown, Check, X, MapPin, Phone } from 'lucide-react';
import { StatutUser } from '@shared/enum/status-constants';
import { resolveStorageUrl } from '../../lib/format';

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  telephone?: string;
  zone_affectation?: string;
  zoneAffectation?: string; // Alias camelCase
  statut: string;
  photoUrl?: string; // Alias camelCase
}

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function AgentSelector({
  agents,
  selectedAgentId,
  onSelect,
  placeholder = "Sélectionner un agent...",
  disabled = false,
}: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to get zone (handle both camelCase and snake_case)
  const getZone = (agent: Agent) => agent.zone_affectation || agent.zoneAffectation || null;

  // Get initials for avatar fallback
  const getInitials = (agent: Agent) => {
    const firstInitial = agent.nom?.charAt(0) || '';
    const secondInitial = agent.prenom?.charAt(0) || '';
    return (firstInitial + secondInitial).toUpperCase();
  };

  // Resolve photo URL for storage
  const getPhotoUrl = (agent: Agent) => {
    return resolveStorageUrl(agent.photoUrl);
  };

  // Find selected agent
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    const activeAgents = agents.filter(a => a.statut === StatutUser.ACTIVE);
    if (!searchQuery.trim()) return activeAgents;
    const query = searchQuery.toLowerCase();
    return activeAgents.filter(
      (a) =>
        `${a.nom} ${a.prenom}`.toLowerCase().includes(query) ||
        `${a.prenom} ${a.nom}`.toLowerCase().includes(query) ||
        getZone(a)?.toLowerCase().includes(query) ||
        a.telephone?.includes(query)
    );
  }, [agents, searchQuery]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (agent: Agent) => {
    onSelect(agent.id);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-4 py-3
          bg-slate-800/50 border border-slate-700 rounded-xl
          text-left text-white
          hover:bg-slate-700/50 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isOpen ? 'ring-2 ring-cyan-500/50 border-cyan-500/50' : ''}
        `}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedAgent ? (
            <>
              {/* Avatar avec photo ou initiales */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border-2 border-cyan-500/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {getPhotoUrl(selectedAgent) ? (
                  <img
                    src={getPhotoUrl(selectedAgent)}
                    alt={`${selectedAgent.nom} ${selectedAgent.prenom}`}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-cyan-400">{getInitials(selectedAgent)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {selectedAgent.prenom} {selectedAgent.nom}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <MapPin size={10} className="text-cyan-500/70 flex-shrink-0" />
                  <span className="truncate">{getZone(selectedAgent) || 'Zone non assignée'}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-slate-700/50 border border-slate-600 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-slate-500" />
              </div>
              <span className="text-slate-400 text-sm">{placeholder}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedAgent && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded hover:bg-slate-600/50 transition-colors"
            >
              <X size={14} className="text-slate-400" />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-700/50">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un agent..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          {/* Agent List */}
          <div className="max-h-72 overflow-y-auto">
            {filteredAgents.length === 0 ? (
              <div className="p-6 text-center">
                <User size={32} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm text-slate-500">Aucun agent trouvé</p>
                <p className="text-xs text-slate-600 mt-1">Essayez un autre terme de recherche</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-semibold bg-slate-800/30">
                  {filteredAgents.length} agent{filteredAgents.length > 1 ? 's' : ''} disponible{filteredAgents.length > 1 ? 's' : ''}
                </div>
                {filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleSelect(agent)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3
                      hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 last:border-b-0
                      ${agent.id === selectedAgentId ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500' : ''}
                    `}
                  >
                    {/* Avatar avec photo ou initiales */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border-2 border-cyan-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {getPhotoUrl(agent) ? (
                        <img
                          src={getPhotoUrl(agent)}
                          alt={`${agent.nom} ${agent.prenom}`}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-bold text-cyan-400">{getInitials(agent)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      {/* Nom complet */}
                      <p className="text-sm font-semibold text-white truncate">
                        {agent.prenom} {agent.nom}
                      </p>
                      {/* Zone d'affectation */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin size={11} className="text-cyan-500/70 flex-shrink-0" />
                        <span className="text-xs text-slate-400 truncate">
                          {getZone(agent) || 'Zone non assignée'}
                        </span>
                      </div>
                      {/* Téléphone si disponible */}
                      {agent.telephone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Phone size={10} className="text-slate-500 flex-shrink-0" />
                          <span className="text-[10px] text-slate-500">{agent.telephone}</span>
                        </div>
                      )}
                    </div>
                    {agent.id === selectedAgentId && (
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Check size={14} className="text-cyan-400" />
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
