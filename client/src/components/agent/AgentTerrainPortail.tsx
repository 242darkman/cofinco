import React, { useState, useRef } from 'react';
import { Map, FileText, GraduationCap, Package, AlertTriangle, Target, BarChart3, TrendingUp, Trophy, Download, LayoutDashboard, UserCircle, ChevronDown, Search, X, UserPlus, Eye, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../ui';
import AgentCommissions from './AgentCommissions';
import AgentPlanning from './AgentPlanning';
import AgentGeolocalisation from './AgentGeolocalisation';
import AgentRapports from './AgentRapports';
import AgentObjectifs from './AgentObjectifs';
import AgentIncidents from './AgentIncidents';
import AgentFormations from './AgentFormations';
import AgentMateriel from './AgentMateriel';
import AgentDashboard from './AgentDashboard';
import AgentReportsGenerator from './AgentReportsGenerator';
import AgentTeamLeaderboard from './AgentTeamLeaderboard';
import ProspectionList from './ProspectionList';
import ProspectionSupervisionPanel from './ProspectionSupervisionPanel';
import LoadingScreen from '../ui/LoadingScreen';
import { authService } from '../../lib/auth';
import { agentTerrainApi } from '../../lib/api-client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';

interface AgentOption {
  id: string;
  nom: string;
  prenom: string;
  zoneAffectation?: string;
}

export default function AgentTerrainPortail({ agentId }: { agentId?: string }) {
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  const [moduleLoading, setModuleLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Admin / Supervisor shared state
  const isAdminOrSupervisor = authService.isAdmin() || authService.hasRole?.('superviseur') || authService.hasRole?.('chef_agence');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agentId || null);
  const [agentsList, setAgentsList] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  React.useEffect(() => {
    if (isAdminOrSupervisor && agentsList.length === 0) {
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
  }, [isAdminOrSupervisor]);

  const selectedAgent = agentsList.find(a => a.id === selectedAgentId);
  const filteredAgents = agentsList.filter(a =>
    `${a.prenom} ${a.nom}`.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
    (a.zoneAffectation || '').toLowerCase().includes(agentSearchQuery.toLowerCase())
  );

  const handleModuleChange = (moduleName: string) => {
    setModuleLoading(true);
    setMobileMenuOpen(false);
    setTimeout(() => {
      setActiveModule(moduleName);
      setModuleLoading(false);
    }, 300);
  };

  const modules = [
    { id: 'dashboard', name: 'Tableau de Bord', icon: LayoutDashboard, component: AgentDashboard },
    { id: 'reports', name: 'Rapports', icon: Download, component: AgentReportsGenerator },
    { id: 'leaderboard', name: 'Classement', icon: Trophy, component: AgentTeamLeaderboard },
    { id: 'prospections', name: 'Prospections', icon: UserPlus, component: ProspectionList },
    { id: 'commissions', name: 'Commissions', icon: BarChart3, component: AgentCommissions },
    { id: 'planning', name: 'Planning', icon: FileText, component: AgentPlanning },
    { id: 'gps', name: 'Géolocalisation', icon: Map, component: AgentGeolocalisation },
    { id: 'rapports', name: 'Stats', icon: TrendingUp, component: AgentRapports },
    { id: 'formations', name: 'Formations', icon: GraduationCap, component: AgentFormations },
    { id: 'materiel', name: 'Matériel', icon: Package, component: AgentMateriel },
    { id: 'incidents', name: 'Incidents', icon: AlertTriangle, component: AgentIncidents },
    { id: 'objectifs', name: 'Objectifs', icon: Target, component: AgentObjectifs },
    { id: 'supervision-prospection', name: 'Supervision', icon: Eye, component: ProspectionSupervisionPanel },
  ];

  const ActiveComponent = modules.find(m => m.id === activeModule)?.component;
  const activeModuleName = modules.find(m => m.id === activeModule)?.name;
  const ActiveIcon = modules.find(m => m.id === activeModule)?.icon || LayoutDashboard;

  return (
    <div className="space-y-4">
      {/* Navbar Compact */}
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-2 sticky top-0 z-20 flex items-center justify-between gap-3 shadow-lg shadow-black/20">
        
        {/* Mobile Menu Trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <button className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg">
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] bg-slate-900 border-r-slate-800 p-0">
            <SheetHeader className="p-4 border-b border-slate-800 text-left">
              <SheetTitle className="text-white flex items-center gap-2">
                <LayoutDashboard className="text-cyan-400" size={20} />
                Menu Agent
              </SheetTitle>
            </SheetHeader>
            <div className="p-2 overflow-y-auto max-h-[calc(100vh-64px)]">
               {modules.map((module) => {
                 const Icon = module.icon;
                 const isActive = activeModule === module.id;
                 return (
                   <button
                     key={module.id}
                     onClick={() => handleModuleChange(module.id)}
                     className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all mb-1 ${
                       isActive ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                     }`}
                   >
                     <Icon size={18} />
                     <span className="text-sm font-medium">{module.name}</span>
                   </button>
                 );
               })}
            </div>
          </SheetContent>
        </Sheet>

        {/* Current Module Title (Mobile) */}
        <div className="flex items-center gap-2 md:hidden">
           <ActiveIcon size={18} className="text-cyan-400" />
           <span className="text-sm font-bold text-white">{activeModuleName}</span>
        </div>

        {/* Desktop Horizontal Scroll Menu */}
        <div className="hidden md:flex flex-1 items-center gap-1 min-w-0">
          <button 
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0"
          >
            <ChevronLeft size={16} />
          </button>
          
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-x-auto gap-1 no-scrollbar flex items-center scroll-smooth"
          >
            {modules.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleChange(module.id)}
                  title={module.name}
                  className={`
                    relative flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all border shrink-0
                    ${isActive
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-md shadow-cyan-900/20'
                      : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-700/50 hover:text-white'
                    }
                  `}
                >
                  <Icon size={16} />
                  <span className="text-xs font-semibold">{module.name}</span>
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Admin/Supervisor Agent Selector */}
        {isAdminOrSupervisor && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowAgentSelector(!showAgentSelector)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition ${
                selectedAgent 
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white'
              }`}
            >
              <UserCircle size={16} />
              <span className="hidden sm:inline max-w-[100px] truncate">
                {selectedAgent ? `${selectedAgent.prenom} ${selectedAgent.nom}` : 'Sélectionner...'}
              </span>
              <ChevronDown size={14} />
            </button>

            {showAgentSelector && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowAgentSelector(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden ring-1 ring-black/50">
                  <div className="p-2 border-b border-slate-700 bg-slate-900 sticky top-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Rechercher un agent..."
                        value={agentSearchQuery}
                        onChange={(e) => setAgentSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {loadingAgents ? (
                      <div className="p-4 text-center text-slate-500 text-xs">Chargement...</div>
                    ) : filteredAgents.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs">Aucun agent trouvé</div>
                    ) : (
                      filteredAgents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => { setSelectedAgentId(agent.id); setShowAgentSelector(false); setAgentSearchQuery(''); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition group ${
                            selectedAgentId === agent.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <div className={`p-1.5 rounded-full ${selectedAgentId === agent.id ? 'bg-cyan-500/20' : 'bg-slate-700 group-hover:bg-slate-600'}`}>
                             <UserCircle size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="truncate block text-xs font-bold">{agent.prenom} {agent.nom}</span>
                            {agent.zoneAffectation && <span className="text-[10px] text-slate-500 truncate block">{agent.zoneAffectation}</span>}
                          </div>
                          {selectedAgentId === agent.id && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedAgentId && (
                     <div className="p-2 border-t border-slate-700 bg-slate-900/50">
                        <button 
                          onClick={() => { setSelectedAgentId(null); setShowAgentSelector(false); }}
                          className="w-full py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center justify-center gap-1"
                        >
                           <X size={12} /> Désélectionner
                        </button>
                     </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Module Content */}
      <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
        {moduleLoading ? (
          <div className="flex items-center justify-center py-32">
             <LoadingScreen message="Chargement du module..." fullScreen={false} />
          </div>
        ) : ActiveComponent ? (
          <ActiveComponent
            agentId={isAdminOrSupervisor ? selectedAgentId || undefined : agentId}
            selectedAgentId={selectedAgentId}
            onAgentChange={setSelectedAgentId}
          />
        ) : (
          <Card className="p-12 text-center text-slate-400 border-dashed">
            <p>Module non disponible</p>
          </Card>
        )}
      </div>
    </div>
  );
}
