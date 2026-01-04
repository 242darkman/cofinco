import React, { useState } from 'react';
import { Menu, Home, ChevronRight, Search, MessageCircle, Settings, User } from 'lucide-react';
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
  onSettingsClick: () => void;
  onLogout: () => void;
  user: {
    nom?: string;
    prenom?: string; // Add prenom to interface
    email?: string;
    role?: string;
  };
}

export default function PlatformHeader({
  breadcrumbs,
  onGlobalSearch,
  onMessagesClick,
  onMenuToggle,
  onProfileClick,
  onSettingsClick,
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
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-status-success rounded-full animate-pulse shadow-lg shadow-status-success/50"></div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-accent">{t('cofinPlatform')}</h2>
            <p className="text-content-muted text-xs font-medium">{t('platformeMicrofinance')}</p>
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

        <IconButton
          onClick={onSettingsClick}
          icon={Settings}
          aria-label="Paramètres"
        />

        <div className="relative xl:ml-auto">
          <UserProfileDropdown 
            user={user}
            onProfileClick={onProfileClick}
            onSettingsClick={onSettingsClick}
            onLogout={onLogout}
          />
        </div>
      </div>
    </div>
  );
}
