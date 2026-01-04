import React, { useState } from 'react';
import { Menu, X, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PLATFORM_MENU_ITEMS } from '../../constants/menuItems';
import { ROUTES, canAccessRoute, type RouteConfig } from '../../lib/routes-config';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';

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
  currentSubModule,
  onModuleChange,
  onLogout,
  userRole = 'agent'
}: PlatformSidebarContentProps) {
  const { t } = useLanguage();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set([currentModule]));

  // Filtrer les routes accessibles par le rôle
  const accessibleRoutes = ROUTES.filter(route => canAccessRoute(route, userRole));

  // Toggle expansion d'un menu avec sous-routes
  const toggleExpand = (key: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Trouver l'icône correspondante dans PLATFORM_MENU_ITEMS
  const getMenuIcon = (key: string) => {
    const item = PLATFORM_MENU_ITEMS.find(m => m.key === key);
    return item?.icon;
  };

  const handleModuleClick = (route: RouteConfig) => {
    if (route.children && route.children.length > 0 && sidebarOpen) {
      toggleExpand(route.key);
      // Naviguer vers l'enfant par défaut
      if (route.defaultChild) {
        onModuleChange(route.key, route.defaultChild);
      } else {
        onModuleChange(route.key);
      }
    } else {
      onModuleChange(route.key);
    }
  };

  const handleSubModuleClick = (parentKey: string, childKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onModuleChange(parentKey, childKey);
  };

  return (
    <div className="flex flex-col h-full bg-sidebar-bg">
      {/* Header */}
      <div className="p-3 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <IconButton
            onClick={onToggleSidebar}
            icon={sidebarOpen ? X : Menu}
            variant="ghost"
            className="text-sidebar-text hover:text-content-primary"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          />
        </div>
        {sidebarOpen && (
          <div className="relative flex flex-col items-center py-1">
            <div className="absolute w-16 h-16 bg-accent/20 rounded-2xl blur-lg" style={{ transform: 'translate(4px, 4px)' }} />
            <div className="absolute w-16 h-16 bg-accent/15 rounded-2xl" style={{ transform: 'translate(2px, 2px)' }} />
            <div
              className="relative w-16 h-16 bg-white rounded-2xl flex items-center justify-center"
              style={{ boxShadow: '0 12px 28px -10px rgba(59, 130, 246, 0.35), 0 0 0 1px rgba(59, 130, 246, 0.1)' }}
            >
              <img
                src="/cofin-logo.png"
                alt="COFIN&CO-M Logo"
                className="w-12 h-12 object-contain"
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 pt-2 overflow-y-auto overflow-x-hidden no-scrollbar" role="navigation" aria-label="Menu principal">
        {sidebarOpen && (
          <div className="px-4 py-1 text-[11px] font-bold text-content-muted uppercase tracking-wider">
            {t('principal')}
          </div>
        )}

        {accessibleRoutes.map((route) => {
          const Icon = getMenuIcon(route.key);
          const isActive = currentModule === route.key;
          const isExpanded = expandedMenus.has(route.key);
          const hasChildren = route.children && route.children.length > 0;
          const accessibleChildren = route.children?.filter(c => canAccessRoute(c, userRole)) || [];
          const isDisabled = route.key === 'transfert' || route.key === 'bourse';

          return (
            <div key={route.key}>
              {/* Menu principal */}
              <Button
                onClick={() => {
                  if (isDisabled) return;
                  handleModuleClick(route);
                }}
                variant="ghost"
                fullWidth
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={isDisabled}
                className={`flex items-center gap-3 px-4 py-2.5 transition text-sm justify-start rounded-none ${
                    isActive
                    ? 'bg-sidebar-active border-l-2 border-sidebar-text-active text-sidebar-text-active font-medium'
                    : 'text-sidebar-text hover:text-content-primary hover:bg-sidebar-hover border-l-2 border-transparent'
                } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {Icon && <Icon size={18} className="shrink-0" aria-hidden="true" />}
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left truncate">{t(route.labelKey || route.key)}</span>
                    {isDisabled && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-warning-bg text-status-warning border border-status-warning/30">
                        Bientôt
                      </span>
                    )}
                    {hasChildren && accessibleChildren.length > 0 && (
                      <span className="text-content-muted shrink-0" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    )}
                  </>
                )}
              </Button>

              {/* Sous-menus */}
              {sidebarOpen && hasChildren && isExpanded && accessibleChildren.length > 0 && (
                <div className="bg-surface-muted/50 border-l-2 border-edge-subtle ml-4" role="menu">
                  {accessibleChildren.map((child) => {
                    const isChildActive = currentSubModule === child.key ||
                      (isActive && !currentSubModule && child.key === route.defaultChild);

                    return (
                      <Button
                        key={child.key}
                        onClick={(e) => handleSubModuleClick(route.key, child.key, e)}
                        variant="ghost"
                        fullWidth
                        size="sm"
                        role="menuitem"
                        aria-current={isChildActive ? 'page' : undefined}
                        className={`flex items-center gap-2 px-4 py-2 text-xs transition justify-start rounded-none ${
                          isChildActive
                            ? 'text-sidebar-text-active bg-sidebar-active font-medium'
                            : 'text-content-muted hover:text-content-primary hover:bg-sidebar-hover'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                        <span className="truncate">{t(child.labelKey || child.key)}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer - Bouton déconnexion distinctif */}
      <div className="border-t border-sidebar-border flex-shrink-0 p-3">
        <Button
          onClick={onLogout}
          variant="danger"
          fullWidth
          icon={LogOut}
          aria-label={t('deconnexion')}
          className="justify-start"
        >
          {sidebarOpen && <span className="text-sm font-medium">{t('deconnexion')}</span>}
        </Button>
      </div>
    </div>
  );
}
