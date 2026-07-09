import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

export default function NotificationBadge() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCenter, setShowCenter] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/notifications/unread', {
        credentials: 'include'
      });
      if (response.ok) {
        const notifications = await response.json();
        setUnreadCount(notifications.length);
      }
    } catch (error) {
      // Silent fail to avoid console spam
    }
  }, []);

  // Click outside handler (desktop only)
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (badgeRef.current && !badgeRef.current.contains(event.target as Node)) {
        setShowCenter(false);
      }
    };

    if (showCenter) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCenter]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCenter) setShowCenter(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showCenter]);

  // Polling + visibility
  useEffect(() => {
    fetchUnreadCount();
    intervalRef.current = setInterval(fetchUnreadCount, 60000);

    const handleVisibility = () => {
      if (!document.hidden) fetchUnreadCount();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchUnreadCount]);

  // Listen for WebSocket notification events for faster updates
  useEffect(() => {
    const handler = () => fetchUnreadCount();
    window.addEventListener('credit-update', handler);
    window.addEventListener('operations-update', handler);
    return () => {
      window.removeEventListener('credit-update', handler);
      window.removeEventListener('operations-update', handler);
    };
  }, [fetchUnreadCount]);

  // Prevent body scroll on mobile when panel is open
  useEffect(() => {
    if (showCenter) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showCenter]);

  const handleClose = useCallback(() => {
    setShowCenter(false);
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  return (
    <div className="relative" ref={badgeRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowCenter(!showCenter)}
        className={`relative transition-colors ${showCenter ? 'bg-surface text-content-primary' : ''}`}
        title="Notifications"
        data-testid="button-notifications"
      >
        <Bell size={20} className={showCenter ? 'text-content-primary' : 'text-content-secondary'} />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1">
            <Badge
              variant="primary"
              className="w-5 h-5 flex items-center justify-center p-0 text-xs animate-pulse bg-status-info hover:bg-status-info border-none text-white shadow-lg shadow-status-info/20"
              data-testid="badge-notification-count"
              value={unreadCount > 9 ? '9+' : unreadCount.toString()}
            />
          </div>
        )}
      </Button>

      {showCenter && (
        <>
          {/* Mobile: Full-screen slide-up panel */}
          <div
            className="fixed inset-0 z-50 sm:hidden animate-in fade-in duration-200"
            onClick={handleClose}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="absolute inset-x-0 bottom-0 top-12 animate-in slide-in-from-bottom-4 duration-300"
              onClick={e => e.stopPropagation()}
            >
              <NotificationCenter onClose={handleClose} fullHeight />
            </div>
          </div>

          {/* Desktop: Dropdown panel */}
          <div className="hidden sm:block absolute right-0 top-full mt-2 z-50 origin-top-right animate-in zoom-in-95 fade-in duration-200">
            <NotificationCenter onClose={handleClose} />
          </div>
        </>
      )}
    </div>
  );
}
