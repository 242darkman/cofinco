import React, { useState, useEffect, memo } from 'react';
import { Users, TrendingUp, TrendingDown, Award, DollarSign, Activity, Calendar, Target, PieChart, BarChart3 } from 'lucide-react';
import { clientApi, type ClientStatsResponse } from '../../lib/api-client';

// P5.8: Memoized distribution bar component to prevent unnecessary re-renders
interface DistributionBarProps {
  name: string;
  value: number;
  color: string;
  percentage: string;
}

const DistributionBar = memo(function DistributionBar({ name, value, color, percentage }: DistributionBarProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-content-secondary">{name}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {value} ({percentage}%)
        </span>
      </div>
      <div className="w-full bg-surface-elevated/50 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all shadow-[0_0_10px_rgba(0,0,0,0.2)]"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}40`
          }}
        />
      </div>
    </div>
  );
});

export default function ClientStatsDashboard() {
  const [stats, setStats] = useState<ClientStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await clientApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    } finally {
      setLoading(false);
    }
  };

  // Computed values for display
  const total = stats?.totalClients || 0;
  const actifs = stats?.activeClients || 0;
  const suspendus = stats?.suspendedClients || 0;
  const inactifs = stats?.inactiveClients || 0;
  const nouveauxCeMois = stats?.newClientsThisMonth || 0;
  const vip = stats?.segmentDistribution.vip || 0;
  const premium = stats?.segmentDistribution.premium || 0;
  const standard = stats?.segmentDistribution.standard || 0;
  const creditTotal = stats?.financialSummary.totalCredit || 0;
  const epargneTotal = stats?.financialSummary.totalEpargne || 0;
  const tauxRemboursementMoyen = stats?.financialSummary.avgRepaymentRate || 0;
  const pointsFideliteTotal = stats?.financialSummary.totalLoyaltyPoints || 0;

  const segmentDistribution = [
    { name: 'VIP', value: vip, color: '#fbbf24', percentage: total > 0 ? ((vip / total) * 100).toFixed(1) : '0' },
    { name: 'Premium', value: premium, color: '#8b5cf6', percentage: total > 0 ? ((premium / total) * 100).toFixed(1) : '0' },
    { name: 'Standard', value: standard, color: '#3b82f6', percentage: total > 0 ? ((standard / total) * 100).toFixed(1) : '0' }
  ];

  const statusDistribution = [
    { name: 'Actifs', value: actifs, color: '#10b981', percentage: total > 0 ? ((actifs / total) * 100).toFixed(1) : '0' },
    { name: 'Suspendus', value: suspendus, color: '#f59e0b', percentage: total > 0 ? ((suspendus / total) * 100).toFixed(1) : '0' },
    { name: 'Inactifs', value: inactifs, color: '#ef4444', percentage: total > 0 ? ((inactifs / total) * 100).toFixed(1) : '0' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-content-muted">Chargement des statistiques...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-0">

      {/* Stats Grid - Fully Responsive No Scroll */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-status-info/10 to-surface-base border border-status-info/30 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-status-info-bg rounded-lg">
              <Users size={18} className="text-status-info" />
            </div>
            <TrendingUp className="text-status-success" size={16} />
          </div>
          <div>
            <p className="text-content-muted text-xs font-medium uppercase tracking-wider mb-1">Total Clients</p>
            <p className="text-2xl sm:text-3xl font-bold text-content-primary">{total}</p>
            <p className="text-xs text-status-info/80 mt-1 font-medium flex items-center gap-1">
              <span className="bg-status-info-bg px-1.5 py-0.5 rounded">+{nouveauxCeMois}</span>
              <span className="text-content-muted">ce mois</span>
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-status-success/10 to-surface-base border border-status-success/30 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-status-success-bg rounded-lg">
              <Activity size={18} className="text-status-success" />
            </div>
            <TrendingUp className="text-status-success" size={16} />
          </div>
          <div>
            <p className="text-content-muted text-xs font-medium uppercase tracking-wider mb-1">Clients Actifs</p>
            <p className="text-2xl sm:text-3xl font-bold text-status-success">{actifs}</p>
            <p className="text-xs text-status-success/80 mt-1 font-medium">
              {total > 0 ? ((actifs / total) * 100).toFixed(1) : 0}% du total
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-status-info/10 to-surface-base border border-status-info/30 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-status-info-bg rounded-lg">
              <Target size={18} className="text-status-info" />
            </div>
            <TrendingUp className="text-status-success" size={16} />
          </div>
          <div>
            <p className="text-content-muted text-xs font-medium uppercase tracking-wider mb-1">Remboursement</p>
            <p className="text-2xl sm:text-3xl font-bold text-status-info">{tauxRemboursementMoyen}%</p>
            <p className="text-xs text-status-info/80 mt-1 font-medium">
              Moyen global
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface/80 backdrop-blur border border-edge rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-content-primary flex items-center gap-2">
            <PieChart size={18} className="text-accent" />
            Répartition par Segment
          </h3>

          <div className="space-y-4">
            {segmentDistribution.map((segment) => (
              <DistributionBar
                key={segment.name}
                name={segment.name}
                value={segment.value}
                color={segment.color}
                percentage={segment.percentage}
              />
            ))}
          </div>

        </div>

        <div className="bg-surface/80 backdrop-blur border border-edge rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-content-primary flex items-center gap-2">
            <BarChart3 size={18} className="text-accent" />
            Répartition par Statut
          </h3>

          <div className="space-y-4">
            {statusDistribution.map((status) => (
              <DistributionBar
                key={status.name}
                name={status.name}
                value={status.value}
                color={status.color}
                percentage={status.percentage}
              />
            ))}
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-content-primary flex items-center gap-2">
            <DollarSign size={18} className="text-accent" />
            Finances
          </h3>

          <div className="space-y-4">
            <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Crédits Total</p>
              <p className="text-xl font-bold text-status-info">{creditTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Épargnes Total</p>
              <p className="text-xl font-bold text-status-success">{epargneTotal.toLocaleString()} FCFA</p>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs">
               <span className="text-content-muted">Total Actifs:</span>
               <span className="font-bold text-accent">{(creditTotal + epargneTotal).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-content-primary flex items-center gap-2">
            <Award size={18} className="text-accent" />
            Fidélité
          </h3>

          <div className="space-y-4">
             <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Points Total</p>
              <p className="text-xl font-bold text-accent">{pointsFideliteTotal.toLocaleString()}</p>
            </div>

            <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Moyenne / Client</p>
              <p className="text-xl font-bold text-accent">
                {total > 0 ? Math.round(pointsFideliteTotal / total) : 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold mb-4 text-content-primary flex items-center gap-2">
            <Calendar size={18} className="text-accent" />
            Croissance
          </h3>

           <div className="space-y-4">
            <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Nouveaux (Mois)</p>
              <p className="text-xl font-bold text-status-success">+{nouveauxCeMois}</p>
            </div>

            <div className="bg-surface-elevated/30 p-3 rounded-lg border border-edge-subtle">
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Clients Suspendus</p>
              <p className="text-xl font-bold text-status-warning">{suspendus}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-4 sm:p-6 shadow-lg">
        <h3 className="text-base font-bold mb-4 text-content-primary">Résumé Exécutif</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-status-success text-sm flex items-center gap-2">
              <TrendingUp size={16} /> Points Forts
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-content-secondary">
              <li className="flex items-start gap-2 bg-surface-elevated/30 p-2 rounded">
                <span className="text-status-success mt-0.5">•</span>
                <span>{actifs} clients actifs ({total > 0 ? ((actifs / total) * 100).toFixed(1) : 0}%)</span>
              </li>
              <li className="flex items-start gap-2 bg-surface-elevated/30 p-2 rounded">
                <span className="text-status-success mt-0.5">•</span>
                <span>Taux de remboursement: <span className="text-content-primary font-bold">{tauxRemboursementMoyen}%</span></span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-status-warning text-sm flex items-center gap-2">
              <TrendingDown size={16} /> Points d'Attention
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-content-secondary">
               <li className="flex items-start gap-2 bg-surface-elevated/30 p-2 rounded">
                <span className="text-status-warning mt-0.5">•</span>
                <span>{suspendus} clients suspendus à vérifier</span>
              </li>
              <li className="flex items-start gap-2 bg-surface-elevated/30 p-2 rounded">
                <span className="text-status-warning mt-0.5">•</span>
                <span>{inactifs} clients inactifs</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
