import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, DollarSign, CheckCircle, AlertTriangle, Calendar, Activity, ArrowRight, Play, Gift, RefreshCw, ChevronDown, ChevronUp, Lock, Clock, Square, Scale, FileText } from 'lucide-react';
import { Card, ProgressBar, Button, Badge } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
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

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [generatingCycle, setGeneratingCycle] = useState(false);
  const [closingCycle, setClosingCycle] = useState(false);
  const [showAllTurns, setShowAllTurns] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Dashboard data from V2 API
  const [dashboard, setDashboard] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [membres, setMembres] = useState<any[]>([]);
  const [pendingDistributions, setPendingDistributions] = useState(0);
  const [pendingPenalties, setPendingPenalties] = useState({ count: 0, amount: 0 });
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [cycleReport, setCycleReport] = useState<any>(null);

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

      // Fetch pending distributions & penalties
      try {
        const [distData, penData] = await Promise.all([
          tontineApi.getDistributionRequests(tontineId).catch(() => []),
          tontineApi.getPenalties(tontineId).catch(() => []),
        ]);
        setPendingDistributions((distData || []).filter((d: any) => d.status === 'SUBMITTED' || d.status === 'APPROVED').length);
        const pendingPens = (penData || []).filter((p: any) => p.statut === 'PENDING');
        setPendingPenalties({
          count: pendingPens.length,
          amount: pendingPens.reduce((s: number, p: any) => s + Number(p.montant || 0), 0),
        });
      } catch { /* ignore */ }

      // Fetch reconciliation
      tontineApi.getReconciliation(tontineId)
        .then(setReconciliation)
        .catch(() => setReconciliation(null));

      // Fetch cycle report if cycle exists
      if (dashData?.currentCycle?.id) {
        tontineApi.getCycleReport(tontineId, dashData.currentCycle.id)
          .then(setCycleReport)
          .catch(() => setCycleReport(null));
      }

      // Build recent activity
      const activities = (contribData || [])
        .slice(0, 8)
        .map((c: any) => ({
          type: 'contribution',
          montant: Number(c.montant),
          date: c.dateContribution || c.createdAt,
          nom: [c.client?.prenom, c.client?.nom].filter(Boolean).join(' ') || 'Inconnu'
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

  const membresAuto = membres.filter((m: any) => m.cotisationAutomatique).length;

  const potCollecte = Number(stats.potCollecte || 0);
  const potDistribue = Number(stats.potDistribue || 0);
  const soldeNet = potCollecte - potDistribue;

  // Cycle progress
  const completedTurns = turns.filter((t: any) => t.status === 'PAID_OUT').length;
  const totalTurns = turns.length;
  const progressPercent = totalTurns > 0 ? (completedTurns / totalTurns) * 100 : 0;

  const handleCloseCycle = useCallback(() => {
    if (!tontineId || !currentCycle?.id) return;
    const remaining = totalTurns - completedTurns;
    const isEarly = remaining > 0;
    openConfirm({
      title: isEarly ? 'Clôturer le cycle prématurément ?' : 'Clôturer le cycle ?',
      message: isEarly
        ? `Il reste ${remaining} tour${remaining > 1 ? 's' : ''} non distribué${remaining > 1 ? 's' : ''} (${Math.round(progressPercent)}% complété). Cette action est irréversible.`
        : 'Tous les tours ont été distribués. Clôturer ce cycle ?',
      variant: isEarly ? 'warning' : 'info',
      confirmText: 'Clôturer',
      onConfirm: async () => {
        setClosingCycle(true);
        try {
          await tontineApi.closeCycle(tontineId, currentCycle.id);
          toast.success('Cycle clôturé avec succès');
          fetchDashboard();
        } catch (error: any) {
          toast.error(error.message || 'Erreur lors de la clôture du cycle');
        } finally {
          setClosingCycle(false);
        }
      },
    });
  }, [tontineId, currentCycle?.id, totalTurns, completedTurns, progressPercent, openConfirm]);

  // Visible turns (first 5 or all)
  const visibleTurns = showAllTurns ? turns : turns.slice(0, 5);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-surface/50 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-status-success text-xs font-semibold">Pot Collecté</span>
            <TrendingUp className="text-status-success" size={16} />
          </div>
          <div className="text-xl font-bold text-content-primary truncate">
            {potCollecte.toLocaleString()}
            <span className="text-xs font-normal text-content-muted ml-1">FCFA</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-status-success text-xs font-semibold">Distribué</span>
            <DollarSign className="text-status-success" size={16} />
          </div>
          <div className="text-xl font-bold text-content-primary truncate">
            {potDistribue.toLocaleString()}
            <span className="text-xs font-normal text-content-muted ml-1">FCFA</span>
          </div>
          <div className="text-[10px] text-status-success/80 mt-1">
            Solde: {soldeNet.toLocaleString()} FCFA
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-status-info/10 to-status-info/5 border-status-info/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-status-info text-xs font-semibold">Membres</span>
            <Users className="text-status-info" size={16} />
          </div>
          <div className="text-xl font-bold text-content-primary">
            {membresActifs}<span className="text-content-muted text-sm">/{totalMembres}</span>
          </div>
          {membresAuto > 0 && (
            <div className="text-[10px] text-status-info/80 mt-1">
              {membresAuto} auto-cotisant{membresAuto > 1 ? 's' : ''}
            </div>
          )}
        </Card>

        <Card className="bg-gradient-to-br from-status-info/10 to-status-info/5 border-status-info/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-status-info text-xs font-semibold">Cycle</span>
            <Calendar className="text-status-info" size={16} />
          </div>
          {currentCycle ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-content-primary">#{currentCycle.cycleNumber}</span>
                <Badge
                  variant={currentCycle.status === 'OPEN' ? 'success' : currentCycle.status === 'PAUSED' ? 'warning' : 'neutral'}
                  className="text-[10px]"
                  value={currentCycle.status === 'OPEN' ? 'Ouvert' : currentCycle.status === 'PAUSED' ? 'Pause' : currentCycle.status === 'CLOSED' ? 'Cloture' : currentCycle.status}
                />
              </div>
              {currentCycle.status === 'OPEN' && (
                <Button
                  size="xs"
                  variant={progressPercent === 100 ? 'outline' : 'ghost'}
                  onClick={handleCloseCycle}
                  disabled={closingCycle}
                  className={`w-full text-[10px] mt-2 ${progressPercent < 100 ? 'text-status-warning' : ''}`}
                  icon={closingCycle ? RefreshCw : Square}
                >
                  {closingCycle ? 'Cloture...' : progressPercent < 100 ? `Cloturer (${Math.round(progressPercent)}%)` : 'Cloturer le cycle'}
                </Button>
              )}
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
              {generatingCycle ? 'Generation...' : 'Demarrer'}
            </Button>
          )}
        </Card>
      </div>

      {/* Cycle details + Pending alerts */}
      {currentCycle && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Cycle dates */}
          <Card className="p-3">
            <div className="text-[10px] text-content-muted uppercase font-semibold mb-1">Période du cycle</div>
            <div className="text-sm text-content-primary">
              {currentCycle.startDate
                ? new Date(currentCycle.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
              {' → '}
              {currentCycle.endDate
                ? new Date(currentCycle.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'En cours'}
            </div>
          </Card>

          {/* Pending distributions */}
          {pendingDistributions > 0 && (
            <Card className="p-3 bg-status-warning-bg/30 border-status-warning/20">
              <div className="text-[10px] text-status-warning uppercase font-semibold mb-1">Distributions en attente</div>
              <div className="text-lg font-bold text-status-warning">{pendingDistributions}</div>
              <div className="text-[10px] text-content-muted">à approuver</div>
            </Card>
          )}

          {/* Pending penalties */}
          {pendingPenalties.count > 0 && (
            <Card className="p-3 bg-status-danger-bg/30 border-status-danger/20">
              <div className="text-[10px] text-status-danger uppercase font-semibold mb-1">Pénalités impayées</div>
              <div className="text-lg font-bold text-status-danger">{pendingPenalties.amount.toLocaleString()} FCFA</div>
              <div className="text-[10px] text-content-muted">{pendingPenalties.count} pénalité{pendingPenalties.count > 1 ? 's' : ''}</div>
            </Card>
          )}
        </div>
      )}

      {/* Reconciliation & Cycle Report */}
      {currentCycle && (reconciliation || cycleReport) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Reconciliation summary */}
          {reconciliation && (
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Scale size={14} className="text-accent" />
                <span className="text-xs font-semibold text-content-primary uppercase tracking-wider">Reconciliation</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-content-muted">Collecte attendue</span>
                  <span className="font-medium text-content-primary">{Number(reconciliation.expectedTotal || 0).toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-content-muted">Collecte reelle</span>
                  <span className="font-medium text-content-primary">{Number(reconciliation.actualTotal || 0).toLocaleString()} FCFA</span>
                </div>
                {(reconciliation.difference != null && Number(reconciliation.difference) !== 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Ecart</span>
                    <span className={`font-bold ${Number(reconciliation.difference) >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                      {Number(reconciliation.difference) >= 0 ? '+' : ''}{Number(reconciliation.difference).toLocaleString()} FCFA
                    </span>
                  </div>
                )}
                {reconciliation.missingMembers > 0 && (
                  <div className="text-[10px] text-status-warning mt-1">
                    {reconciliation.missingMembers} membre{reconciliation.missingMembers > 1 ? 's' : ''} en retard
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Cycle report summary */}
          {cycleReport && (
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-accent" />
                <span className="text-xs font-semibold text-content-primary uppercase tracking-wider">Rapport du cycle</span>
              </div>
              <div className="space-y-1.5">
                {cycleReport.totalContributions != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Cotisations</span>
                    <span className="font-medium text-content-primary">{Number(cycleReport.totalContributions).toLocaleString()} FCFA</span>
                  </div>
                )}
                {cycleReport.totalDistributions != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Distributions</span>
                    <span className="font-medium text-content-primary">{Number(cycleReport.totalDistributions).toLocaleString()} FCFA</span>
                  </div>
                )}
                {cycleReport.totalPenalties != null && Number(cycleReport.totalPenalties) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Penalites</span>
                    <span className="font-medium text-status-danger">{Number(cycleReport.totalPenalties).toLocaleString()} FCFA</span>
                  </div>
                )}
                {cycleReport.completionRate != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Taux completion</span>
                    <span className="font-medium text-content-primary">{Math.round(Number(cycleReport.completionRate))}%</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Prochain bénéficiaire + Progression */}
      {currentCycle && (
        <div className="grid md:grid-cols-2 gap-3">
          {/* Prochain tour */}
          {nextTurn && (
            <Card className="p-3 bg-linear-to-r from-accent/10 to-accent-secondary/10 border-accent/30">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-accent text-xs font-semibold uppercase tracking-wider mb-1">
                    Prochain Bénéficiaire
                  </div>
                  <div className="text-content-primary font-bold flex items-center gap-2">
                    <Gift size={16} className="text-status-success" />
                    Tour #{nextTurn.turnNumber}
                  </div>
                  <div className="text-content-muted text-xs mt-0.5">
                    {nextTurn.dueDate ? new Date(nextTurn.dueDate).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'short'
                    }) : '-'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-content-primary font-bold">
                    {Number(nextTurn.amountExpected || 0).toLocaleString()} FCFA
                  </div>
                  {(nextTurn.isLocked) && (
                    <div className="flex items-center gap-1 text-status-warning text-[10px] mt-1 justify-end">
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
              <span className="text-content-muted text-xs font-semibold uppercase tracking-wider">Progression</span>
              <span className="text-content-primary text-sm font-medium">{completedTurns}/{totalTurns}</span>
            </div>
            <ProgressBar
              value={progressPercent}
              color={progressPercent === 100 ? 'success' : 'primary'}
              size="md"
              animate
            />
            <div className="flex justify-between mt-2 text-[10px] text-content-muted">
              <span>{Math.round(progressPercent)}% complété</span>
              <span>{totalTurns - completedTurns} restants</span>
            </div>
          </Card>
        </div>
      )}

      {/* Liste des tours (compact) */}
      {turns.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-edge-subtle flex items-center justify-between">
            <h3 className="text-content-primary font-semibold text-sm flex items-center gap-2">
              <Calendar size={14} className="text-accent" />
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
          <div className="divide-y divide-edge/30 max-h-[250px] overflow-y-auto">
            {visibleTurns.map((turn: any, idx: number) => {
              const status = turn.status || 'SCHEDULED';
              const statusCfg = turnStatusConfig[status] || turnStatusConfig.SCHEDULED;
              const isNext = nextTurn?.id === turn.id;
              const turnNum = turn.turnNumber;
              const dueDate = turn.dueDate;
              const amountExpected = Number(turn.amountExpected || 0);
              const isLocked = turn.isLocked;

              return (
                <div
                  key={turn.id || idx}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 hover:bg-surface/30 transition',
                    isNext && 'bg-accent/5 border-l-2 border-accent'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                      status === 'PAID_OUT' ? 'bg-status-success-bg text-status-success' :
                      status === 'READY' ? 'bg-status-warning-bg text-status-warning' :
                      'bg-surface-elevated/50 text-content-muted'
                    )}>
                      {turnNum}
                    </div>
                    <div>
                      <div className="text-content-primary text-xs font-medium">
                        {turn.beneficiaryMemberName || `Tour ${turnNum}`}
                      </div>
                      <div className="text-content-muted text-[10px]">
                        {dueDate ? new Date(dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLocked && <Lock size={10} className="text-content-muted" />}
                    <Badge variant={statusCfg.variant} className="text-[9px] px-1.5" value={statusCfg.label} />
                    <span className="text-content-muted text-[10px] font-medium min-w-[60px] text-right">
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
        <div className="p-3 border-b border-edge-subtle">
          <h3 className="text-content-primary font-semibold text-sm flex items-center gap-2">
            <Activity size={14} className="text-accent" />
            Activité Récente
          </h3>
        </div>
        <div className="divide-y divide-edge/30 max-h-[200px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <div className="text-center py-6 text-content-muted text-xs">Aucune activité</div>
          ) : (
            recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between px-3 py-2 hover:bg-surface/30 transition">
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded ${
                    activity.type === 'contribution' ? 'bg-status-success-bg text-status-success' : 'bg-status-success-bg text-status-success'
                  }`}>
                    {activity.type === 'contribution' ? <TrendingUp size={12} /> : <ArrowRight size={12} />}
                  </div>
                  <span className="text-content-primary text-xs truncate max-w-[120px]">{activity.nom}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    activity.type === 'contribution' ? 'text-status-success' : 'text-status-success'
                  }`}>
                    {activity.montant.toLocaleString()}
                  </span>
                  <span className="text-content-muted text-[10px]">
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
          <Calendar className="mx-auto text-content-muted mb-3" size={32} />
          <h3 className="text-content-primary font-semibold mb-1">Aucun cycle actif</h3>
          <p className="text-content-muted text-xs mb-3">
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

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
