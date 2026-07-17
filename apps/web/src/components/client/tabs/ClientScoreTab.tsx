import React, { useState } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import {
  TrendingUp, TrendingDown, Award, Target, Shield, Zap,
  BarChart3, RefreshCw, Plus, Minus, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, Badge, ProgressBar, Button, Skeleton, Modal, FormField, TextareaField } from '../../ui';
import { useClientScore } from '../../../hooks/useClientScore';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast } from '../../../lib/toast';
import { SegmentClient, SEGMENT_CLIENT_LABELS } from '@shared/enum/status-constants';

interface ClientScoreTabProps {
  client: ClientWithIdentity;
}

const SEGMENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  [SegmentClient.VIP]:      { bg: 'bg-status-warning-bg', text: 'text-status-warning', border: 'border-status-warning/30' },
  [SegmentClient.PREMIUM]:  { bg: 'bg-status-info-bg',    text: 'text-status-info',    border: 'border-status-info/30' },
  [SegmentClient.STANDARD]: { bg: 'bg-surface-subtle',    text: 'text-content-secondary', border: 'border-edge-subtle' },
  [SegmentClient.RISQUE]:   { bg: 'bg-status-danger-bg',  text: 'text-status-danger',  border: 'border-status-danger/30' },
};

const COMPONENT_CONFIG = [
  { key: 'scorePayment',    label: 'Paiement',    weight: '40%', icon: Target,    color: 'primary' as const },
  { key: 'scoreLoyalty',    label: 'Fidélité',     weight: '30%', icon: Award,     color: 'success' as const },
  { key: 'scoreEngagement', label: 'Engagement',  weight: '20%', icon: Zap,       color: 'warning' as const },
  { key: 'scoreCompliance', label: 'Conformité',  weight: '10%', icon: Shield,    color: 'primary' as const },
];

const EVENT_TYPE_LABELS: Record<string, { label: string; icon: typeof TrendingUp; positive: boolean }> = {
  EPARGNE_DEPOT:         { label: 'Dépôt épargne',       icon: TrendingUp,   positive: true },
  CREDIT_REMBOURSEMENT:  { label: 'Remboursement',       icon: TrendingUp,   positive: true },
  CREDIT_SOLDE:          { label: 'Crédit soldé',        icon: Award,        positive: true },
  TONTINE_CONTRIBUTION:  { label: 'Cotisation tontine',  icon: TrendingUp,   positive: true },
  KYC_VERIFIED:          { label: 'KYC vérifié',         icon: Shield,       positive: true },
  PROFILE_COMPLETED:     { label: 'Profil complété',     icon: Zap,          positive: true },
  INCIDENT_RETARD:       { label: 'Retard paiement',     icon: TrendingDown, positive: false },
  INCIDENT_DEFAUT:       { label: 'Défaut paiement',     icon: TrendingDown, positive: false },
  TONTINE_PENALITE:      { label: 'Pénalité tontine',    icon: TrendingDown, positive: false },
  COMPTE_BLOQUE:         { label: 'Compte bloqué',       icon: TrendingDown, positive: false },
  BONUS_MANUEL:          { label: 'Bonus manuel',        icon: Plus,         positive: true },
  MALUS_MANUEL:          { label: 'Malus manuel',        icon: Minus,        positive: false },
  INITIAL_SCORE:         { label: 'Score initial',       icon: Zap,          positive: true },
  RECALCUL_COMPLET:      { label: 'Recalcul complet',    icon: RefreshCw,    positive: true },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-status-success';
  if (score >= 65) return 'text-status-info';
  if (score >= 40) return 'text-status-warning';
  return 'text-status-danger';
}

function getScoreBarColor(score: number): 'success' | 'primary' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 65) return 'primary';
  if (score >= 40) return 'warning';
  return 'danger';
}

