import React, { useState, useEffect } from 'react';
import { Menu, X, Clock } from 'lucide-react';
import IconButton from '../ui/IconButton';

interface AgentHeaderProps {
  agent: {
    nom_complet: string;
    code_agent: string;
  } | null;
  onMenuToggle: () => void;
  isMobile: boolean;
  sidebarOpen: boolean;
}

export default function AgentHeader({
  agent,
  onMenuToggle,
  isMobile,
  sidebarOpen
}: AgentHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <IconButton
            onClick={onMenuToggle}
            icon={sidebarOpen ? X : Menu}
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-white">Interface Agent de Caisse</h1>
          <p className="text-sm text-slate-400">
            {agent?.nom_complet || 'Agent'} • {agent?.code_agent || ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg">
          <Clock size={16} className="text-slate-400" />
          <span className="text-sm text-slate-300">
            {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
