/**
 * KPI Dashboard — barre d'en-tête (période, agence, export, recalcul)
 * et badge de fraîcheur du snapshot affiché.
 * Extrait de KpiDashboard.tsx pour respecter la limite de 400 lignes.
 */
import { useEffect, useState } from 'react';
import { BarChart3, Building2, Calendar, Clock, Download, RefreshCw } from 'lucide-react';
import Card from '@/components/ui/Card';

type PeriodType = 'monthly' | 'yearly';

interface Option {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Badge de fraîcheur — « Généré il y a X », re-rendu toutes les 30 s
// ---------------------------------------------------------------------------

function formatRelative(generatedAt: string): string {
  const elapsedMs = Date.now() - new Date(generatedAt).getTime();
  if (elapsedMs < 0 || Number.isNaN(elapsedMs)) return '';
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `le ${new Date(generatedAt).toLocaleDateString('fr-FR')} a ${new Date(generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

interface FreshnessBadgeProps {
  generatedAt: string;
  version?: number;
  source?: string;
}

export function KpiFreshnessBadge({ generatedAt, version, source }: FreshnessBadgeProps) {
  // Tick 30 s pour garder le libellé relatif à jour
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const isAuto = source === 'scheduled';

  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs text-content-muted"
      title={`Snapshot v${version ?? 1} — ${isAuto ? 'rafraichissement automatique' : 'recalcul manuel'}`}
    >
      <Clock size={12} className="shrink-0" />
      <span>
        Genere {formatRelative(generatedAt)}
        {version ? ` · v${version}` : ''}
        {isAuto ? ' · auto' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre d'en-tête
// ---------------------------------------------------------------------------

export interface KpiDashboardHeaderProps {
  periodType: PeriodType;
  periodKey: string;
  periodOptions: Option[];
  onPeriodTypeChange: (type: PeriodType) => void;
  onPeriodKeyChange: (key: string) => void;
  canManage: boolean;
  agencyOptions: Option[];
  selectedAgencyId?: string;
  onAgencyChange: (id: string | undefined) => void;
  exportDisabled: boolean;
  onExport: () => void;
  recalculatePending: boolean;
  recalculateSuccess: boolean;
  recalculateError: string | null;
  onRecalculate: () => void;
  generatedAt?: string | null;
  snapshotVersion?: number | null;
  snapshotSource?: string | null;
  /** Connexion WebSocket active : les snapshots se rafraîchissent seuls */
  isLive?: boolean;
}

export default function KpiDashboardHeader(props: KpiDashboardHeaderProps) {
  const {
    periodType, periodKey, periodOptions, onPeriodTypeChange, onPeriodKeyChange,
    canManage, agencyOptions, selectedAgencyId, onAgencyChange,
    exportDisabled, onExport,
    recalculatePending, recalculateSuccess, recalculateError, onRecalculate,
    generatedAt, snapshotVersion, snapshotSource, isLive,
  } = props;

  const toggleClass = (active: boolean, borderLeft = false) => `
    px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors
    ${borderLeft ? 'border-l border-edge' : ''}
    ${active
      ? 'bg-accent text-white'
      : 'bg-surface text-content-secondary hover:bg-surface-elevated hover:text-content-primary'
    }
  `;

  return (
    <Card padding="sm" className="space-y-3 sm:space-y-0">
      <div className="flex flex-wrap items-center gap-3">
        {/* Title + live + freshness */}
        <div className="flex items-center gap-2 mr-auto">
          <BarChart3 size={22} className="text-accent shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-content-primary whitespace-nowrap">
                KPI & Pilotage
              </h1>
              {isLive !== undefined && (
                <span
                  role="status"
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    isLive
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-surface-elevated text-content-muted'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-status-success' : 'bg-content-muted'}`}
                  />
                  {isLive ? 'Temps réel' : 'Hors ligne'}
                </span>
              )}
            </div>
            {generatedAt && (
              <KpiFreshnessBadge
                generatedAt={generatedAt}
                version={snapshotVersion ?? undefined}
                source={snapshotSource ?? undefined}
              />
            )}
          </div>
        </div>

        {/* Period type toggle */}
        <div className="flex rounded-lg border border-edge overflow-hidden shrink-0" role="group" aria-label="Type de periode">
          <button
            type="button"
            onClick={() => onPeriodTypeChange('monthly')}
            aria-pressed={periodType === 'monthly'}
            className={toggleClass(periodType === 'monthly')}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => onPeriodTypeChange('yearly')}
            aria-pressed={periodType === 'yearly'}
            className={toggleClass(periodType === 'yearly', true)}
          >
            Annuel
          </button>
        </div>

        {/* Period picker */}
        <div className="relative shrink-0">
          <Calendar
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
          />
          <select
            value={periodKey}
            onChange={(e) => onPeriodKeyChange(e.target.value)}
            aria-label="Choisir la periode"
            className="
              appearance-none pl-8 pr-8 py-1.5
              text-xs sm:text-sm font-medium
              bg-input border border-input-border rounded-lg
              text-content-primary
              focus:outline-none focus:border-input-focus
              transition-colors cursor-pointer
            "
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Agency selector (admin only) */}
        {canManage && agencyOptions.length > 0 && (
          <div className="relative shrink-0">
            <Building2
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
            />
            <select
              value={selectedAgencyId ?? 'all'}
              onChange={(e) => onAgencyChange(e.target.value === 'all' ? undefined : e.target.value)}
              aria-label="Choisir l'agence"
              className="
                appearance-none pl-8 pr-8 py-1.5
                text-xs sm:text-sm font-medium
                bg-input border border-input-border rounded-lg
                text-content-primary
                focus:outline-none focus:border-input-focus
                transition-colors cursor-pointer
                max-w-[200px]
              "
            >
              <option value="all">Toutes les agences</option>
              {agencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Export button */}
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label="Exporter les KPI en Excel"
          className="
            inline-flex items-center gap-1.5
            px-3 py-1.5
            text-xs sm:text-sm font-medium
            bg-surface border border-edge rounded-lg
            text-content-secondary
            hover:bg-surface-elevated hover:text-content-primary
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors shrink-0
          "
        >
          <Download size={14} />
          <span className="hidden sm:inline">Exporter</span>
        </button>

        {/* Recalculate button (admin only) */}
        {canManage && (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={recalculatePending}
            aria-label="Recalculer les KPI"
            className="
              inline-flex items-center gap-1.5
              px-3 py-1.5
              text-xs sm:text-sm font-medium
              bg-accent text-white rounded-lg
              hover:bg-accent/90
              disabled:opacity-60 disabled:cursor-not-allowed
              transition-colors shrink-0
            "
          >
            <RefreshCw size={14} className={recalculatePending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">
              {recalculatePending ? 'Calcul...' : 'Recalculer'}
            </span>
          </button>
        )}
      </div>

      {/* Recalculate feedback */}
      {recalculateSuccess && (
        <div role="status" className="mt-2 px-3 py-1.5 rounded-lg bg-status-success-bg text-status-success text-xs font-medium">
          Recalcul termine avec succes.
        </div>
      )}
      {recalculateError && (
        <div role="alert" className="mt-2 px-3 py-1.5 rounded-lg bg-status-danger-bg text-status-danger text-xs font-medium">
          Erreur lors du recalcul : {recalculateError}
        </div>
      )}
    </Card>
  );
}