export default function ClientScoreTab({ client }: ClientScoreTabProps) {
  const {
    state, history, historyTotal, trend, percentile,
    stateLoading, historyLoading, trendLoading, percentileLoading,
    stateError,
    historyPage, setHistoryPage, historyHasMore,
    recalculate, recalculating,
    addBonus, addingBonus,
  } = useClientScore(client.id);

  const { can } = usePermissions();
  const canManage = can('manage', 'loyalty');
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusPoints, setBonusPoints] = useState('');
  const [bonusDescription, setBonusDescription] = useState('');

  const noScoreYet = !state && !stateLoading && !!stateError;
  const segment = state?.segment || client.segment || SegmentClient.STANDARD;
  const segmentStyle = SEGMENT_STYLES[segment] || SEGMENT_STYLES[SegmentClient.STANDARD];
  const scoreGlobal = state?.scoreGlobal ?? (client as any).score ?? 50;

  async function handleRecalculate() {
    try {
      const result = await recalculate('Recalcul manuel');
      toast.success('Score recalculé', { description: `Nouveau score : ${result.scoreGlobal}/100 — ${result.segment}` });
    } catch {
      toast.error('Echec du recalcul du score');
    }
  }

  async function handleBonus() {
    const pts = parseInt(bonusPoints, 10);
    if (!pts || !bonusDescription.trim()) return;
    try {
      await addBonus({
        points: pts,
        description: bonusDescription.trim(),
      });
      toast.success(pts > 0 ? 'Bonus appliqué' : 'Malus appliqué', { description: `${pts > 0 ? '+' : ''}${pts} points` });
      setShowBonusModal(false);
      setBonusPoints('');
      setBonusDescription('');
    } catch {
      toast.error('Echec de l\'application du bonus/malus');
    }
  }

  // Loading skeleton
  if (stateLoading) {
    return (
      <div className="grid md:grid-cols-3 gap-4">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl col-span-full" />
      </div>
    );
  }

  // No score computed yet — prompt recalculation
  if (noScoreYet) {
    return (
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-6 text-center">
          <div className="p-3 bg-surface-subtle rounded-full w-fit mx-auto mb-3">
            <BarChart3 size={24} className="text-content-muted" />
          </div>
          <h3 className="text-sm font-bold text-content-primary mb-1">Aucun score calculé</h3>
          <p className="text-xs text-content-muted mb-4">Ce client n'a pas encore de score. Lancez un premier calcul pour initialiser le scoring.</p>
          {canManage && (
            <Button onClick={handleRecalculate} disabled={recalculating} variant="primary" size="sm">
              <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
              {recalculating ? 'Calcul en cours...' : 'Calculer le score'}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Row 1: Score Global + Percentile + Tendance */}
      <div className="grid md:grid-cols-3 gap-4">

        {/* Score Global */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-accent/20 to-status-info/20 rounded-lg">
                  <BarChart3 size={16} className="text-accent" />
                </div>
                <h3 className="text-sm font-bold text-content-primary tracking-tight">Score Global</h3>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${segmentStyle.bg} ${segmentStyle.text} ${segmentStyle.border}`}>
                {SEGMENT_CLIENT_LABELS[segment as keyof typeof SEGMENT_CLIENT_LABELS] || segment}
              </div>
            </div>

            <div className="flex items-end gap-4 mb-4">
              <div className={`text-5xl font-bold tabular-nums ${getScoreColor(scoreGlobal)}`}>
                {scoreGlobal}
              </div>
              <div className="text-sm text-content-muted pb-1.5">/ 100</div>
            </div>

            <ProgressBar
              value={scoreGlobal}
              max={100}
              color={getScoreBarColor(scoreGlobal)}
              size="md"
              animate
            />

            {state && (
              <div className="mt-3 pt-3 border-t border-edge-subtle grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-content-muted">Points fidélité</span>
                  <p className="font-semibold text-content-primary">{state.totalPointsFidelite}</p>
                </div>
                <div>
                  <span className="text-content-muted">Taux rembours.</span>
                  <p className="font-semibold text-content-primary">{Number(state.tauxRemboursement).toFixed(0)}%</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Percentile */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-status-success/20 to-accent/20 rounded-lg">
                <Award size={16} className="text-status-success" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Classement</h3>
            </div>

            {percentileLoading ? (
              <Skeleton className="h-20 w-full rounded-lg" />
            ) : percentile ? (
              <>
                <div className="text-center mb-3">
                  <div className="text-4xl font-bold text-content-primary tabular-nums">
                    Top {100 - percentile.percentile + 1}%
                  </div>
                  <p className="text-xs text-content-muted mt-1">
                    {percentile.rank}<sup>e</sup> sur {percentile.total} clients
                  </p>
                </div>

                <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-status-success to-accent rounded-full transition-all duration-700"
                    style={{ width: `${percentile.percentile}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-content-muted text-center py-4">Aucune donnée de classement</p>
            )}

            {state && (
              <div className="mt-3 pt-3 border-t border-edge-subtle grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-content-muted">Crédits remb.</span>
                  <p className="font-semibold text-content-primary">{state.totalCreditsRembourses}</p>
                </div>
                <div>
                  <span className="text-content-muted">Incidents</span>
                  <p className="font-semibold text-status-danger">{state.totalIncidents}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Tendance (data only — no admin actions here) */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-status-warning/20 to-accent/20 rounded-lg">
                <TrendingUp size={16} className="text-status-warning" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Tendance</h3>
            </div>

            {trendLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : trend.length > 0 ? (
              <div className="space-y-1.5">
                {trend.slice(0, 6).map((t) => (
                  <div key={t.month} className="flex items-center justify-between text-xs">
                    <span className="text-content-muted">{t.month}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-content-muted">{t.eventCount} evt</span>
                      <span className={`font-semibold tabular-nums ${t.pointsDelta >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                        {t.pointsDelta >= 0 ? '+' : ''}{t.pointsDelta} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-content-muted text-center py-4">Aucune activité récente</p>
            )}
          </div>
        </Card>
      </div>

      {/* Row 2: Component Breakdown + Admin Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Component Breakdown */}
        <Card variant="default" padding="none" className="overflow-hidden md:col-span-2">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-accent/20 to-status-success/20 rounded-lg">
                <Target size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Décomposition du Score</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {COMPONENT_CONFIG.map(({ key, label, weight, icon: Icon, color }) => {
                const value = state ? (state as any)[key] ?? 50 : 50;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className="text-content-muted" />
                        <span className="text-xs font-medium text-content-primary">{label}</span>
                        <span className="text-[10px] text-content-muted">({weight})</span>
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${getScoreColor(value)}`}>{value}</span>
                    </div>
                    <ProgressBar
                      value={value}
                      max={100}
                      color={getScoreBarColor(value)}
                      size="sm"
                      animate
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Admin Actions (separate card) */}
        {canManage && (
          <Card variant="default" padding="none" className="overflow-hidden">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
                  <Zap size={16} className="text-status-info" />
                </div>
                <h3 className="text-sm font-bold text-content-primary tracking-tight">Actions</h3>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleRecalculate}
                  disabled={recalculating}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
                  {recalculating ? 'Recalcul...' : 'Recalculer le score'}
                </Button>
                <Button
                  onClick={() => setShowBonusModal(true)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Plus size={14} />
                  Bonus / Malus manuel
                </Button>
              </div>

              {state && (
                <div className="mt-4 pt-3 border-t border-edge-subtle text-xs text-content-muted">
                  <p>Dernier recalcul :</p>
                  <p className="font-medium text-content-secondary">
                    {state.lastRecalcAt
                      ? new Date(state.lastRecalcAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'Jamais'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Row 3: Event History with real pagination */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
                <Clock size={16} className="text-status-info" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Historique des événements</h3>
            </div>
            {historyTotal > 0 && (
              <span className="text-xs text-content-muted">{historyTotal} événement{historyTotal > 1 ? 's' : ''}</span>
            )}
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : history.length === 0 && historyPage === 0 ? (
            <p className="text-sm text-content-muted text-center py-6">Aucun événement enregistré</p>
          ) : (
            <>
              <div className="space-y-1">
                {history.map((evt) => {
                  const config = EVENT_TYPE_LABELS[evt.eventType] || {
                    label: evt.eventType, icon: Zap, positive: evt.pointsDelta >= 0,
                  };
                  const EvtIcon = config.icon;
                  return (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-surface-subtle/50 transition-colors"
                    >
                      <div className={`p-1.5 rounded-md ${config.positive ? 'bg-status-success-bg' : 'bg-status-danger-bg'}`}>
                        <EvtIcon size={12} className={config.positive ? 'text-status-success' : 'text-status-danger'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-content-primary truncate">{config.label}</p>
                        {evt.reason && (
                          <p className="text-[10px] text-content-muted truncate">{evt.reason}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-bold tabular-nums ${config.positive ? 'text-status-success' : 'text-status-danger'}`}>
                          {evt.pointsDelta > 0 ? '+' : ''}{evt.pointsDelta} pts
                        </span>
                        <p className="text-[10px] text-content-muted">
                          {new Date(evt.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination controls */}
              {historyTotal > 50 && (
                <div className="mt-3 pt-3 border-t border-edge-subtle flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage(historyPage - 1)}
                  >
                    <ChevronLeft size={14} />
                    Précédent
                  </Button>
                  <span className="text-xs text-content-muted tabular-nums">
                    Page {historyPage + 1} / {Math.ceil(historyTotal / 50)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!historyHasMore}
                    onClick={() => setHistoryPage(historyPage + 1)}
                  >
                    Suivant
                    <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Bonus/Malus Modal */}
      <Modal
        isOpen={showBonusModal}
        onClose={() => setShowBonusModal(false)}
        title="Bonus / Malus manuel"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-content-muted">Saisissez une valeur positive pour un bonus, négative pour un malus.</p>

          <FormField
            label="Points"
            name="bonusPoints"
            type="text"
            inputMode="numeric"
            value={bonusPoints}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || v === '-' || /^-?\d+$/.test(v)) setBonusPoints(v);
            }}
            placeholder="ex: -15 ou 20"
          />

          <TextareaField
            label="Motif (obligatoire)"
            name="bonusDescription"
            value={bonusDescription}
            onChange={(e) => setBonusDescription(e.target.value)}
            placeholder="Raison du bonus/malus..."
            rows={3}
          />

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowBonusModal(false)} className="flex-1">
              Annuler
            </Button>
            <Button
              variant={parseInt(bonusPoints, 10) < 0 ? 'danger' : 'primary'}
              onClick={handleBonus}
              disabled={addingBonus || !bonusPoints || !parseInt(bonusPoints, 10) || !bonusDescription.trim()}
              className="flex-1"
            >
              {addingBonus ? 'Enregistrement...' : `Appliquer ${parseInt(bonusPoints, 10) < 0 ? 'malus' : 'bonus'}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
