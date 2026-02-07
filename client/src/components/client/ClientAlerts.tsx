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
        <Card variant="default" padding="sm" className={`flex items-center justify-between sm:block bg-red-500/10 border-red-500/20 ${criticalAlerts.length > 0 ? 'ring-1 ring-red-500/50' : ''}`}>
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-red-400 font-semibold text-xs uppercase">
               <ShieldAlert size={14} /> Critiques
           </div>
           <p className="text-xl sm:text-2xl font-bold text-red-500">{criticalAlerts.length}</p>
        </Card>

        <Card variant="default" padding="sm" className="flex items-center justify-between sm:block bg-amber-500/10 border-amber-500/20">
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-amber-400 font-semibold text-xs uppercase">
               <AlertCircle size={14} /> Warning
           </div>
           <p className="text-xl sm:text-2xl font-bold text-amber-500">{warningAlerts.length}</p>
        </Card>

        <Card variant="default" padding="sm" className="flex items-center justify-between sm:block bg-blue-500/10 border-blue-500/20">
           <div className="flex items-center gap-2 mb-0 sm:mb-1 text-blue-400 font-semibold text-xs uppercase">
               <Info size={14} /> Infos
           </div>
           <p className="text-xl sm:text-2xl font-bold text-blue-500">{infoAlerts.length}</p>
        </Card>
      </div>

      {/* 2. Main Alerts Feed */}
      <Card variant="default" padding="md">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            Alertes actives
            <Badge value={alerts.length} size="sm" variant={alerts.length > 0 ? 'warning' : 'neutral'} />
        </h3>

        {loading ? (
             <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-700 rounded-lg bg-slate-800/20">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                 <BadgeCheck size={32} className="text-emerald-500" />
            </div>
            <p className="text-emerald-400 font-bold text-lg">Aucune alerte active</p>
            <p className="text-slate-400 text-sm">Le client est en parfaite regle.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
               <Card key={alert.id} variant="default" padding="sm" className="bg-slate-800/30 hover:border-slate-600 transition-colors">
                 <div className="flex items-start gap-3">
                     <div className={`mt-0.5 p-1.5 rounded-lg ${
                         alert.alertLevel === 'critical' ? 'bg-red-500/10 text-red-400' :
                         alert.alertLevel === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
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
                                 <span className="text-[10px] text-slate-500 uppercase font-semibold hidden sm:inline-block">
                                     {new Date(alert.createdAt).toLocaleDateString()}
                                 </span>
                             </div>
                             <button
                                onClick={() => handleResolveAlert(alert.alertType)}
                                className="text-slate-400 hover:text-white p-1 hover:bg-slate-700/50 rounded transition"
                                title="Marquer comme resolu"
                             >
                                <X size={16} />
                             </button>
                         </div>
                         <p className="text-sm text-slate-300 leading-relaxed font-medium">
                             {alert.message}
                         </p>
                         <p className="text-[10px] text-slate-500 mt-1 sm:hidden">
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
          <Card variant="elevated" className="border-cyan-500/30">
            <h3 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} /> Actions Recommandees
            </h3>
            <ul className="space-y-2">
                {criticalAlerts.length > 0 && (
                    <li className="flex items-start gap-2 text-sm text-slate-300 bg-red-500/5 p-2 rounded border border-red-500/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5"></span>
                        <span>Contacter immediatement le client pour regularisation des paiements en retard.</span>
                    </li>
                )}
                 {warningAlerts.length > 0 && (
                    <li className="flex items-start gap-2 text-sm text-slate-300 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5"></span>
                        <span>Profiter du prochain contact pour mettre a jour les documents manquants ou le score.</span>
                    </li>
                )}
            </ul>
          </Card>
      )}
    </div>
  );
}
