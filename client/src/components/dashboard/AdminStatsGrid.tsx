import React from 'react';
import { Users, CreditCard, PiggyBank, RefreshCw } from 'lucide-react';
import { StatCard } from '../ui';

interface AdminStatsGridProps {
  stats: {
    totalClients: number;
    clientsActifs: number;
    creditsEnCours: number;
    creditsEnAttente: number;
    totalEpargnes: number;
    montantEpargneTotal: number;
    tontinesActives: number;
    totalTontines: number;
  };
  recent: {
    nouveauxClients: number;
    nouveauxCredits: number;
  };
  t: (key: string) => string;
}

export default function AdminStatsGrid({ stats, recent, t }: AdminStatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        title={t('totalClients')}
        value={stats.totalClients || 0}
        subtitle={`${stats.clientsActifs || 0} ${t('activeClients')}`}
        icon={Users}
        color="primary"
        trend={recent.nouveauxClients ? `+${recent.nouveauxClients} ${t('cetteASemaine')}` : undefined}
        trendUp={true}
      />
      <StatCard
        title={t('creditsEnCours')}
        value={stats.creditsEnCours || 0}
        subtitle={`${stats.creditsEnAttente || 0} ${t('enAttente')}`}
        icon={CreditCard}
        color="success"
        trend={recent.nouveauxCredits ? `+${recent.nouveauxCredits} ${t('cetteASemaine')}` : undefined}
        trendUp={true}
      />
      <StatCard
        title={t('epargnes')}
        value={stats.totalEpargnes || 0}
        subtitle={new Intl.NumberFormat('fr-FR').format(stats.montantEpargneTotal || 0) + ' FCFA'}
        icon={PiggyBank}
        color="warning"
      />
      <StatCard
        title={t('tontinesActives')}
        value={stats.tontinesActives || 0}
        subtitle={`${t('surTotal')} ${stats.totalTontines || 0} ${t('total')}`}
        icon={RefreshCw}
        color="primary"
      />
    </div>
  );
}
