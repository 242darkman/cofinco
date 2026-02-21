import { useState, useEffect, useCallback, useMemo } from 'react';
import { GripVertical, Lock, Unlock, SkipForward, CheckCircle, Clock, DollarSign, AlertTriangle, History, RefreshCw } from 'lucide-react';
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
  const [showAudit, setShowAudit] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [membres, setMembres] = useState<any[]>([]);

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
    // Update turn numbers
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
      fetchData(); // reset
    } finally {
      setReordering(false);
    }
  }, [tontineId, currentCycle?.id, scheduledTurns, completedTurns, fetchData, onUpdate]);

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-content-primary">Tours du cycle #{currentCycle.cycleNumber}</h3>
          <p className="text-xs text-content-muted">{turns.length} tours • {completedTurns.length} complétés</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={History}
            onClick={handleToggleAudit}
          >
            {showAudit ? 'Tours' : 'Historique'}
          </Button>
          {scheduledTurns.length > 1 && (
            <Button
              size="sm"
              variant="primary"
              icon={reordering ? RefreshCw : CheckCircle}
              onClick={handleSaveOrder}
              disabled={reordering}
            >
              {reordering ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          )}
        </div>
      </div>

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
                    <p className="text-xs text-content-primary font-medium">{entry.action || entry.type || 'Modification'}</p>
                    {entry.reason && <p className="text-[10px] text-content-muted mt-0.5 italic">{entry.reason}</p>}
                    <p className="text-[10px] text-content-muted mt-1">
                      {entry.createdAt && new Date(entry.createdAt).toLocaleString('fr-FR')}
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
                const Icon = cfg.icon;
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
                        {turn.amountPaid > 0 && (
                          <span className="text-[10px] text-status-success">{Number(turn.amountPaid).toLocaleString()} {sym}</span>
                        )}
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
                À venir {scheduledTurns.length > 1 && '— glissez pour réorganiser'}
              </p>
              {scheduledTurns.map((turn, idx) => {
                const cfg = turnStatusConfig[turn.status] || turnStatusConfig.SCHEDULED;
                const Icon = cfg.icon;
                const isFirst = idx === 0;

                return (
                  <div
                    key={turn.id}
                    draggable={!turn.isLocked && scheduledTurns.length > 1}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    <Card className={`p-3 transition-all ${
                      draggedIdx === idx ? 'border-accent bg-accent/5 shadow-lg' : ''
                    } ${isFirst ? 'border-accent/30 bg-accent/5' : ''}`}>
                      <div className="flex items-center gap-3">
                        {!turn.isLocked && scheduledTurns.length > 1 && (
                          <GripVertical className="w-4 h-4 text-content-muted cursor-grab active:cursor-grabbing shrink-0" />
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
                            {isFirst && <Badge variant="info" value="Prochain" size="sm" />}
                          </div>
                          {turn.dueDate && (
                            <span className="text-[10px] text-content-muted">
                              Prévu: {new Date(turn.dueDate).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {turn.isLocked && <Lock size={12} className="text-content-muted shrink-0" title="Verrouillé" />}
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
