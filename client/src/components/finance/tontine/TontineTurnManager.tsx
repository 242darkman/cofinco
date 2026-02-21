import { useState, useEffect, useCallback, useMemo } from 'react';
import { GripVertical, Lock, Unlock, SkipForward, CheckCircle, Clock, DollarSign, AlertTriangle, History, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
import { tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { currencySymbol } from '@shared/config/currency';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface TontineTurnManagerProps {
  tontineId: string;
  onUpdate?: () => void;
}

const turnStatusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: React.ElementType }> = {
  SCHEDULED: { label: 'Planifié', variant: 'neutral', icon: Clock },
  READY: { label: 'Prêt', variant: 'info', icon: CheckCircle },
  PARTIAL_PAID: { label: 'Partiel', variant: 'warning', icon: DollarSign },
  PAID_OUT: { label: 'Distribué', variant: 'success', icon: CheckCircle },
  SKIPPED: { label: 'Sauté', variant: 'danger', icon: SkipForward },
};

export default function TontineTurnManager({ tontineId, onUpdate }: TontineTurnManagerProps) {
  const sym = currencySymbol();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [turns, setTurns] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [membres, setMembres] = useState<any[]>([]);

  // Swap UI state
  const [swapMode, setSwapMode] = useState(false);
  const [swapTurnA, setSwapTurnA] = useState<string | null>(null);
  const [swapReason, setSwapReason] = useState('');

  // Skip reason input
  const [skipTurnId, setSkipTurnId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  const currentCycle = dashboard?.currentCycle;

  const fetchData = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const [dashData, membresData] = await Promise.all([
        tontineApi.getDashboard(tontineId).catch(() => null),
        tontineApi.getMembres(tontineId).catch(() => []),
      ]);
      setDashboard(dashData);
      setMembres(membresData || []);

      if (dashData?.currentCycle?.id) {
        const turnsData = await tontineApi.getTurns(tontineId, dashData.currentCycle.id);
        setTurns((turnsData || []).sort((a: any, b: any) => a.turnNumber - b.turnNumber));
      } else {
        setTurns([]);
      }
    } catch {
      setTurns([]);
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  const fetchAudit = useCallback(async () => {
    if (!tontineId || !currentCycle?.id) return;
    try {
      const data = await tontineApi.getTurnAudit(tontineId, currentCycle.id);
      setAudit(data || []);
    } catch {
      setAudit([]);
    }
  }, [tontineId, currentCycle?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getMemberName = useCallback((memberId: string) => {
    const m = membres.find((m: any) => m.id === memberId);
    if (!m?.client) return memberId?.slice(0, 8) || '—';
    return `${m.client.nom || ''}${m.client.prenom ? ' ' + m.client.prenom : ''}`.trim();
  }, [membres]);

  // Drag & drop reorder for SCHEDULED turns
  const scheduledTurns = useMemo(() => turns.filter(t => t.status === 'SCHEDULED' || t.status === 'READY'), [turns]);
  const completedTurns = useMemo(() => turns.filter(t => t.status === 'PAID_OUT' || t.status === 'PARTIAL_PAID' || t.status === 'SKIPPED'), [turns]);

  const handleDragStart = (idx: number) => setDraggedIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const newTurns = [...scheduledTurns];
    const [dragged] = newTurns.splice(draggedIdx, 1);
    newTurns.splice(idx, 0, dragged);
    const reordered = newTurns.map((t, i) => ({ ...t, turnNumber: completedTurns.length + i + 1 }));
    setTurns([...completedTurns, ...reordered]);
    setDraggedIdx(idx);
  };
  const handleDragEnd = () => setDraggedIdx(null);

  const handleSaveOrder = useCallback(async () => {
    if (!currentCycle?.id) return;
    setReordering(true);
    try {
      const newOrder = scheduledTurns.map((t, i) => ({
        turnNumber: completedTurns.length + i + 1,
        memberId: t.beneficiaryMemberId,
      }));
      await tontineApi.reorderTurns(tontineId, currentCycle.id, {
        newOrder,
        reason: 'Réorganisation manuelle',
      });
      toast.success('Ordre des tours mis à jour');
      fetchData();
      onUpdate?.();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de la réorganisation"));
      fetchData();
    } finally {
      setReordering(false);
    }
  }, [tontineId, currentCycle?.id, scheduledTurns, completedTurns, fetchData, onUpdate]);

  // Lock/unlock toggle
  const handleToggleLock = useCallback((turn: any) => {
    const willLock = !turn.isLocked;
    openConfirm({
      title: willLock ? 'Verrouiller ce tour ?' : 'Déverrouiller ce tour ?',
      message: willLock
        ? `Le tour #${turn.turnNumber} ne pourra plus être déplacé ou modifié.`
        : `Le tour #${turn.turnNumber} pourra de nouveau être réorganisé.`,
      variant: willLock ? 'warning' : 'info',
      confirmText: willLock ? 'Verrouiller' : 'Déverrouiller',
      onConfirm: async () => {
        setActionLoading(turn.id);
        try {
          await tontineApi.lockTurn(tontineId, turn.id, willLock, willLock ? 'Verrouillé manuellement' : undefined);
          toast.success(willLock ? 'Tour verrouillé' : 'Tour déverrouillé');
          fetchData();
          onUpdate?.();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur'));
        } finally {
          setActionLoading(null);
        }
      },
    });
  }, [tontineId, openConfirm, fetchData, onUpdate]);

  // Skip turn
  const handleSkipTurn = useCallback(async () => {
    if (!skipTurnId || !currentCycle?.id || !skipReason.trim()) return;
    setActionLoading(skipTurnId);
    try {
      await tontineApi.skipTurn(tontineId, currentCycle.id, skipTurnId, skipReason.trim());
      toast.success('Tour sauté');
      setSkipTurnId(null);
      setSkipReason('');
      fetchData();
      onUpdate?.();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur'));
    } finally {
      setActionLoading(null);
    }
  }, [tontineId, currentCycle?.id, skipTurnId, skipReason, fetchData, onUpdate]);

  // Swap turns
  const handleSwapSelect = useCallback((turnId: string) => {
    if (!swapTurnA) {
      setSwapTurnA(turnId);
    } else if (swapTurnA === turnId) {
      setSwapTurnA(null);
    } else {
      // Second turn selected — prompt for reason
      const turnA = turns.find(t => t.id === swapTurnA);
      const turnB = turns.find(t => t.id === turnId);
      openConfirm({
        title: 'Échanger ces deux tours ?',
        message: `Échanger tour #${turnA?.turnNumber} (${getMemberName(turnA?.beneficiaryMemberId)}) avec tour #${turnB?.turnNumber} (${getMemberName(turnB?.beneficiaryMemberId)})`,
        variant: 'info',
        confirmText: 'Échanger',
        onConfirm: async () => {
          setActionLoading(swapTurnA!);
          try {
            await tontineApi.requestSwap(tontineId, currentCycle!.id, swapTurnA!, turnId, swapReason || 'Échange manuel');
            toast.success('Échange effectué');
            setSwapMode(false);
            setSwapTurnA(null);
            setSwapReason('');
            fetchData();
            onUpdate?.();
          } catch (error) {
            toast.error(handleApiError(error, "Erreur lors de l'échange"));
          } finally {
            setActionLoading(null);
          }
        },
      });
    }
  }, [swapTurnA, swapReason, turns, tontineId, currentCycle?.id, openConfirm, getMemberName, fetchData, onUpdate]);

  const handleToggleAudit = useCallback(() => {
    if (!showAudit) fetchAudit();
    setShowAudit(!showAudit);
  }, [showAudit, fetchAudit]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-surface/50 rounded-lg" />)}
      </div>
    );
  }

  if (!currentCycle) {
    return (
      <Card className="p-8 text-center">
        <Clock className="mx-auto text-content-muted mb-2" size={28} />
        <p className="text-sm text-content-primary font-medium">Aucun cycle actif</p>
        <p className="text-xs text-content-muted">Générez un cycle depuis le Dashboard pour voir les tours</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-content-primary">Tours du cycle #{currentCycle.cycleNumber}</h3>
          <p className="text-xs text-content-muted">{turns.length} tours • {completedTurns.length} complétés</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" icon={History} onClick={handleToggleAudit}>
            {showAudit ? 'Tours' : 'Historique'}
          </Button>
          {!showAudit && scheduledTurns.length >= 2 && (
            <>
              <Button
                size="sm"
                variant={swapMode ? 'danger' : 'outline'}
                icon={ArrowRightLeft}
                onClick={() => { setSwapMode(!swapMode); setSwapTurnA(null); }}
              >
                {swapMode ? 'Annuler échange' : 'Échanger'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={reordering ? RefreshCw : CheckCircle}
                onClick={handleSaveOrder}
                disabled={reordering}
              >
                {reordering ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Swap mode hint */}
      {swapMode && (
        <div className="bg-status-info-bg/50 border border-status-info/20 rounded-lg p-3 flex items-center gap-3">
          <ArrowRightLeft size={16} className="text-status-info shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-content-primary font-medium">
              {!swapTurnA
                ? 'Cliquez sur le premier tour à échanger'
                : `Tour #${turns.find(t => t.id === swapTurnA)?.turnNumber} sélectionné — cliquez sur le second tour`}
            </p>
            {swapTurnA && (
              <input
                type="text"
                value={swapReason}
                onChange={e => setSwapReason(e.target.value)}
                placeholder="Raison de l'échange (optionnel)..."
                className="mt-2 w-full px-2 py-1 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
              />
            )}
          </div>
        </div>
      )}

      {/* Skip reason inline form */}
      {skipTurnId && (
        <div className="bg-status-warning-bg/50 border border-status-warning/20 rounded-lg p-3">
          <p className="text-xs text-content-primary font-medium mb-2">
            Sauter le tour #{turns.find(t => t.id === skipTurnId)?.turnNumber} — {getMemberName(turns.find(t => t.id === skipTurnId)?.beneficiaryMemberId)}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              placeholder="Raison obligatoire..."
              className="flex-1 px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
            />
            <Button size="sm" variant="warning" onClick={handleSkipTurn} disabled={!skipReason.trim() || actionLoading === skipTurnId}>
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSkipTurnId(null); setSkipReason(''); }}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Audit view */}
      {showAudit ? (
        <div className="space-y-2">
          {audit.length === 0 ? (
            <Card className="p-6 text-center">
              <History className="mx-auto text-content-muted mb-2" size={24} />
              <p className="text-sm text-content-muted">Aucun historique de modification</p>
            </Card>
          ) : (
            audit.map((entry: any, idx: number) => (
              <Card key={idx} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-accent/10 text-accent shrink-0">
                    <History size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-content-primary font-medium">{entry.actionType || entry.action || entry.type || 'Modification'}</p>
                    {entry.reason && <p className="text-[10px] text-content-muted mt-0.5 italic">{entry.reason}</p>}
                    <p className="text-[10px] text-content-muted mt-1">
                      {(entry.changedAt || entry.createdAt) && new Date(entry.changedAt || entry.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Completed turns */}
          {completedTurns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">Complétés</p>
              {completedTurns.map((turn) => {
                const cfg = turnStatusConfig[turn.status] || turnStatusConfig.SCHEDULED;
                return (
                  <Card key={turn.id} className="p-3 opacity-70">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-surface-subtle flex items-center justify-center text-xs font-bold text-content-muted shrink-0">
                        {turn.turnNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-content-primary truncate">
                            {getMemberName(turn.beneficiaryMemberId)}
                          </span>
                          <Badge variant={cfg.variant} value={cfg.label} size="sm" />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-content-muted mt-0.5">
                          {turn.amountPaidOut > 0 && (
                            <span className="text-status-success">{Number(turn.amountPaidOut).toLocaleString()} {sym} payé</span>
                          )}
                          {turn.amountExpected > 0 && (
                            <span>Attendu: {Number(turn.amountExpected).toLocaleString()} {sym}</span>
                          )}
                        </div>
                      </div>
                      {turn.isLocked && <Lock size={12} className="text-content-muted shrink-0" />}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Scheduled turns (draggable) */}
          {scheduledTurns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">
                À venir {scheduledTurns.length > 1 && !swapMode && '— glissez pour réorganiser'}
              </p>
              {scheduledTurns.map((turn, idx) => {
                const cfg = turnStatusConfig[turn.status] || turnStatusConfig.SCHEDULED;
                const isFirst = idx === 0;
                const isSwapSelected = swapTurnA === turn.id;
                const isLoading = actionLoading === turn.id;

                return (
                  <div
                    key={turn.id}
                    draggable={!turn.isLocked && scheduledTurns.length > 1 && !swapMode}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    onClick={swapMode && !turn.isLocked ? () => handleSwapSelect(turn.id) : undefined}
                  >
                    <Card className={`p-3 transition-all ${
                      draggedIdx === idx ? 'border-accent bg-accent/5 shadow-lg' : ''
                    } ${isFirst && !swapMode ? 'border-accent/30 bg-accent/5' : ''} ${
                      swapMode ? 'cursor-pointer hover:border-status-info/50' : ''
                    } ${isSwapSelected ? 'border-status-info bg-status-info-bg/30 ring-1 ring-status-info/30' : ''}`}>
                      <div className="flex items-center gap-3">
                        {!turn.isLocked && scheduledTurns.length > 1 && !swapMode && (
                          <GripVertical className="w-4 h-4 text-content-muted cursor-grab active:cursor-grabbing shrink-0" />
                        )}
                        {swapMode && (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSwapSelected ? 'border-status-info bg-status-info text-white' : 'border-content-muted'
                          }`}>
                            {isSwapSelected && <CheckCircle size={12} />}
                          </div>
                        )}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isFirst ? 'bg-accent/10 text-accent' : 'bg-surface-subtle text-content-muted'
                        }`}>
                          {turn.turnNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-content-primary truncate">
                              {getMemberName(turn.beneficiaryMemberId)}
                            </span>
                            <Badge variant={cfg.variant} value={cfg.label} size="sm" />
                            {isFirst && !swapMode && <Badge variant="info" value="Prochain" size="sm" />}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-content-muted mt-0.5">
                            {turn.dueDate && (
                              <span>Prévu: {new Date(turn.dueDate).toLocaleDateString('fr-FR')}</span>
                            )}
                            {turn.amountExpected > 0 && (
                              <span>Attendu: {Number(turn.amountExpected).toLocaleString()} {sym}</span>
                            )}
                          </div>
                        </div>

                        {/* Turn action buttons */}
                        {!swapMode && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {/* Lock/unlock */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleLock(turn); }}
                              disabled={isLoading}
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                turn.isLocked
                                  ? 'text-status-warning hover:bg-status-warning-bg'
                                  : 'text-content-muted hover:text-content-primary hover:bg-surface-elevated'
                              }`}
                              title={turn.isLocked ? `Déverrouiller${turn.lockedReason ? ` (${turn.lockedReason})` : ''}` : 'Verrouiller'}
                            >
                              {turn.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                            </button>
                            {/* Skip */}
                            {!turn.isLocked && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setSkipTurnId(turn.id); setSkipReason(''); }}
                                disabled={isLoading}
                                className="p-1.5 rounded-lg text-content-muted hover:text-status-danger hover:bg-status-danger-bg transition-colors disabled:opacity-50"
                                title="Sauter ce tour"
                              >
                                <SkipForward size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {turns.length === 0 && (
            <Card className="p-8 text-center">
              <Clock className="mx-auto text-content-muted mb-2" size={28} />
              <p className="text-sm text-content-muted">Aucun tour dans ce cycle</p>
            </Card>
          )}
        </>
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
