import React, { useState } from 'react';
import { Menu, Home, ChevronRight, Search, MessageCircle, User } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import NotificationBadge from '../shared/NotificationBadge';
import OfflineIndicator from '../shared/OfflineIndicator';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import ThemeToggle from '../ui/ThemeToggle';
import UserProfileDropdown from './UserProfileDropdown';

interface PlatformHeaderProps {
  breadcrumbs: string[];
  onGlobalSearch: () => void;
  onMessagesClick: () => void;
  onMenuToggle: () => void;
  onProfileClick: () => void;
  onLogout: () => void;
  user: {
    nom?: string;
    prenom?: string;
    email?: string;
    role?: string;
    photoProfile?: string;
    agence?: string;
  };
}

export default function PlatformHeader({
  breadcrumbs,
  onGlobalSearch,
  onMessagesClick,
  onMenuToggle,
  onProfileClick,
  onLogout,
  user
}: PlatformHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full xl:w-auto">
        <div className="md:hidden">
          <IconButton
            onClick={onMenuToggle}
            icon={Menu}
            aria-label="Menu"
          />
        </div>
        <div className="flex items-center gap-4 border-l border-edge pl-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              {t('cofinPlatform')}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-content-muted/80">
                {t('platformeMicrofinance')}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/20 to-transparent"></div>
            </div>
          </div>
        </div>

        <div className="hidden md:block h-10 w-px bg-edge"></div>

        <div className="hidden md:flex items-center gap-2 text-sm">
          <Home size={14} className="text-content-muted" />
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight size={12} className="text-content-muted" />}
              <span className={idx === breadcrumbs.length - 1 ? 'text-accent font-semibold' : 'text-content-muted'}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full xl:w-auto justify-between xl:justify-end">
        <div className="hidden sm:flex">
          <OfflineIndicator />
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        <div className="relative">
          <IconButton
            onClick={onGlobalSearch}
            icon={Search}
            aria-label="Recherche globale"
          />
        </div>

        <NotificationBadge />

        <div className="relative">
          <div className="relative inline-flex">
            <IconButton
              onClick={onMessagesClick}
              icon={MessageCircle}
              aria-label="Messages"
            />
            <span className="absolute top-1 right-1 w-2 h-2 bg-status-success rounded-full animate-pulse pointer-events-none"></span>
          </div>
        </div>



        <div className="relative xl:ml-auto">
          <UserProfileDropdown
            user={user}
            onProfileClick={onProfileClick}
            onLogout={onLogout}
          />
        </div>
      </div>
    </div>
  );
}
