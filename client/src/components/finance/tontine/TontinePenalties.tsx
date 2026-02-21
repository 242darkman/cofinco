import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Ban, DollarSign, Clock, Filter, ShieldOff, Plus } from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
import { tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { currencySymbol } from '@shared/config/currency';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface TontinePenaltiesProps {
  tontineId: string;
  onUpdate?: () => void;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral'; icon: React.ElementType }> = {
  PENDING: { label: 'En attente', variant: 'warning', icon: Clock },
  PAID: { label: 'Payée', variant: 'success', icon: CheckCircle },
  CANCELLED: { label: 'Annulée', variant: 'danger', icon: XCircle },
  WAIVED: { label: 'Annulée (grâce)', variant: 'neutral', icon: Ban },
};

const typeLabels: Record<string, string> = {
  LATE: 'Retard',
  ABSENCE: 'Absence',
  WITHDRAWAL_FEE: 'Frais de retrait',
  CUSTOM: 'Personnalisé',
};

export default function TontinePenalties({ tontineId, onUpdate }: TontinePenaltiesProps) {
  const sym = currencySymbol();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [penalties, setPenalties] = useState<any[]>([]);
  const [membres, setMembres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [waiving, setWaiving] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Manual penalty creation
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createData, setCreateData] = useState({ membreId: '', montant: '', penaltyType: 'CUSTOM', motif: '' });
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const [penData, membresData] = await Promise.all([
        tontineApi.getPenalties(tontineId).catch(() => []),
        tontineApi.getMembres(tontineId).catch(() => []),
      ]);
      setPenalties(penData || []);
      setMembres(membresData || []);
    } catch {
      setPenalties([]);
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreatePenalty = useCallback(async () => {
    if (!createData.membreId || !createData.montant) {
      toast.warning('Membre et montant requis');
      return;
    }
    setCreating(true);
    try {
      await tontineApi.createPenalty(tontineId, {
        membreId: createData.membreId,
        montant: Number(createData.montant),
        penaltyType: createData.penaltyType || 'CUSTOM',
        motif: createData.motif || undefined,
      });
      toast.success('Penalite creee');
      setShowCreateForm(false);
      setCreateData({ membreId: '', montant: '', penaltyType: 'CUSTOM', motif: '' });
      await fetchData();
      onUpdate?.();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la creation'));
    } finally {
      setCreating(false);
    }
  }, [tontineId, createData, fetchData, onUpdate]);

  const getMemberName = useCallback((membreId: string) => {
    const m = membres.find((m: any) => m.id === membreId);
    if (!m?.client) return membreId?.slice(0, 8) || '—';
    return `${m.client.nom || ''}${m.client.prenom ? ' ' + m.client.prenom : ''}`.trim();
  }, [membres]);

  const handlePayPenalty = useCallback((penalty: any) => {
    openConfirm({
      title: 'Confirmer le paiement',
      message: `Payer la pénalité de ${Number(penalty.montant).toLocaleString()} ${sym} pour ${getMemberName(penalty.membreId)} ?`,
      variant: 'info',
      confirmText: 'Payer',
      onConfirm: async () => {
        setPaying(penalty.id);
        try {
          await tontineApi.payPenalty(tontineId, penalty.id);
          toast.success('Pénalité payée avec succès');
          await fetchData();
          onUpdate?.();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors du paiement'));
        } finally {
          setPaying(null);
        }
      },
    });
  }, [tontineId, sym, openConfirm, fetchData, onUpdate, getMemberName]);

  const handleWaivePenalty = useCallback((penalty: any) => {
    setWaiving(penalty.id);
    setWaiveReason('');
  }, []);

  const confirmWaive = useCallback(async () => {
    if (!waiving || !waiveReason.trim()) return;
    try {
      await tontineApi.waivePenalty(waiving, waiveReason.trim());
      toast.success('Penalite annulee (grace)');
      setWaiving(null);
      setWaiveReason('');
      await fetchData();
      onUpdate?.();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'annulation"));
    }
  }, [waiving, waiveReason, fetchData, onUpdate]);

  // Filtered penalties
  const filteredPenalties = useMemo(() => {
    let result = penalties;
    if (statusFilter) result = result.filter(p => p.statut === statusFilter);
    if (typeFilter) result = result.filter(p => p.penaltyType === typeFilter);
    return result;
  }, [penalties, statusFilter, typeFilter]);

  // Stats (based on all penalties, not filtered)
  const pending = penalties.filter((p) => p.statut === 'PENDING');
  const totalPending = pending.reduce((sum, p) => sum + Number(p.montant || 0), 0);
  const totalPaid = penalties
    .filter((p) => p.statut === 'PAID')
    .reduce((sum, p) => sum + Number(p.montant || 0), 0);

  // Available types for filter
  const penaltyTypes = useMemo(() => {
    const types = new Set<string>();
    penalties.forEach(p => { if (p.penaltyType) types.add(p.penaltyType); });
    return Array.from(types);
  }, [penalties]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-16 bg-surface/50 rounded-lg" />
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface/50 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-content-muted text-[10px] uppercase font-semibold">Total</div>
          <div className="text-lg font-bold text-content-primary">{penalties.length}</div>
        </Card>
        <Card className="p-3 text-center bg-status-warning-bg/30 border-status-warning/20">
          <div className="text-status-warning text-[10px] uppercase font-semibold">En attente</div>
          <div className="text-lg font-bold text-status-warning">{totalPending.toLocaleString()} {sym}</div>
          <div className="text-[10px] text-content-muted">{pending.length} pénalité{pending.length > 1 ? 's' : ''}</div>
        </Card>
        <Card className="p-3 text-center bg-status-success-bg/30 border-status-success/20">
          <div className="text-status-success text-[10px] uppercase font-semibold">Payées</div>
          <div className="text-lg font-bold text-status-success">{totalPaid.toLocaleString()} {sym}</div>
        </Card>
      </div>

      {/* Filters */}
      {penalties.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-input border border-input-border rounded-lg text-xs text-content-primary focus:border-input-focus focus:outline-none appearance-none cursor-pointer"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(statusConfig).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.label}</option>
            ))}
          </select>
          {penaltyTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-input border border-input-border rounded-lg text-xs text-content-primary focus:border-input-focus focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">Tous les types</option>
              {penaltyTypes.map(t => (
                <option key={t} value={t}>{typeLabels[t] || t}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Create penalty button */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" icon={Plus} onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Annuler' : 'Nouvelle penalite'}
        </Button>
      </div>

      {/* Create penalty form */}
      {showCreateForm && (
        <Card className="p-3 bg-accent/5 border-accent/20">
          <p className="text-xs font-semibold text-content-primary mb-3">Creer une penalite manuelle</p>
          <div className="space-y-2">
            <select
              value={createData.membreId}
              onChange={e => setCreateData(p => ({ ...p, membreId: e.target.value }))}
              className="w-full px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
            >
              <option value="">Selectionner un membre...</option>
              {membres.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.client?.nom || ''} {m.client?.prenom || ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={createData.montant}
                onChange={e => setCreateData(p => ({ ...p, montant: e.target.value }))}
                placeholder={`Montant (${sym})`}
                className="px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
              />
              <select
                value={createData.penaltyType}
                onChange={e => setCreateData(p => ({ ...p, penaltyType: e.target.value }))}
                className="px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
              >
                <option value="CUSTOM">Personnalise</option>
                <option value="LATE">Retard</option>
                <option value="ABSENCE">Absence</option>
                <option value="WITHDRAWAL_FEE">Frais de retrait</option>
              </select>
            </div>
            <input
              type="text"
              value={createData.motif}
              onChange={e => setCreateData(p => ({ ...p, motif: e.target.value }))}
              placeholder="Motif (optionnel)"
              className="w-full px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
            />
            <Button size="sm" variant="primary" onClick={handleCreatePenalty} disabled={creating || !createData.membreId || !createData.montant} isLoading={creating} fullWidth>
              Creer la penalite
            </Button>
          </div>
        </Card>
      )}

      {/* Waive reason form */}
      {waiving && (
        <Card className="p-3 bg-status-warning-bg/30 border-status-warning/20">
          <p className="text-xs text-content-primary font-medium mb-2">
            Annuler la penalite — {getMemberName(penalties.find(p => p.id === waiving)?.membreId || '')}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={waiveReason}
              onChange={e => setWaiveReason(e.target.value)}
              placeholder="Raison obligatoire..."
              className="flex-1 px-2 py-1.5 bg-input border border-input-border rounded text-xs text-content-primary focus:border-input-focus focus:outline-none"
              autoFocus
            />
            <Button size="sm" variant="warning" onClick={confirmWaive} disabled={!waiveReason.trim()}>
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setWaiving(null); setWaiveReason(''); }}>
              Annuler
            </Button>
          </div>
        </Card>
      )}

      {/* Penalties list */}
      {filteredPenalties.length === 0 && penalties.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="mx-auto text-status-success mb-2" size={28} />
          <p className="text-sm text-content-primary font-medium">Aucune pénalité</p>
          <p className="text-xs text-content-muted">Tous les membres sont à jour</p>
        </Card>
      ) : filteredPenalties.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-content-muted">Aucune pénalité ne correspond aux filtres</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredPenalties.map((penalty) => {
            const cfg = statusConfig[penalty.statut] || statusConfig.PENDING;
            const Icon = cfg.icon;
            const isPending = penalty.statut === 'PENDING';
            const isPaying = paying === penalty.id;
            const memberName = getMemberName(penalty.membreId);

            return (
              <Card key={penalty.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isPending ? 'bg-status-warning-bg text-status-warning' : 'bg-surface-subtle text-content-muted'
                    }`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-content-primary">
                          {Number(penalty.montant || 0).toLocaleString()} {sym}
                        </span>
                        <Badge variant={cfg.variant} value={cfg.label} size="sm" />
                        <span className="text-[10px] px-1.5 py-0.5 bg-surface-subtle rounded text-content-muted">
                          {typeLabels[penalty.penaltyType] || penalty.penaltyType}
                        </span>
                        {penalty.autoApplied && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-status-info-bg rounded text-status-info">
                            Auto
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-content-muted mt-1">
                        <span className="font-medium text-content-secondary">{memberName}</span>
                        {penalty.dateFaute && (
                          <span className="ml-2">
                            Faute le {new Date(penalty.dateFaute).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                      {penalty.motif && (
                        <p className="text-[10px] text-content-muted mt-0.5 italic">{penalty.motif}</p>
                      )}
                      {penalty.datePaiement && (
                        <p className="text-[10px] text-status-success mt-0.5">
                          Payée le {new Date(penalty.datePaiement).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                      {penalty.waivedAt && (
                        <p className="text-[10px] text-content-muted mt-0.5">
                          Annulée le {new Date(penalty.waivedAt).toLocaleDateString('fr-FR')}
                          {penalty.waiveReason && ` — ${penalty.waiveReason}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={DollarSign}
                        onClick={() => handlePayPenalty(penalty)}
                        disabled={isPaying}
                        className="text-xs"
                      >
                        {isPaying ? '...' : 'Payer'}
                      </Button>
                      <button
                        onClick={() => handleWaivePenalty(penalty)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-status-warning hover:bg-status-warning-bg transition-colors"
                        title="Annuler (grace)"
                      >
                        <ShieldOff size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
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
