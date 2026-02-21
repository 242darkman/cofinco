import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { LayoutDashboard, CreditCard, Clock, Calendar, FileText, FolderOpen, Star, User } from 'lucide-react';
import { TabGroup, FeatureHeader } from '../ui';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import MonEspaceDashboard from './MonEspaceDashboard';
import MonProfilEditor from './MonProfilEditor';
import MaPresenceTab from './MaPresenceTab';
import MesCongesTab from './MesCongesTab';
import MesBulletinsTab from './MesBulletinsTab';
import MesDocumentsPortail from './MesDocumentsPortail';
import MesEvaluationsTab from './MesEvaluationsTab';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'coordonnees', label: 'Coordonnées', icon: CreditCard },
  { key: 'presence', label: 'Présence', icon: Clock },
  { key: 'conges', label: 'Congés', icon: Calendar },
  { key: 'bulletins', label: 'Bulletins', icon: FileText },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'evaluations', label: 'Évaluations', icon: Star },
];

type TabKey = typeof TABS[number]['key'];

export default function MonEspace() {
  const { currentSubModule, navigateToModule } = useAppNavigation();
  const VALID_TABS = TABS.map(t => t.key);

  const activeTab = useMemo<TabKey>(() => {
    if (currentSubModule && VALID_TABS.includes(currentSubModule)) {
      return currentSubModule as TabKey;
    }
    return 'dashboard';
  }, [currentSubModule]);

  const setActiveTab = useCallback((tab: string) => {
    navigateToModule('mon-espace', tab as TabKey);
  }, [navigateToModule]);

  useEffect(() => {
    if (!currentSubModule || !VALID_TABS.includes(currentSubModule)) {
      navigateToModule('mon-espace', 'dashboard');
    }
  }, [currentSubModule]);

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
      case 'bulletins':
        return <MesBulletinsTab />;
      case 'documents':
        return <MesDocumentsPortail />;
      case 'evaluations':
        return <MesEvaluationsTab />;
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
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key as TabKey)}
          variant="underline"
          size="sm"
          className="mt-2"
          scrollable={false}
        />
      </div>

      <div className="flex-1 p-2 sm:p-3">
        {renderContent()}
      </div>
    </div>
  );
}
