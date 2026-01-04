import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import Card from '../../ui/Card';

export default function ComplianceStatusStats() {
  const currentDate = new Date().toLocaleDateString('fr-FR');

  const stats = [
    {
      label: 'OHADA',
      status: '100% Conforme',
      icon: CheckCircle,
      color: 'text-green-400',
      bgClass: 'bg-green-500/10 border-green-500/20',
      footer: `Dernière vérification: ${currentDate}`
    },
    {
      label: 'DGI Congo',
      status: '100% Conforme',
      icon: CheckCircle,
      color: 'text-green-400',
      bgClass: 'bg-green-500/10 border-green-500/20',
      footer: `Dernière vérification: ${currentDate}`
    },
    {
      label: 'Piste d\'Audit',
      status: '100% Intègre',
      icon: CheckCircle,
      color: 'text-green-400',
      bgClass: 'bg-green-500/10 border-green-500/20',
      footer: 'Checksums vérifiés'
    },
    {
      label: 'Archivage',
      status: 'Automatique',
      icon: AlertCircle,
      color: 'text-blue-400',
      bgClass: 'bg-blue-500/10 border-blue-500/20',
      footer: 'Rétention: 365 jours minimum'
    }
  ];

  return (
    <Card className="p-6 bg-slate-900 border-slate-800">
      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <CheckCircle className="text-emerald-500" />
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
                <div className={`p-2 rounded-full bg-slate-900/50`}>
                   <Icon className={stat.color} size={20} />
                </div>
                <div>
                  <div className={`font-bold ${stat.color}`}>{stat.label}</div>
                  <div className="text-sm font-medium text-slate-200">{stat.status}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400 border-t border-slate-700/50 pt-2 mt-1">
                {stat.footer}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
