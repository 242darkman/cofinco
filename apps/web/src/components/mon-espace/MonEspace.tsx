import React, { useMemo, useCallback, useEffect } from 'react';
import { LayoutDashboard, CreditCard, Clock, Calendar, FileText, FolderOpen, Star, Briefcase, User, Users } from 'lucide-react';
import { TabGroup, FeatureHeader } from '../ui';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useMonEspaceBadge } from '../../hooks/hr/useMonEspaceBadge';
import { useTeamPendingCount } from '../../hooks/hr/useTeamPendingCount';
import MonEspaceDashboard from './MonEspaceDashboard';
import MonProfilEditor from './MonProfilEditor';
import MaPresenceTab from './MaPresenceTab';
import MesCongesTab from './MesCongesTab';
import MesBulletinsTab from './MesBulletinsTab';
import MesDocumentsPortail from './MesDocumentsPortail';
import MesEvaluationsTab from './MesEvaluationsTab';
import MesOffresInternesTab from './MesOffresInternesTab';
import MonEquipeCongesTab from './MonEquipeCongesTab';

const TABS_BASE = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'coordonnees', label: 'Coordonnées', icon: CreditCard },
  { key: 'presence', label: 'Présence', icon: Clock },
  { key: 'conges', label: 'Congés', icon: Calendar },
  { key: 'bulletins', label: 'Bulletins', icon: FileText },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'evaluations', label: 'Évaluations', icon: Star },
  { key: 'offres', label: 'Offres', icon: Briefcase },
];

export default function MonEspace() {
  const { currentSubModule, navigateToModule } = useAppNavigation();
  const { unreadBulletins, newDocuments } = useMonEspaceBadge();
  const { pendingCount: teamPending, isManager, canApprove } = useTeamPendingCount();

  // Show "Mon Équipe" tab if user has subordinates OR has CASL approve permission on leaves
  const showEquipeTab = isManager || canApprove;

  const tabs = useMemo(() => {
    const t = [...TABS_BASE];
    if (showEquipeTab) {
      // Insert "Mon Équipe" after "Congés" (index 3 → insert at 4)
      t.splice(4, 0, { key: 'equipe', label: 'Mon Équipe', icon: Users });
    }
    return t;
  }, [showEquipeTab]);

  const VALID_TABS = useMemo(() => tabs.map(t => t.key), [tabs]);

  const activeTab = useMemo(() => {
    if (currentSubModule && VALID_TABS.includes(currentSubModule)) {
      return currentSubModule;
    }
    return 'dashboard';
  }, [currentSubModule, VALID_TABS]);

  const setActiveTab = useCallback((tab: string) => {
    navigateToModule('mon-espace', tab);
  }, [navigateToModule]);

  useEffect(() => {
    if (!currentSubModule || !VALID_TABS.includes(currentSubModule)) {
      navigateToModule('mon-espace', 'dashboard');
    }
  }, [currentSubModule, VALID_TABS]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <MonEspaceDashboard />;
      case 'coordonnees':
        return <MonProfilEditor />;
      case 'presence':
        return <MaPresenceTab />;
      case 'conges':
        return <MesCongesTab />;
      case 'equipe':
        return <MonEquipeCongesTab />;
      case 'bulletins':
        return <MesBulletinsTab />;
      case 'documents':
        return <MesDocumentsPortail />;
      case 'evaluations':
        return <MesEvaluationsTab />;
      case 'offres':
        return <MesOffresInternesTab />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-y-auto">
      <div className="shrink-0 space-y-2 p-2 sm:p-4 pb-0 bg-surface-base border-b border-edge/50">
        <FeatureHeader
          featureKey="mon-espace"
          title="Mon Espace"
          subtitle="Votre portail employé personnel"
          icon={<User size={24} />}
        />
        <TabGroup
          tabs={tabs.map(tab => ({
            ...tab,
            ...(tab.key === 'equipe' && teamPending && teamPending > 0 ? { badge: teamPending } : {}),
            ...(tab.key === 'bulletins' && unreadBulletins > 0 ? { badge: unreadBulletins } : {}),
            ...(tab.key === 'documents' && newDocuments > 0 ? { badge: newDocuments } : {}),
          }))}
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key)}
          className="mt-2"
          scrollable
        />
      </div>

      <div className="flex-1 p-2 sm:p-3">
        {renderContent()}
      </div>
    </div>
  );
}
