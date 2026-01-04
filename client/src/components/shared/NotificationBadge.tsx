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

  // Click outside handler
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

  return (
    <div className="relative" ref={badgeRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowCenter(!showCenter)}
        className={`relative transition-colors ${showCenter ? 'bg-slate-800 text-white' : ''}`}
        title="Notifications"
        data-testid="button-notifications"
      >
        <Bell size={20} className={showCenter ? 'text-white' : 'text-slate-300'} />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1">
            <Badge 
              variant="primary"
              className="w-5 h-5 flex items-center justify-center p-0 text-xs animate-pulse bg-blue-600 hover:bg-blue-700 border-none text-white shadow-lg shadow-blue-500/20"
              data-testid="badge-notification-count"
              value={unreadCount > 9 ? '9+' : unreadCount.toString()}
            />
          </div>
        )}
      </Button>

      {showCenter && (
        <>
            {/* Mobile Backdrop & Modal */}
           <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm sm:hidden animate-in fade-in duration-200">
               <div className="w-full max-w-[350px]" onClick={e => e.stopPropagation()}>
                    <NotificationCenter onClose={() => {
                        setShowCenter(false);
                        fetchUnreadCount();
                    }} />
               </div>
           </div>

           {/* Desktop Dropdown */}
           <div className="hidden sm:block absolute right-0 top-full mt-2 z-50 origin-top-right">
              <NotificationCenter onClose={() => {
                setShowCenter(false);
                fetchUnreadCount();
              }} />
           </div>
        </>
      )}
    </div>
  );
}
