import { useState, useMemo } from 'react';
import {
  Eye,
  Briefcase,
  ShieldAlert,
  PiggyBank,
  TrendingUp,
  Wallet,
  Users,
  Landmark,
} from 'lucide-react';
import TabGroup from '@/components/ui/TabGroup';
import { useKpiSnapshot, useKpiRecalculate, useKpiRealtimeRefresh, useOfflinePendingSummary } from '@/hooks/use-kpi';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAbilityContext } from '@/contexts/AbilityContext';
import { Actions, Subjects } from '@/lib/casl';
import { useAgence } from '@/contexts/AgenceContext';
import { exportKpiToExcel } from './kpi-export';
import { formatPeriodLabel } from './kpi-period-utils';

import KpiDashboardHeader from './KpiDashboardHeader';
import KpiTrendsStrip from './KpiTrendsStrip';
import {
  KpiAccessDeniedCard,
  KpiCoherenceWarningsBanner,
  KpiEmptyPeriodState,
  KpiErrorCard,
  KpiLoadingSkeleton,
  KpiOfflinePendingBanner,
} from './KpiDashboardStates';
import KpiOverviewTab from './tabs/KpiOverviewTab';
import KpiCreditTab from './tabs/KpiCreditTab';
import KpiRisqueTab from './tabs/KpiRisqueTab';
import KpiTontinesTab from './tabs/KpiTontinesTab';
import KpiRentabiliteTab from './tabs/KpiRentabiliteTab';
import KpiTresorerieTab from './tabs/KpiTresorerieTab';
import KpiRhTab from './tabs/KpiRhTab';
import KpiCobacTab from './tabs/KpiCobacTab';

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

/** Return the current period key depending on type */
function currentPeriodKey(type: PeriodType): string {
  const now = new Date();
  if (type === 'yearly') return String(now.getFullYear());
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
  // L'onglet COBAC est masqué sans permission comptable — l'API applique
  // la même règle côté serveur (VIEW COMPTABILITE)
  const canViewCobac = isAdmin || ability.can(Actions.VIEW, Subjects.COMPTABILITE);

  // ---- Connexion temps réel ----
  const { isConnected: isLive } = useWebSocket();

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

  // Temps réel : invalide le cache dès que le serveur diffuse un snapshot frais
  useKpiRealtimeRefresh();

  const snapshot = data?.data ?? null;
  const payload = snapshot?.payload ?? snapshot ?? null;
  const deltas = snapshot?.payload?.deltas ?? snapshot?.deltas ?? null;

  // Écarts consolidé/somme des agences (metadata du snapshot consolidé) —
  // visibles uniquement pour les admins, qui peuvent agir dessus
  const coherenceWarnings: string[] = canManage
    ? (snapshot?.metadata?.warnings ?? [])
    : [];

  // Opérations offline en attente : les indicateurs peuvent être incomplets
  const offlinePending = useOfflinePendingSummary(scope);
  const pendingSummary = offlinePending.data?.data;

  // ---- Period options ----

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
      <KpiAccessDeniedCard
        title="Acces restreint"
        message="Vous n'avez pas les permissions necessaires pour acceder au tableau de bord KPI. Contactez votre administrateur pour obtenir l'acces."
      />
    );
  }

  // ---- Loading skeleton ----
  if (isLoading) {
    return <KpiLoadingSkeleton />;
  }

  // ---- Error state ----
  if (isError) {
    if (error?.message === 'ACCESS_DENIED') {
      return (
        <KpiAccessDeniedCard
          title="Acces refuse"
          message="Vous n'etes pas autorise a consulter les KPI pour cette periode ou agence."
        />
      );
    }
    return <KpiErrorCard />;
  }

  // ---- Tabs (COBAC conditionné par la permission comptable) ----
  const visibleTabs = [
    ...KPI_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon })),
    ...(canViewCobac ? [{ key: 'cobac', label: 'Ratios COBAC', icon: Landmark }] : []),
  ];

  // ---- Active tab component ----
  const ActiveTabComponent = TAB_COMPONENTS[activeTab] ?? KpiOverviewTab;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <KpiDashboardHeader
        periodType={periodType}
        periodKey={periodKey}
        onPeriodTypeChange={handlePeriodTypeChange}
        onPeriodKeyChange={setPeriodKey}
        canManage={canManage}
        agencyOptions={agencyOptions}
        selectedAgencyId={selectedAgencyId}
        onAgencyChange={setSelectedAgencyId}
        exportDisabled={!payload}
        onExport={handleExport}
        recalculatePending={recalculate.isPending}
        recalculateSuccess={recalculate.isSuccess}
        recalculateError={
          recalculate.isError
            ? ((recalculate.error as Error)?.message ?? 'Erreur inconnue')
            : null
        }
        onRecalculate={handleRecalculate}
        generatedAt={snapshot?.generatedAt ?? null}
        snapshotVersion={snapshot?.version ?? null}
        snapshotSource={snapshot?.metadata?.source ?? null}
        isLive={isLive}
      />

      <KpiCoherenceWarningsBanner warnings={coherenceWarnings} />

      {pendingSummary && (
        <KpiOfflinePendingBanner
          totalPending={pendingSummary.totalPending}
          deviceCount={pendingSummary.deviceCount}
          oldestReportAt={pendingSummary.oldestReportAt}
        />
      )}

      {payload && <KpiTrendsStrip periodType={periodType} scope={scope} />}

      <TabGroup
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pills"
        size="sm"
      />

      {activeTab === 'cobac' ? (
        // Onglet autonome : source comptabilité, indépendante des snapshots KPI
        <KpiCobacTab agencyId={scope} isAdmin={canManage} />
      ) : !payload ? (
        <KpiEmptyPeriodState
          periodLabel={formatPeriodLabel(periodType, periodKey)}
          canManage={canManage}
          isPending={recalculate.isPending}
          onRecalculate={handleRecalculate}
        />
      ) : (
        <ActiveTabComponent payload={payload} deltas={deltas} />
      )}
    </div>
  );
}

export default KpiDashboard;
