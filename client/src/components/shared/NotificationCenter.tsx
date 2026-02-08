import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, X, CheckCircle, Calendar, CreditCard, Users, AlertTriangle, Settings, Info, Trash2, Check, Clock, ChevronRight, ClipboardCheck, Banknote } from 'lucide-react';
import { Badge, Button } from '../ui';
import clsx from 'clsx';

export interface Notification {
  id: string;
  userId: string | null;
  type: string;
  titre: string;
  message: string;
  lien: string | null;
  priorite: string;
  lue: boolean;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface NotificationCenterProps {
  onClose?: () => void;
  fullHeight?: boolean;
}

export default function NotificationCenter({ onClose, fullHeight }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, lue: true } : n)
        );
      }
    } catch (error) {
      console.error('Erreur marquage notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        credentials: 'include'
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, lue: true })));
      }
    } catch (error) {
      console.error('Erreur marquage notifications:', error);
    }
  };

  const deleteNotification = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }
    } catch (error) {
      console.error('Erreur suppression notification:', error);
    }
  };

  const getIcon = (type: string) => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case 'echeance': return <Calendar className={clsx(iconClass, "text-amber-500")} />;
      case 'credit': return <CreditCard className={clsx(iconClass, "text-emerald-500")} />;
      case 'tontine': return <Users className={clsx(iconClass, "text-purple-500")} />;
      case 'alerte': return <AlertTriangle className={clsx(iconClass, "text-red-500")} />;
      case 'system': return <Settings className={clsx(iconClass, "text-cyan-500")} />;
      case 'INVESTIGATION_ASSIGNED':
      case 'enquete': return <ClipboardCheck className={clsx(iconClass, "text-indigo-500")} />;
      case 'paiement':
      case 'remboursement': return <Banknote className={clsx(iconClass, "text-emerald-500")} />;
      default: return <Info className={clsx(iconClass, "text-blue-500")} />;
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.lue)
    : notifications;

  const unreadCount = notifications.filter(n => !n.lue).length;

  // Group notifications by date
  const groupedNotifications = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const map = new Map<string, Notification[]>();

    for (const n of filteredNotifications) {
      const date = new Date(n.createdAt);
      date.setHours(0, 0, 0, 0);

      let label: string;
      if (date.getTime() === today.getTime()) {
        label = "Aujourd'hui";
      } else if (date.getTime() === yesterday.getTime()) {
        label = 'Hier';
      } else {
        label = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      }

      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(n);
    }

    for (const [label, items] of map) {
      groups.push({ label, items });
    }

    return groups;
  }, [filteredNotifications]);

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <div
      className={clsx(
        "group relative p-3 sm:p-4 transition-all duration-200 hover:bg-slate-800/40",
        !notification.lue ? "bg-slate-800/20" : ""
      )}
    >
      <div className="flex gap-3">
        {/* Icon Container */}
        <div className={clsx(
          "flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg",
          "bg-slate-900 border border-slate-800"
        )}>
          {getIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h4 className={clsx(
              "text-sm font-semibold leading-tight",
              notification.lue ? "text-slate-400" : "text-slate-200"
            )}>
              {notification.titre}
            </h4>
            <span className="text-[10px] text-slate-500 whitespace-nowrap flex items-center gap-1 shrink-0">
              <Clock size={10} />
              {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-2 line-clamp-2">
            {notification.message}
          </p>

          {/* Actions & Meta */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notification.priorite === 'urgente' && (
                <Badge value="Urgent" variant="danger" size="sm" />
              )}
              {notification.type === 'echeance' && !notification.lue && (
                <span className="text-[10px] font-medium text-amber-500 flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  <AlertTriangle size={10} />
                  A traiter
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity sm:translate-y-1 sm:group-hover:translate-y-0 duration-200">
               {!notification.lue && (
                <button
                  onClick={(e) => markAsRead(notification.id, e)}
                  title="Marquer comme lu"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  <Check size={14} />
                </button>
              )}
              <button
                onClick={(e) => deleteNotification(notification.id, e)}
                title="Supprimer"
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unread Indicator */}
      {!notification.lue && (
        <div className="absolute top-3 right-2 sm:top-4 w-2 h-2 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50 animate-pulse" />
      )}
    </div>
  );

  return (
    <div className={clsx(
      "flex flex-col bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl overflow-hidden",
      fullHeight
        ? "h-full rounded-t-2xl"
        : "h-auto max-h-[min(80vh,600px)] rounded-2xl w-full sm:w-[380px] md:w-[420px]"
    )}>
      {/* Header */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
             <div className="relative">
                <Bell size={20} className="text-blue-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse ring-2 ring-slate-900" />
                )}
             </div>
             <div>
               <h3 className="font-bold text-white text-sm">Notifications</h3>
               <p className="text-[10px] text-slate-400 font-medium">
                 {unreadCount} non {unreadCount > 1 ? 'lues' : 'lue'}
               </p>
             </div>
          </div>

          <div className="flex gap-1">
             <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="h-8 w-8 p-0 rounded-full hover:bg-blue-500/10 hover:text-blue-400 text-slate-400"
                title="Tout marquer comme lu"
             >
                <CheckCircle size={16} />
             </Button>

             {onClose && (
                <Button
                   variant="ghost"
                   size="sm"
                   onClick={onClose}
                   className="h-8 w-8 p-0 rounded-full hover:bg-slate-800 text-slate-400"
                >
                   <X size={16} />
                </Button>
             )}
          </div>
        </div>

        {/* Filters - Segmented Control Style */}
        <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800">
           <button
             onClick={() => setFilter('all')}
             className={clsx(
               "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
               filter === 'all'
                 ? "bg-slate-800 text-white shadow-sm"
                 : "text-slate-500 hover:text-slate-300"
             )}
           >
             Toutes
           </button>
           <button
             onClick={() => setFilter('unread')}
             className={clsx(
               "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 relative",
               filter === 'unread'
                 ? "bg-slate-800 text-white shadow-sm"
                 : "text-slate-500 hover:text-slate-300"
             )}
           >
             Non lues
             {unreadCount > 0 && filter !== 'unread' && (
                <span className="ml-1.5 text-[9px] bg-blue-500 text-white px-1 rounded-full">
                  {unreadCount}
                </span>
             )}
           </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain bg-slate-950/30"
      >
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
             <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
             <p className="text-xs text-slate-500">Chargement...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 px-4 text-center">
             <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4 ring-1 ring-slate-800 shadow-xl">
               <Bell className="text-slate-600 opacity-50" size={32} />
             </div>
             <p className="text-slate-300 font-medium text-sm mb-1">
               {filter === 'unread' ? 'Tout est a jour !' : 'Aucune notification'}
             </p>
             <p className="text-slate-500 text-xs max-w-[200px]">
               {filter === 'unread'
                 ? "Vous avez lu toutes vos notifications importantes."
                 : "Les nouvelles activites apparaitront ici."}
             </p>
             {filter === 'unread' && (
               <button
                 onClick={() => setFilter('all')}
                 className="mt-4 text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
               >
                 Voir l'historique <ChevronRight size={12} />
               </button>
             )}
          </div>
        ) : (
          <div>
            {groupedNotifications.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800/50">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {group.items.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
         <div className="flex-shrink-0 p-3 border-t border-slate-800 bg-slate-900/50 text-center">
            {filter === 'all' && (
                <p className="text-[10px] text-slate-500">
                    Les notifications sont conservees pendant 30 jours
                </p>
            )}
         </div>
      )}
    </div>
  );
}
