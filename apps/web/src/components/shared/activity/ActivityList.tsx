import React from 'react';
import { UserActivity } from '../../../hooks/useUserActivity';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import LoadingSpinner from '../../ui/LoadingSpinner';

interface ActivityListProps {
  activities: UserActivity[];
  loading: boolean;
  dateDebut: string;
  setDateDebut: (date: string) => void;
  dateFin: string;
  setDateFin: (date: string) => void;
}

export default function ActivityList({ 
  activities, 
  loading,
  dateDebut,
  setDateDebut,
  dateFin,
  setDateFin
}: ActivityListProps) {
  return (
    <Card className="bg-surface p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h3 className="text-xl font-bold text-content-primary">Utilisateurs Actifs Récents</h3>
        <div className="flex gap-3 w-full md:w-auto">
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="flex-1 md:w-auto px-4 py-2 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="flex-1 md:w-auto px-4 py-2 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner size="lg" text="Chargement des activités..." />
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 md:mx-0">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full divide-y divide-edge">
              <thead className="bg-surface-elevated/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Utilisateur</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-content-secondary uppercase tracking-wider">Actions</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-content-secondary uppercase tracking-wider">Modules</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Dernière Activité</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge bg-transparent">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-content-muted">
                      Aucune activité trouvée pour cette période
                    </td>
                  </tr>
                ) : (
                  activities.map((activity, index) => (
                    <tr key={index} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-status-info flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-accent/20">
                            {activity.userEmail?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="text-sm font-medium text-content-primary">
                            {activity.userEmail || 'Utilisateur Inconnu'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="info" value={`${activity.totalActions} actions`} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="success" value={`${activity.modulesUsed} modules`} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-content-secondary">
                        {activity.lastActivity ? new Date(activity.lastActivity).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-content-secondary">
                        {activity.activityDate ? new Date(activity.activityDate).toLocaleDateString('fr-FR') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
