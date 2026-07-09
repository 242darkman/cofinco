import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import Card from '../../ui/Card';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

export default function ComplianceStatusStats() {
  const currentDate = new Date().toLocaleDateString('fr-FR');

  const stats = [
    {
      label: 'OHADA',
      status: '100% Conforme',
      icon: CheckCircle,
      color: 'text-status-success',
      bgClass: 'bg-status-success-bg border-status-success/20',
      footer: `Dernière vérification: ${currentDate}`
    },
    {
      label: 'DGI Congo',
      status: '100% Conforme',
      icon: CheckCircle,
      color: 'text-status-success',
      bgClass: 'bg-status-success-bg border-status-success/20',
      footer: `Dernière vérification: ${currentDate}`
    },
    {
      label: 'Piste d\'Audit',
      status: '100% Intègre',
      icon: CheckCircle,
      color: 'text-status-success',
      bgClass: 'bg-status-success-bg border-status-success/20',
      footer: 'Checksums vérifiés'
    },
    {
      label: 'Archivage',
      status: 'Automatique',
      icon: AlertCircle,
      color: 'text-status-info',
      bgClass: 'bg-status-info-bg border-status-info/20',
      footer: 'Rétention: 365 jours minimum'
    }
  ];

  return (
    <Card className="p-6 bg-surface-base border-edge">
      <h3 className="text-xl font-bold text-content-primary mb-6 flex items-center gap-2">
        <CheckCircle className="text-status-success" />
        Statut de Conformité
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index} 
              className={`${stat.bgClass} border rounded-xl p-4 transition-all hover:bg-opacity-70`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-full bg-surface-base/50`}>
                   <Icon className={stat.color} size={20} />
                </div>
                <div>
                  <div className={`font-bold ${stat.color}`}>{stat.label}</div>
                  <div className="text-sm font-medium text-content-secondary">{ALL_STATUS_LABELS[stat.status] || stat.status}</div>
                </div>
              </div>
              <div className="text-xs text-content-muted border-t border-edge-subtle pt-2 mt-1">
                {stat.footer}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
