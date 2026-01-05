import React from 'react';
import { Activity, Shield, Calendar, RefreshCw } from 'lucide-react';
import { Card, IconButton } from '../ui';

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
  currentTime: Date;
  language: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
  getGreeting: () => string;
  getRoleLabel: (role: string) => string;
  t: (key: string) => string;
}

export default function DashboardHeader({
  userName,
  userRole,
  currentTime,
  language,
  onRefresh,
  isRefreshing = false,
  getGreeting,
  getRoleLabel,
  t
}: DashboardHeaderProps) {
  return (
    <Card variant="default" padding="sm">
      <div className="flex items-center justify-between gap-2">
        {/* User Info - Compact */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 bg-emerald-500/20 rounded-lg flex-shrink-0">
            <Activity className="text-emerald-400" size={16} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold truncate" data-testid="text-greeting">
              {getGreeting()}, {userName}!
            </h1>
            <p className="text-slate-500 text-[10px] sm:text-xs flex items-center gap-1">
              <Shield size={10} className="flex-shrink-0 text-slate-400" />
              <span className="truncate">{getRoleLabel(userRole)}</span>
            </p>
          </div>
        </div>

        {/* Time & Refresh - Compact Inline */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[9px] sm:text-[10px] text-slate-500 hidden sm:block">
            {currentTime.toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          <IconButton
            icon={RefreshCw}
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            aria-label="Rafraîchir"
            data-testid="button-refresh-stats"
            className={isRefreshing ? '[&_svg]:animate-spin' : ''}
            disabled={isRefreshing}
          />
        </div>
      </div>
    </Card>
  );
}
