/**
 * KPI Dashboard — états d'affichage (accès refusé, chargement, erreur, vide).
 * Extrait de KpiDashboard.tsx pour respecter la limite de 400 lignes.
 */
import { AlertTriangle, BarChart3, RefreshCw, ShieldAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import { Skeleton, SkeletonStatCard } from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Accès refusé / restreint
// ---------------------------------------------------------------------------

interface AccessDeniedCardProps {
  title: string;
  message: string;
}

export function KpiAccessDeniedCard({ title, message }: AccessDeniedCardProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-status-danger-bg flex items-center justify-center">
            <ShieldAlert size={32} className="text-status-danger" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary">{title}</h2>
          <p className="text-sm text-content-secondary">{message}</p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Erreur de chargement générique
// ---------------------------------------------------------------------------

export function KpiErrorCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-4">
      <Card className="max-w-md w-full text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-status-warning-bg flex items-center justify-center">
            <AlertTriangle size={32} className="text-status-warning" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary">
            Erreur de chargement
          </h2>
          <p className="text-sm text-content-secondary">
            Impossible de charger les donnees KPI. Veuillez reessayer.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Squelette de chargement
// ---------------------------------------------------------------------------

export function KpiLoadingSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton variant="text" width="200px" height="2rem" />
        <div className="flex-1" />
        <Skeleton variant="rounded" width={120} height={36} />
        <Skeleton variant="rounded" width={120} height={36} />
      </div>

      {/* Tabs skeleton */}
      <Skeleton variant="rounded" width="100%" height={40} />

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bannière d'écart de cohérence (admin) — consolidé ≠ somme des agences
// ---------------------------------------------------------------------------

interface CoherenceWarningsProps {
  warnings: string[];
}

export function KpiCoherenceWarningsBanner({ warnings }: CoherenceWarningsProps) {
  if (warnings.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-edge bg-status-warning-bg px-4 py-3">
      <div className="flex items-center gap-2 text-status-warning text-sm font-semibold">
        <AlertTriangle size={16} className="shrink-0" />
        Ecart de coherence detecte ({warnings.length})
      </div>
      <ul className="mt-2 space-y-1 text-xs text-content-secondary list-disc pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-content-muted">
        La vue consolidee ne correspond pas a la somme des agences sur ces
        indicateurs. Verifier les operations hors perimetre agence avant de
        publier ces chiffres.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bannière opérations offline en attente — indicateurs incomplets
// ---------------------------------------------------------------------------

interface OfflinePendingBannerProps {
  totalPending: number;
  deviceCount: number;
  oldestReportAt: string | null;
}

function formatReportAge(oldestReportAt: string): string {
  const elapsedMs = Date.now() - new Date(oldestReportAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '';
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export function KpiOfflinePendingBanner({ totalPending, deviceCount, oldestReportAt }: OfflinePendingBannerProps) {
  if (totalPending <= 0) return null;
  const age = oldestReportAt ? formatReportAge(oldestReportAt) : '';
  return (
    <div role="status" className="rounded-lg border border-edge bg-status-warning-bg px-4 py-3">
      <div className="flex items-center gap-2 text-status-warning text-sm font-semibold">
        <AlertTriangle size={16} className="shrink-0" />
        {totalPending} opération{totalPending > 1 ? 's' : ''} offline en attente de synchronisation
      </div>
      <p className="mt-1 text-xs text-content-secondary">
        {deviceCount} appareil{deviceCount > 1 ? 's' : ''} n'{deviceCount > 1 ? 'ont' : 'a'} pas
        termine sa synchronisation{age ? ` (plus ancien rapport : il y a ${age})` : ''}.
        Les indicateurs affiches peuvent etre incomplets tant que ces operations ne sont pas
        integrees.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// État vide — aucun snapshot pour la période
// ---------------------------------------------------------------------------

interface EmptyPeriodStateProps {
  periodLabel: string;
  canManage: boolean;
  isPending: boolean;
  onRecalculate: () => void;
}

export function KpiEmptyPeriodState({ periodLabel, canManage, isPending, onRecalculate }: EmptyPeriodStateProps) {
  return (
    <Card className="text-center">
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center">
          <BarChart3 size={32} className="text-content-muted" />
        </div>
        <h2 className="text-lg font-semibold text-content-primary">
          Aucune donnee pour cette periode
        </h2>
        <p className="text-sm text-content-secondary max-w-sm">
          Aucun snapshot KPI n'a ete genere pour{' '}
          <span className="font-medium text-content-primary">{periodLabel}</span>
          .
          {canManage
            ? ' Cliquez sur "Recalculer" pour generer les indicateurs.'
            : ' Contactez un administrateur pour lancer le calcul.'}
        </p>
        {canManage && (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={isPending}
            className="
              inline-flex items-center gap-2
              px-4 py-2
              text-sm font-medium
              bg-accent text-white rounded-lg
              hover:bg-accent/90
              disabled:opacity-60 disabled:cursor-not-allowed
              transition-colors
            "
          >
            <RefreshCw size={16} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Calcul en cours...' : 'Recalculer maintenant'}
          </button>
        )}
      </div>
    </Card>
  );
}
