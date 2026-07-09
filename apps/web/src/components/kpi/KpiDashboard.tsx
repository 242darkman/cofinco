import { useState, useMemo } from 'react';
import {
  BarChart3,
  Download,
  RefreshCw,
  Calendar,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShieldAlert,
  PiggyBank,
  Wallet,
  Users,
  Briefcase,
  Eye,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import TabGroup from '@/components/ui/TabGroup';
import Badge from '@/components/ui/Badge';
import { Skeleton, SkeletonStatCard } from '@/components/ui/Skeleton';
import { useKpiSnapshot, useKpiRecalculate } from '@/hooks/use-kpi';
import { useAbilityContext } from '@/contexts/AbilityContext';
import { Actions, Subjects } from '@/lib/casl';
import { useAgence } from '@/contexts/AgenceContext';
import { exportKpiToExcel } from './kpi-export';

import KpiOverviewTab from './tabs/KpiOverviewTab';
import KpiCreditTab from './tabs/KpiCreditTab';
import KpiRisqueTab from './tabs/KpiRisqueTab';
import KpiTontinesTab from './tabs/KpiTontinesTab';
import KpiRentabiliteTab from './tabs/KpiRentabiliteTab';
import KpiTresorerieTab from './tabs/KpiTresorerieTab';
import KpiRhTab from './tabs/KpiRhTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PeriodType = 'monthly' | 'yearly';

interface TabComponentProps {
  payload: any;
  deltas: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate the last 24 month options as { value, label } */
function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

/** Generate the last 5 year options */
function buildYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const year = currentYear - i;
    return { value: String(year), label: String(year) };
  });
}

