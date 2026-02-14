import React, { useState } from 'react';
import { Search, Globe, User, ChevronDown, Shield } from 'lucide-react';
import NotificationBadge from '../shared/NotificationBadge';
import { SystemRole, getRoleLabel, normalizeRole } from '@shared/types/roles';

interface HeaderProps {
  language: string;
  onChangeLanguage: (lang: string) => void;
  user?: {
    name: string;
    role: string;
    email?: string;
  };
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
}

export default function Header({
  language,
  onChangeLanguage,
  user,
  onProfileClick,
  onSettingsClick
}: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const getRoleBadgeColor = (role: string) => {
    // Professional blue-based palette for institutional consistency
    const normalizedRole = normalizeRole(role);
    switch (normalizedRole) {
      case SystemRole.ADMIN:
        return 'bg-surface text-white border-edge';
      case SystemRole.COMPTABLE:
        return 'bg-status-info text-white border-status-info';
      case SystemRole.CHEF_AGENCE:
        return 'bg-status-info text-white border-status-info';
      case SystemRole.SUPERVISEUR:
        return 'bg-status-info text-white border-status-info';
      default:
        return 'bg-status-info-bg text-status-info border-status-info/30';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-surface-base border-b border-edge shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3">
        {/* Search */}
        <div className="hidden md:flex items-center flex-1 max-w-xl">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
            <input
              type="text"
              placeholder="Rechercher un client, crédit, transaction..."
              className="w-full pl-11 pr-4 py-2.5 bg-input-bg border border-input-border rounded-xl focus:outline-none focus:ring-2 focus:ring-status-info/20 focus:border-status-info text-sm text-content-primary placeholder:text-content-muted transition-all duration-200"
              data-testid="input-search-global"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1 md:gap-2 ml-auto">
          {/* Security indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-status-success-bg text-status-success rounded-lg text-xs font-medium border border-status-success/30">
            <Shield size={14} />
            <span>Sécurisé</span>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2.5 rounded-xl hover:bg-surface transition-colors flex items-center gap-1.5"
              data-testid="button-language"
            >
              <Globe size={18} className="text-content-secondary" />
              <span className="hidden sm:inline text-sm font-medium text-content-secondary">
                {language.toUpperCase()}
              </span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-surface-base rounded-xl shadow-lg border border-edge py-1">
                <button
                  onClick={() => {
                    onChangeLanguage('fr');
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface transition-colors ${
                    language === 'fr' ? 'text-status-info font-semibold bg-status-info-bg' : 'text-content-secondary'
                  }`}
                >
                  🇫🇷 Français
                </button>
                <button
                  onClick={() => {
                    onChangeLanguage('en');
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface transition-colors ${
                    language === 'en' ? 'text-status-info font-semibold bg-status-info-bg' : 'text-content-secondary'
                  }`}
                >
                  🇬🇧 English
                </button>
              </div>
            )}
          </div>

          {/* Notifications */}
          <NotificationBadge />

          {/* Divider */}
          <div className="hidden md:block w-px h-8 bg-edge mx-2" />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface transition-colors"
              data-testid="button-user-menu"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-status-info to-status-info flex items-center justify-center shadow-sm">
                <User size={18} className="text-white" />
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-semibold text-content-primary">
                  {user?.name || 'Utilisateur'}
                </p>
                <p className="text-xs text-content-muted">
                  {getRoleLabel(user?.role || '')}
                </p>
              </div>
              <ChevronDown size={16} className="hidden lg:block text-content-muted" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-surface-base rounded-xl shadow-xl border border-edge overflow-hidden">
                <div className="px-4 py-4 bg-gradient-to-r from-surface to-surface-base border-b border-edge">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-status-info to-status-info flex items-center justify-center">
                      <User size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-content-primary">
                        {user?.name || 'Utilisateur'}
                      </p>
                      <p className="text-xs text-content-muted">
                        {user?.email || 'email@cofin.cg'}
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-md border ${getRoleBadgeColor(user?.role || '')}`}>
                        {getRoleLabel(user?.role || '')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowUserMenu(false);
                      if (onProfileClick) {
                        onProfileClick();
                      }
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-content-secondary hover:bg-surface cursor-pointer transition-colors"
                  >
                    Mon profil
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowUserMenu(false);
                      if (onSettingsClick) {
                        onSettingsClick();
                      }
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-content-secondary hover:bg-surface cursor-pointer transition-colors"
                  >
                    Paramètres
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full pl-11 pr-4 py-2.5 bg-input-bg border border-input-border rounded-xl focus:outline-none focus:ring-2 focus:ring-status-info/20 focus:border-status-info text-sm text-content-primary placeholder:text-content-muted"
          />
        </div>
      </div>
    </header>
  );
}
