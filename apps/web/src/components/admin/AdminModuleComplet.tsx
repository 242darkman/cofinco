import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import {
  Shield, Users, Key, Settings, BarChart3, Activity, Monitor, Power, Building2, MapPin,
  MessageSquare, KeyRound, Clock, UserPlus, Award, Package, CreditCard, CalendarClock,
  AlertTriangle, Lock, ChevronLeft, ChevronRight, Coins, RotateCcw, Wallet, Percent, Palette,
  CloudUpload,
} from 'lucide-react';

// Constants
import { ADMIN_TABS, ADMIN_TAB_TENANT_FEATURE } from '../../constants/admin-constants';
import { useAbility } from '../../contexts/AbilityContext';
import { Actions, Subjects } from '@/lib/casl';
import { getPermissionMapping } from '@shared/ability/mappings';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useTenant } from '@/contexts/TenantContext';

// Le rendu des onglets vient de la source unique `admin-tabs` (composants lazy).
import { Spinner } from '@/components/ui/Spinner';


interface AdminModuleCompletProps {
  readonly activeView?: string;
}

export default function AdminModuleComplet({ activeView }: AdminModuleCompletProps) {
  const ability = useAbility();
  const { currentSubModule, navigateToModule } = useAppNavigation();
  const { config: tenantConfig } = useTenant();
  const tenantFeatures = tenantConfig.features;

  // Dérive l'onglet actif depuis l'URL (source de vérité)
  const VALID_TAB_IDS = ADMIN_TABS.map(t => t.id) as string[];
  const activeTab = useMemo<string>(() => {
    if (currentSubModule && VALID_TAB_IDS.includes(currentSubModule)) {
      const tabId = currentSubModule as string;
      // Onglet lié à une feature désactivée : inaccessible même en accès direct
      const feature = ADMIN_TAB_TENANT_FEATURE[tabId];
      if (feature && !tenantFeatures[feature]) return 'dashboard';
      return tabId;
    }
    return 'dashboard';
  }, [currentSubModule, tenantFeatures]);

  const setActiveTab = useCallback((tab: string) => {
    navigateToModule('administrateur', tab);
  }, [navigateToModule]);

  // Navigation Scroll State
  const scrollContainerRef = useRef<HTMLElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  // Legacy: si activeView est passé via l'ancien système (avant URL sync), on redirige
  useEffect(() => {
    if (activeView && !currentSubModule) {
      switch (activeView) {
        case 'admin-users': navigateToModule('administrateur', 'users'); break;
        case 'admin-agences': navigateToModule('administrateur', 'agences'); break;
        case 'admin-audit': navigateToModule('administrateur', 'logs'); break;
      }
    }
  }, [activeView, currentSubModule, navigateToModule]);

  // Scroll Management
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftShadow(scrollLeft > 0);
      setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 5); // tolerance
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  // Scroll active tab into view + Check arrows on tab change
  useEffect(() => {
    // Small delay to ensure render
    setTimeout(() => {
        checkScroll();
        const activeEl = document.getElementById(`admin-tab-${activeTab}`);
        if (activeEl && scrollContainerRef.current) {
             const container = scrollContainerRef.current;
             const { left: activeLeft, right: activeRight } = activeEl.getBoundingClientRect();
             const { left: containerLeft, right: containerRight } = container.getBoundingClientRect();
             
             // If element is out of view, scroll it in
             if (activeLeft < containerLeft) {
                 container.scrollBy({ left: activeLeft - containerLeft - 100, behavior: 'smooth' });
             } else if (activeRight > containerRight) {
                 container.scrollBy({ left: activeRight - containerRight + 100, behavior: 'smooth' });
             }
        }
    }, 100);
  }, [activeTab]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const iconMap: Record<string, any> = {
    'BarChart3': BarChart3, 'UserPlus': UserPlus, 'Users': Users, 'Building2': Building2,
    'MapPin': MapPin, 'KeyRound': KeyRound, 'Activity': Activity, 'Monitor': Monitor,
    'Power': Power, 'Shield': Shield, 'Key': Key, 'MessageSquare': MessageSquare, 'Coins': Coins,
    'Settings': Settings, 'Clock': Clock, 'Award': Award, 'Package': Package,
    'CalendarClock': CalendarClock,
    'CreditCard': CreditCard,
    'AlertTriangle': AlertTriangle,
    'RotateCcw': RotateCcw,
    'Wallet': Wallet,
    'Percent': Percent,
    'Palette': Palette,
    'CloudUpload': CloudUpload,
  };

  // Onglet actif issu de la source unique.
  const activeTabDef = useMemo(() => ADMIN_TABS.find((t) => t.id === activeTab), [activeTab]);

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden bg-surface-base">
      {/* TOP NAVIGATION BAR */}
      <header className="shrink-0 bg-surface-base border-b border-edge flex items-center h-14 px-4 gap-4 sticky top-0 z-20">
        {/* Title / Brand */}
        <div className="flex items-center gap-2 shrink-0 pr-4 border-r border-edge">
           <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-accent" />
           </div>
           <div className="hidden md:block">
             <h2 className="text-sm font-bold text-content-primary leading-none">Admin</h2>
             <p className="text-[9px] text-content-muted uppercase tracking-wider leading-none mt-0.5">Système</p>
           </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 relative overflow-hidden flex items-center group/nav">
           
           {/* Left Shadow / Button */}
           <div className={`absolute left-0 top-0 bottom-0 w-16 bg-linear-to-r from-surface-base to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showLeftShadow && (
                <button 
                  onClick={() => scroll('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-surface/80 hover:bg-surface-elevated text-content-secondary p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
                >
                    <ChevronLeft size={16} />
                </button>
            )}

            {/* Scroll Container */}
            <nav 
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth px-2"
            >
               {ADMIN_TABS.filter(tab => {
                  // Masqué si la feature tenant associée est désactivée
                  const feature = ADMIN_TAB_TENANT_FEATURE[tab.id];
                  if (feature && !tenantFeatures[feature]) return false;
                  if (!tab.permission) return true;
                  const parts = tab.permission.split('.');
                  const module = parts[0];
                  const action = parts.slice(1).join('.') || 'view';
                  if (ability.can(Actions.MANAGE, Subjects.ALL)) return true;
                  const mapping = getPermissionMapping(`${module}.${action}`);
                  if (!mapping) return false;
                  return ability.can(mapping.action, mapping.subject);
                }).map((tab) => {
                  const Icon = iconMap[tab.icon] || Shield;
                  const isActive = activeTab === tab.id;
                  const isDisabled = 'disabled' in tab && !!(tab as any).disabled;
                  
                  let tabClasses = 'text-content-muted hover:text-content-secondary hover:bg-surface hover:border-edge';
                  if (isActive) {
                    tabClasses = 'bg-accent text-white shadow-sm shadow-accent/20 border-accent/50';
                  } else if (isDisabled) {
                    tabClasses = 'opacity-40 cursor-not-allowed text-content-muted';
                  }
                  
                  return (
                    <button
                      key={tab.id}
                      id={`admin-tab-${tab.id}`}
                      onClick={() => !isDisabled && setActiveTab(tab.id)}
                      disabled={isDisabled}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 border border-transparent
                        ${tabClasses}
                      `}
                    >
                      <Icon size={14} className={isActive ? "text-white" : "text-content-muted"} />
                      <span>{tab.label}</span>
                      {isDisabled && <Lock size={10} className="ml-1" />}
                    </button>
                  );
                })}
            </nav>

            {/* Right Shadow / Button */}
            <div className={`absolute right-0 top-0 bottom-0 w-16 bg-linear-to-l from-surface-base to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`} />
            {showRightShadow && (
                <button 
                  onClick={() => scroll('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-surface/80 hover:bg-surface-elevated text-content-secondary p-1 rounded-full shadow-lg backdrop-blur-sm transition-all animate-in fade-in zoom-in-50"
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-surface-base">
        <div className="h-full p-2 md:p-3 flex flex-col">
           <div className="w-full h-full flex flex-col">
              
              {/* Optional Section Header if needed, or streamlined */}
              {activeTab !== 'dashboard' && (
                <div className="mb-3 shrink-0">
                    <h1 className="text-base font-bold text-content-primary flex items-center gap-2">
                      {iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'] 
                         ? React.createElement(iconMap[ADMIN_TABS.find(t => t.id === activeTab)?.icon || 'Shield'], { size: 18, className: "text-accent" })
                         : <Shield className="text-accent" size={18} />
                      }
                      {ADMIN_TABS.find(t => t.id === activeTab)?.label}
                    </h1>
                </div>
              )}

              {/* Rendu de l'onglet actif — dérivé de la source unique ADMIN_TABS. */}
              <div className="flex-1 relative overflow-hidden flex flex-col">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner size="lg" /></div>}>
                  {activeTabDef?.render({ goToDashboard: () => setActiveTab('dashboard') })}
                </Suspense>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}

