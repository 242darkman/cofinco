import { useState, useEffect, useCallback, useMemo } from 'react';
import { History, ArrowRightLeft, Lock, Unlock, SkipForward, UserPlus, Play, RefreshCw, Filter, ArrowUpDown } from 'lucide-react';
import { tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import Badge from '../../ui/Badge';

interface AuditEntry {
  id: string;
  actionType: string;
  reason: string;
  changedAt: string;
  changedBy: string;
  oldOrder: any;
  newOrder: any;
  affectedTurnIds: string[] | null;
  affectedMemberIds: string[] | null;
  metadata: any;
  // joined fields
  changedByUser?: { nom?: string; prenom?: string; username?: string };
}

interface Props {
  tontineId: string;
}

const ACTION_TYPES = ['INITIAL_GENERATION', 'REORDER', 'SWAP', 'SKIP', 'BENEFICIARY_CHANGE', 'LOCK', 'UNLOCK'] as const;

const ACTION_CONFIG: Record<string, { label: string; icon: typeof History; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  INITIAL_GENERATION: { label: 'Generation initiale', icon: Play, variant: 'success' },
  REORDER: { label: 'Reorganisation', icon: ArrowRightLeft, variant: 'info' },
  SWAP: { label: 'Echange', icon: RefreshCw, variant: 'info' },
  SKIP: { label: 'Tour saute', icon: SkipForward, variant: 'warning' },
  BENEFICIARY_CHANGE: { label: 'Changement beneficiaire', icon: UserPlus, variant: 'warning' },
  LOCK: { label: 'Verrouillage', icon: Lock, variant: 'danger' },
  UNLOCK: { label: 'Deverrouillage', icon: Unlock, variant: 'default' },
};

function getUserName(entry: AuditEntry): string {
  if (entry.changedByUser) {
    return `${entry.changedByUser.prenom || ''} ${entry.changedByUser.nom || ''}`.trim() || entry.changedByUser.username || '';
  }
  return entry.changedBy?.substring(0, 8) || '';
}

export default function TontineAuditTrail({ tontineId }: Props) {
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dashboard = await tontineApi.getDashboard(tontineId);
      const activeCycle = dashboard?.activeCycle || dashboard?.cycles?.[0];
      if (!activeCycle) {
        setAudits([]);
        return;
      }
      const data = await tontineApi.getTurnAudit(tontineId, activeCycle.id);
      setAudits(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement audit'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = audits;
    if (filterType) result = result.filter((a) => a.actionType === filterType);
    return result;
  }, [audits, filterType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-content-muted text-sm">
        Chargement...
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-content-muted">
        <History size={32} className="mb-2 opacity-50" />
        <p className="text-sm">Aucun evenement d'audit</p>
        <p className="text-xs mt-1">Les modifications de tours apparaitront ici</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-content-primary">
          Historique d'audit ({filtered.length}{filtered.length !== audits.length ? `/${audits.length}` : ''} evenements)
        </h3>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            showFilters || filterType ? 'bg-accent/10 text-accent' : 'bg-surface-subtle text-content-muted hover:text-content-secondary'
          }`}
        >
          <Filter size={12} />
          Filtres
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setFilterType('')}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${
              !filterType ? 'bg-accent text-white' : 'bg-surface-subtle text-content-muted hover:text-content-secondary'
            }`}
          >
            Tous
          </button>
          {ACTION_TYPES.map((type) => {
            const cfg = ACTION_CONFIG[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(filterType === type ? '' : type)}
                className={`px-2 py-1 rounded text-[10px] transition-colors ${
                  filterType === type ? 'bg-accent text-white' : 'bg-surface-subtle text-content-muted hover:text-content-secondary'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-edge" />

        <div className="space-y-3">
          {filtered.map((entry) => {
            const cfg = ACTION_CONFIG[entry.actionType] || { label: entry.actionType, icon: History, variant: 'default' as const };
            const Icon = cfg.icon;
            const date = new Date(entry.changedAt);
            const userName = getUserName(entry);

            return (
              <div key={entry.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 border-surface ${
                  cfg.variant === 'success' ? 'bg-status-success'
                  : cfg.variant === 'info' ? 'bg-status-info'
                  : cfg.variant === 'warning' ? 'bg-status-warning'
                  : cfg.variant === 'danger' ? 'bg-status-danger'
                  : 'bg-content-muted'
                }`} />

                <div className="bg-surface border border-edge-subtle rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-content-secondary" />
                      <Badge value={cfg.label} variant={cfg.variant} size="sm" />
                    </div>
                    <span className="text-[10px] text-content-muted">
                      {date.toLocaleDateString('fr-FR')} {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {entry.reason && (
                    <p className="text-xs text-content-secondary mt-1">{entry.reason}</p>
                  )}

                  <div className="flex items-center gap-2 mt-1">
                    {userName && (
                      <span className="text-[10px] text-content-muted">
                        Par {userName}
                      </span>
                    )}
                    {entry.affectedTurnIds && entry.affectedTurnIds.length > 0 && (
                      <span className="text-[10px] text-content-muted">
                        · {entry.affectedTurnIds.length} tour(s) affecte(s)
                      </span>
                    )}
                  </div>

                  {/* Show details for REORDER */}
                  {entry.actionType === 'REORDER' && entry.oldOrder && entry.newOrder && (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-content-muted bg-surface-subtle rounded px-2 py-1">
                      <ArrowUpDown size={10} />
                      <span>{Array.isArray(entry.oldOrder) ? entry.oldOrder.length : 0} positions modifiees</span>
                    </div>
                  )}

                  {/* Show details for LOCK/UNLOCK */}
                  {entry.metadata && (entry.actionType === 'LOCK' || entry.actionType === 'UNLOCK') && (
                    <div className="mt-1 text-[10px] text-content-muted bg-surface-subtle rounded px-2 py-1">
                      Tour #{entry.metadata.turnNumber}
                      {entry.metadata.reason && ` — ${entry.metadata.reason}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
