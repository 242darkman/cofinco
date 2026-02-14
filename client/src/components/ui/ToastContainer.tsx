import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastType } from '../../lib/toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: 'bg-status-success-bg',
    border: 'border-status-success/50',
    icon: 'text-status-success',
    text: 'text-status-success-text',
  },
  error: {
    bg: 'bg-status-danger-bg',
    border: 'border-status-danger/50',
    icon: 'text-status-danger',
    text: 'text-status-danger-text',
  },
  warning: {
    bg: 'bg-status-warning-bg',
    border: 'border-status-warning/50',
    icon: 'text-status-warning',
    text: 'text-status-warning-text',
  },
  info: {
    bg: 'bg-status-info-bg',
    border: 'border-status-info/50',
    icon: 'text-status-info',
    text: 'text-status-info-text',
  },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = icons[t.type];
        const color = colors[t.type];

        return (
          <div
            key={t.id}
            className={`
              pointer-events-auto
              ${color.bg} ${color.border}
              border rounded-lg p-4 shadow-lg backdrop-blur-sm
              animate-slide-in-right
              flex items-start gap-3
            `}
            role="alert"
          >
            <Icon className={`${color.icon} shrink-0 mt-0.5`} size={20} />
            <p className={`${color.text} text-sm flex-1 font-medium`}>{t.message}</p>
            <button
              onClick={() => toast.remove(t.id)}
              className="shrink-0 text-content-muted hover:text-content-primary transition-colors"
              aria-label="Fermer la notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
