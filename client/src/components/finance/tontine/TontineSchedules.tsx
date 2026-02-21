import { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle, Clock, Lock, AlertTriangle, Eye } from 'lucide-react';
import { tontineApi, tontineScheduleApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { currencySymbol } from '@shared/config/currency';

interface Schedule {
  id: string;
  periodNumber: number;
  dueDate: string;
  amountExpectedPerMember: string;
  status: string;
  totalCollected: string;
  membersPaidCount: number;
  closedAt: string | null;
}

interface Props {
  tontineId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'default'; icon: typeof Clock }> = {
  UPCOMING: { label: 'A venir', variant: 'default', icon: Clock },
  OPEN: { label: 'En cours', variant: 'info', icon: Calendar },
  CLOSED: { label: 'Cloturee', variant: 'success', icon: CheckCircle },
  CANCELLED: { label: 'Annulee', variant: 'warning', icon: AlertTriangle },
};

export default function TontineSchedules({ tontineId }: Props) {
  const sym = currencySymbol();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get dashboard to find active cycle
      const dashboard = await tontineApi.getDashboard(tontineId);
      const activeCycle = dashboard?.activeCycle || dashboard?.cycles?.[0];
      if (!activeCycle) {
        setSchedules([]);
        return;
      }
      setCycleId(activeCycle.id);
      const data = await tontineApi.getSchedules(tontineId, activeCycle.id);
      setSchedules(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement echeancier'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const tontine = await tontineApi.getById(tontineId);
      if (!tontine) { toast.error('Tontine introuvable'); return; }
      const result = await tontineScheduleApi.preview({
        frequence: tontine.frequence,
        intervalleCotisation: tontine.intervalleCotisation || 1,
        nombreMembres: tontine.nombreMembres,
        montantCotisation: tontine.montantCotisation,
        dateDebut: tontine.dateDebut,
        collectionCalendarMode: tontine.collectionCalendarMode,
        weekdaysMask: tontine.weekdaysMask,
        shiftNonWorkingDay: tontine.shiftNonWorkingDay,
      });
      setPreviewData(result?.schedules || result || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la previsualisation'));
    } finally {
      setPreviewing(false);
    }
  }, [tontineId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-content-muted text-sm">
        Chargement...
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-content-muted">
        <Calendar size={32} className="mb-2 opacity-50" />
        <p className="text-sm">Aucun echeancier disponible</p>
        <p className="text-xs mt-1">Generez un cycle pour voir les periodes de collecte</p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-content-primary">
          Echeancier de collecte ({schedules.length} periodes)
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-[10px] text-content-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-info" /> En cours</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-success" /> Cloturee</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-edge" /> A venir</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Eye}
            onClick={() => previewData ? setPreviewData(null) : handlePreview()}
            disabled={previewing}
          >
            {previewData ? 'Masquer' : previewing ? '...' : 'Previsualiser'}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        {schedules.map((s) => {
          const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.UPCOMING;
          const Icon = cfg.icon;
          const dueDate = new Date(s.dueDate);
          const isPast = dueDate < now && s.status === 'OPEN';
          const expected = parseFloat(s.amountExpectedPerMember || '0');
          const collected = parseFloat(s.totalCollected || '0');
          const pctCollected = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;

          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                s.status === 'OPEN'
                  ? 'bg-status-info-bg/50 border-status-info/20'
                  : s.status === 'CLOSED'
                  ? 'bg-surface-subtle border-edge-subtle opacity-75'
                  : 'bg-surface border-edge-subtle'
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                s.status === 'OPEN' ? 'bg-status-info/10 text-status-info'
                : s.status === 'CLOSED' ? 'bg-status-success/10 text-status-success'
                : 'bg-surface-subtle text-content-muted'
              }`}>
                <Icon size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-content-primary">
                    Periode {s.periodNumber}
                  </span>
                  <Badge value={cfg.label} variant={cfg.variant} size="sm" />
                  {isPast && (
                    <span className="text-[10px] text-status-danger font-medium">En retard</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-content-muted">
                    Echeance: {dueDate.toLocaleDateString('fr-FR')}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {s.membersPaidCount} paye(s)
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-content-primary">
                  {collected.toLocaleString()} {sym}
                </div>
                <div className="text-[10px] text-content-muted">
                  / {expected.toLocaleString()} attendu
                </div>
                {s.status === 'OPEN' && (
                  <div className="w-20 h-1 bg-edge rounded-full mt-1">
                    <div
                      className="h-full bg-status-info rounded-full transition-all"
                      style={{ width: `${pctCollected}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Schedule Preview */}
      {previewData && previewData.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">
            Previsualisation ({previewData.length} periodes)
          </p>
          <div className="space-y-1">
            {previewData.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-accent/20 bg-accent/5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/10 text-accent shrink-0">
                  <span className="text-xs font-bold">{p.periodNumber || i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-content-primary">
                    {p.dueDate ? new Date(p.dueDate).toLocaleDateString('fr-FR') : `Periode ${i + 1}`}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-medium text-content-primary">
                    {Number(p.amountExpectedPerMember || p.amount || 0).toLocaleString()} {sym}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
