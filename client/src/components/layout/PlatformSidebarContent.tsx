import React from 'react';
import { Menu, X, LogOut } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PLATFORM_MENU_ITEMS } from '../../constants/menuItems';
import { ROUTES, canAccessRoute, type RouteConfig } from '../../lib/routes-config';
import IconButton from '../ui/IconButton';
import { useSystemSettings } from '../../hooks/settings/useSystemSettings';

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
  const agenceName = systemSettings?.find(s => s.cle === 'agence_name')?.valeur || 'COFIN&CO-M';

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
    const isDisabled = route.key === 'transfert' || route.key === 'bourse';

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
          transition-all duration-200 text-sm
          ${!sidebarOpen ? 'justify-center' : ''}
          ${isActive
            ? 'bg-accent/15 text-accent font-medium'
            : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'
          }
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Active indicator */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-full" />
        )}

        {Icon && (
          <Icon
            size={20}
            className={`shrink-0 transition-colors ${isActive ? 'text-accent' : ''}`}
            aria-hidden="true"
          />
        )}

        {sidebarOpen && (
          <>
            <span className="flex-1 text-left truncate">
              {t(route.labelKey || route.key)}
            </span>
            {isDisabled && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Bientôt
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
            {isDisabled && ' (Bientôt)'}
          </div>
        )}
      </button>
    );
  }
}
