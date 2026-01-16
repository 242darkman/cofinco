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
        return 'bg-slate-800 text-white border-slate-700';
      case SystemRole.COMPTABLE:
        return 'bg-blue-700 text-white border-blue-600';
      case SystemRole.CHEF_AGENCE:
        return 'bg-blue-600 text-white border-blue-500';
      case SystemRole.SUPERVISEUR:
        return 'bg-blue-500 text-white border-blue-400';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm transition-colors duration-300 dark:bg-slate-900 dark:border-slate-700">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3">
        {/* Search */}
        <div className="hidden md:flex items-center flex-1 max-w-xl">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher un client, crédit, transaction..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              data-testid="input-search-global"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1 md:gap-2 ml-auto">
          {/* Security indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium border border-emerald-200">
            <Shield size={14} />
            <span>Sécurisé</span>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2.5 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5 dark:hover:bg-slate-800"
              data-testid="button-language"
            >
              <Globe size={18} className="text-slate-600 dark:text-slate-300" />
              <span className="hidden sm:inline text-sm font-medium text-slate-600 dark:text-slate-300">
                {language.toUpperCase()}
              </span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-white rounded-xl shadow-lg border border-slate-200 py-1 dark:bg-slate-800 dark:border-slate-700">
                <button
                  onClick={() => {
                    onChangeLanguage('fr');
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors dark:hover:bg-slate-700 ${
                    language === 'fr' ? 'text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  🇫🇷 Français
                </button>
                <button
                  onClick={() => {
                    onChangeLanguage('en');
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors dark:hover:bg-slate-700 ${
                    language === 'en' ? 'text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30' : 'text-slate-700 dark:text-slate-300'
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
          <div className="hidden md:block w-px h-8 bg-slate-200 mx-2 dark:bg-slate-700" />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors dark:hover:bg-slate-800"
              data-testid="button-user-menu"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <User size={18} className="text-white" />
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {user?.name || 'Utilisateur'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {getRoleLabel(user?.role || '')}
                </p>
              </div>
              <ChevronDown size={16} className="hidden lg:block text-slate-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                <div className="px-4 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 dark:from-slate-800 dark:to-slate-800 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                      <User size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {user?.name || 'Utilisateur'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
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
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors dark:text-slate-300 dark:hover:bg-slate-700"
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
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors dark:text-slate-300 dark:hover:bg-slate-700"
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
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
      </div>
    </header>
  );
}
