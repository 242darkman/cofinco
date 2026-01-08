import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, DollarSign, CheckCircle, AlertTriangle, Calendar, Activity, ArrowRight } from 'lucide-react';
import { Card, ProgressBar } from '../../ui';

interface TontineDashboardProps {
  tontineId: string;
  montantContribution: number;
  nombreMembres: number;
  tourActuel: number;
}

interface Stats {
  totalContributions: number;
  totalDistributions: number;
  membresActifs: number;
  membresEnRetard: number;
  tauxParticipation: number;
  prochainBeneficiaire: string | null;
  contributionsTourActuel: number;
  contributionsAttendues: number;
}

export default function TontineDashboard({
  tontineId,
  montantContribution,
  nombreMembres,
  tourActuel
}: TontineDashboardProps) {
  const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const totalMembres = toNumber(nombreMembres);
  const currentTour = toNumber(tourActuel);
  const contributionAmount = toNumber(montantContribution);
  const [stats, setStats] = useState<Stats>({
    totalContributions: 0,
    totalDistributions: 0,
    membresActifs: 0,
    membresEnRetard: 0,
    tauxParticipation: 0,
    prochainBeneficiaire: null,
    contributionsTourActuel: 0,
    contributionsAttendues: 0
  });
  const [loading, setLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
  }, [tontineId, tourActuel]);

  const fetchStats = async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const [contribRes, membresRes] = await Promise.all([
        fetch(`/api/tontines/${tontineId}/contributions`, { credentials: 'include' }),
        fetch(`/api/tontines/${tontineId}/membres`, { credentials: 'include' })
      ]);

      if (!contribRes.ok || !membresRes.ok) {
        throw new Error('Erreur lors du chargement des données');
      }

      const contribData = await contribRes.json();
      const membresData = await membresRes.json();

      const totalContributions = contribData?.reduce((sum: number, c: any) => sum + (Number(c.montant) || 0), 0) || 0;
      const totalDistributions = 0;
      const membresActifs = membresData?.filter((m: any) => m.status === 'Actif').length || 0;

      const contributionsTourActuel = contribData?.filter((c: any) => c.tour_numero === currentTour).length || 0;
      const contributionsAttendues = membresActifs;

      const tauxParticipation = contributionsAttendues > 0
        ? (contributionsTourActuel / contributionsAttendues) * 100
        : 0;

      const membresEnRetard = membresData?.filter(
        (m: any) =>
          m.status === 'Actif' &&
          (m.montant_total_contribue || 0) < (currentTour * contributionAmount),
      ).length || 0;

      const prochainBeneficiaire = membresData?.find((m: any) => !m.a_recu_benefice)?.clients?.nom || null;

      setStats({
        totalContributions,
        totalDistributions,
        membresActifs,
        membresEnRetard,
        tauxParticipation,
        prochainBeneficiaire,
        contributionsTourActuel,
        contributionsAttendues
      });
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    if (!tontineId) return;
    try {
      const contribRes = await fetch(`/api/tontines/${tontineId}/contributions`, { credentials: 'include' });
      if (!contribRes.ok) return;

      const contribData = await contribRes.json();

      const combined = (contribData || [])
        .slice(0, 8)
        .map((c: any) => ({
          type: 'contribution',
          montant: Number(c.montant),
          date: c.date_contribution || c.created_at || c.createdAt, 
          nom: c.client?.nom || c.tontine_membres?.clients?.nom || 'Inconnu'
        }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setRecentActivity(combined);
    } catch (error) {
      console.error('Erreur activité récente:', error);
    }
  };

  const soldeNet = stats.totalContributions - stats.totalDistributions;
  const progressionTour = stats.contributionsAttendues > 0
    ? (stats.contributionsTourActuel / stats.contributionsAttendues) * 100
    : 0;
  
  const montantMoyen = stats.membresActifs > 0 
    ? Math.round(stats.totalContributions / stats.membresActifs) 
    : 0;

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Chargement du dashboard...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-green-400 text-xs sm:text-sm font-semibold truncate">Total Contributions</div>
            <TrendingUp className="text-green-400 shrink-0" size={18} />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white mb-1 truncate">
            {stats.totalContributions.toLocaleString()} <span className="text-xs sm:text-sm font-normal text-slate-400">FCFA</span>
          </div>
          <div className="text-[10px] sm:text-xs text-green-400/80 font-medium">
            <span className="bg-green-500/20 px-1.5 py-0.5 rounded text-[10px] mr-1">+{stats.contributionsTourActuel}</span>
            sur ce tour
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-emerald-400 text-xs sm:text-sm font-semibold truncate">Total Distribué</div>
            <DollarSign className="text-emerald-400 shrink-0" size={18} />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white mb-1 truncate">
            {stats.totalDistributions.toLocaleString()} <span className="text-xs sm:text-sm font-normal text-slate-400">FCFA</span>
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-400/80 font-medium truncate">
            Solde: {soldeNet.toLocaleString()} FCFA
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-blue-400 text-xs sm:text-sm font-semibold truncate">Membres Actifs</div>
            <Users className="text-blue-400 shrink-0" size={18} />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white mb-1">
            {stats.membresActifs}<span className="text-slate-500 text-sm">/{totalMembres}</span>
          </div>
          <div className="text-[10px] sm:text-xs text-blue-400/80 font-medium">
            {totalMembres > 0 ? ((stats.membresActifs / totalMembres) * 100).toFixed(0) : 0}% participation
          </div>
        </Card>

        <Card className={`bg-gradient-to-br ${
          stats.membresEnRetard > 0
            ? 'from-red-500/10 to-red-600/5 border-red-500/20'
            : 'from-green-500/10 to-green-600/5 border-green-500/20'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`text-xs sm:text-sm font-semibold truncate ${
              stats.membresEnRetard > 0 ? 'text-red-400' : 'text-green-400'
            }`}>
              Retards
            </div>
            {stats.membresEnRetard > 0 ? (
              <AlertTriangle className="text-red-400 shrink-0" size={18} />
            ) : (
              <CheckCircle className="text-green-400 shrink-0" size={18} />
            )}
          </div>
          <div className={`text-xl sm:text-2xl font-bold ${
            stats.membresEnRetard > 0 ? 'text-red-400' : 'text-green-400'
          } mb-1`}>
            {stats.membresEnRetard} <span className="text-sm font-normal opacity-70">membres</span>
          </div>
          <div className={`text-[10px] sm:text-xs font-medium truncate ${
            stats.membresEnRetard > 0 ? 'text-red-400/80' : 'text-green-400/80'
          }`}>
            {stats.membresEnRetard === 0 ? 'Tout est à jour' : 'Action requise'}
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-4">
             <Calendar size={18} className="text-cyan-400" />
             <h3 className="text-base sm:text-lg font-bold text-white">Tour Actuel #{tourActuel}</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2 text-xs sm:text-sm">
                <span className="text-slate-400">Progression</span>
                <span className="text-white font-medium">
                  {stats.contributionsTourActuel}/{stats.contributionsAttendues}
                </span>
              </div>
              <ProgressBar 
                value={Math.min(progressionTour, 100)} 
                color={progressionTour === 100 ? 'success' : 'primary'} 
                size="md" 
                animate
              />
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-slate-400 mb-1 uppercase tracking-wider font-semibold text-[10px]">Prochain Bénéficiaire</div>
              {stats.prochainBeneficiaire ? (
                <div className="text-white font-bold text-base flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {stats.prochainBeneficiaire}
                </div>
              ) : (
                <div className="text-slate-500 italic text-xs">Aucun en attente</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Attendu</div>
                <div className="text-slate-300 font-bold text-xs sm:text-sm">
                  {(montantContribution * stats.contributionsAttendues).toLocaleString()} FCFA
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Collecté</div>
                <div className="text-green-400 font-bold text-xs sm:text-sm">
                  {(montantContribution * stats.contributionsTourActuel).toLocaleString()} FCFA
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
             <Activity size={18} className="text-cyan-400" />
             <h3 className="text-base sm:text-lg font-bold text-white">Activité Récente</h3>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 flex flex-col items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <Activity className="text-slate-600" size={18} />
                 </div>
                 <div className="text-slate-500 text-xs">Aucune activité</div>
              </div>
            ) : (
              recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="group flex items-center gap-2 sm:gap-3 p-2.5 bg-slate-800/30 rounded-lg hover:bg-slate-800 transition border border-transparent hover:border-slate-700"
                >
                  <div className={`p-1.5 rounded-lg ${
                    activity.type === 'contribution'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {activity.type === 'contribution' ? (
                      <TrendingUp size={14} />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-xs sm:text-sm font-medium truncate group-hover:text-white transition-colors">
                      {activity.nom}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {activity.type === 'contribution' ? 'Contribution' : 'Distribution'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-xs sm:text-sm font-bold ${
                      activity.type === 'contribution' ? 'text-green-400' : 'text-emerald-400'
                    }`}>
                      {activity.montant.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(activity.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short'
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-800/40 border-slate-700/50 p-3 flex flex-col justify-between h-full">
          <div className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 truncate">Participation</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-cyan-400">{stats.tauxParticipation.toFixed(0)}</span>
            <span className="text-sm font-medium text-cyan-500/70">%</span>
          </div>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50 p-3 flex flex-col justify-between h-full">
          <div className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 truncate">Moyenne</div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-green-400 leading-none">
              {montantMoyen.toLocaleString()}
            </div>
            <div className="text-[10px] font-medium text-slate-500 mt-1">FCFA / membre</div>
          </div>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50 p-3 flex flex-col justify-between h-full">
          <div className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 truncate">Tours Restants</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-emerald-400">{Math.max(0, totalMembres - currentTour + 1)}</span>
            <span className="text-[10px] font-medium text-emerald-500/70 uppercase">Tours</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