/** Return the current period key depending on type */
function currentPeriodKey(type: PeriodType): string {
  const now = new Date();
  if (type === 'yearly') return String(now.getFullYear());
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = buildMonthOptions();
const YEAR_OPTIONS = buildYearOptions();

const KPI_TABS = [
  { key: 'overview', label: "Vue d'ensemble", icon: Eye },
  { key: 'credit', label: 'Credit', icon: Briefcase },
  { key: 'risque', label: 'Risque', icon: ShieldAlert },
  { key: 'tontines', label: 'Tontines & Epargne', icon: PiggyBank },
  { key: 'rentabilite', label: 'Rentabilite', icon: TrendingUp },
  { key: 'tresorerie', label: 'Tresorerie', icon: Wallet },
  { key: 'rh', label: 'RH & Productivite', icon: Users },
] as const;

const TAB_COMPONENTS: Record<string, React.FC<TabComponentProps>> = {
  overview: KpiOverviewTab,
  credit: KpiCreditTab,
  risque: KpiRisqueTab,
  tontines: KpiTontinesTab,
  rentabilite: KpiRentabiliteTab,
  tresorerie: KpiTresorerieTab,
  rh: KpiRhTab,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function KpiDashboard() {
  // ---- Permissions ----
  const { ability, isAdmin, roles } = useAbilityContext();
  const canView = isAdmin || ability.can(Actions.VIEW, Subjects.KPI);
  const canManage = isAdmin || ability.can(Actions.MANAGE, Subjects.KPI);

  // ---- Agency context (admin can pick an agency) ----
  const { agences, selectedAgence } = useAgence();

  // ---- Local state ----
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [periodKey, setPeriodKey] = useState<string>(() => currentPeriodKey('monthly'));
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | undefined>(undefined);

  // When switching period type, reset to current period
  const handlePeriodTypeChange = (type: PeriodType) => {
    setPeriodType(type);
    setPeriodKey(currentPeriodKey(type));
  };

  // ---- Scope for the API call ----
  const scope = useMemo(() => {
    if (canManage && selectedAgencyId && selectedAgencyId !== 'all') {
      return selectedAgencyId;
    }
    return undefined;
  }, [canManage, selectedAgencyId]);

  // ---- Data fetching ----
  const { data, isLoading, isError, error } = useKpiSnapshot(periodType, periodKey, scope);
  const recalculate = useKpiRecalculate();

  const payload = data?.data?.payload ?? data?.data ?? null;
  const deltas = data?.data?.deltas ?? null;

  // ---- Period options ----
  const periodOptions = periodType === 'monthly' ? MONTH_OPTIONS : YEAR_OPTIONS;

  // ---- Agency options for admin selector ----
  const agencyOptions = useMemo(() => {
    if (!canManage) return [];
    return agences.map((ua) => ({
      value: ua.agence.id,
      label: `${ua.agence.codeAgence} - ${ua.agence.nom}`,
    }));
  }, [canManage, agences]);

  // ---- Export handler ----
  const handleExport = () => {
    if (!payload) return;
    exportKpiToExcel(payload, {
      periodType,
      periodKey,
      agencyName: canManage
        ? agencyOptions.find((a) => a.value === selectedAgencyId)?.label ?? 'Toutes'
        : selectedAgence?.nom ?? '',
    });
  };

  // ---- Recalculate handler ----
  const handleRecalculate = () => {
    recalculate.mutate({
      periodType,
      periodKey,
      agencyId: scope ?? null,
    });
  };

  // ---- Wait for permissions to load ----
  // roles is [] until first /api/my-permissions completes
  const permissionsLoaded = roles.length > 0;

  // ---- Access denied state (only after permissions are loaded) ----
  if (permissionsLoaded && !canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-status-danger-bg flex items-center justify-center">
              <ShieldAlert size={32} className="text-status-danger" />
            </div>
            <h2 className="text-lg font-semibold text-content-primary">
              Acces restreint
            </h2>
            <p className="text-sm text-content-secondary">
              Vous n'avez pas les permissions necessaires pour acceder au tableau de bord KPI.
              Contactez votre administrateur pour obtenir l'acces.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Loading skeleton ----
  if (isLoading) {
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

  // ---- Error state ----
  if (isError) {
    const isAccessDenied = error?.message === 'ACCESS_DENIED';
    if (isAccessDenied) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <Card className="max-w-md w-full text-center">
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-status-danger-bg flex items-center justify-center">
                <ShieldAlert size={32} className="text-status-danger" />
              </div>
              <h2 className="text-lg font-semibold text-content-primary">
                Acces refuse
              </h2>
              <p className="text-sm text-content-secondary">
                Vous n'etes pas autorise a consulter les KPI pour cette periode ou agence.
              </p>
            </div>
          </Card>
        </div>
      );
    }

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

  // ---- Active tab component ----
  const ActiveTabComponent = TAB_COMPONENTS[activeTab] ?? KpiOverviewTab;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* ================================================================ */}
      {/* HEADER BAR                                                       */}
      {/* ================================================================ */}
      <Card padding="sm" className="space-y-3 sm:space-y-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Title */}
          <div className="flex items-center gap-2 mr-auto">
            <BarChart3 size={22} className="text-accent shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-content-primary whitespace-nowrap">
              KPI & Pilotage
            </h1>
          </div>

          {/* Period type toggle */}
          <div className="flex rounded-lg border border-edge overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => handlePeriodTypeChange('monthly')}
              className={`
                px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors
                ${periodType === 'monthly'
                  ? 'bg-accent text-white'
                  : 'bg-surface text-content-secondary hover:bg-surface-elevated hover:text-content-primary'
                }
              `}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => handlePeriodTypeChange('yearly')}
              className={`
                px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors border-l border-edge
                ${periodType === 'yearly'
                  ? 'bg-accent text-white'
                  : 'bg-surface text-content-secondary hover:bg-surface-elevated hover:text-content-primary'
                }
              `}
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
              onChange={(e) => setPeriodKey(e.target.value)}
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
                onChange={(e) =>
                  setSelectedAgencyId(e.target.value === 'all' ? undefined : e.target.value)
                }
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
            onClick={handleExport}
            disabled={!payload}
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
              onClick={handleRecalculate}
              disabled={recalculate.isPending}
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
              <RefreshCw
                size={14}
                className={recalculate.isPending ? 'animate-spin' : ''}
              />
              <span className="hidden sm:inline">
                {recalculate.isPending ? 'Calcul...' : 'Recalculer'}
              </span>
            </button>
          )}
        </div>

        {/* Recalculate feedback */}
        {recalculate.isSuccess && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-status-success-bg text-status-success text-xs font-medium">
            Recalcul termine avec succes.
          </div>
        )}
        {recalculate.isError && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-status-danger-bg text-status-danger text-xs font-medium">
            Erreur lors du recalcul : {(recalculate.error as Error)?.message ?? 'Erreur inconnue'}
          </div>
        )}
      </Card>

      {/* ================================================================ */}
      {/* TABS                                                             */}
      {/* ================================================================ */}
      <TabGroup
        tabs={KPI_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pills"
        size="sm"
      />

      {/* ================================================================ */}
      {/* TAB CONTENT                                                      */}
      {/* ================================================================ */}
      {!payload ? (
        /* Empty state — no snapshot for this period */
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
              <span className="font-medium text-content-primary">
                {periodOptions.find((o) => o.value === periodKey)?.label ?? periodKey}
              </span>
              .
              {canManage
                ? ' Cliquez sur "Recalculer" pour generer les indicateurs.'
                : ' Contactez un administrateur pour lancer le calcul.'}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={recalculate.isPending}
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
                <RefreshCw
                  size={16}
                  className={recalculate.isPending ? 'animate-spin' : ''}
                />
                {recalculate.isPending ? 'Calcul en cours...' : 'Recalculer maintenant'}
              </button>
            )}
          </div>
        </Card>
      ) : (
        <ActiveTabComponent payload={payload} deltas={deltas} />
      )}
    </div>
  );
}

export default KpiDashboard;
