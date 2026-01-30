import React, { useState } from 'react';
import { Map, FileText, GraduationCap, MessageSquare, Package, AlertTriangle, Target, BarChart3, Clock, Banknote, Phone, Users, Receipt, Star, Camera, Eye, BookOpen, TrendingUp, Trophy, Download, LayoutDashboard, UserCircle, ChevronDown, Search, X } from 'lucide-react';
import { Card } from '../ui';
import AgentCommissions from './AgentCommissions';
import AgentPlanning from './AgentPlanning';
import AgentGeolocalisation from './AgentGeolocalisation';
import AgentRapports from './AgentRapports';
import AgentObjectifs from './AgentObjectifs';
import AgentIncidents from './AgentIncidents';
import AgentCommunications from './AgentCommunications';
import AgentFormations from './AgentFormations';
import AgentMateriel from './AgentMateriel';
import AgentDashboard from './AgentDashboard';
import AgentReportsGenerator from './AgentReportsGenerator';
import AgentTeamLeaderboard from './AgentTeamLeaderboard';
import LoadingScreen from '../ui/LoadingScreen';
import { authService } from '../../lib/auth';
import { agentTerrainApi } from '../../lib/api-client';

interface AgentTerrainPortailProps {
  agentId?: string;
}

interface AgentOption {
  id: string;
  nom: string;
  prenom: string;
  zoneAffectation?: string;
}

export default function AgentTerrainPortail({ agentId }: AgentTerrainPortailProps) {
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [moduleLoading, setModuleLoading] = useState(false);

  // Shared agent selection state for admins
  const isAdmin = authService.isAdmin();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agentId || null);
  const [agentsList, setAgentsList] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  // Load agents list for admin selector
  React.useEffect(() => {
    if (isAdmin && agentsList.length === 0) {
      setLoadingAgents(true);
      agentTerrainApi.getAllList()
        .then((data: any[]) => {
          setAgentsList(data.map((a: any) => ({
            id: a.id,
            nom: a.nom || 'Inconnu',
            prenom: a.prenom || '',
            zoneAffectation: a.zone_affectation || a.zoneAffectation || '',
          })));
        })
        .catch(console.error)
        .finally(() => setLoadingAgents(false));
    }
  }, [isAdmin]);

  const selectedAgent = agentsList.find(a => a.id === selectedAgentId);
  const filteredAgents = agentsList.filter(a =>
    `${a.prenom} ${a.nom}`.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
    (a.zoneAffectation || '').toLowerCase().includes(agentSearchQuery.toLowerCase())
  );

  const handleModuleChange = (moduleName: string) => {
    setModuleLoading(true);
    setTimeout(() => {
      setActiveModule(moduleName);
      setModuleLoading(false);
    }, 500);
  };

  const modules = [
    { id: 'dashboard', name: 'Tableau de Bord', icon: LayoutDashboard, component: AgentDashboard },
    { id: 'reports', name: 'Rapports', icon: Download, component: AgentReportsGenerator },
    { id: 'leaderboard', name: 'Classement', icon: Trophy, component: AgentTeamLeaderboard },
    { id: 'commissions', name: 'Commissions', icon: BarChart3, component: AgentCommissions },
    { id: 'planning', name: 'Planning', icon: FileText, component: AgentPlanning },
    { id: 'gps', name: 'Géolocalisation', icon: Map, component: AgentGeolocalisation },
    { id: 'rapports', name: 'Stats', icon: TrendingUp, component: AgentRapports },
    { id: 'formations', name: 'Formations', icon: GraduationCap, component: AgentFormations },
    { id: 'communications', name: 'Messages', icon: MessageSquare, component: AgentCommunications },
    { id: 'materiel', name: 'Matériel', icon: Package, component: AgentMateriel },
    { id: 'incidents', name: 'Incidents', icon: AlertTriangle, component: AgentIncidents },
    { id: 'objectifs', name: 'Objectifs', icon: Target, component: AgentObjectifs },
  ];

  const ActiveComponent = modules.find(m => m.id === activeModule)?.component;

  return (
    <div className="space-y-4">
      {/* Module Grid using Card for container */}
      <Card padding="sm" className="bg-slate-800/80">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = activeModule === module.id;
            return (
              <button
                key={module.id}
                onClick={() => handleModuleChange(module.id)}
                className={`
                  relative flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 border
                  ${isActive
                    ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-900/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:border-slate-600 hover:text-white'
                  }
                `}
              >
                <div className={`
                    p-2 rounded-lg shrink-0 transition-colors
                    ${isActive ? 'bg-white/20' : 'bg-slate-900/50 border border-slate-700/50'}
                `}>
                    <Icon size={18} />
                </div>
                <span className="text-xs sm:text-sm font-semibold leading-tight">{module.name}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Admin Agent Selector Bar */}
      {isAdmin && (
        <Card padding="sm" className="bg-slate-900/50 border-cyan-500/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <UserCircle size={16} className="text-cyan-400" />
              <span className="font-medium">Agent sélectionné :</span>
            </div>

            <div className="relative flex-1 max-w-xs">
              <button
                onClick={() => setShowAgentSelector(!showAgentSelector)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white hover:border-cyan-500/50 transition"
              >
                {selectedAgent ? (
                  <span className="truncate">{selectedAgent.prenom} {selectedAgent.nom}</span>
                ) : (
                  <span className="text-slate-500">Sélectionner un agent...</span>
                )}
                <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${showAgentSelector ? 'rotate-180' : ''}`} />
              </button>

              {showAgentSelector && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowAgentSelector(false);
                      setAgentSearchQuery('');
                    }}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-slate-700">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                          type="text"
                          placeholder="Rechercher..."
                          value={agentSearchQuery}
                          onChange={(e) => setAgentSearchQuery(e.target.value)}
                          autoFocus
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {loadingAgents ? (
                        <div className="p-4 text-center text-slate-500 text-sm">Chargement...</div>
                      ) : filteredAgents.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-sm">Aucun agent trouvé</div>
                      ) : (
                        filteredAgents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setSelectedAgentId(agent.id);
                              setShowAgentSelector(false);
                              setAgentSearchQuery('');
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 transition ${
                              selectedAgentId === agent.id ? 'bg-cyan-500/10 text-cyan-400' : 'text-white'
                            }`}
                          >
                            <UserCircle size={16} />
                            <div className="flex-1 min-w-0">
                              <span className="truncate block">{agent.prenom} {agent.nom}</span>
                              {agent.zoneAffectation && (
                                <span className="text-[10px] text-slate-500 truncate block">{agent.zoneAffectation}</span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {selectedAgentId && (
              <button
                onClick={() => setSelectedAgentId(null)}
                className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Désélectionner"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Active Module Content */}
      <div className="animate-in fade-in duration-300">
        {moduleLoading ? (
          <div className="flex items-center justify-center py-20">
             <LoadingScreen message="Chargement..." fullScreen={false} />
          </div>
        ) : ActiveComponent ? (
          <ActiveComponent
            agentId={isAdmin ? selectedAgentId || undefined : agentId}
            selectedAgentId={selectedAgentId}
            onAgentChange={setSelectedAgentId}
          />
        ) : (
          <Card className="p-12 text-center text-slate-400">
            <p>Module non disponible</p>
          </Card>
        )}
      </div>
    </div>
  );
}
