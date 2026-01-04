import React from 'react';
import { Users, Activity, BarChart3, Clock } from 'lucide-react';
import { ActivityStats } from '../../../hooks/useUserActivity';
import StatCard from '../../ui/StatCard';

interface ActivityStatsCardsProps {
  stats: ActivityStats;
}

export default function ActivityStatsCards({ stats }: ActivityStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Utilisateurs"
        value={stats.totalUsers}
        icon={Users}
        className="from-blue-500 to-cyan-500"
      />
      <StatCard
        title="Actifs Aujourd'hui"
        value={stats.activeToday}
        icon={Activity}
        className="from-green-500 to-emerald-500"
      />
      <StatCard
        title="Total Actions"
        value={stats.totalActions.toLocaleString()}
        icon={BarChart3}
        className="from-emerald-500 to-cyan-500"
      />
      <StatCard
        title="Moy. / Utilisateur"
        value={stats.avgActionsPerUser}
        icon={Clock}
        className="from-emerald-500 to-blue-500"
      />
    </div>
  );
}
