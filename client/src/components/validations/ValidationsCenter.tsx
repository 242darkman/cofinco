import React, { useEffect } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import TabGroup from '@/components/ui/TabGroup';
import { useValidationsBadge } from '@/hooks/useValidationsBadge';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import AgentCollecteValidations from './AgentCollecteValidations';
import ClosureApprovals from './ClosureApprovals';
import OpeningApprovals from './OpeningApprovals';

type TabKey = 'collectes' | 'clotures' | 'ouvertures';

const VALID_TABS: TabKey[] = ['collectes', 'clotures', 'ouvertures'];

interface ValidationsCenterProps {
  activeView?: string;
}

export default function ValidationsCenter({ activeView }: ValidationsCenterProps) {
  const { navigateToModule } = useAppNavigation();
  const { operationsCount, closuresCount, openingsCount, totalCount, refresh } = useValidationsBadge();

  // Derive active tab from URL, default to 'collectes'
  const activeTab: TabKey = VALID_TABS.includes(activeView as TabKey)
    ? (activeView as TabKey)
    : 'collectes';

  // Redirect bare /validations to /validations/collectes
  useEffect(() => {
    if (!activeView || !VALID_TABS.includes(activeView as TabKey)) {
      navigateToModule('validations', 'collectes');
    }
  }, [activeView, navigateToModule]);

  const handleTabChange = (key: string) => {
    navigateToModule('validations', key);
  };

  const tabs = [
    {
      key: 'collectes' as const,
      label: 'Collectes Agents',
      badge: operationsCount,
      badgeClassName: activeTab === 'collectes'
        ? 'bg-surface-base text-content-primary ring-1 ring-white/30'
        : 'bg-status-danger text-white',
    },
    {
      key: 'clotures' as const,
      label: 'Clotures Comptes',
      badge: closuresCount,
      badgeClassName: activeTab === 'clotures'
        ? 'bg-surface-base text-content-primary ring-1 ring-white/30'
        : 'bg-status-danger text-white',
    },
    {
      key: 'ouvertures' as const,
      label: 'Creations Comptes',
      badge: openingsCount,
      badgeClassName: activeTab === 'ouvertures'
        ? 'bg-surface-base text-content-primary ring-1 ring-white/30'
        : 'bg-status-danger text-white',
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-content-primary flex items-center gap-2 sm:gap-3">
            <ShieldCheck className="text-status-success w-6 h-6 sm:w-8 sm:h-8" />
            Centre de Validations
            {totalCount > 0 && (
              <span className="bg-status-danger text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-content-muted mt-1">
            Gerez toutes les validations en attente depuis un seul endroit.
          </p>
        </div>

        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-surface-muted text-content-muted hover:text-content-secondary transition-colors self-end sm:self-auto"
          title="Rafraichir"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="shrink-0">
        <TabGroup
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
          variant="pills"
          size="md"
          scrollable
        />
      </div>

      {/* Tab Content — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'collectes' && <AgentCollecteValidations />}
        {activeTab === 'clotures' && <ClosureApprovals />}
        {activeTab === 'ouvertures' && <OpeningApprovals />}
      </div>
    </div>
  );
}
