import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, DollarSign, CheckCircle, AlertTriangle, Calendar, Activity, ArrowRight, Play, Gift, RefreshCw, ChevronDown, ChevronUp, Lock, Clock } from 'lucide-react';
import { Card, ProgressBar, Button, Badge } from '../../ui';
import { toast } from '../../../lib/toast';
import { tontineApi } from '../../../lib/api-client';
import { StatutClient, StatutContributionTontine } from '@shared/enum/status-constants';
import { cn } from '../../../lib/utils';

interface TontineDashboardProps {
  tontineId: string;
  montantContribution: number;
  nombreMembres: number;
  tourActuel: number;
}

// Status configurations (using Badge variants: success, warning, danger, info, neutral, primary, outline)
const turnStatusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'outline' }> = {
  SCHEDULED: { label: 'Planifié', variant: 'neutral' },
  READY: { label: 'En attente', variant: 'warning' },
  PARTIAL_PAID: { label: 'Partiel', variant: 'warning' },
  PAID_OUT: { label: 'Distribué', variant: 'success' },
  SKIPPED: { label: 'Sauté', variant: 'danger' },
};

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

  const [loading, setLoading] = useState(false);
  const [generatingCycle, setGeneratingCycle] = useState(false);
  const [showAllTurns, setShowAllTurns] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Dashboard data from V2 API
  const [dashboard, setDashboard] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [membres, setMembres] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboard();
  }, [tontineId, tourActuel]);

  const fetchDashboard = async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      // Fetch dashboard, members and contributions in parallel
      const [dashData, membresData, contribData] = await Promise.all([
        tontineApi.getDashboard(tontineId).catch(() => null),
        tontineApi.getMembres(tontineId),
        tontineApi.getContributions(tontineId)
      ]);

      setDashboard(dashData);
      setMembres(membresData || []);

      // Fetch turns if we have a cycle
      if (dashData?.currentCycle?.id) {
        const turnsData = await tontineApi.getTurns(tontineId, dashData.currentCycle.id);
        setTurns(turnsData || []);
      }

      // Build recent activity
      const activities = (contribData || [])
        .slice(0, 8)
        .map((c: any) => ({
          type: 'contribution',
          montant: Number(c.montant),
          date: c.date_contribution || c.created_at || c.createdAt,
          nom: c.client?.nom || c.tontine_membres?.clients?.nom || 'Inconnu'
        }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activities);

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCycle = useCallback(async () => {
    if (!tontineId) return;
    setGeneratingCycle(true);
    try {
      const result = await tontineApi.generateCycle(tontineId);
      toast.success(`Cycle généré avec ${result.turnsCreated} tours`);
      fetchDashboard();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la génération du cycle');
    } finally {
      setGeneratingCycle(false);
    }
  }, [tontineId]);

  // Compute stats
  const stats = dashboard?.stats || {};
  const currentCycle = dashboard?.currentCycle;
  const nextTurn = dashboard?.nextTurn;

  const membresActifs = membres.filter((m: any) =>
    m.status === StatutClient.ACTIVE || m.statut === StatutClient.ACTIVE
  ).length;

  const potCollecte = Number(stats.potCollecte || 0);
  const potDistribue = Number(stats.potDistribue || 0);
  const soldeNet = potCollecte - potDistribue;

  // Cycle progress
  const completedTurns = turns.filter((t: any) => t.status === 'PAID_OUT').length;
  const totalTurns = turns.length;
  const progressPercent = totalTurns > 0 ? (completedTurns / totalTurns) * 100 : 0;

  // Visible turns (first 5 or all)
  const visibleTurns = showAllTurns ? turns : turns.slice(0, 5);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-slate-800/50 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-400 text-xs font-semibold">Pot Collecté</span>
            <TrendingUp className="text-green-400" size={16} />
          </div>
          <div className="text-xl font-bold text-white truncate">
            {potCollecte.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">FCFA</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-emerald-400 text-xs font-semibold">Distribué</span>
            <DollarSign className="text-emerald-400" size={16} />
          </div>
          <div className="text-xl font-bold text-white truncate">
            {potDistribue.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">FCFA</span>
          </div>
          <div className="text-[10px] text-emerald-400/80 mt-1">
            Solde: {soldeNet.toLocaleString()} FCFA
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 text-xs font-semibold">Membres</span>
            <Users className="text-blue-400" size={16} />
          </div>
          <div className="text-xl font-bold text-white">
            {membresActifs}<span className="text-slate-500 text-sm">/{totalMembres}</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-400 text-xs font-semibold">Cycle</span>
            <Calendar className="text-purple-400" size={16} />
          </div>
          {currentCycle ? (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">#{currentCycle.cycleNumber || currentCycle.cycle_number}</span>
              <Badge variant="success" className="text-[10px]" value="Actif" />
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateCycle}
              disabled={generatingCycle}
              className="w-full text-xs"
              icon={generatingCycle ? RefreshCw : Play}
            >
              {generatingCycle ? 'Génération...' : 'Démarrer'}
            </Button>
          )}
        </Card>
      </div>

      {/* Prochain bénéficiaire + Progression */}
      {currentCycle && (
        <div className="grid md:grid-cols-2 gap-3">
          {/* Prochain tour */}
          {nextTurn && (
            <Card className="p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Prochain Bénéficiaire
                  </div>
                  <div className="text-white font-bold flex items-center gap-2">
                    <Gift size={16} className="text-emerald-400" />
                    Tour #{nextTurn.turnNumber || nextTurn.turn_number}
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {nextTurn.dueDate || nextTurn.due_date ? new Date(nextTurn.dueDate || nextTurn.due_date).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'short'
                    }) : '-'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">
                    {Number(nextTurn.amountExpected || nextTurn.amount_expected || 0).toLocaleString()} FCFA
                  </div>
                  {(nextTurn.isLocked || nextTurn.is_locked) && (
                    <div className="flex items-center gap-1 text-amber-400 text-[10px] mt-1 justify-end">
                      <Lock size={10} />
                      <span>Verrouillé</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Progression */}
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Progression</span>
              <span className="text-white text-sm font-medium">{completedTurns}/{totalTurns}</span>
            </div>
            <ProgressBar
              value={progressPercent}
              color={progressPercent === 100 ? 'success' : 'primary'}
              size="md"
              animate
            />
            <div className="flex justify-between mt-2 text-[10px] text-slate-500">
              <span>{Math.round(progressPercent)}% complété</span>
              <span>{totalTurns - completedTurns} restants</span>
            </div>
          </Card>
        </div>
      )}

      {/* Liste des tours (compact) */}
      {turns.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Calendar size={14} className="text-cyan-400" />
              Calendrier des Tours
            </h3>
            {turns.length > 5 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowAllTurns(!showAllTurns)}
                icon={showAllTurns ? ChevronUp : ChevronDown}
              >
                {showAllTurns ? 'Réduire' : `Voir tous (${totalTurns})`}
              </Button>
            )}
          </div>
          <div className="divide-y divide-slate-700/30 max-h-[250px] overflow-y-auto">
            {visibleTurns.map((turn: any, idx: number) => {
              const status = turn.status || 'SCHEDULED';
              const statusCfg = turnStatusConfig[status] || turnStatusConfig.SCHEDULED;
              const isNext = nextTurn?.id === turn.id;
              const turnNum = turn.turnNumber || turn.turn_number;
              const dueDate = turn.dueDate || turn.due_date;
              const amountExpected = Number(turn.amountExpected || turn.amount_expected || 0);
              const isLocked = turn.isLocked || turn.is_locked;

              return (
                <div
                  key={turn.id || idx}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 hover:bg-slate-800/30 transition',
                    isNext && 'bg-cyan-500/5 border-l-2 border-cyan-500'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                      status === 'PAID_OUT' ? 'bg-green-500/20 text-green-400' :
                      status === 'READY' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-700/50 text-slate-400'
                    )}>
                      {turnNum}
                    </div>
                    <div>
                      <div className="text-white text-xs font-medium">
                        {turn.beneficiaryMemberName || turn.beneficiary_member_name || `Tour ${turnNum}`}
                      </div>
                      <div className="text-slate-500 text-[10px]">
                        {dueDate ? new Date(dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLocked && <Lock size={10} className="text-slate-500" />}
                    <Badge variant={statusCfg.variant} className="text-[9px] px-1.5" value={statusCfg.label} />
                    <span className="text-slate-400 text-[10px] font-medium min-w-[60px] text-right">
                      {amountExpected.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Activité récente (compact) */}
      <Card>
        <div className="p-3 border-b border-slate-700/50">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Activity size={14} className="text-cyan-400" />
            Activité Récente
          </h3>
        </div>
        <div className="divide-y divide-slate-700/30 max-h-[200px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">Aucune activité</div>
          ) : (
            recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between px-3 py-2 hover:bg-slate-800/30 transition">
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded ${
                    activity.type === 'contribution' ? 'bg-green-500/10 text-green-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {activity.type === 'contribution' ? <TrendingUp size={12} /> : <ArrowRight size={12} />}
                  </div>
                  <span className="text-white text-xs truncate max-w-[120px]">{activity.nom}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    activity.type === 'contribution' ? 'text-green-400' : 'text-emerald-400'
                  }`}>
                    {activity.montant.toLocaleString()}
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    {new Date(activity.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Action: générer cycle si pas de cycle */}
      {!currentCycle && !loading && (
        <Card className="p-4 text-center">
          <Calendar className="mx-auto text-slate-500 mb-3" size={32} />
          <h3 className="text-white font-semibold mb-1">Aucun cycle actif</h3>
          <p className="text-slate-400 text-xs mb-3">
            Générez un cycle pour planifier les tours de distribution
          </p>
          <Button
            onClick={handleGenerateCycle}
            disabled={generatingCycle}
            icon={generatingCycle ? RefreshCw : Play}
          >
            {generatingCycle ? 'Génération...' : 'Générer un cycle'}
          </Button>
        </Card>
      )}
    </div>
  );
}
