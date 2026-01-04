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
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/50',
    icon: 'text-emerald-400',
    text: 'text-emerald-300',
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/50',
    icon: 'text-red-400',
    text: 'text-red-300',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/50',
    icon: 'text-amber-400',
    text: 'text-amber-300',
  },
  info: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/50',
    icon: 'text-cyan-400',
    text: 'text-cyan-300',
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
              className="shrink-0 text-slate-400 hover:text-white transition-colors"
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
