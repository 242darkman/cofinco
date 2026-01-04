import React from 'react';
import { Menu, X, LogOut, ArrowDownCircle, ArrowUpCircle, CreditCard, Banknote } from 'lucide-react';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';

interface AgentSidebarContentProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'versement' | 'retrait' | 'remboursement' | 'epargne';
  onTabChange: (tab: 'versement' | 'retrait' | 'remboursement' | 'epargne') => void;
  onLogout: () => void;
  agent: {
    nom_complet: string;
    code_agent: string;
    peut_faire_versements: boolean;
    peut_faire_retraits: boolean;
    peut_rembourser_credits: boolean;
    peut_collecter_epargnes: boolean;
  } | null;
}

export default function AgentSidebarContent({
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onTabChange,
  onLogout,
  agent
}: AgentSidebarContentProps) {

  const getTabLabel = (tab: 'versement' | 'retrait' | 'remboursement' | 'epargne') => {
    switch (tab) {
      case 'versement': return 'Versement';
      case 'retrait': return 'Retrait';
      case 'remboursement': return 'Remboursement crédit';
      case 'epargne': return 'Collecte épargne';
    }
  };

  const getTabIcon = (tab: 'versement' | 'retrait' | 'remboursement' | 'epargne', size = 18) => {
    switch (tab) {
      case 'versement': return <ArrowDownCircle size={size} />;
      case 'retrait': return <ArrowUpCircle size={size} />;
      case 'remboursement': return <CreditCard size={size} />;
      case 'epargne': return <Banknote size={size} />;
    }
  };

  const canPerformTab = (tab: 'versement' | 'retrait' | 'remboursement' | 'epargne') => {
    if (!agent) return false;
    switch (tab) {
      case 'versement': return agent.peut_faire_versements;
      case 'retrait': return agent.peut_faire_retraits;
      case 'remboursement': return agent.peut_rembourser_credits;
      case 'epargne': return agent.peut_collecter_epargnes;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <IconButton
            onClick={onToggleSidebar}
            icon={sidebarOpen ? X : Menu}
            variant="ghost"
            className="text-slate-400 hover:text-white"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          />
        </div>
        {sidebarOpen && (
          <div className="relative flex flex-col items-center py-2">
            <div className="relative w-16 h-16 bg-white rounded-2xl flex items-center justify-center">
              <img
                src="/cofin-logo.png"
                alt="COFIN Logo"
                className="w-12 h-12 object-contain"
              />
            </div>
            <div className="mt-2 text-center">
              <p className="text-sm font-semibold text-white">{agent?.nom_complet || 'Agent'}</p>
              <p className="text-xs text-slate-400">{agent?.code_agent || ''}</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 pt-2 overflow-y-auto overflow-x-hidden no-scrollbar">
        {sidebarOpen && (
          <div className="px-4 py-1 text-[11px] font-bold text-slate-400 uppercase">
            Actions
          </div>
        )}
        {(['versement', 'retrait', 'remboursement', 'epargne'] as const).map((tab) => (
          <Button
            key={tab}
            onClick={() => onTabChange(tab)}
            disabled={!canPerformTab(tab)}
            variant="ghost"
            fullWidth
            className={`flex items-center gap-3 px-4 py-2 text-sm transition justify-start rounded-none ${
              activeTab === tab
                ? 'bg-gradient-to-r from-blue-600/30 to-cyan-500/30 border-l-2 border-cyan-400 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border-l-2 border-transparent'
            } ${!canPerformTab(tab) ? 'opacity-50 cursor-not-allowed' : ''} ${sidebarOpen ? '' : 'justify-center mx-auto'}`}
          >
            {getTabIcon(tab, 18)}
            {sidebarOpen && <span>{getTabLabel(tab)}</span>}
          </Button>
        ))}
      </nav>

      <div className="border-t border-slate-700 p-3">
        <Button
          onClick={onLogout}
          variant="danger"
          className="w-full justify-start bg-transparent hover:bg-red-500/10 border-none text-slate-400 hover:text-blue-400 shadow-none"
          icon={LogOut}
        >
          {sidebarOpen && <span className="text-sm">Déconnexion</span>}
        </Button>
      </div>
    </div>
  );
}
