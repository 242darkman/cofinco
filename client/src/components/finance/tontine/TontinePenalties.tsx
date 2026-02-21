import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Ban, DollarSign, Clock } from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
import { tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { currencySymbol } from '@shared/config/currency';
import { formatDate } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

interface TontinePenaltiesProps {
  tontineId: string;
  onUpdate?: () => void;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral'; icon: React.ElementType }> = {
  PENDING: { label: 'En attente', variant: 'warning', icon: Clock },
  PAID: { label: 'Payee', variant: 'success', icon: CheckCircle },
  CANCELLED: { label: 'Annulee', variant: 'danger', icon: XCircle },
  WAIVED: { label: 'Annulee (grace)', variant: 'neutral', icon: Ban },
};

const typeLabels: Record<string, string> = {
  LATE: 'Retard',
  ABSENCE: 'Absence',
  WITHDRAWAL_FEE: 'Frais de retrait',
  CUSTOM: 'Personnalise',
};

export default function TontinePenalties({ tontineId, onUpdate }: TontinePenaltiesProps) {
  const sym = currencySymbol();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [penalties, setPenalties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const fetchPenalties = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const data = await tontineApi.getPenalties(tontineId);
      setPenalties(data || []);
    } catch {
      setPenalties([]);
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => {
    fetchPenalties();
  }, [fetchPenalties]);

  const handlePayPenalty = useCallback((penalty: any) => {
    openConfirm({
      title: 'Confirmer le paiement',
      message: `Payer la penalite de ${Number(penalty.montant).toLocaleString()} ${sym} ?`,
      variant: 'info',
      confirmText: 'Payer',
      onConfirm: async () => {
        setPaying(penalty.id);
        try {
          await tontineApi.payPenalty(tontineId, penalty.id);
          toast.success('Penalite payee avec succes');
          await fetchPenalties();
          onUpdate?.();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors du paiement'));
        } finally {
          setPaying(null);
        }
      },
    });
  }, [tontineId, sym, openConfirm, fetchPenalties, onUpdate]);

  // Stats
  const pending = penalties.filter((p) => p.statut === 'PENDING');
  const totalPending = pending.reduce((sum, p) => sum + Number(p.montant || 0), 0);
  const totalPaid = penalties
    .filter((p) => p.statut === 'PAID')
    .reduce((sum, p) => sum + Number(p.montant || 0), 0);

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
          <div className="text-[10px] text-content-muted">{pending.length} penalite{pending.length > 1 ? 's' : ''}</div>
        </Card>
        <Card className="p-3 text-center bg-status-success-bg/30 border-status-success/20">
          <div className="text-status-success text-[10px] uppercase font-semibold">Payees</div>
          <div className="text-lg font-bold text-status-success">{totalPaid.toLocaleString()} {sym}</div>
        </Card>
      </div>

      {/* Penalties list */}
      {penalties.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="mx-auto text-status-success mb-2" size={28} />
          <p className="text-sm text-content-primary font-medium">Aucune penalite</p>
          <p className="text-xs text-content-muted">Tous les membres sont a jour</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {penalties.map((penalty) => {
            const cfg = statusConfig[penalty.statut] || statusConfig.PENDING;
            const Icon = cfg.icon;
            const isPending = penalty.statut === 'PENDING';
            const isPaying = paying === penalty.id;

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
                      </div>
                      <div className="text-xs text-content-muted mt-1">
                        {penalty.membreName || penalty.membreId}
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
                          Payee le {new Date(penalty.datePaiement).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                      {penalty.waivedAt && (
                        <p className="text-[10px] text-content-muted mt-0.5">
                          Annulee le {new Date(penalty.waivedAt).toLocaleDateString('fr-FR')}
                          {penalty.waiveReason && ` — ${penalty.waiveReason}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={DollarSign}
                      onClick={() => handlePayPenalty(penalty)}
                      disabled={isPaying}
                      className="shrink-0 text-xs"
                    >
                      {isPaying ? '...' : 'Payer'}
                    </Button>
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
