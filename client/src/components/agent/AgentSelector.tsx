import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, User, ChevronDown, Check, X } from 'lucide-react';

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  telephone?: string;
  zone_affectation?: string;
  statut: string;
  photo_url?: string;
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

  // Find selected agent
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents.filter(a => a.statut === 'Actif');
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        a.statut === 'Actif' &&
        (`${a.nom} ${a.prenom}`.toLowerCase().includes(query) ||
          a.zone_affectation?.toLowerCase().includes(query) ||
          a.telephone?.includes(query))
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
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                {selectedAgent.photo_url ? (
                  <img
                    src={selectedAgent.photo_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User size={14} className="text-cyan-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {selectedAgent.nom} {selectedAgent.prenom}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {selectedAgent.zone_affectation || 'Zone non assignée'}
                </p>
              </div>
            </>
          ) : (
            <span className="text-slate-400 text-sm">{placeholder}</span>
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
          <div className="max-h-64 overflow-y-auto">
            {filteredAgents.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                Aucun agent trouvé
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleSelect(agent)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3
                    hover:bg-slate-800/50 transition-colors
                    ${agent.id === selectedAgentId ? 'bg-cyan-500/10' : ''}
                  `}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                    {agent.photo_url ? (
                      <img
                        src={agent.photo_url}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User size={18} className="text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-white truncate">
                      {agent.nom} {agent.prenom}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {agent.zone_affectation || 'Zone non assignée'}
                    </p>
                  </div>
                  {agent.id === selectedAgentId && (
                    <Check size={16} className="text-cyan-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
