import React, { useState } from 'react';
import { Map, FileText, GraduationCap, MessageSquare, Package, AlertTriangle, Target, BarChart3, Clock, Banknote, Phone, Users, Receipt, Star, Camera, Eye, BookOpen, TrendingUp, Trophy, Download, LayoutDashboard } from 'lucide-react';
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
import AgentDashboardComplet from './AgentDashboardComplet';
import AgentReportsGenerator from './AgentReportsGenerator';
import AgentTeamLeaderboard from './AgentTeamLeaderboard';
import LoadingScreen from '../ui/LoadingScreen';

interface AgentTerrainExtendedProps {
  agentId?: string;
}

export default function AgentTerrainExtended({ agentId }: AgentTerrainExtendedProps) {
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [moduleLoading, setModuleLoading] = useState(false);

  const handleModuleChange = (moduleName: string) => {
    setModuleLoading(true);
    setTimeout(() => {
      setActiveModule(moduleName);
      setModuleLoading(false);
    }, 500);
  };

  const modules = [
    { id: 'dashboard', name: 'Tableau de Bord', icon: LayoutDashboard, component: AgentDashboardComplet },
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

      {/* Active Module Content */}
      <div className="animate-in fade-in duration-300">
        {moduleLoading ? (
          <div className="flex items-center justify-center py-20">
             <LoadingScreen message="Chargement..." fullScreen={false} />
          </div>
        ) : ActiveComponent ? (
          <ActiveComponent agentId={agentId} />
        ) : (
          <Card className="p-12 text-center text-slate-400">
            <p>Module non disponible</p>
          </Card>
        )}
      </div>
    </div>
  );
}
