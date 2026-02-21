import React, { useState } from 'react';
import { FolderOpen, Clock, BarChart3 } from 'lucide-react';
import { TabGroup } from '../ui';
import ProjetsTab from './temps-projet/ProjetsTab';
import FeuilleDeTempTab from './temps-projet/FeuilleDeTempTab';
import ReportingTab from './temps-projet/ReportingTab';

const SUB_TABS = [
  { key: 'projets', label: 'Projets', icon: FolderOpen },
  { key: 'feuilles', label: 'Feuilles de temps', icon: Clock },
  { key: 'reporting', label: 'Reporting', icon: BarChart3 },
];

export default function TempsProjetManager() {
  const [activeSubTab, setActiveSubTab] = useState('projets');

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="shrink-0">
        <TabGroup
          tabs={SUB_TABS}
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          variant="pills"
          size="sm"
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeSubTab === 'projets' && <ProjetsTab />}
        {activeSubTab === 'feuilles' && <FeuilleDeTempTab />}
        {activeSubTab === 'reporting' && <ReportingTab />}
      </div>
    </div>
  );
}
