import type { ClientWithIdentity } from '@shared/schema';
import React, { useState, useEffect } from 'react';
import { AlertCircle, Info, X, ShieldAlert, BadgeCheck } from 'lucide-react';
import { Card, Badge } from '../ui';

interface ClientAlert {
  id: string;
  clientId: string;
  alertType: 'payment_overdue' | 'document_missing' | 'kyc_pending' | 'credit_late' | 'low_balance';
  alertLevel: 'info' | 'warning' | 'critical';
  message: string;
  isResolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

interface ClientAlertsProps {
  client: ClientWithIdentity;
  onUpdate?: () => void;
}

export default function ClientAlerts({ client, onUpdate }: ClientAlertsProps) {
  const [alerts, setAlerts] = useState<ClientAlert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, [client.id]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/alerts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement alertes');
      const data: ClientAlert[] = await res.json();
      setAlerts(data.sort((a, b) => {
        const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (levelOrder[a.alertLevel] ?? 3) - (levelOrder[b.alertLevel] ?? 3);
      }));
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertType: string) => {
    try {
      const res = await fetch(`/api/clients/${client.id}/alerts/${alertType}/resolve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur resolution alerte');

      setAlerts(prev => prev.filter(a => a.alertType !== alertType));
      onUpdate?.();
    } catch (error) {
      console.error('Erreur resolution alerte:', error);
    }
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'critical': return <ShieldAlert size={16} />;
      case 'warning': return <AlertCircle size={16} />;
      default: return <Info size={16} />;
    }
  };

  const getAlertVariant = (level: string) => {
    switch (level) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  const getAlertLabel = (level: string) => {
    switch (level) {
      case 'critical': return 'Critique';
      case 'warning': return 'Attention';
      default: return 'Information';
    }
  };

  const criticalAlerts = alerts.filter(a => a.alertLevel === 'critical');
  const warningAlerts = alerts.filter(a => a.alertLevel === 'warning');
  const infoAlerts = alerts.filter(a => a.alertLevel === 'info');

  return (
    <div className="space-y-4">
      {/* 1. Header & Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <Card variant="default" padding="sm" className={`flex items-center justify-between sm:block bg-status-danger-bg border-status-danger/20 ${criticalAlerts.length > 0 ? 'ring-1 ring-status-danger/50' : ''}`}>
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-status-danger font-semibold text-xs uppercase">
               <ShieldAlert size={14} /> Critiques
           </div>
           <p className="text-xl sm:text-2xl font-bold text-status-danger">{criticalAlerts.length}</p>
        </Card>

        <Card variant="default" padding="sm" className="flex items-center justify-between sm:block bg-status-warning-bg border-status-warning/20">
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-status-warning font-semibold text-xs uppercase">
               <AlertCircle size={14} /> Warning
           </div>
           <p className="text-xl sm:text-2xl font-bold text-status-warning">{warningAlerts.length}</p>
        </Card>

        <Card variant="default" padding="sm" className="flex items-center justify-between sm:block bg-status-info-bg border-status-info/20">
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-status-info font-semibold text-xs uppercase">
               <Info size={14} /> Infos
           </div>
           <p className="text-xl sm:text-2xl font-bold text-status-info">{infoAlerts.length}</p>
        </Card>
      </div>

      {/* 2. Main Alerts Feed */}
      <Card variant="default" padding="md">
        <h3 className="text-base font-bold text-content-primary mb-4 flex items-center gap-2">
            Alertes actives
            <Badge value={alerts.length} size="sm" variant={alerts.length > 0 ? 'warning' : 'neutral'} />
        </h3>

        {loading ? (
             <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-edge rounded-lg bg-surface/20">
            <div className="w-16 h-16 bg-status-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
                 <BadgeCheck size={32} className="text-status-success" />
            </div>
            <p className="text-status-success font-bold text-lg">Aucune alerte active</p>
            <p className="text-content-muted text-sm">Le client est en parfaite regle.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
               <Card key={alert.id} variant="default" padding="sm" className="bg-surface/30 hover:border-edge-strong transition-colors">
                 <div className="flex items-start gap-3">
                     <div className={`mt-0.5 p-1.5 rounded-lg ${
                         alert.alertLevel === 'critical' ? 'bg-status-danger-bg text-status-danger' :
                         alert.alertLevel === 'warning' ? 'bg-status-warning-bg text-status-warning' : 'bg-status-info-bg text-status-info'
                     }`}>
                         {getAlertIcon(alert.alertLevel)}
                     </div>

                     <div className="flex-1 min-w-0">
                         <div className="flex items-center justify-between mb-1">
                             <div className="flex items-center gap-2">
                                 <Badge
                                    value={getAlertLabel(alert.alertLevel)}
                                    variant={getAlertVariant(alert.alertLevel)}
                                    size="sm"
                                 />
                                 <span className="text-[10px] text-content-muted uppercase font-semibold hidden sm:inline-block">
                                     {new Date(alert.createdAt).toLocaleDateString()}
                                 </span>
                             </div>
                             <button
                                onClick={() => handleResolveAlert(alert.alertType)}
                                className="text-content-muted hover:text-content-primary p-1 hover:bg-surface-elevated/50 rounded transition"
                                title="Marquer comme resolu"
                             >
                                <X size={16} />
                             </button>
                         </div>
                         <p className="text-sm text-content-secondary leading-relaxed font-medium">
                             {alert.message}
                         </p>
                         <p className="text-[10px] text-content-muted mt-1 sm:hidden">
                             {new Date(alert.createdAt).toLocaleDateString()}
                         </p>
                     </div>
                 </div>
               </Card>
            ))}
          </div>
        )}
      </Card>

      {/* 3. Recommended Actions (Conditional) */}
      {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
          <Card variant="elevated" className="border-accent/30">
            <h3 className="text-sm font-bold text-accent mb-3 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} /> Actions Recommandees
            </h3>
            <ul className="space-y-2">
                {criticalAlerts.length > 0 && (
                    <li className="flex items-start gap-2 text-sm text-content-secondary bg-status-danger/5 p-2 rounded border border-status-danger/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-danger mt-1.5"></span>
                        <span>Contacter immediatement le client pour regularisation des paiements en retard.</span>
                    </li>
                )}
                 {warningAlerts.length > 0 && (
                    <li className="flex items-start gap-2 text-sm text-content-secondary bg-status-warning/5 p-2 rounded border border-status-warning/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-warning mt-1.5"></span>
                        <span>Profiter du prochain contact pour mettre a jour les documents manquants ou le score.</span>
                    </li>
                )}
            </ul>
          </Card>
      )}
    </div>
  );
}
