import React from 'react';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { Menu, X, LogOut, ArrowDownCircle, ArrowUpCircle, CreditCard, Banknote } from 'lucide-react';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import { useBranding } from '../../contexts/BrandingContext';

interface AgentSidebarContentProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'versement' | 'retrait' | 'remboursement' | 'epargne' | 'offline';
  onTabChange: (tab: 'versement' | 'retrait' | 'remboursement' | 'epargne' | 'offline') => void;
  onLogout: () => void;
  agent: {
    nomComplet: string;
    codeAgent: string;
    peutFaireVersements: boolean;
    peutFaireRetraits: boolean;
    peutRembourserCredits: boolean;
    peutCollecterEpargnes: boolean;
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
  const { branding } = useBranding();

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
      case 'versement': return agent.peutFaireVersements;
      case 'retrait': return agent.peutFaireRetraits;
      case 'remboursement': return agent.peutRembourserCredits;
      case 'epargne': return agent.peutCollecterEpargnes;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-edge">
        <div className="flex items-center justify-between">
          <IconButton
            onClick={onToggleSidebar}
            icon={sidebarOpen ? X : Menu}
            variant="ghost"
            className="text-content-muted hover:text-content-primary"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          />
        </div>
        {sidebarOpen && (
          <div className="relative flex flex-col items-center py-2">
            <div className="relative w-16 h-16 bg-surface rounded-2xl flex items-center justify-center">
              <TenantLogo className="w-12 h-12 object-contain" />
            </div>
            <div className="mt-2 text-center">
              <p className="text-sm font-semibold text-content-primary">{agent?.nomComplet || 'Agent'}</p>
              <p className="text-xs text-content-muted">{agent?.codeAgent || ''}</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 pt-2 overflow-y-auto overflow-x-hidden no-scrollbar">
        {sidebarOpen && (
          <div className="px-4 py-1 text-[11px] font-bold text-content-muted uppercase">
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
                ? 'bg-gradient-to-r from-status-info/30 to-accent/30 border-l-2 border-accent text-white'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-elevated/50 border-l-2 border-transparent'
            } ${!canPerformTab(tab) ? 'opacity-50 cursor-not-allowed' : ''} ${sidebarOpen ? '' : 'justify-center mx-auto'}`}
          >
            {getTabIcon(tab, 18)}
            {sidebarOpen && <span>{getTabLabel(tab)}</span>}
          </Button>
        ))}
      </nav>

      <div className="border-t border-edge p-3">
        <Button
          onClick={onLogout}
          variant="danger"
          className="w-full justify-start bg-transparent hover:bg-status-danger-bg border-none text-content-muted hover:text-status-info shadow-none"
          icon={LogOut}
        >
          {sidebarOpen && <span className="text-sm">Déconnexion</span>}
        </Button>
      </div>
    </div>
  );
}
