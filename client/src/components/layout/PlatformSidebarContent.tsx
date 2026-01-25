import React, { useEffect, useState } from 'react';
import { Menu, X, LogOut, Lock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { maintenanceApi, creditRefundsApi } from '../../lib/api-client';
import { PLATFORM_MENU_ITEMS } from '../../constants/menuItems';
import { ROUTES, canAccessRoute, type RouteConfig, getRouteByKey } from '../../lib/routes-config';
import IconButton from '../ui/IconButton';
import { useSystemSettings } from '../../hooks/settings/useSystemSettings';
import { usePermissionsContext } from '../../contexts/PermissionsContext';
import { isAdminRole } from '@shared/types/roles';
import { useOperationsBadge } from '../../hooks/useOperationsBadge';

interface PlatformSidebarContentProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentModule: string;
  currentSubModule?: string;
  onModuleChange: (module: string, subModule?: string) => void;
  onLogout: () => void;
  userRole?: string;
}

export default function PlatformSidebarContent({
  sidebarOpen,
  onToggleSidebar,
  currentModule,
  onModuleChange,
  onLogout,
  userRole = 'agent'
}: PlatformSidebarContentProps) {
  const { t } = useLanguage();
  const { settings: systemSettings } = useSystemSettings();
  usePermissionsContext(); // Subscribe to permission changes to force re-render
  const agenceName = systemSettings?.find(s => s.cle === 'agence_name')?.valeur || 'COFIN&CO-M';

  // Maintenance Status State
  const [lockedModules, setLockedModules] = useState<Set<string>>(new Set());
  const [pendingRefundsCount, setPendingRefundsCount] = useState<number>(0);

  // Use real-time operations badge hook
  const { pendingCount: pendingValidationsCount } = useOperationsBadge();

  // Fetch Pending Refunds Count (Restitutions Frais)
  const fetchPendingRefundsCount = async () => {
    try {
      if (canAccessRoute(getRouteByKey('remboursements')!, userRole)) {
        const result = await creditRefundsApi.countPending();
        if (result && typeof result.count === 'number') {
          setPendingRefundsCount(result.count);
        }
      }
    } catch (error) {
       // Silent error for dashboard counters
       console.error("Refunds counter error:", error);
    }
  };

  // Fetch Maintenance Status on Mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const modules = await maintenanceApi.getStatus();
        // Assume modules have properties: moduleName (camelCase)
        const locked = new Set<string>(
          modules
            .filter((m: any) => m.isLocked)
            .map((m: any) => String(m.moduleName))
        );
        setLockedModules(locked);
      } catch (error) {
        console.error("Failed to fetch sidebar maintenance status", error);
      }
    };

    fetchStatus();
    fetchPendingRefundsCount();

    // Real-time Updates Listener
    const handleMaintenanceUpdate = (event: CustomEvent) => {
        const { moduleName, isLocked, isPlatform } = event.detail;
        console.log('[Sidebar] Maintenance update received:', { moduleName, isLocked, isPlatform });
        
        setLockedModules(prev => {
            const next = new Set(prev);
            console.log('[Sidebar] Previous locked:', Array.from(prev));
            
            if (isPlatform) {
                 if (isLocked) next.add('PLATFORM');
                 else next.delete('PLATFORM');
            } else {
                 const name = String(moduleName);
                 if (isLocked) {
                     next.add(name);
                     console.log(`[Sidebar] Locking ${name}`);
                 } else {
                     const deleted = next.delete(name);
                     console.log(`[Sidebar] Unlocking ${name}, found=${deleted}`);
                 }
            }
            console.log('[Sidebar] Next locked:', Array.from(next));
            return next;
        });
    };

    const handleRefundUpdate = () => {
      // Refresh refund count when refunds change status
      fetchPendingRefundsCount();
    };

    window.addEventListener('maintenance-update', handleMaintenanceUpdate as EventListener);
    window.addEventListener('refund-update', handleRefundUpdate as EventListener);

    // Polling interval for refunds (every 30 seconds) as backup
    const refundPollInterval = setInterval(fetchPendingRefundsCount, 30000);

    return () => {
        window.removeEventListener('maintenance-update', handleMaintenanceUpdate as EventListener);
        window.removeEventListener('refund-update', handleRefundUpdate as EventListener);
        clearInterval(refundPollInterval);
    };
  }, [userRole]);

  // Configure Module Mapping: Route Key -> Maintenance Module Name
  // This must match the backend list: 'PLATFORM', 'CAISSE', 'CREDITS', 'TONTINES', 'EPARGNE', 'RH', 'MESSAGES', 'ADMIN'
  const routeToModuleMap: Record<string, string> = {
    'credit': 'CREDITS',
    'caisse': 'CAISSE',
    'tontine': 'TONTINES',
    'epargne': 'EPARGNE',
    'rh': 'RH',
    'messagerie': 'MESSAGES',
    // Add others if needed
  };

  const getMenuIcon = (key: string) => {
    const item = PLATFORM_MENU_ITEMS.find(m => m.key === key);
    return item?.icon;
  };

  const handleModuleClick = (route: RouteConfig) => {
    onModuleChange(route.key);
  };

  // Group routes
  const accessibleRoutes = ROUTES.filter(route => canAccessRoute(route, userRole));
  const groupedRoutes: Record<string, RouteConfig[]> = {};

  // Define group order and labels
  const groupConfig = {
    'Principal': { label: '', showLabel: false },
    'Services Clients': { label: 'Produits', showLabel: true },
    'Opérations': { label: 'Opérations', showLabel: true },
    'Gestion': { label: 'Gestion', showLabel: true },
    'Système': { label: 'Système', showLabel: true },
  };
  const groupOrder = Object.keys(groupConfig);

  accessibleRoutes.forEach(route => {
    const group = route.group || 'Principal';
    if (!groupedRoutes[group]) {
      groupedRoutes[group] = [];
    }
    groupedRoutes[group].push(route);
  });

  return (
    <div className="flex flex-col h-full bg-sidebar-bg">
      {/* Header */}
      <div className="p-3 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <IconButton
            onClick={onToggleSidebar}
            icon={sidebarOpen ? X : Menu}
            variant="ghost"
            className="text-sidebar-text hover:text-content-primary"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          />
          {sidebarOpen && (
            <span className="text-xs font-medium text-content-muted uppercase tracking-wider">
              Menu
            </span>
          )}
        </div>

      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden no-scrollbar" role="navigation" aria-label="Menu principal">
        {groupOrder.map(groupName => {
          const routes = groupedRoutes[groupName] || [];
          if (routes.length === 0) return null;

          const config = groupConfig[groupName as keyof typeof groupConfig];

          return (
            <div key={groupName} className="mb-2">
              {/* Group label - only show when sidebar is open and showLabel is true */}
              {sidebarOpen && config.showLabel && (
                <div className="px-4 py-2">
                  <span className="text-[10px] font-semibold text-content-muted uppercase tracking-widest">
                    {config.label}
                  </span>
                </div>
              )}

              {/* Divider for collapsed sidebar between groups */}
              {!sidebarOpen && groupName !== 'Principal' && (
                <div className="mx-3 my-2 border-t border-sidebar-border/50" />
              )}

              {/* Route items */}
              <div className="space-y-0.5 px-2">
                {routes.map(route => renderRouteItem(route))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border flex-shrink-0 p-3">
        <button
          onClick={onLogout}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-red-400 hover:text-red-300 hover:bg-red-500/10
            transition-all duration-200
            ${!sidebarOpen ? 'justify-center' : ''}
          `}
          aria-label={t('deconnexion')}
        >
          <LogOut size={18} className="shrink-0" />
          {sidebarOpen && (
            <span className="text-sm font-medium">{t('deconnexion')}</span>
          )}
        </button>
      </div>
    </div>
  );

  function renderRouteItem(route: RouteConfig) {
    const Icon = getMenuIcon(route.key);
    const isActive = currentModule === route.key;
    
    // Check maintenance
    const maintenanceModule = routeToModuleMap[route.key];
    const isMaintenanceLocked = maintenanceModule ? lockedModules.has(maintenanceModule) : false;
    const isPlatformLocked = lockedModules.has('PLATFORM');
    
    // Allow admin to bypass maintenance visual lock if needed, but for now we show lock to all
    // Or better, check role:
    const isAdmin = isAdminRole(userRole);
    const showMaintenanceLock = (isMaintenanceLocked || isPlatformLocked) && !isAdmin;

    const isDisabled = route.key === 'bourse' || showMaintenanceLock;

    return (
      <button
        key={route.key}
        onClick={() => {
          if (isDisabled) return;
          handleModuleClick(route);
        }}
        disabled={isDisabled}
        aria-current={isActive ? 'page' : undefined}
        className={`
          group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
          transition-all duration-300 text-sm overflow-hidden
          ${!sidebarOpen ? 'justify-center' : ''}
          ${isActive
            ? 'bg-gradient-to-r from-accent/15 via-accent/5 to-transparent text-accent font-semibold shadow-sm ring-1 ring-accent/10'
            : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'
          }
          ${isDisabled ? 'opacity-50 cursor-not-allowed grayscale-[0.5]' : 'cursor-pointer'}
        `}
      >
        {/* Active indicator with Glow */}
        {isActive && !isDisabled && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full shadow-[0_0_12px_rgba(var(--accent-primary),0.6)]" />
        )}

        {/* Maintenance Lock Overlay (or icon replacement) */}
        {showMaintenanceLock ? (
           <Lock size={20} className="shrink-0 text-amber-500/80" />
        ) : (
          Icon && (
            <Icon
              size={20}
              className={`shrink-0 transition-colors duration-300 ${isActive ? 'text-accent drop-shadow-sm' : 'group-hover:text-sidebar-text-active'}`}
              aria-hidden="true"
            />
          )
        )}

        {/* Real-time Badge for Collapsed Sidebar - Validations */}
        {!sidebarOpen && route.key === 'agentValidations' && pendingValidationsCount > 0 && (
          <div className="absolute top-1 right-2 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in duration-300 ring-2 ring-sidebar-bg">
            {pendingValidationsCount}
          </div>
        )}
        {/* Real-time Badge for Collapsed Sidebar - Restitutions Frais */}
        {!sidebarOpen && route.key === 'remboursements' && pendingRefundsCount > 0 && (
          <div className="absolute top-1 right-2 bg-cyan-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in duration-300 ring-2 ring-sidebar-bg">
            {pendingRefundsCount}
          </div>
        )}

        {sidebarOpen && (
          <>
            <span className={`flex-1 text-left truncate transition-all duration-300 ${isActive ? 'translate-x-1' : ''}`}>
              {t(route.labelKey || route.key)}
            </span>
            {route.key === 'agentValidations' && pendingValidationsCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-in zoom-in duration-300">
                {pendingValidationsCount}
              </span>
            )}
            {route.key === 'remboursements' && pendingRefundsCount > 0 && (
              <span className="bg-cyan-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-in zoom-in duration-300">
                {pendingRefundsCount}
              </span>
            )}
            {isDisabled && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                showMaintenanceLock 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                  : 'bg-content-muted/20 text-content-muted border-content-muted/30'
              }`}>
                {showMaintenanceLock ? 'Maint.' : 'Bientôt'}
              </span>
            )}
          </>
        )}

        {/* Tooltip for collapsed sidebar */}
        {!sidebarOpen && (
          <div className="
            absolute left-full ml-2 px-2 py-1 rounded-md
            bg-surface-elevated text-content-primary text-xs font-medium
            opacity-0 invisible group-hover:opacity-100 group-hover:visible
            transition-all duration-200 whitespace-nowrap z-50
            shadow-lg border border-edge-subtle
          ">
            {t(route.labelKey || route.key)}
            {showMaintenanceLock ? ' (En Maintenance)' : isDisabled ? ' (Bientôt)' : ''}
          </div>
        )}
      </button>
    );
  }
}
