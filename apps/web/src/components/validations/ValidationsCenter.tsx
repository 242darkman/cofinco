import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Layers,
  CreditCard,
  UserPlus,
  Search,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { useValidationsBadge } from '@/hooks/useValidationsBadge';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { usePermissions } from '@/components/auth/ProtectedFeature';
import SearchableSelect, { SearchableSelectOption } from '@/components/ui/SearchableSelect';
import AgentCollecteValidations from './AgentCollecteValidations';
import ClosureApprovals from './ClosureApprovals';
import OpeningApprovals from './OpeningApprovals';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { agencesApi, type Agence } from '@/lib/api-client';
import { filterActiveAgencies } from './validation-helpers';

type TabKey = 'collectes' | 'clotures' | 'ouvertures';

const VALID_TABS: TabKey[] = ['collectes', 'clotures', 'ouvertures'];

interface ValidationsCenterProps {
  activeView?: string;
}

export default function ValidationsCenter({ activeView }: ValidationsCenterProps) {
  const { navigateToModule } = useAppNavigation();
  const { operationsCount, closuresCount, openingsCount, totalCount, refresh } = useValidationsBadge();
  const { isAdmin, user } = usePermissions();
  const [agences, setAgences] = useState<Agence[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(true);

  // Global Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgenceId, setSelectedAgenceId] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const data = await agencesApi.getAgences();
        setAgences(data || []);
      } catch (err) {
        console.error('Failed to fetch agencies', err);
      } finally {
        setLoadingAgencies(false);
      }
    };
    fetchAgencies();
  }, []);

  const activeAgencies = useMemo(() => filterActiveAgencies(agences), [agences]);

  // Only show agency selector for admins or users not tied to a single agency
  const showAgencySelector = isAdmin || !user?.agenceId || activeAgencies.length > 1;

  const handleTabChange = (key: string) => {
    navigateToModule('validations', key);
    // Reset filters when changing tabs? User didn't specify, but often better to persist or reset.
    // Resetting for now to avoid confusion across different data types.
    setSearchTerm('');
    setSelectedAgenceId('all');
  };

  const tabs = [
    {
      key: 'collectes' as const,
      label: 'Collectes Agents',
      icon: Layers,
      count: operationsCount,
      color: 'text-primary'
    },
    {
      key: 'clotures' as const,
      label: 'Clôtures',
      icon: CreditCard,
      count: closuresCount,
      color: 'text-status-danger'
    },
    {
      key: 'ouvertures' as const,
      label: 'Ouvertures',
      icon: UserPlus,
      count: openingsCount,
      color: 'text-status-success'
    },
  ];

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    window.dispatchEvent(new CustomEvent('operation-update', { detail: { type: 'REFRESH_ALL' } }));
    window.dispatchEvent(new CustomEvent('closure-update'));
    window.dispatchEvent(new CustomEvent('opening-update'));
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-6">
      {/* Executive Sticky Header with Filters */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-surface/90 backdrop-blur-xl border-b border-edge flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner shrink-0 leading-none">
            <ShieldCheck className="text-primary w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-content-primary flex items-center gap-3">
              <span className="truncate">Centre de Validations</span>
              {totalCount > 0 && (
                <div className="px-2 py-0.5 rounded-full bg-status-danger text-white text-[10px] font-black shadow-lg shadow-status-danger/20 shrink-0">
                  {totalCount}
                </div>
              )}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse shrink-0"></div>
              <span className="text-[11px] font-bold text-content-muted uppercase tracking-widest truncate">
                {activeAgencies.length} Agences actives
              </span>
            </div>
          </div>
        </div>

        {/* Search & Global Filter Layer */}
        <div className="flex items-center flex-1 max-w-2xl gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted group-focus-within:text-accent transition-colors" size={16} />
            <input
              type="text"
              placeholder="Recherche globale..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-[13px] bg-input-bg border border-input-border rounded-xl focus:ring-[3px] focus:ring-accent/30 focus:border-accent hover:border-content-muted shadow-sm outline-none transition-all placeholder:text-input-placeholder"
            />
          </div>
          
          {showAgencySelector && (
            <div className="relative min-w-[200px] hidden sm:block">
              <SearchableSelect
                name="agenceSelector"
                value={selectedAgenceId}
                onChange={(val) => setSelectedAgenceId(String(val))}
                options={[
                  { value: 'all', label: 'Toutes agences', hideAvatar: true },
                  ...activeAgencies.map(a => ({
                    value: a.id,
                    label: a.nom,
                    hideAvatar: true
                  }))
                ]}
                placeholder="Sélectionner une agence..."
                variant="dark"
                icon={Filter}
                className="[&>button]:!h-10 [&>button]:!rounded-xl [&>button]:!bg-input-bg [&>button]:!border-input-border [&>button]:hover:!border-content-muted [&>button]:focus:!border-accent [&>button]:focus:!ring-accent/30 [&>button]:!text-[13px]"
              />
            </div>
          )}

          <button
            onClick={handleRefresh}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-surface-muted text-content-muted hover:text-primary transition-all active:scale-95 border border-edge shrink-0"
            title="Rafraîchir"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Modern Compact Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-surface-muted/20 border border-edge rounded-2xl w-fit self-center sm:self-start lg:-mt-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "relative px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 outline-none group",
                isActive ? "text-accent" : "text-content-muted hover:text-content-primary hover:bg-surface-subtle"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-accent/10 border border-accent/20 shadow-sm rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon size={16} className={cn("relative z-10 transition-colors", isActive ? tab.color : "opacity-60")} />
              <span className="relative z-10 whitespace-nowrap uppercase tracking-wider">{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                    "relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[20px] text-center",
                    isActive ? "bg-accent text-white shadow-sm" : "bg-surface-elevated border border-edge text-content-muted"
                  )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-visible">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="h-full"
          >
            {activeTab === 'collectes' && (
              <AgentCollecteValidations
                searchTerm={searchTerm}
                selectedAgenceId={selectedAgenceId}
                activeAgencies={activeAgencies}
              />
            )}
            {activeTab === 'clotures' && (
              <ClosureApprovals 
                searchTerm={searchTerm} 
                agenceId={selectedAgenceId !== 'all' ? selectedAgenceId : undefined}
              />
            )}
            {activeTab === 'ouvertures' && (
              <OpeningApprovals 
                searchTerm={searchTerm} 
                agenceId={selectedAgenceId !== 'all' ? selectedAgenceId : undefined}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
