import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Map, FileText, GraduationCap, Package, AlertTriangle, Target, BarChart3, TrendingUp, Trophy, Download, LayoutDashboard, UserCircle, ChevronDown, Search, X, UserPlus, Eye, Menu, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
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
import AgentSessionManager from './sessions/AgentSessionManager';
import LoadingScreen from '../ui/LoadingScreen';
import { authService } from '../../lib/auth';
import { agentTerrainApi } from '../../lib/api-client';
import { useProspectionBadge } from '../../hooks/useProspectionBadge';
import { useUserProfile } from '../../hooks/useUserProfile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';

interface AgentOption {
  id: string;
  nom: string;
  prenom: string;
  zoneAffectation?: string;
}

interface AgentTerrainPortailProps {
  agentId?: string;
  activeView?: string;
  onModuleChange?: (module: string, subModule?: string) => void;
}

export default function AgentTerrainPortail({ agentId, activeView, onModuleChange }: AgentTerrainPortailProps) {
  const [activeModule, setActiveModule] = useState<string>(activeView || 'dashboard');
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

  // Prospection badge counts - only show badge for new (REGISTERED) prospects
  const { newCount: prospectionCount } = useProspectionBadge();
  const { user } = useUserProfile();

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

  // Sync URL → internal state
  useEffect(() => {
    if (activeView && activeView !== activeModule) {
      setActiveModule(activeView);
    }
  }, [activeView]);

  const handleModuleChange = (moduleName: string) => {
    setModuleLoading(true);
    setMobileMenuOpen(false);
    setTimeout(() => {
      setActiveModule(moduleName);
      setModuleLoading(false);
      // Sync to URL: 'dashboard' = no sub-module
      onModuleChange?.('agentModules', moduleName === 'dashboard' ? undefined : moduleName);
    }, 300);
  };

  // Wrapper component for unified GL + Offline session management
  const SessionManagerWrapper = useCallback(({ agentId: propAgentId }: any) => {
    const effectiveAgentId = isAdminOrSupervisor ? propAgentId : user?.id;
    const agencyId = user?.agenceId || '';
    if (!effectiveAgentId) {
      if (isAdminOrSupervisor) {
        return (
          <div className="flex flex-col items-center justify-center py-20 text-content-muted gap-3">
            <UserCircle size={48} className="opacity-30" />
            <p className="text-sm font-medium">Veuillez sélectionner un agent pour afficher sa session</p>
          </div>
        );
      }
      return <div className="text-center py-12 text-content-muted">Chargement du profil...</div>;
    }
    return (
      <AgentSessionManager
        agentId={effectiveAgentId}
        agenceId={agencyId}
        mode={isAdminOrSupervisor ? 'supervisor' : 'agent'}
      />
    );
  }, [user, isAdminOrSupervisor]);

  const modules = [
    { id: 'dashboard', name: 'Tableau de Bord', icon: LayoutDashboard, component: AgentDashboard },
    { id: 'session', name: 'Session', icon: Activity, component: SessionManagerWrapper },
    { id: 'reports', name: 'Rapports', icon: Download, component: AgentReportsGenerator },
    { id: 'leaderboard', name: 'Classement', icon: Trophy, component: AgentTeamLeaderboard },
    { id: 'prospections', name: 'Prospections', icon: UserPlus, component: ProspectionList, badge: prospectionCount },
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
      <div className="bg-surface/80 backdrop-blur border border-edge rounded-xl p-2 sticky top-0 z-20 flex items-center justify-between gap-3 shadow-lg shadow-black/20">
        
        {/* Mobile Menu Trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <button className="md:hidden p-2 text-content-muted hover:text-content-primary hover:bg-surface-elevated/50 rounded-lg">
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] bg-surface-base border-r-edge p-0">
            <SheetHeader className="p-4 border-b border-edge text-left">
              <SheetTitle className="text-content-primary flex items-center gap-2">
                <LayoutDashboard className="text-accent" size={20} />
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
                       isActive ? 'bg-accent-secondary/20 text-accent border border-accent/30' : 'text-content-muted hover:bg-surface hover:text-content-primary'
                     }`}
                   >
                     <Icon size={18} />
                     <span className="text-sm font-medium">{module.name}</span>
                     {module.badge != null && module.badge > 0 && (
                       <span className="ml-auto bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                         {module.badge > 99 ? '99+' : module.badge}
                       </span>
                     )}
                   </button>
                 );
               })}
            </div>
          </SheetContent>
        </Sheet>

        {/* Current Module Title (Mobile) */}
        <div className="flex items-center gap-2 md:hidden">
           <ActiveIcon size={18} className="text-accent" />
           <span className="text-sm font-bold text-content-primary">{activeModuleName}</span>
        </div>

        {/* Desktop Horizontal Scroll Menu */}
        <div className="hidden md:flex flex-1 items-center gap-1 min-w-0">
          <button 
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-elevated/50 transition-colors flex-shrink-0"
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
                      ? 'bg-accent-secondary border-accent text-white shadow-md shadow-accent/20'
                      : 'bg-transparent border-transparent text-content-muted hover:bg-surface-elevated/50 hover:text-content-primary'
                    }
                  `}
                >
                  <Icon size={16} />
                  <span className="text-xs font-semibold">{module.name}</span>
                  {module.badge != null && module.badge > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                      isActive ? 'bg-white/20 text-white' : 'bg-accent text-white'
                    }`}>
                      {module.badge > 99 ? '99+' : module.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-elevated/50 transition-colors flex-shrink-0"
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
                  ? 'bg-accent/10 border-accent/30 text-accent' 
                  : 'bg-surface-elevated/50 border-edge-strong text-content-muted hover:text-content-primary'
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
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-base border border-edge rounded-xl shadow-2xl z-40 overflow-hidden ring-1 ring-black/50">
                  <div className="p-2 border-b border-edge bg-surface-base sticky top-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Rechercher un agent..."
                        value={agentSearchQuery}
                        onChange={(e) => setAgentSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {loadingAgents ? (
                      <div className="p-4 text-center text-content-muted text-xs">Chargement...</div>
                    ) : filteredAgents.length === 0 ? (
                      <div className="p-4 text-center text-content-muted text-xs">Aucun agent trouvé</div>
                    ) : (
                      filteredAgents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => { setSelectedAgentId(agent.id); setShowAgentSelector(false); setAgentSearchQuery(''); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition group ${
                            selectedAgentId === agent.id ? 'bg-accent/10 text-accent' : 'text-content-secondary hover:bg-surface hover:text-content-primary'
                          }`}
                        >
                          <div className={`p-1.5 rounded-full ${selectedAgentId === agent.id ? 'bg-accent/10' : 'bg-surface-elevated group-hover:bg-surface-subtle'}`}>
                             <UserCircle size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="truncate block text-xs font-bold">{agent.prenom} {agent.nom}</span>
                            {agent.zoneAffectation && <span className="text-[10px] text-content-muted truncate block">{agent.zoneAffectation}</span>}
                          </div>
                          {selectedAgentId === agent.id && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedAgentId && (
                     <div className="p-2 border-t border-edge bg-surface-base/50">
                        <button 
                          onClick={() => { setSelectedAgentId(null); setShowAgentSelector(false); }}
                          className="w-full py-1.5 text-xs text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition flex items-center justify-center gap-1"
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
          <Card className="p-12 text-center text-content-muted border-dashed">
            <p>Module non disponible</p>
          </Card>
        )}
      </div>
    </div>
  );
}
