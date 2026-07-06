import React, { useMemo } from 'react';
import {
  Bell,
  Clock,
  FileText,
  Calendar,
  Stethoscope,
  CheckCircle,
  X,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import { useHrAlerts, type HrAlert } from '../../hooks/hr/useHrAlerts';

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  FIN_PERIODE_ESSAI: { label: "Fin période d'essai", icon: Clock },
  EXPIRATION_CDD: { label: 'Expiration CDD', icon: FileText },
  DOCUMENT_EXPIRANT: { label: 'Document expirant', icon: FileText },
  ANNIVERSAIRE_TRAVAIL: { label: 'Anniversaire', icon: Calendar },
  VISITE_MEDICALE: { label: 'Visite médicale', icon: Stethoscope },
};

const MAX_VISIBLE = 10;

function getDaysRemaining(eventDate: string): number {
  const now = new Date();
  const event = new Date(eventDate);
  const diffMs = event.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function getUrgencyClass(days: number): string {
  if (days < 7) return 'border-l-4 border-status-danger';
  if (days < 15) return 'border-l-4 border-status-warning';
  return 'border-l-4 border-status-info';
}

function getUrgencyIconColor(days: number): string {
  if (days < 7) return 'text-status-danger';
  if (days < 15) return 'text-status-warning';
  return 'text-status-info';
}

function formatDaysLabel(days: number): string {
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `Dans ${days} jours`;
}

export default function HrAlertsPanel() {
  const { alerts, stats, loading, acknowledge, dismiss } = useHrAlerts();

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const daysA = getDaysRemaining(a.eventDate);
      const daysB = getDaysRemaining(b.eventDate);
      return daysA - daysB;
    });
  }, [alerts]);

  const visibleAlerts = sortedAlerts.slice(0, MAX_VISIBLE);
  const hasMore = sortedAlerts.length > MAX_VISIBLE;

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Bell className="text-content-muted animate-pulse" size={20} />
          <div className="h-5 w-48 bg-surface-subtle rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-subtle rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 pb-0 sm:pb-0">
        <div className="flex items-center gap-2">
          <Bell className="text-content-primary" size={20} />
          <h3 className="font-bold text-content-primary text-lg">Alertes à venir</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats.urgent > 0 && (
            <Badge variant="danger" size="sm" rawValue>
              {stats.urgent} urgent{stats.urgent > 1 ? 's' : ''}
            </Badge>
          )}
          {stats.warning > 0 && (
            <Badge variant="warning" size="sm" rawValue>
              {stats.warning} attention
            </Badge>
          )}
          {stats.info > 0 && (
            <Badge variant="info" size="sm" rawValue>
              {stats.info} info
            </Badge>
          )}
        </div>
      </div>

      {/* Alert list */}
      <div className="p-4 sm:p-6 pt-4">
        {visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-content-muted">
            <CheckCircle size={40} className="mb-3 opacity-50" />
            <p className="text-sm">Aucune alerte à venir</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onAcknowledge={acknowledge}
                onDismiss={dismiss}
              />
            ))}
          </ul>
        )}

        {hasMore && (
          <button className="flex items-center gap-1 mt-4 text-sm font-medium text-accent hover:underline mx-auto">
            Voir tout ({sortedAlerts.length} alertes)
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </Card>
  );
}

interface AlertRowProps {
  alert: HrAlert;
  onAcknowledge: (id: string) => Promise<unknown>;
  onDismiss: (args: { id: string; reason?: string }) => Promise<unknown>;
}

function AlertRow({ alert, onAcknowledge, onDismiss }: AlertRowProps) {
  const [acting, setActing] = React.useState(false);
  const days = getDaysRemaining(alert.eventDate);
  const config = ALERT_TYPE_CONFIG[alert.alertType] || {
    label: alert.alertType,
    icon: AlertTriangle,
  };
  const Icon = config.icon;
  const urgencyClass = getUrgencyClass(days);
  const iconColor = getUrgencyIconColor(days);

  const handleAcknowledge = async () => {
    setActing(true);
    try {
      await onAcknowledge(alert.id);
    } finally {
      setActing(false);
    }
  };

  const handleDismiss = async () => {
    setActing(true);
    try {
      await onDismiss({ id: alert.id });
    } finally {
      setActing(false);
    }
  };

  return (
    <li
      className={`flex items-center gap-3 p-3 rounded-lg bg-surface-elevated ${urgencyClass} transition-colors`}
    >
      <div className={`shrink-0 ${iconColor}`}>
        <Icon size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-content-primary truncate">
            {config.label}
          </span>
          <span className="text-xs text-content-muted">
            {formatDaysLabel(days)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-content-secondary truncate">
            {alert.employeNom}
          </span>
          {alert.eventLabel && (
            <span className="text-xs text-content-muted truncate hidden sm:inline">
              &mdash; {alert.eventLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="xs"
          icon={CheckCircle}
          disabled={acting}
          onClick={handleAcknowledge}
          title="Prendre en compte"
        >
          <span className="hidden sm:inline">Prendre en compte</span>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          icon={X}
          disabled={acting}
          onClick={handleDismiss}
          title="Écarter"
        />
      </div>
    </li>
  );
}
