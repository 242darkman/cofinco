import React, { useState } from 'react';
import { TabGroup } from '../ui';
import { Star, User, FileText } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import CampaignesTab from './evaluations/CampaignesTab';
import MesEvaluationsTab from './evaluations/MesEvaluationsTab';
import ModelesTab from './evaluations/ModelesTab';

const SUB_TABS = [
  { key: 'campagnes', label: 'Campagnes', icon: Star },
  { key: 'mes-evaluations', label: 'Mes Évaluations', icon: User },
  { key: 'modeles', label: 'Modèles', icon: FileText },
];

export default function EvaluationsManager() {
  const [activeSubTab, setActiveSubTab] = useState('campagnes');
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'edit');

  const visibleTabs = SUB_TABS.filter(tab => {
    if (tab.key === 'modeles' && !canManage) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <TabGroup
        tabs={visibleTabs}
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        variant="pills"
        size="sm"
      />

      {activeSubTab === 'campagnes' && <CampaignesTab />}
      {activeSubTab === 'mes-evaluations' && <MesEvaluationsTab />}
      {activeSubTab === 'modeles' && canManage && <ModelesTab />}
    </div>
  );
}
